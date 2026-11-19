"""Read-only signed native computation engine distribution."""
from pathlib import Path
import json

PACKAGE = Path('/opt/pk-atlas/native-engine.json')
MAX_PACKAGE_BYTES = 1_600_000


def package() -> dict:
    raw = PACKAGE.read_bytes()
    if not raw or len(raw) > MAX_PACKAGE_BYTES:
        raise ValueError('签名计算包大小无效')
    result=json.loads(raw)
    if not isinstance(result,dict) or result.get('schemaVersion')!=1 or not all(
        isinstance(result.get(x),str) for x in ('payloadBase64','signatureBase64','keyId')
    ):
        raise ValueError('签名计算包格式无效')
    return result
