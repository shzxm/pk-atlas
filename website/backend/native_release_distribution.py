"""Privacy-preserving read-only signed native release manifest."""
from pathlib import Path
import json

PACKAGE=Path('/opt/pk-atlas/native-release.json')

def package():
    raw=PACKAGE.read_bytes()
    if not raw or len(raw)>10_000:
        raise ValueError('发行版本信息大小无效')
    obj=json.loads(raw)
    if (not isinstance(obj,dict) or obj.get('schemaVersion')!=1 or
        obj.get('keyId')!='pkatlas-ed25519-2026-11-1' or
        not all(isinstance(obj.get(field),str) for field in
                ('payloadBase64','signatureBase64'))):
        raise ValueError('发行版本信息不合法')
    return obj
