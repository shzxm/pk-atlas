import base64
import hashlib
import json
from pathlib import Path
import sys
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from publish_native_engine import PREFIX,make_package

class NativeEngineSignatureTest(unittest.TestCase):
    def test_signed_payload_verifies_and_detects_tamper(self):
        key=Ed25519PrivateKey.generate()
        js=(ROOT/'web/app.js').read_bytes()
        catalog=(ROOT/'backend/drugs.json').read_bytes()
        meta=json.loads((ROOT/'backend/model-engine.json').read_text())
        caps=json.loads((ROOT/'ops/native/engine-capabilities.json').read_text())
        obj=make_package(js,catalog,meta,caps,key)
        raw=base64.b64decode(obj['payloadBase64'],validate=True)
        sig=base64.b64decode(obj['signatureBase64'],validate=True)
        key.public_key().verify(sig,PREFIX+raw)
        data=json.loads(raw)
        self.assertEqual(data['engineVersion'],meta['engineVersion'])
        self.assertEqual(hashlib.sha256(base64.b64decode(data['scriptBase64'])).hexdigest(),data['engineSHA256'])
        self.assertEqual(hashlib.sha256(base64.b64decode(data['catalogBase64'])).hexdigest(),data['catalogVersion'])
        with self.assertRaises(Exception):key.public_key().verify(sig,PREFIX+raw+b'bad')

if __name__=='__main__':unittest.main()
