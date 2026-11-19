"""Small same-origin account API for PK Atlas. Python standard library only."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import api_v1
import state_store
import last_upload
import session_devices
import curve_png
import push_service
import native_auth
import model_distribution
import native_engine_distribution
import native_release_distribution
import native_engine_distribution
import math_runtime
import native_apns

DB = os.environ.get("PK_DB", "/var/lib/pk-atlas/pk.sqlite3")
PORT = int(os.environ.get("PK_PORT", "8766"))
HOST = "127.0.0.1"
PUBLIC_HOST = "pk.example.com"
COOKIE = "pk_atlas_session"
# Per-browser sessions, not IP/UA device fingerprinting.
REMEMBER_ABSOLUTE = 90 * 86400
REMEMBER_IDLE = 30 * 86400
NORMAL_ABSOLUTE = 7 * 86400
NORMAL_IDLE = 24 * 3600
SESSION_AGE = REMEMBER_ABSOLUTE
MAX_BODY = 8_000_000
USER_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_-]{2,31}$")
ATTEMPTS: dict[str, list[float]] = {}


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB, timeout=15)
    con.row_factory = sqlite3.Row
    return con


def setup() -> None:
    os.makedirs(os.path.dirname(DB), mode=0o700, exist_ok=True)
    with db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, password_hash BLOB NOT NULL, created_at INTEGER NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL)")
        # Additive migration. Keep existing sessions active up to their
        # original server expiration, without changing their token hashes.
        columns={x["name"] for x in con.execute("PRAGMA table_info(sessions)")}
        for name,definition in [
            ("created_at","INTEGER NOT NULL DEFAULT 0"),
            ("last_active_at","INTEGER NOT NULL DEFAULT 0"),
            ("absolute_expires_at","INTEGER NOT NULL DEFAULT 0"),
            ("remembered","INTEGER NOT NULL DEFAULT 1"),
            ("device_name","TEXT NOT NULL DEFAULT ''"),
            ("device_key","TEXT NOT NULL DEFAULT ''"),
            ("device_platform","TEXT NOT NULL DEFAULT ''"),
            ("device_os","TEXT NOT NULL DEFAULT ''"),
            ("login_method","TEXT NOT NULL DEFAULT 'legacy'")]:
            if name not in columns:
                con.execute(f"ALTER TABLE sessions ADD COLUMN {name} {definition}")
        now=int(time.time())
        con.execute("UPDATE sessions SET created_at=? WHERE created_at=0",(now,))
        con.execute("UPDATE sessions SET last_active_at=? WHERE last_active_at=0",(now,))
        con.execute("UPDATE sessions SET absolute_expires_at=expires_at WHERE absolute_expires_at=0")
        # Legacy logins did not record User-Agent or last activity: do not
        # misrepresent the migration time as a verified usage timestamp.
        con.execute("UPDATE sessions SET device_name='旧会话（设备未记录）' WHERE device_name=''")
        con.execute("CREATE TABLE IF NOT EXISTS user_state (user_id INTEGER PRIMARY KEY REFERENCES users(id), version INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS api_keys (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), created_at INTEGER NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, details INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)")
        con.execute("CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id)")
        con.execute("CREATE TABLE IF NOT EXISTS push_deliveries (endpoint_hash TEXT NOT NULL, event_key TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY(endpoint_hash,event_key))")
        con.execute("CREATE TABLE IF NOT EXISTS push_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id), body TEXT NOT NULL)")
        push_service.initialize_adopted_changes(con)
        con.execute("CREATE TABLE IF NOT EXISTS push_scenarios (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, drug TEXT NOT NULL, doses TEXT NOT NULL, created_at INTEGER NOT NULL)")
        con.execute("CREATE INDEX IF NOT EXISTS push_scenarios_user ON push_scenarios(user_id)")
        state_store.initialize(con)
        last_upload.initialize(con)
    native_apns.setup()


def rate_ok(key: str, limit: int, window: int) -> bool:
    now = time.monotonic()
    recent = [t for t in ATTEMPTS.get(key, []) if now - t < window]
    recent.append(now)
    ATTEMPTS[key] = recent
    return len(recent) <= limit


def password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)


class Handler(BaseHTTPRequestHandler):
    server_version = "PKAtlasAPI/1"

    def log_message(self, fmt: str, *args: object) -> None:
        # Version checks are anonymous and intentionally leave NO per-request
        # origin log. This endpoint also has Nginx access_log disabled.
        if urlsplit(self.path).path == "/api/native/version":
            return
        # Never log credentials, request bodies, or cookies.
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    def respond(self, status: int, payload: dict, session: str | None = None, clear: bool = False, session_age: int = SESSION_AGE, persistent_cookie: bool = True) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        if session:
            lifetime=f"; Max-Age={max(1,int(session_age))}" if persistent_cookie else ""
            self.send_header("Set-Cookie", f"{COOKIE}={session}; Path=/api/{lifetime}; HttpOnly; Secure; SameSite=Strict")
        elif clear:
            self.send_header("Set-Cookie", f"{COOKIE}=; Path=/api/; Max-Age=0; HttpOnly; Secure; SameSite=Strict")
        self.end_headers()
        self.wfile.write(data)

    def respond_png(self, data: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def valid_host(self) -> bool:
        return self.headers.get("Host", "").split(":")[0].lower() == PUBLIC_HOST

    def valid_origin(self) -> bool:
        origin = self.headers.get("Origin", "")
        return origin == f"https://{PUBLIC_HOST}"

    def body(self) -> dict | None:
        try:
            n = int(self.headers.get("Content-Length", "-1"))
            if n < 0 or n > MAX_BODY or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return None
            data = json.loads(self.rfile.read(n))
            return data if isinstance(data, dict) else None
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def session(self) -> tuple[int, str, str] | None:
        try:
            jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            token = jar[COOKIE].value
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
                return None
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            now=int(time.time())
            with db() as con:
                row=con.execute("""SELECT u.id,u.username,s.token_hash,
                    s.expires_at,s.absolute_expires_at,s.last_active_at,s.remembered
                    FROM sessions s JOIN users u ON u.id=s.user_id
                    WHERE s.token_hash=? AND s.expires_at>? AND s.absolute_expires_at>?""",
                    (token_hash,now,now)).fetchone()
                if not row:
                    return None
                idle=REMEMBER_IDLE if row["remembered"] else NORMAL_IDLE
                # Background GET state/push polling does not count as human
                # activity. Opening the app or intentionally writing does.
                touched=self.endpoint()=="/api/me" or self.command in ("PUT","DELETE") or (
                    self.command=="POST" and self.endpoint() not in
                    ("/api/push/status","/api/push/test"))
                if row["last_active_at"]+idle<=now:
                    return None
                if touched and now-row["last_active_at"]>=60:
                    expiry=min(row["absolute_expires_at"],now+idle)
                    con.execute("UPDATE sessions SET last_active_at=?,expires_at=? WHERE token_hash=?",
                                (now,expiry,token_hash))
            return row["id"],row["username"],row["token_hash"]
        except (KeyError, cookies.CookieError):
            return None

    def endpoint(self) -> str:
        return urlsplit(self.path).path

    def v1_user(self, username: str):
        authorization = self.headers.get("Authorization", "")
        if authorization:
            with db() as con:
                row = api_v1.user_for_key(con, username, authorization)
        else:
            session = self.session()
            row = {"id": session[0], "username": session[1]} if session and username == session[1] else None
        if not row:
            self.respond(401, {"error": "用户名或访问密钥无效"})
        return row

    def v1_state(self, user_id: int):
        with db() as con:
            row = con.execute("SELECT version,body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
        return row["version"], json.loads(row["body"])

    def curve_payload(self, user, drug_value, day, step_value="30"):
        drug = api_v1.canonical_drug(drug_value)
        start = int(api_v1.parse_date(day).timestamp() * 1000)
        step = int(api_v1.number(step_value, "采样间隔", 5, 120))
        _, state = self.v1_state(user["id"])
        model = api_v1.Model(drug, state)
        end = start + int((24 + max(8, model.effective_half_life * 4)) * 3600000)
        points = [{"time": t, "timeIso": api_v1.public_time(t),
                   "bloodMgL": round(model.blood(t), 6),
                   "equivalentMg": round(model.equivalent(t), 6)}
                  for t in range(start, end + 1, step * 60000)]
        now = api_v1.now_ms()
        current = {"time": now, "bloodMgL": round(model.blood(now), 6),
                   "equivalentMg": round(model.equivalent(now), 6)}
        readout = api_v1.curve_readout(model, day, now)
        return {"username": user["username"], "drug": drug, "drugName": model.name,
                "date": day, "model": "群体药代教学估算，非实测浓度或服药建议",
                "now": current, **readout,
                "message": readout["nowText"] + "\n" + readout["caption"],
                "points": points}

    def v1_get(self):
        path = self.endpoint()
        if path == "/api/v1/key":
            session = self.session()
            if not session:
                self.respond(401, {"error": "请先登录网站"})
                return
            with db() as con:
                row = con.execute("SELECT created_at FROM api_keys WHERE user_id=?", (session[0],)).fetchone()
            self.respond(200, {"username": session[1], "hasKey": bool(row),
                               "createdAt": row["created_at"] if row else None})
            return
        args = parse_qs(urlsplit(self.path).query)
        username = args.get("username", [""])[0]
        user = self.v1_user(username)
        if not user:
            return
        if path == "/api/v1/drugs":
            self.respond(200, {"username": user["username"], "drugs": [
                {"id": key, "name": value[0]} for key, value in api_v1.DRUGS.items()]})
            return
        version, state = self.v1_state(user["id"])
        if path == "/api/v1/state":
            self.respond(200, {"username": user["username"], "version": version, "state": state})
        elif path == "/api/v1/doses":
            try:
                day = args.get("date", [api_v1.date_key(api_v1.now_ms())])[0]
                api_v1.parse_date(day)
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
                return
            rows = [r for r in state.get("records", []) if isinstance(r, dict)
                    and isinstance(r.get("time"), (int, float)) and api_v1.date_key(r["time"]) == day]
            self.respond(200, {"username": user["username"], "date": day, "doses": rows})
        elif path == "/api/v1/curve":
            try:
                day = args.get("date", [api_v1.date_key(api_v1.now_ms())])[0]
                self.respond(200, self.curve_payload(user, args.get("drug", [""])[0], day,
                                                     args.get("stepMinutes", ["30"])[0]))
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
        else:
            self.respond(404, {"error": "接口不存在"})

    def v1_post(self):
        path = self.endpoint()
        if path == "/api/v1/key":
            if not self.valid_origin():
                self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
                return
            session = self.session()
            if not session:
                self.respond(401, {"error": "请先登录网站"})
                return
            with db() as con:
                token = api_v1.create_key(con, session[0])
            self.respond(200, {"username": session[1], "apiKey": token,
                               "message": "仅显示一次；重新生成会使旧密钥失效"})
            return
        if not self.headers.get("Authorization") and not self.valid_origin():
            self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
            return
        data = self.body()
        if data is None:
            self.respond(400, {"error": "请求格式无效"})
            return
        user = self.v1_user(data.get("username", ""))
        if not user:
            return
        if path == "/api/v1/doses":
            try:
                drug = api_v1.canonical_drug(data.get("drug"))
                if drug not in api_v1.DRUGS:
                    raise ValueError("不支持该药物")
                unit = data.get("unit", "mg")
                if unit not in ("mg", "g"):
                    raise ValueError("单位只能是 mg 或 g")
                amount = api_v1.number(data.get("amount"), "剂量", .001, 1000000)
                mg = amount * (1000 if unit == "g" else 1)
                if mg > 1000000:
                    raise ValueError("剂量过大")
                taken_at = api_v1.parse_time(data.get("time") or None)
                if abs(taken_at - api_v1.now_ms()) > 366 * 86400000:
                    raise ValueError("服用时间超出允许范围")
                key = data.get("idempotencyKey")
                if key is not None and (not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", key)):
                    raise ValueError("幂等键格式无效")
                record = {"id": key or secrets.token_urlsafe(18),
                          "courseId": "day-" + api_v1.date_key(taken_at),
                          "drug": drug, "time": taken_at, "mg": mg, "unit": unit}
                with db() as con:
                    con.execute("BEGIN IMMEDIATE")
                    row = con.execute("SELECT version,body FROM user_state WHERE user_id=?", (user["id"],)).fetchone()
                    state = json.loads(row["body"])
                    existing = next((r for r in state.get("records", []) if r.get("id") == record["id"]), None)
                    if existing:
                        same_dose = all(existing.get(field) == record[field] for field in ("drug", "mg", "unit"))
                        same_time = not data.get("time") or existing.get("time") == record["time"]
                        if not same_dose or not same_time:
                            self.respond(409, {"error": "幂等键已用于另一条记录"})
                            return
                        record = existing
                        version = row["version"]
                    else:
                        if len(state.get("records", [])) >= 10000:
                            raise ValueError("记录已达到上限")
                        state.setdefault("records", []).append(record)
                        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
                        if len(payload.encode()) > MAX_BODY - 100:
                            raise ValueError("同步数据过大")
                        con.execute("UPDATE user_state SET version=version+1,body=? WHERE user_id=?",
                                    (payload, user["id"]))
                        state_store.mirror(con, user["id"], state, ("records",))
                        version = row["version"] + 1
                self.respond(200 if existing else 201,
                             {"username": user["username"], "version": version, "dose": record,
                              "message": f"已记录 {api_v1.DRUGS[drug][0]} {amount:g} {unit}，服用时间 {api_v1.public_time(taken_at).replace('T', ' ')}。"})
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
        elif path in ("/api/v1/curve", "/api/v1/curve.png"):
            try:
                day = data.get("date") or api_v1.date_key(api_v1.now_ms())
                payload = self.curve_payload(user, data.get("drug"), day,
                                             data.get("stepMinutes", "30"))
                if path.endswith(".png"):
                    self.respond_png(curve_png.render(payload["points"]))
                else:
                    self.respond(200, payload)
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
        elif path == "/api/v1/inverse/point":
            try:
                drug = api_v1.canonical_drug(data.get("drug"))
                mode = {"血药浓度 mg/L": "blood", "剂量等效量 mg": "equivalent"}.get(
                    data.get("mode", "blood"), data.get("mode", "blood"))
                if mode not in ("blood", "equivalent"):
                    raise ValueError("模式只能是 blood 或 equivalent")
                threshold = api_v1.number(data.get("threshold"), "参考值", .000001, 1000000)
                target = api_v1.parse_time(data.get("targetTime"))
                now = api_v1.now_ms()
                if target <= now or target > now + 24 * 3600000:
                    raise ValueError("目标时刻须为未来 24 小时内")
                cap = data.get("maxDose")
                cap = api_v1.number(cap, "单次上限", .001, 1000000) if cap not in (None, "") else float("inf")
                count = data.get("count")
                count = int(count) if isinstance(count, str) and count.isdecimal() else count
                if count == "": count = None
                if count is not None and (type(count) is not int or not 1 <= count <= 8):
                    raise ValueError("次数须为 1–8 的整数")
                _, state = self.v1_state(user["id"])
                model = api_v1.Model(drug, state)
                result = model.point_inverse(threshold, target, now, mode, cap, count)
                if result.get("alreadyAbove"):
                    message = "已记录曲线在目标时段的采样点高于参考值。"
                elif result.get("reason") == "specs":
                    message = "请先在网站保存该药物的药盒规格。"
                elif result.get("reason"):
                    message = "有限候选搜索未找到符合条件的数学情景。"
                else:
                    rows = "\n".join(f"{r['timeIso']} · {r['mg']:g} mg" for r in result["doses"])
                    coverage = ("从现在起均达到参考线" if result["allCovered"] else
                                "从 " + api_v1.public_time(result["continuousFrom"]) + " 起达到参考线"
                                if result["continuousFrom"] else "目标前未连续达到参考线")
                    message = f"模型合计 {result['totalMg']:g} mg，{result['count']} 个假设节点。\n{rows}\n{coverage}。"
                self.respond(200, {"username": user["username"], "drug": drug,
                                   "drugName": model.name, "mode": mode, "threshold": threshold,
                                   "targetTime": api_v1.public_time(target), "result": result,
                                   "message": message + "\n数学情景，非服药建议。"})
            except (TypeError, KeyError):
                self.respond(400, {"error": "反算参数无效"})
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
        elif path == "/api/v1/inverse":
            try:
                drug = api_v1.canonical_drug(data.get("drug"))
                mode = data.get("mode", "blood")
                mode = {"血药浓度 mg/L": "blood", "剂量等效量 mg": "equivalent"}.get(mode, mode)
                if mode not in ("blood", "equivalent"):
                    raise ValueError("模式只能是 blood 或 equivalent")
                threshold = api_v1.number(data.get("threshold"), "参考值", .000001, 1000000)
                start = api_v1.parse_time(data.get("targetStart"))
                hours = api_v1.number(data.get("holdHours"), "持续时长", .25, 24)
                now = api_v1.now_ms()
                if start < now - 60000 or start > now + 24 * 3600000:
                    raise ValueError("开始时间须为未来 24 小时内")
                count = data.get("count")
                if count == "":
                    count = None
                elif isinstance(count, str) and count.isdecimal():
                    count = int(count)
                if count is not None and (type(count) is not int or not 1 <= count <= 8):
                    raise ValueError("次数须为 1–8 的整数")
                _, state = self.v1_state(user["id"])
                model = api_v1.Model(drug, state)
                result = model.inverse(threshold, start, hours, now, mode, count)
                if result.get("alreadyAbove"):
                    message = "已记录曲线在指定时段的采样点高于参考值。"
                elif result.get("reason") == "specs":
                    message = "请先在网站保存该药物的药盒规格。"
                elif result.get("reason"):
                    message = "有限候选搜索未找到覆盖整个时段的组合。"
                else:
                    rows = "\n".join(f"{r['timeIso']} · {r['mg']:g} mg" for r in result["doses"])
                    message = f"模型合计 {result['totalMg']:g} mg，{result['count']} 个假设节点。\n{rows}"
                self.respond(200, {"username": user["username"], "drug": drug,
                                   "drugName": model.name, "mode": mode, "threshold": threshold,
                                   "targetStart": api_v1.public_time(start), "holdHours": hours,
                                   "result": result, "message": message + "\n数学情景，非服药建议。",
                                   "model": "有限候选数学反算，非服药建议"})
            except (TypeError, KeyError) as exc:
                self.respond(400, {"error": "反算参数无效"})
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
        else:
            self.respond(404, {"error": "接口不存在"})

    def do_GET(self) -> None:
        if not self.valid_host():
            self.respond(421, {"error": "请使用正式 HTTPS 域名"})
            return
        if self.endpoint().startswith("/api/v1/"):
            self.v1_get()
            return
        if self.endpoint() == "/api/health":
            self.respond(200, {"ok": True})
            return
        if self.endpoint() == "/api/native/version":
            try:
                self.respond(200, native_release_distribution.package())
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                self.respond(503, {"error": "发行版本信息暂不可用"})
            return
        if self.endpoint() == "/api/native/model":
            try:
                self.respond(200, model_distribution.package())
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                # Fail closed. Never serve a partially generated catalog.
                self.respond(503, {"error": "模型数据暂不可用；请保留本机已验证版本"})
            return
        if self.endpoint() == "/api/native/engine":
            try:
                self.respond(200, native_engine_distribution.package())
            except (OSError, ValueError, TypeError):
                self.respond(503, {"error": "签名算法包暂不可用，本机版本继续有效"})
            return
        if self.endpoint() == "/api/native/engine":
            try:
                self.respond(200, native_engine_distribution.package())
            except (OSError, ValueError, TypeError):
                self.respond(503, {"error": "签名算法包暂不可用，本机版本继续有效"})
            return
        if self.endpoint() == "/api/native/login":
            query=parse_qs(urlsplit(self.path).query)
            challenge=query.get("challenge",[""])[0]
            state=query.get("state",[""])[0]
            valid = native_auth.valid_challenge(challenge) and native_auth.valid_state(state)
            page=(native_auth.LOGIN_PAGE if valid else native_auth.INVALID_REQUEST_PAGE).encode("utf-8")
            self.send_response(200 if valid else 400)
            self.send_header("Content-Type","text/html; charset=utf-8")
            self.send_header("Content-Length",str(len(page)))
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Referrer-Policy","no-referrer")
            self.send_header("X-Frame-Options","DENY")
            self.send_header("Content-Security-Policy",
                             "default-src 'none'; script-src 'self'; style-src 'self'; "
                             "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(page)
            return
        session = self.session()
        if not session:
            self.respond(401, {"error": "请先登录"})
            return
        user_id, username, _ = session
        if self.endpoint() == "/api/me":
            with db() as con:
                row=con.execute("SELECT expires_at,absolute_expires_at,remembered FROM sessions WHERE token_hash=?",
                                (session[2],)).fetchone()
            now=int(time.time())
            remaining=min(row["expires_at"],row["absolute_expires_at"])-now
            jar=cookies.SimpleCookie(self.headers.get("Cookie",""))
            self.respond(200,{"username":username,"remembered":bool(row["remembered"]),
                              "sessionExpiresAt":min(row["expires_at"],row["absolute_expires_at"])*1000},
                         session=jar[COOKIE].value,session_age=remaining,
                         persistent_cookie=bool(row["remembered"]))
        elif self.endpoint() == "/api/sessions":
            now=int(time.time())
            with db() as con:
                rows=con.execute("""SELECT token_hash,created_at,last_active_at,
                    expires_at,absolute_expires_at,remembered,device_name,
                    device_platform,device_os,login_method,device_key
                    FROM sessions WHERE user_id=? AND expires_at>? AND absolute_expires_at>?
                    ORDER BY last_active_at DESC""",(user_id,now,now)).fetchall()
            self.respond(200,{"sessions":[{
                "id":r["token_hash"],"name":r["device_name"] or "未知浏览器",
                "platform":r["device_platform"] or "未知系统",
                "osVersion":r["device_os"] or "版本未提供",
                "loginMethod":r["login_method"] or "legacy",
                "identifiedInstallation":bool(r["device_key"]),
                "current":r["token_hash"]==session[2],
                "remembered":bool(r["remembered"]),
                "createdAt":r["created_at"]*1000,
                "lastActiveAt":None if r["device_name"].startswith("旧会话（") else r["last_active_at"]*1000,
                "expiresAt":min(r["expires_at"],r["absolute_expires_at"])*1000
            } for r in rows]})
        elif self.endpoint() == "/api/state":
            with db() as con:
                row = con.execute("SELECT version, body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
            self.respond(200, {"version": row["version"], "state": json.loads(row["body"]), "syncPolicy": last_upload.POLICY})
        elif self.endpoint() == "/api/state/sections":
            with db() as con:
                row = con.execute("SELECT version FROM user_state WHERE user_id=?", (user_id,)).fetchone()
                sections = state_store.load_sections(con, user_id)
            self.respond(200, {"version": row["version"], "sections": sections})
        elif self.endpoint() == "/api/native/apns/status":
            self.respond(200, {"registeredDevices": native_apns.count(user_id),
                               "providerConfigured": native_apns.configured(),
                               "guaranteedBackgroundDelivery": False})
        elif self.endpoint() == "/api/push/config":
            try:
                self.respond(200, {"publicKey": push_service.public_key()})
            except OSError:
                self.respond(503, {"error": "推送服务尚未配置"})
        elif self.endpoint() == "/api/push/preferences":
            with db() as con:
                prefs = push_service.preferences(con, user_id)
            self.respond(200, {"preferences": prefs,
                               "drugs": [{"id": key, "name": value[0]} for key, value in api_v1.DRUGS.items()]})
        elif self.endpoint() == "/api/push/pending":
            with db() as con:
                prefs = push_service.preferences(con, user_id)
                row = con.execute("SELECT body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
            now = api_v1.now_ms()
            with db() as con:
                events = push_service.timeline_events(json.loads(row["body"]), prefs, now + 1, now + 7 * 86400000)
                if prefs["auto"]:
                    events += push_service.adopted_plan_events(json.loads(row["body"]), now + 1, now + 7 * 86400000)
            events = sorted(events, key=lambda event: event["time"])
            self.respond(200, {"events": events, "windowDays": 7,
                               "model": "模型预测时间和个人参考线；非实测浓度、真实药效或用药建议"})
        elif self.endpoint() == "/api/push/diagnostics":
            # The Web Push gateway only acknowledges provider acceptance.
            # It cannot confirm the user's OS displayed a notification.
            now = int(time.time())
            with db() as con:
                count = con.execute(
                    "SELECT COUNT(*) FROM push_subscriptions WHERE user_id=?",
                    (user_id,)).fetchone()[0]
                delivery = con.execute("""
                    SELECT COUNT(*) AS total,
                      SUM(CASE WHEN d.sent_at>=? THEN 1 ELSE 0 END) AS recent,
                      MAX(d.sent_at) AS latest
                    FROM push_deliveries d JOIN push_subscriptions s
                    ON s.endpoint_hash=d.endpoint_hash WHERE s.user_id=?
                    """, (now - 86400,user_id)).fetchone()
                items = con.execute("""
                    SELECT d.sent_at AS at FROM push_deliveries d
                    JOIN push_subscriptions s ON s.endpoint_hash=d.endpoint_hash
                    WHERE s.user_id=? ORDER BY d.sent_at DESC LIMIT 12
                    """, (user_id,)).fetchall()
            self.respond(200, {
                "subscribedDevices": count,
                "acceptedByProviderTotal": delivery["total"] or 0,
                "acceptedLast24h": delivery["recent"] or 0,
                "lastProviderAcceptedAt": (delivery["latest"] * 1000 if delivery["latest"] else None),
                "recentProviderAcceptances": [item["at"]*1000 for item in items],
                "deviceDeliveryConfirmed": False,
                "caveat": "仅记录推送服务商接受请求，无法确认设备是否弹出或用户是否看到通知。"
            })
        elif self.endpoint() == "/api/push/scenarios":
            with db() as con:
                row = con.execute("SELECT body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
                prefs = push_service.preferences(con, user_id)
            now = api_v1.now_ms()
            events = (push_service.adopted_plan_events(json.loads(row["body"]), now + 1, now + 7 * 86400000)
                      if prefs["auto"] else [])
            # Legacy manual rows are retained for rollback but no longer
            # create live reminders; the adopted model state is authoritative.
            self.respond(200, {"scenarios": [], "automatic": events, "enabled": prefs["auto"]})
        else:
            self.respond(404, {"error": "接口不存在"})

    def do_POST(self) -> None:
        if self.valid_host() and self.endpoint().startswith("/api/v1/"):
            self.v1_post()
            return
        if not self.valid_host() or not self.valid_origin():
            self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
            return
        path = self.endpoint()
        if path == "/api/native/math/samples":
            ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
            if not rate_ok("math-samples:"+ip, 20, 60):
                self.respond(429, {"error":"模型查询频率过高"})
                return
            try:
                n=int(self.headers.get("Content-Length","-1"))
                if n<2 or n>110_000:
                    raise ValueError("数学模型请求大小超限")
                data=self.body()
                if data is None:
                    raise ValueError("数学模型请求格式无效")
                self.respond(200, math_runtime.run(data))
            except (ValueError, OverflowError) as exc:
                self.respond(400, {"error":str(exc)})
            return
        if path in ("/api/register", "/api/login"):
            self.auth(path)
            return
        if path == "/api/native/exchange":
            self.exchange_native()
            return
        session = self.session()
        if not session:
            self.respond(401, {"error": "请先登录"})
            return
        user_id = session[0]
        if path == "/api/native/authorize":
            self.authorize_native(user_id)
            return
        if path == "/api/native/apns/register":
            body = self.body()
            if not body or not native_apns.register(user_id,body.get("deviceToken"),body.get("environment")):
                self.respond(400, {"error":"APNs 设备令牌或环境无效"})
                return
            self.respond(200, {"ok":True,"providerConfigured":native_apns.configured()})
            return
        if path == "/api/native/apns/unregister":
            body = self.body()
            if not body or not native_apns.unregister(user_id,body.get("deviceToken")):
                self.respond(400, {"error":"APNs 注销参数无效"})
                return
            self.respond(200, {"ok":True})
            return
        if path == "/api/sessions/revoke":
            payload=self.body()
            target=payload.get("id") if payload else None
            if not isinstance(target,str) or not re.fullmatch(r"[a-f0-9]{64}",target):
                self.respond(400,{"error":"会话标识无效"})
                return
            with db() as con:
                updated=con.execute("DELETE FROM sessions WHERE user_id=? AND token_hash=?",
                                    (user_id,target)).rowcount
            self.respond(200,{"ok":True,"revoked":bool(updated),"current":target==session[2]},
                         clear=target==session[2])
            return
        elif path == "/api/sessions/revoke-others":
            # Keep the authenticated current browser and revoke only other
            # sessions owned by the same user.
            with db() as con:
                count=con.execute(
                    "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
                    (user_id,session[2])).rowcount
            self.respond(200,{"ok":True,"revoked":count})
            return
        elif path == "/api/logout":
            with db() as con:
                con.execute("DELETE FROM sessions WHERE token_hash=?", (session[2],))
            self.respond(200, {"ok": True}, clear=True)
        elif path == "/api/push/scenarios":
            self.respond(410, {"error": "模型提醒已改为随已采用方案自动同步，无需单独保存提醒。"})
            return
        elif path == "/api/push/subscribe":
            data = self.body()
            try:
                subscription = push_service.validate_subscription(data.get("subscription") if data else None)
                if not isinstance(data.get("details"), bool):
                    raise ValueError("通知隐私设置无效")
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
                return
            digest = push_service.endpoint_hash(subscription["endpoint"])
            with db() as con:
                count = con.execute("SELECT COUNT(*) FROM push_subscriptions WHERE user_id=? AND endpoint_hash<>?", (user_id, digest)).fetchone()[0]
                if count >= 10:
                    self.respond(409, {"error": "账号已绑定 10 台设备，请先在旧设备关闭通知"})
                    return
                con.execute("INSERT INTO push_subscriptions(endpoint_hash,user_id,endpoint,p256dh,auth,details,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,details=excluded.details",
                            (digest, user_id, subscription["endpoint"], subscription["keys"]["p256dh"], subscription["keys"]["auth"], int(data["details"]), int(time.time())))
            self.respond(200, {"ok": True})
        elif path == "/api/push/test":
            if not rate_ok(f"push-test:{user_id}", 3, 60):
                self.respond(429, {"error": "测试过于频繁，请稍后再试"})
                return
            data = self.body()
            endpoint = data.get("endpoint") if data else None
            if not isinstance(endpoint, str) or len(endpoint) > 2048:
                self.respond(400, {"error": "缺少当前设备的推送订阅"})
                return
            with db() as con:
                row = con.execute("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE endpoint_hash=? AND user_id=?", (push_service.endpoint_hash(endpoint), user_id)).fetchone()
            if not row:
                self.respond(404, {"error": "当前设备未开启提醒"})
                return
            try:
                push_service.send({"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}},
                                  {"title": "药时 · 通知测试", "body": "通知已连接。实际提醒按记录与模型参考线计算。", "url": "/"})
            except Exception:
                self.respond(502, {"error": "推送服务暂时未能发送，请稍后重试"})
                return
            self.respond(200, {"ok": True})
        elif path == "/api/push/status":
            data = self.body()
            endpoint = data.get("endpoint") if data else None
            if not isinstance(endpoint, str) or len(endpoint) > 2048:
                self.respond(400, {"error": "缺少当前设备的推送订阅"})
                return
            with db() as con:
                row = con.execute("SELECT details FROM push_subscriptions WHERE endpoint_hash=? AND user_id=?",
                                  (push_service.endpoint_hash(endpoint), user_id)).fetchone()
            self.respond(200, {"enabled": bool(row), "details": bool(row["details"]) if row else False})
        else:
            self.respond(404, {"error": "接口不存在"})

    def do_DELETE(self) -> None:
        if self.endpoint() == "/api/push/scenarios":
            if not self.valid_host() or not self.valid_origin():
                self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
                return
            session = self.session()
            if not session:
                self.respond(401, {"error": "请先登录网站"})
                return
            data = self.body()
            scenario_id = data.get("id") if data else None
            if not isinstance(scenario_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,30}", scenario_id):
                self.respond(400, {"error": "情景编号无效"})
                return
            with db() as con:
                con.execute("DELETE FROM push_scenarios WHERE id=? AND user_id=?", (scenario_id, session[0]))
            self.respond(200, {"ok": True})
            return
        if self.endpoint() == "/api/push/subscribe":
            if not self.valid_host() or not self.valid_origin():
                self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
                return
            session = self.session()
            if not session:
                self.respond(401, {"error": "请先登录网站"})
                return
            data = self.body()
            endpoint = data.get("endpoint") if data else None
            if not isinstance(endpoint, str) or len(endpoint) > 2048:
                self.respond(400, {"error": "缺少当前设备的推送订阅"})
                return
            digest = push_service.endpoint_hash(endpoint)
            with db() as con:
                con.execute("DELETE FROM push_subscriptions WHERE endpoint_hash=? AND user_id=?", (digest, session[0]))
            self.respond(200, {"ok": True})
            return
        if not self.valid_host() or not self.valid_origin() or self.endpoint() != "/api/v1/key":
            self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
            return
        session = self.session()
        if not session:
            self.respond(401, {"error": "请先登录网站"})
            return
        with db() as con:
            con.execute("DELETE FROM api_keys WHERE user_id=?", (session[0],))
        self.respond(200, {"ok": True})

    def authorize_native(self, user_id: int) -> None:
        request = self.body()
        if not request or not rate_ok(f"native:authorize:{user_id}", 40, 3600):
            self.respond(429, {"error": "授权请求无效或过于频繁"})
            return
        challenge, state = request.get("challenge"), request.get("state")
        code = native_auth.issue(user_id, challenge, state)
        if not code:
            self.respond(400, {"error": "设备授权参数无效"})
            return
        self.respond(200, {"callback": native_auth.callback(code, state),
                           "expiresIn": native_auth.TTL})

    def exchange_native(self) -> None:
        ip = self.headers.get("X-Real-IP", self.client_address[0])
        if not rate_ok(f"native:exchange:{ip}", 30, 900):
            self.respond(429, {"error": "设备授权尝试过于频繁"})
            return
        body = self.body()
        if not body:
            self.respond(400, {"error": "交换请求格式无效"})
            return
        user_id = native_auth.consume(body.get("code"), body.get("verifier"), body.get("state"))
        if not user_id:
            self.respond(401, {"error": "设备授权已失效或验证失败，请重新登录"})
            return
        now=int(time.time())
        token=secrets.token_urlsafe(32)
        with db() as con:
            row=con.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
            if not row:
                self.respond(401, {"error": "账号不存在"})
                return
            info=session_devices.from_request(user_id,body,"ios-native",
                         fallback="药时 iOS 原生 App")
            session_devices.prune_old_same_installation(con,user_id,info)
            con.execute("""INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_active_at,
                absolute_expires_at,remembered,device_name,device_key,device_platform,
                device_os,login_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (hashlib.sha256(token.encode()).hexdigest(),user_id,now+REMEMBER_IDLE,now,now,
                 now+REMEMBER_ABSOLUTE,1,info["device_name"],info["device_key"],
                 info["device_platform"],info["device_os"],info["login_method"]))
        # Only HTTPS JSON response carries the long-lived credential. Never
        # put a session token in the callback or in HTTP access logs.
        self.respond(200, {"username": row["username"], "sessionToken": token,
                           "sessionExpiresAt": (now + REMEMBER_IDLE)*1000})

    def auth(self, path: str) -> None:
        data = self.body()
        if not data:
            self.respond(400, {"error": "请求格式无效"})
            return
        username = str(data.get("username", "")).strip().lower()
        password = data.get("password", "")
        if not USER_RE.fullmatch(username) or not isinstance(password, str) or len(password) > 128:
            self.respond(400, {"error": "用户名需为 3–32 位字母、数字或下划线；密码格式无效"})
            return
        ip = self.headers.get("X-Real-IP", self.client_address[0])
        if not rate_ok(f"{path}:{ip}:{username}", 10 if path.endswith("login") else 4, 900 if path.endswith("login") else 3600):
            self.respond(429, {"error": "尝试过于频繁，请稍后再试"})
            return
        if path == "/api/register":
            if len(password) < 12:
                self.respond(400, {"error": "密码至少 12 个字符"})
                return
            salt = secrets.token_bytes(16)
            with db() as con:
                try:
                    cur = con.execute("INSERT INTO users(username,salt,password_hash,created_at) VALUES(?,?,?,?)", (username, salt, password_hash(password, salt), int(time.time())))
                    user_id = cur.lastrowid
                    con.execute("INSERT INTO user_state(user_id,version,body) VALUES(?,?,?)", (user_id, 0, '{"records":[],"courses":[],"plans":{},"settings":{}}'))
                    state_store.mirror(con, user_id, state_store.DEFAULTS, state_store.SECTIONS)
                except sqlite3.IntegrityError:
                    self.respond(409, {"error": "用户名已存在"})
                    return
        else:
            with db() as con:
                row = con.execute("SELECT id,salt,password_hash FROM users WHERE username=?", (username,)).fetchone()
            dummy_salt = b"\x00" * 16
            computed = password_hash(password, row["salt"] if row else dummy_salt)
            if not row or not hmac.compare_digest(computed, row["password_hash"]):
                self.respond(401, {"error": "用户名或密码不正确"})
                return
            user_id = row["id"]
        token = secrets.token_urlsafe(32)
        remember=data.get("remember",True)
        if type(remember) is not bool:
            self.respond(400,{"error":"设备登录选项无效"})
            return
        label=str(data.get("deviceName") or "").strip()
        if len(label)>50:
            self.respond(400,{"error":"设备名称不能超过 50 个字符"})
            return
        if not label:
            ua=self.headers.get("User-Agent","")
            label=("iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else
                   "Android" if "Android" in ua else "Mac" if "Macintosh" in ua else
                   "Windows" if "Windows" in ua else "浏览器")+" · 网页"
        # Label is only user-facing metadata, never used as an authentication
        # secret or a device fingerprint.
        now=int(time.time())
        idle=REMEMBER_IDLE if remember else NORMAL_IDLE
        absolute=REMEMBER_ABSOLUTE if remember else NORMAL_ABSOLUTE
        with db() as con:
            con.execute("DELETE FROM sessions WHERE expires_at<? OR absolute_expires_at<?",(now,now))
            info=session_devices.from_request(user_id,data,"web",fallback=label)
            session_devices.prune_old_same_installation(con,user_id,info)
            con.execute("""INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_active_at,
                absolute_expires_at,remembered,device_name,device_key,device_platform,
                device_os,login_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (hashlib.sha256(token.encode()).hexdigest(),user_id,now+idle,now,now,
                 now+absolute,int(remember),info["device_name"],info["device_key"],
                 info["device_platform"],info["device_os"],info["login_method"]))
        with db() as con:
            current = con.execute("SELECT version,body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
        self.respond(200,{"username":username,"remembered":remember,
            "sessionExpiresAt":(now+idle)*1000,
            "account":{"version":current["version"],"state":json.loads(current["body"])}},
            session=token,session_age=idle,persistent_cookie=remember)

    def do_PUT(self) -> None:
        if not self.valid_host() or not self.valid_origin() or self.endpoint() not in ("/api/state", "/api/state/sections", "/api/push/preferences"):
            self.respond(403, {"error": "请通过正式 HTTPS 页面操作"})
            return
        session = self.session()
        if not session:
            self.respond(401, {"error": "请先登录"})
            return
        if self.endpoint() == "/api/push/preferences":
            data = self.body()
            try:
                prefs = push_service.validate_preferences(data.get("preferences") if data else None)
            except ValueError as exc:
                self.respond(400, {"error": str(exc)})
                return
            with db() as con:
                con.execute("INSERT INTO push_preferences(user_id,body) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body",
                            (session[0], json.dumps(prefs, ensure_ascii=False)))
            self.respond(200, {"preferences": prefs})
            return
        data = self.body()
        section_mode = self.endpoint() == "/api/state/sections"
        if not data or not isinstance(data.get("version"), int):
            self.respond(400, {"error": "同步数据格式无效"})
            return
        if section_mode:
            changed = data.get("sections")
            if not isinstance(changed, dict) or not changed or any(name not in state_store.SECTIONS for name in changed):
                self.respond(400, {"error": "同步分区无效"})
                return
        else:
            if not isinstance(data.get("state"), dict):
                self.respond(400, {"error": "同步数据格式无效"})
                return
            changed = None
        sync_policy = data.get("syncPolicy")
        use_lww = sync_policy == last_upload.POLICY
        if sync_policy not in (None, last_upload.POLICY):
            self.respond(400, {"error": "不支持的同步策略"})
            return
        if use_lww and (section_mode or not last_upload.valid_operation_id(data.get("operationId"))):
            self.respond(400, {"error": "最后上传者优先需要完整快照和唯一上传编号"})
            return
        with db() as con:
            # SQLite assigns the ordering, not the client device clock.
            con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT version,body FROM user_state WHERE user_id=?", (session[0],)).fetchone()
            if use_lww:
                receipt = last_upload.lookup(con, session[0], data["operationId"])
                if receipt is not None:
                    self.respond(200, {"version": row["version"], "acceptedVersion": receipt,
                                       "replayed": True, "syncPolicy": last_upload.POLICY})
                    return
            elif row["version"] != data["version"]:
                self.respond(409, {"error": "另一台设备已更新数据", "version": row["version"], "state": json.loads(row["body"])})
                return
            previous = json.loads(row["body"])
            state = {**previous, **changed} if section_mode else data["state"]
            if (not isinstance(state.get("records"), list) or len(state["records"]) > 10000 or
                not isinstance(state.get("courses"), list) or len(state["courses"]) > 3000 or
                not isinstance(state.get("intakes", []), list) or len(state.get("intakes", [])) > 10000 or
                not isinstance(state.get("plans"), dict) or len(state["plans"]) > 100 or
                not isinstance(state.get("settings"), dict)):
                self.respond(400, {"error": "同步数据超出允许范围"})
                return
            payload = state_store.compact(state)
            if len(payload.encode()) > MAX_BODY - 100:
                self.respond(413, {"error": "同步数据过大"})
                return
            names = [name for name in state_store.SECTIONS if previous.get(name, state_store.DEFAULTS[name]) != state.get(name, state_store.DEFAULTS[name])]
            if use_lww:
                # Keep 20 private, bounded recovery points before replacement.
                last_upload.backup(con, session[0], row["version"], row["body"])
            con.execute("UPDATE user_state SET version=version+1,body=? WHERE user_id=?", (payload, session[0]))
            state_store.mirror(con, session[0], state, names)
            version = row["version"] + 1
            adopted_changed = push_service.adopted_signature(previous) != push_service.adopted_signature(state)
            if adopted_changed:
                push_service.queue_adopted_change(con, session[0], version)
            if use_lww:
                last_upload.remember(con, session[0], data["operationId"], version)
        self.respond(200, {"version": version,
                           "syncPolicy": last_upload.POLICY if use_lww else "conditional-v1"})
        if names:
            native_apns.schedule_change(session[0], version, adopted_changed=adopted_changed)


if __name__ == "__main__":
    setup()
    threading.Thread(target=push_service.scheduler, args=(DB,), daemon=True, name="web-push-scheduler").start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
