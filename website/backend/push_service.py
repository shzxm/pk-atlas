"""Opt-in Web Push for recorded doses and model-estimated stages."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import sqlite3
import time
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import api_v1

PRIVATE_KEY = os.environ.get("PK_VAPID_PRIVATE", "/var/lib/pk-atlas/vapid-private.pem")
PUBLIC_KEY = os.environ.get("PK_VAPID_PUBLIC", "/var/lib/pk-atlas/vapid-public.txt")
VAPID_SUBJECT = os.environ.get("PK_VAPID_SUBJECT", "mailto:admin@example.com")
KINDS = ("dose", "comeup", "peak", "offset", "end")
LABELS = {"dose": "服药时间", "comeup": "上升越过低参考线", "peak": "模型预计峰值",
          "offset": "下降越过高参考线", "end": "下降低于低参考线"}
DEFAULT_PREFERENCES = {"auto": True,
                       "enabled": {"dose": False, "comeup": False, "peak": True,
                                   "offset": False, "end": False},
                       "thresholds": {}}
SCENARIO_LABELS = {"point-a": "目标时刻方案 A", "point-b": "目标时刻方案 B", "point-c": "目标时刻方案 C", "duration": "持续时长情景"}


def prune_scenarios(con: sqlite3.Connection, now_s: int | None = None) -> int:
    """Keep scenarios created today or yesterday in the site's Asia/Shanghai timezone."""
    current = int(time.time() if now_s is None else now_s)
    yesterday = datetime.fromtimestamp(current, api_v1.TZ).date() - timedelta(days=1)
    cutoff = int(datetime(yesterday.year, yesterday.month, yesterday.day, tzinfo=api_v1.TZ).timestamp())
    cursor = con.execute("DELETE FROM push_scenarios WHERE created_at<?", (cutoff,))
    return cursor.rowcount


def validate_scenario(value: object, now_ms: int) -> dict:
    if not isinstance(value, dict) or value.get("kind") not in SCENARIO_LABELS or value.get("drug") not in api_v1.DRUGS:
        raise ValueError("模型情景类型或药物无效")
    doses = value.get("doses")
    if not isinstance(doses, list) or not 1 <= len(doses) <= 12:
        raise ValueError("模型情景须有 1—12 个时间节点")
    clean = []
    for dose in doses:
        if not isinstance(dose, dict):
            raise ValueError("模型情景节点无效")
        at, mg = dose.get("time"), dose.get("mg")
        if (isinstance(at, bool) or not isinstance(at, (int, float)) or not math.isfinite(at) or
            at < now_ms + 60000 or at > now_ms + 7 * 86400000 or
            isinstance(mg, bool) or not isinstance(mg, (int, float)) or not math.isfinite(mg) or not 0 < mg <= 1000000):
            raise ValueError("仅能保存未来 7 天内、至少 1 分钟后的有效节点")
        clean.append({"time": int(at), "mg": round(float(mg), 3)})
    clean.sort(key=lambda item: item["time"])
    return {"kind": value["kind"], "drug": value["drug"], "doses": clean}


def scenario_events(con: sqlite3.Connection, user_id: int, start_ms: int, end_ms: int) -> list[dict]:
    rows = con.execute("SELECT id,kind,drug,doses FROM push_scenarios WHERE user_id=?", (user_id,)).fetchall()
    events = []
    for row in rows:
        for index, dose in enumerate(json.loads(row["doses"])):
            at = dose["time"]
            if start_ms <= at <= end_ms:
                events.append({"id": f"scenario:{row['id']}:{index}", "kind": "scenario", "label": "模型情景时间提醒", "source": SCENARIO_LABELS[row["kind"]],
                               "time": at, "timeIso": api_v1.public_time(at), "drug": row["drug"],
                               "drugName": api_v1.DRUGS[row["drug"]][0], "doseMg": dose["mg"], "levelMgL": None})
    return events


