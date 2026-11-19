"""Minimal, user-visible login device metadata; never hardware fingerprinting.

Client-generated random installation IDs are hashed and never stored raw.
Within the same authenticated account + login method, later logins for the
same installation supersede old sessions. Browsers without a local ID keep
independent legacy sessions rather than guessing from User-Agent/IP.
"""
import hashlib
import re

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,100}$")


def cleaned(value, max_length=64, fallback=""):
    if not isinstance(value, str):
        return fallback
    value = "".join(c for c in value if c.isprintable() and c not in "<>\u2028\u2029").strip()
    return value[:max_length] or fallback


def from_request(user_id, payload, method, fallback="浏览器 · 网页"):
    identifier = payload.get("deviceId")
    device_key = ""
    if isinstance(identifier, str) and ID_PATTERN.fullmatch(identifier):
        raw = f"PKAtlas-installation-v1:{user_id}:{method}:{identifier}".encode()
        device_key = hashlib.sha256(raw).hexdigest()
    platform = cleaned(payload.get("devicePlatform"), 30, "未知系统")
    os_version = cleaned(payload.get("deviceOS"), 44, "版本未提供")
    label = cleaned(payload.get("deviceName"), 50, fallback)
    return {
        "device_key": device_key,
        "device_name": label,
        "device_platform": platform,
        "device_os": os_version,
        "login_method": method,
    }


def prune_old_same_installation(con, user_id, info):
    if info["device_key"]:
        return con.execute(
            "DELETE FROM sessions WHERE user_id=? AND device_key=? AND login_method=?",
            (user_id, info["device_key"], info["login_method"])
        ).rowcount
    return 0
