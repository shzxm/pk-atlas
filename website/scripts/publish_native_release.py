#!/usr/bin/env python3
"""Publish signed iOS release metadata after an IPA has been built and verified.

No IPA binary or private key is hosted publicly; the artifact is delivered to
its owner's iCloud Drive/Downloads. The native app checks only this same-origin
Ed25519-signed manifest, never a third-party update service.
"""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import re
import tempfile
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

PREFIX=b"PKATLAS-NATIVE-RELEASE-v1\n"
KEY=Path('/etc/pk-atlas/native-engine-ed25519.pem')
OUTPUT=Path('/opt/pk-atlas/native-release.json')
KEY_ID='pkatlas-ed25519-2026-11-1'

def version_parts(value):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,3}',value):
        raise ValueError('版本格式应为2.6等点分数字')
    return tuple(map(int,value.split('.')))

def signed_release(version, build, filename, digest, notes, key, published_at):
    version_parts(version)
    if not isinstance(build,int) or build < 1 or build > 1_000_000:
        raise ValueError('Build编号无效')
    if not isinstance(filename,str) or not re.fullmatch(
        r'PKAtlas-iOS[0-9.]+-v[0-9.]+-build[0-9]+(?:-[0-9]{8}-[0-9]{6})?-unsigned[.]ipa',filename
    ) or f'-v{version}-build{build}' not in filename or len(filename)>130:
        raise ValueError('IPA文件名及版本不匹配')
    if not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):
        raise ValueError('IPA SHA256无效')
    if not isinstance(notes,str) or not (1<=len(notes)<=1200):
        raise ValueError('更新说明无效')
    payload={'schemaVersion':1,'version':version,'build':build,
        'fileName':filename,'ipaSHA256':digest,
        'releaseNotes':notes, 'publishedAt':published_at,
        'distribution':'icloud-drive-downloads'}
    data=json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
    return {'schemaVersion':1,'keyId':KEY_ID,
      'payloadBase64':base64.b64encode(data).decode('ascii'),
      'signatureBase64':base64.b64encode(key.sign(PREFIX+data)).decode('ascii')}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--version',required=True)
    parser.add_argument('--build',type=int,required=True)
    parser.add_argument('--artifact',required=True)
    parser.add_argument('--sha256',required=True)
    parser.add_argument('--notes',required=True)
    parser.add_argument('--output',type=Path,default=OUTPUT)
    args=parser.parse_args()
    if args.output==OUTPUT and os.geteuid()!=0:
        parser.error('生产版本签名发布必须使用root')
    if args.output.exists():
        old=json.loads(args.output.read_text())
        payload=json.loads(base64.b64decode(old['payloadBase64'],validate=True))
        if (version_parts(args.version),args.build)<(version_parts(payload['version']),payload['build']):
            raise ValueError('禁止降级已发布的最新版宣告')
    with KEY.open('rb') as file:
        key=serialization.load_pem_private_key(file.read(),password=None)
    if not isinstance(key,Ed25519PrivateKey):raise ValueError('私钥类型不是Ed25519')
    now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    envelope=signed_release(args.version,args.build,args.artifact,args.sha256,
                            args.notes,key,now)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix='.native-release-',dir=args.output.parent,
                                     delete=False) as file:
        temp=Path(file.name)
        file.write(json.dumps(envelope,ensure_ascii=False,separators=(',',':')).encode()+b'\n')
    try:
        os.chmod(temp,0o644)
        temp.replace(args.output)
    finally:temp.unlink(missing_ok=True)
    print('PUBLISHED_SIGNED_RELEASE',args.version,args.build,args.artifact,'to',args.output)

if __name__=='__main__':main()