def adopted_plan_events(state: dict, start_ms: int, end_ms: int) -> list[dict]:
    """Derive reminders from the *currently adopted* model plan.

    No extra save button, legacy scenario row, or database migration is needed:
    accepted adjustments and cancelled plans immediately change the next
    scheduler read. Completed nodes are matched against actual records using
    the same nearest-half-interval (max 2h) rule as the UI.

    These are mathematical scenarios, never prescriptions.
    """
    if end_ms < start_ms:
        return []
    now = int(time.time() * 1000)
    settings = state.get("settings") or {}
    memory = settings.get("inverseMemory") or {}
    if not isinstance(memory, dict):
        return []
    records = state.get("records") or []
    result = []
    for drug, entry in memory.items():
        if drug not in api_v1.DRUGS or drug in api_v1.RECORD_ONLY or not isinstance(entry, dict):
            continue
        plan = entry.get("adoptedPointPlan")
        if not isinstance(plan, dict) or plan.get("v") != 1 or plan.get("drug") != drug:
            continue
        raw = plan.get("doses")
        if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
            continue
        doses = []
        for item in raw:
            if not isinstance(item, dict):
                break
            at, mg = item.get("time"), item.get("mg")
            if (isinstance(at, bool) or not isinstance(at, (int, float)) or not math.isfinite(at)
                or isinstance(mg, bool) or not isinstance(mg, (int, float)) or not math.isfinite(mg)
                or mg <= 0 or mg > 1000000):
                break
            doses.append({"time": int(at), "mg": round(float(mg), 3)})
        if len(doses) != len(raw):
            continue
        baseline = set(plan.get("baselineIds") or [])
        adopted_at = plan.get("adoptedAt") or now
        target = plan.get("target") or max(d["time"] for d in doses)
        earliest = min(int(adopted_at), *(d["time"] for d in doses)) - 6 * 3600000
        candidates = [r for r in records if isinstance(r, dict) and r.get("drug") == drug
                      and r.get("id") not in baseline and isinstance(r.get("time"), (int, float))
                      and isinstance(r.get("mg"), (int, float))
                      and earliest <= r["time"] <= min(target, now)]
        candidates.sort(key=lambda r: r["time"])
        used_nodes, used_records = set(), set()
        manual = plan.get("manualMatches") or {}
        if not isinstance(manual, dict):
            manual = {}
        for i, dose in enumerate(doses):
            key = str(i)
            if key not in manual:
                continue
            rid = manual[key]
            if rid is None:
                used_nodes.add(i)
                continue
            row = next((r for r in candidates if r["id"] == rid and rid not in used_records), None)
            if row is not None:
                used_nodes.add(i)
                used_records.add(rid)
        pairs = []
        for row in candidates:
            if row.get("id") in used_records:
                continue
            for i, dose in enumerate(doses):
                if i in used_nodes:
                    continue
                left = abs(dose["time"] - doses[i-1]["time"])/2 if i else float("inf")
                right = abs(doses[i+1]["time"]-dose["time"])/2 if i+1<len(doses) else float("inf")
                window = max(30*60000,min(2*3600000,left,right))
                delta = abs(row["time"]-dose["time"])
                if delta <= window:
                    pairs.append((delta,abs(row["mg"]-dose["mg"]),row["time"],i,row))
        pairs.sort(key=lambda x:(x[0],x[1],x[2],x[3]))
        for _,_,_,i,row in pairs:
            if i in used_nodes or row.get("id") in used_records:
                continue
            used_nodes.add(i)
            used_records.add(row["id"])
        completed = len(used_records)
        adjustment = plan.get("adjustment")
        adjusted = isinstance(adjustment, dict) and isinstance(adjustment.get("doses"), list)
        if adjusted:
            clean_adjusted=[]
            for item in adjustment["doses"][:12]:
                if not isinstance(item, dict):
                    break
                at, mg=item.get("time"),item.get("mg")
                if (isinstance(at,bool) or not isinstance(at,(int,float)) or not math.isfinite(at)
                    or isinstance(mg,bool) or not isinstance(mg,(int,float)) or not math.isfinite(mg)
                    or mg<=0 or mg>1000000):
                    break
                clean_adjusted.append({"time":int(at),"mg":round(float(mg),3)})
            adjusted_count = int(adjustment.get("completedCount",0))
            if len(clean_adjusted)!=len(adjustment["doses"]) or adjusted_count<0:
                continue
            pending = clean_adjusted[max(0,completed-adjusted_count):]
        else:
            pending = [dose for i,dose in enumerate(doses) if i not in used_nodes]
        # Key includes the adopted revision. If it changes, old undelivered
        # nodes are not scheduled; unchanged nodes cannot be sent twice.
        revision = int(adjustment.get("adoptedAt",0)) if adjusted else int(adopted_at)
        for i,dose in enumerate(pending):
            at=dose["time"]
            if not start_ms <= at <= end_ms:
                continue
            event_key=hashlib.sha256(f"adopted:{drug}:{revision}:{i}:{at}:{dose['mg']}".encode()).hexdigest()
            result.append({"id":event_key,"kind":"scenario","label":"已采用模型节点提醒",
                           "source":"已采用的反算方案（自动同步）","time":at,
                           "timeIso":api_v1.public_time(at),"drug":drug,
                           "drugName":api_v1.DRUGS[drug][0],"doseMg":dose["mg"],"levelMgL":None})
    return sorted(result,key=lambda event:(event["time"],event["drug"]))


