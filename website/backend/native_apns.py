"""Independent, opt-in APNs registry for the signed iOS native client.

Existing PK Atlas user-state SQLite schema is untouched. APNs credentials are
read from protected environment config if present, never shipped in code.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REGISTRY = os.environ.get("PK_NATIVE_APNS_DB", "/var/lib/pk-atlas/native-apns.sqlite3")
TOKEN_RE = re.compile(r"^[0-9a-f]{64,128}$")
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pk-native-apns")
_last_schedule: dict[int, float] = {}
_lock = threading.Lock()


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(REGISTRY, timeout=12)
    con.row_factory = sqlite3.Row
    return con


def setup() -> None:
    Path(REGISTRY).parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS devices(
            token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            environment TEXT NOT NULL, bundle TEXT NOT NULL,
            updated_at INTEGER NOT NULL)""")
        con.execute("CREATE INDEX IF NOT EXISTS native_apns_user ON devices(user_id)")
    try:
        os.chmod(REGISTRY, 0o600)
    except OSError:
        pass


def configured() -> bool:
    return bool(os.environ.get("PK_APNS_TEAM_ID") and
                os.environ.get("PK_APNS_KEY_ID") and
                os.environ.get("PK_APNS_TOPIC") == "com.example.PKAtlas" and
                os.environ.get("PK_APNS_KEY_FILE") and
                Path(os.environ["PK_APNS_KEY_FILE"]).is_file())


def register(user_id: int, token: object, environment: object) -> bool:
    if type(token) is not str or not TOKEN_RE.fullmatch(token):
        return False
    if environment not in ("sandbox", "production"):
        return False
    with connect() as con:
        con.execute("""INSERT INTO devices(token,user_id,environment,bundle,updated_at)
            VALUES(?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET
            user_id=excluded.user_id,environment=excluded.environment,
            bundle=excluded.bundle,updated_at=excluded.updated_at""",
            (token,user_id,environment,"com.example.PKAtlas",int(time.time())))
    return True


def unregister(user_id: int, token: object) -> bool:
    if type(token) is not str or not TOKEN_RE.fullmatch(token):
        return False
    with connect() as con:
        con.execute("DELETE FROM devices WHERE user_id=? AND token=?", (user_id,token))
    return True


def count(user_id: int) -> int:
    with connect() as con:
        return con.execute("SELECT COUNT(*) FROM devices WHERE user_id=?", (user_id,)).fetchone()[0]


def _b64(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def jwt_token() -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    header = _b64(json.dumps({"alg":"ES256","kid":os.environ["PK_APNS_KEY_ID"]},
                              separators=(",",":")).encode())
    payload = _b64(json.dumps({"iss":os.environ["PK_APNS_TEAM_ID"],"iat":int(time.time())},
                               separators=(",",":")).encode())
    content = f"{header}.{payload}".encode()
    path = os.environ["PK_APNS_KEY_FILE"]
    key = serialization.load_pem_private_key(Path(path).read_bytes(),password=None)
    der = key.sign(content,ec.ECDSA(hashes.SHA256()))
    r,s = utils.decode_dss_signature(der)
    return f"{header}.{payload}.{_b64(r.to_bytes(32,'big')+s.to_bytes(32,'big'))}"


def schedule_change(user_id: int, version: int, adopted_changed: bool = False) -> None:
    if not configured():
        return
    # The registry is populated only after an App has actually launched and
    # enrolled with its OS token. With no enrolment, skip App notifications.
    if count(user_id) == 0:
        return
    # Collapse rapid consecutive edits. Foreground app does read-back on wake.
    now = time.monotonic()
    with _lock:
        if now - _last_schedule.get((user_id, adopted_changed), 0) < 8:
            return
        _last_schedule[(user_id, adopted_changed)] = now
    _executor.submit(_send_change, user_id, version, adopted_changed)


def _send_change(user_id: int, version: int, adopted_changed: bool = False) -> None:
    try:
        import httpx
        with connect() as con:
            devices = con.execute("SELECT token,environment FROM devices WHERE user_id=?",
                                  (user_id,)).fetchall()
        if not devices:
            return
        bearer = jwt_token()
        aps = {"content-available":1}
        if adopted_changed:
            # Generic on-lock-screen alert, no drug/dose. Background-only
            # messages cannot visibly notify a suspended native iOS App.
            aps.update({"alert": {"title":"药时 · 已采用方案已更新",
                                  "body":"云端已同步数学方案和计划，请打开核对。不是服药建议。"},
                        "sound":"default"})
        payload = {"aps":aps,"type":"pkatlas_state_changed","version":version}
        with httpx.Client(http2=True,timeout=9) as client:
            for device in devices:
                host = "https://api.sandbox.push.apple.com" if device["environment"] == "sandbox" \
                       else "https://api.push.apple.com"
                response = client.post(f"{host}/3/device/{device['token']}",json=payload,headers={
                    "authorization":f"bearer {bearer}",
                    "apns-topic":"com.example.PKAtlas",
                    "apns-push-type":"alert" if adopted_changed else "background",
                    "apns-priority":"10" if adopted_changed else "5",
                    "apns-collapse-id":f"pkatlas-state-{user_id}"
                })
                # Never log raw device tokens or personal medication details.
                if response.status_code == 410:
                    with connect() as con:
                        con.execute("DELETE FROM devices WHERE token=?", (device["token"],))
                elif response.status_code != 200:
                    print(f"APNs background update not accepted: HTTP {response.status_code}",flush=True)
    except Exception as exc:
        print(f"APNs update deferred: {type(exc).__name__}",flush=True)
