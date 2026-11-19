#!/usr/bin/env python3
"""Publish a root-signed, all-or-nothing PK model+solver update.

Run with `sudo python3 scripts/publish_native_engine.py`. The private key is
root-only under /etc/pk-atlas and MUST NOT enter the repo, web root, logs or
an App bundle. Never publish from a partial compilation.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import subprocess
import shutil
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

PREFIX = b"PKATLAS-NATIVE-ENGINE-v1\n"
MAX_JS_BYTES = 700_000
MAX_CATALOG_BYTES = 512_000
ROOT = Path(__file__).resolve().parents[1]
KEY_PATH = Path('/etc/pk-atlas/native-engine-ed25519.pem')
CAPABILITIES = ROOT / 'ops/native/engine-capabilities.json'


def make_package(engine: bytes, catalog: bytes, meta: dict,
                 capability: dict, private_key: Ed25519PrivateKey) -> dict:
    if not (0 < len(engine) <= MAX_JS_BYTES and 0 < len(catalog) <= MAX_CATALOG_BYTES):
        raise ValueError('引擎或模型大小不符合限制')
    version = meta.get('engineVersion')
    if not isinstance(version, str) or not re.fullmatch('[0-9a-f]{64}', version):
        raise ValueError('网站计算引擎指纹不合法')
    if not engine.startswith(b'"use strict";'):
        raise ValueError('模型脚本不是完整的网页构建产物')
    expected = ('const PK_MODEL_ENGINE_VERSION = "' + version + '";').encode()
    if engine.count(expected) != 1:
        raise ValueError('网页算法代码与服务器指纹不一致')
    catalog_obj = json.loads(catalog)
    if not isinstance(catalog_obj.get('drugs'), list) or not catalog_obj['drugs']:
        raise ValueError('药物目录内容不合法')
    # The executable formula MUST see the very same catalog as the payload.
    # This prevents signed mixed-version assets during partial web deployments.
    decoder = json.JSONDecoder()
    script = engine.decode('utf-8')
    for prefix, expected in (('const DRUGS = ', catalog_obj['drugs']),
                             ('const FOOD_INFO = ', catalog_obj['food'])):
        if script.count(prefix) != 1:
            raise ValueError('网页构建产物缺少唯一模型字段')
        embedded, _ = decoder.raw_decode(script.split(prefix, 1)[1])
        if embedded != expected:
            raise ValueError('网站脚本嵌入模型与服务器目录不一致；拒绝签名')
    if capability.get('bridgeVersion') != 1 or not isinstance(capability.get('requiredCapabilities'), list):
        raise ValueError('原生能力配置不正确')
    required = capability['requiredCapabilities']
    if not required or len(required) != len(set(required)) or not all(
        isinstance(v, str) and re.fullmatch(r'[a-z0-9._-]{1,70}',v) for v in required
    ):
        raise ValueError('原生能力不合法')
    payload = {
        'schemaVersion': 1, 'bridgeVersion': capability['bridgeVersion'],
        'requiredCapabilities': required,
        'engineVersion': version,
        'engineSHA256': hashlib.sha256(engine).hexdigest(),
        'catalogVersion': hashlib.sha256(catalog).hexdigest(),
        'scriptBase64': base64.b64encode(engine).decode('ascii'),
        'catalogBase64': base64.b64encode(catalog).decode('ascii'),
    }
    data = json.dumps(payload, ensure_ascii=False, separators=(',', ':'),sort_keys=True).encode()
    sig = private_key.sign(PREFIX + data)
    return {'schemaVersion':1,'keyId':'pkatlas-ed25519-2026-11-1',
            'payloadBase64':base64.b64encode(data).decode('ascii'),
            'signatureBase64':base64.b64encode(sig).decode('ascii')}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--engine',type=Path,default=Path('/var/www/pk-atlas/app.js'))
    parser.add_argument('--catalog',type=Path,default=Path('/opt/pk-atlas/drugs.json'))
    parser.add_argument('--meta',type=Path,default=Path('/opt/pk-atlas/model-engine.json'))
    parser.add_argument('--output',type=Path,default=Path('/opt/pk-atlas/native-engine.json'))
    args=parser.parse_args()
    if os.geteuid()!=0 and args.output==Path('/opt/pk-atlas/native-engine.json'):
        parser.error('生产签名发布必须以 root 运行')
    with KEY_PATH.open('rb') as file:
        private = serialization.load_pem_private_key(file.read(), password=None)
    if not isinstance(private,Ed25519PrivateKey): raise ValueError('不是 Ed25519 私钥')
    # Signed formula scripts are executable: a broken JavaScript file must
    # never be signed even when its mathematical version hash is unchanged.
    if not shutil.which('node'):
        raise RuntimeError('安全发布需要Node.js对完整JavaScript做语法验证')
    subprocess.run(['node','--check',str(args.engine)],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    obj=make_package(args.engine.read_bytes(),args.catalog.read_bytes(),
        json.loads(args.meta.read_text()),json.loads(CAPABILITIES.read_text()),private)
    output=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()+b'\n'
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix='.native-engine-', dir=args.output.parent,
                                     delete=False) as file:
        temp=Path(file.name);file.write(output)
    try:
        os.chmod(temp,0o644)
        temp.replace(args.output)
    finally: temp.unlink(missing_ok=True)
    print('SIGNED_NATIVE_ENGINE',args.output,len(output),'bytes',
          'version',json.loads(base64.b64decode(obj['payloadBase64']))['engineVersion'])

if __name__=='__main__':main()