def validate_preferences(value: object) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("auto"), bool):
        raise ValueError("提醒设置格式无效")
    enabled = value.get("enabled")
    if not isinstance(enabled, dict) or any(not isinstance(enabled.get(kind), bool) for kind in KINDS):
        raise ValueError("提醒开关格式无效")
    raw_thresholds = value.get("thresholds")
    if not isinstance(raw_thresholds, dict) or any(drug not in api_v1.DRUGS for drug in raw_thresholds):
        raise ValueError("药物参考线格式无效")
    thresholds = {}
    for drug, pair in raw_thresholds.items():
        if not isinstance(pair, dict):
            raise ValueError("药物参考线格式无效")
        clean = {}
        for name in ("low", "high"):
            number = pair.get(name)
            if number in (None, ""):
                continue
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 < number <= 1000000:
                raise ValueError("参考线须为大于 0 的 mg/L 数值")
            clean[name] = round(float(number), 6)
        if "low" in clean and "high" in clean and clean["high"] <= clean["low"]:
            raise ValueError("高参考线必须大于低参考线")
        if clean:
            thresholds[drug] = clean
    return {"auto": value["auto"], "enabled": {kind: enabled[kind] for kind in KINDS},
            "thresholds": thresholds}


def preferences(con: sqlite3.Connection, user_id: int) -> dict:
    row = con.execute("SELECT body FROM push_preferences WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        return json.loads(json.dumps(DEFAULT_PREFERENCES))
    return validate_preferences(json.loads(row["body"]))


def public_key() -> str:
    with open(PUBLIC_KEY, encoding="ascii") as handle:
        return handle.read().strip()


def validate_subscription(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("推送订阅格式无效")
    endpoint = value.get("endpoint")
    keys = value.get("keys")
    if not isinstance(endpoint, str) or len(endpoint) > 2048 or not isinstance(keys, dict):
        raise ValueError("推送订阅格式无效")
    try:
        url = urlsplit(endpoint)
    except ValueError:
        raise ValueError("推送服务地址无效") from None
    host = (url.hostname or "").lower()
    allowed = (host == "web.push.apple.com" or host.endswith(".push.apple.com") or
               host == "fcm.googleapis.com" or host == "updates.push.services.mozilla.com")
    try:
        port_ok = url.port in (None, 443)
    except ValueError:
        port_ok = False
    if url.scheme != "https" or url.username or url.password or not port_ok or not allowed:
        raise ValueError("不支持此推送服务地址")
    for name, low, high in (("p256dh", 40, 150), ("auth", 16, 100)):
        key = keys.get(name)
        if not isinstance(key, str) or not low <= len(key) <= high or not re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", key):
            raise ValueError("推送加密密钥无效")
    return {"endpoint": endpoint, "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]}}


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode()).hexdigest()


def send(subscription: dict, payload: dict) -> None:
    from pywebpush import webpush
    webpush(subscription_info=subscription, data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=PRIVATE_KEY, vapid_claims={"sub": VAPID_SUBJECT}, ttl=900,
            timeout=10)


def next_peak(model: api_v1.Model, row: dict) -> tuple[int, float] | None:
    """Find a distinct rise after this recorded dose, before the next same-drug dose."""
    start = int(row["time"])
    later = [int(other["time"]) for other in model.rows if other["time"] > start]
    stop = min(start + 12 * 3600000, min(later, default=start + 12 * 3600000))
    if stop - start < 10 * 60000:
        return None
    baseline = model.blood(start)
    candidates = ((at, model.blood(at)) for at in range(start + 60000, stop + 1, 5 * 60000))
    coarse_time, coarse_value = max(candidates, key=lambda item: item[1])
    lo = max(start + 60000, coarse_time - 5 * 60000)
    hi = min(stop, coarse_time + 5 * 60000)
    peak_time, peak_value = max(((at, model.blood(at)) for at in range(lo, hi + 1, 60000)),
                                key=lambda item: item[1])
    if peak_value <= max(0.001, baseline * 1.01) or peak_time >= stop - 60000:
        return None
    return peak_time, peak_value


def crossing(model: api_v1.Model, threshold: float, start: int, stop: int, rising: bool) -> int | None:
    """Find the first crossing and refine its time to within one minute."""
    if stop <= start:
        return None
    previous_time, previous_value = start, model.blood(start)
    step = 10 * 60000
    for at in range(start + step, stop + step, step):
        at = min(at, stop)
        value = model.blood(at)
        found = previous_value < threshold <= value if rising else previous_value > threshold >= value
        if found:
            lo, hi = previous_time, at
            while hi - lo > 60000:
                mid = (lo + hi) // 2
                if (model.blood(mid) >= threshold) == rising:
                    hi = mid
                else:
                    lo = mid
            return hi
        previous_time, previous_value = at, value
        if at == stop:
            break
    return None


def timeline_events(state: dict, prefs: dict, start_ms: int, end_ms: int) -> list[dict]:
    """Return enabled model events in a window; reference lines are user supplied."""
    if not prefs["auto"] or end_ms < start_ms:
        return []
    events = []
    enabled = prefs["enabled"]
    for drug in api_v1.DRUGS:
        if drug in api_v1.RECORD_ONLY:
            continue
        model = api_v1.Model(drug, state)
        pair = prefs["thresholds"].get(drug, {})
        for index, row in enumerate(model.rows):
            dose_time = int(row["time"])
            if dose_time > end_ms or dose_time < start_ms - 14 * 86400000:
                continue
            next_dose = int(model.rows[index + 1]["time"]) if index + 1 < len(model.rows) else None
            peak = next_peak(model, row)
            key = str(row.get("id") or dose_time)

            def add(kind: str, at: int | None, level: float | None = None, threshold: float | None = None):
                if at is None or not start_ms <= at <= end_ms:
                    return
                event_key = hashlib.sha256(f"{drug}:{key}:{kind}:{at}:{threshold}".encode()).hexdigest()
                events.append({"id": event_key, "kind": kind, "label": LABELS[kind], "time": at,
                               "timeIso": api_v1.public_time(at), "drug": drug, "drugName": model.name,
                               "doseMg": round(float(row["mg"]), 3),
                               "levelMgL": round(float(level if level is not None else model.blood(at)), 6),
                               "thresholdMgL": threshold})

            if enabled["dose"]:
                add("dose", dose_time)
            if not peak:
                continue
            peak_time, peak_level = peak
            if enabled["peak"]:
                add("peak", peak_time, peak_level)
            low, high = pair.get("low"), pair.get("high")
            if enabled["comeup"] and low:
                add("comeup", crossing(model, low, dose_time, peak_time, True), threshold=low)
            stop = min(next_dose or peak_time + 14 * 86400000,
                       peak_time + min(14 * 86400000, int(model.effective_half_life * 12 * 3600000)))
            if enabled["offset"] and high and peak_level > high:
                add("offset", crossing(model, high, peak_time, stop, False), threshold=high)
            if enabled["end"] and low and peak_level > low:
                add("end", crossing(model, low, peak_time, stop, False), threshold=low)
    events.sort(key=lambda event: (event["time"], event["drug"], event["kind"]))
    return events[:200]


def dispatch_due(db_path: str, now_ms: int | None = None) -> int:
    """Send due events once per device; never log subscription URLs or drug records."""
    now = int(now_ms if now_ms is not None else time.time() * 1000)
    sent = 0
    with sqlite3.connect(db_path, timeout=15) as con:
        con.row_factory = sqlite3.Row
        users = con.execute("SELECT DISTINCT user_id FROM push_subscriptions").fetchall()
        if users:
            from pywebpush import WebPushException
        for user in users:
            user_id = user["user_id"]
            state_row = con.execute("SELECT body FROM user_state WHERE user_id=?", (user_id,)).fetchone()
            if not state_row:
                continue
            try:
                state = json.loads(state_row["body"])
                subscriptions = con.execute("SELECT endpoint_hash,endpoint,p256dh,auth,details FROM push_subscriptions WHERE user_id=?", (user_id,)).fetchall()
                prefs = preferences(con, user_id)
                events = timeline_events(state, prefs, now - 15 * 60000, now)
                if prefs["auto"]:
                    events += adopted_plan_events(state, now - 15 * 60000, now)
                for event in events:
                    for subscription in subscriptions:
                        done = con.execute("SELECT 1 FROM push_deliveries WHERE endpoint_hash=? AND event_key=?",
                                           (subscription["endpoint_hash"], event["id"])).fetchone()
                        if done:
                            continue
                        detailed = bool(subscription["details"])
                        clock = datetime.fromtimestamp(event["time"] / 1000, api_v1.TZ).strftime("%H:%M")
                        title = f"{event['drugName']} · {event['label']}" if detailed else f"药时 · {event['label']}"
                        if event["kind"] == "scenario":
                            body = (f"{clock} {event['source']} · 假设节点 {event['doseMg']:g} mg；不是服药建议。" if detailed
                                    else "已采用反算模型的时间节点提醒，非处方；请核对医嘱。")
                        else:
                            body = (f"{clock} 模型估算 {event['levelMgL']:.3f} mg/L；非实测或真实药效判断。" if detailed
                                    else "模型时间提醒；点开查看详情。非实测或用药建议。")
                        target = {"endpoint": subscription["endpoint"],
                                  "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}}
                        try:
                            send(target, {"title": title, "body": body, "url": "/", "tag": event["id"]})
                        except WebPushException as exc:
                            status = getattr(getattr(exc, "response", None), "status_code", None)
                            if status in (404, 410):
                                con.execute("DELETE FROM push_subscriptions WHERE endpoint_hash=?", (subscription["endpoint_hash"],))
                                con.commit()
                            else:
                                logging.warning("Web Push failed with status %s", status)
                            continue
                        except Exception:
                            logging.exception("Web Push delivery failed")
                            continue
                        con.execute("INSERT OR IGNORE INTO push_deliveries(endpoint_hash,event_key,sent_at) VALUES(?,?,?)",
                                    (subscription["endpoint_hash"], event["id"], int(time.time())))
                        con.commit()
                        sent += 1
            except (ValueError, TypeError, KeyError, OverflowError):
                logging.exception("Could not calculate model notifications")
        con.execute("DELETE FROM push_deliveries WHERE sent_at<?", (int(time.time()) - 30 * 86400,))
    return sent


def scheduler(db_path: str) -> None:
    cleaned_day = None
    while True:
        try:
            today = datetime.now(api_v1.TZ).date()
            if today != cleaned_day:
                with sqlite3.connect(db_path, timeout=15) as con:
                    prune_scenarios(con)
                cleaned_day = today
            dispatch_due(db_path)
        except Exception:
            logging.exception("Web Push scheduler cycle failed")
        time.sleep(60)
