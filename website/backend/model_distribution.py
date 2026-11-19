"""Public read-only catalog delivery for native clients.

Catalog bytes are generated from the SAME shared/catalog.json as web/app.js.
No user session, executable code, state write, or API credential is involved.
"""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CATALOG_PATH = BASE / "drugs.json"
ENGINE_PATH = BASE / "model-engine.json"
MAX_CATALOG_BYTES = 512 * 1024


def package() -> dict:
    raw = CATALOG_PATH.read_bytes()
    if not raw or len(raw) > MAX_CATALOG_BYTES:
        raise ValueError("模型目录大小不合法")
    # Parse before publishing to prevent shipping damaged generated files.
    obj = json.loads(raw)
    if (not isinstance(obj, dict) or not isinstance(obj.get("drugs"), list)
            or not isinstance(obj.get("food"), dict) or not obj["drugs"]):
        raise ValueError("模型目录格式不合法")
    version = hashlib.sha256(raw).hexdigest()
    engine = json.loads(ENGINE_PATH.read_text(encoding="utf-8"))
    fingerprint = engine.get("engineVersion", "")
    if (engine.get("schemaVersion") != 1 or not isinstance(fingerprint, str)
            or len(fingerprint) != 64 or any(c not in '0123456789abcdef' for c in fingerprint)):
        raise ValueError("模型计算引擎指纹不可用")
    return {"schemaVersion": 1, "catalogVersion": version,
            "engineVersion": fingerprint,
            "catalogBase64": base64.b64encode(raw).decode("ascii"),
            "maxSupportedClientSchema": 1,
            "description": "药物、饮食与文献数据；不是个人血药浓度或用药建议"}
