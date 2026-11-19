import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from publish_native_release import PREFIX,signed_release,version_parts

class NativeReleaseTests(unittest.TestCase):
 def test_version_comparison_is_numeric(self):
  self.assertGreater(version_parts('2.10'),version_parts('2.9'))
  self.assertGreater(version_parts('3.0'),version_parts('2.99'))
 def test_sign_and_verify_release_and_tamper(self):
  key=Ed25519PrivateKey.generate()
  filename='PKAtlas-iOS27.2-v2.5-build9-unsigned.ipa'
  envelope=signed_release('2.5',9,filename,'a'*64,'更新测试',key,'2026-11-17T00:00:00Z')
  raw=base64.b64decode(envelope['payloadBase64'],validate=True)
  signature=base64.b64decode(envelope['signatureBase64'],validate=True)
  key.public_key().verify(signature,PREFIX+raw)
  with self.assertRaises(Exception):key.public_key().verify(signature,PREFIX+raw+b'bad')
  payload=json.loads(raw)
  self.assertEqual(payload['distribution'],'icloud-drive-downloads')
  self.assertNotIn('ip',json.dumps(payload).lower().replace('ipa',''))
 def test_invalid_artifact_rejected(self):
  key=Ed25519PrivateKey.generate()
  with self.assertRaises(ValueError):
   signed_release('2.5',9,'../../passwd','a'*64,'notes',key,'2026-11-17')

if __name__=='__main__':unittest.main()
