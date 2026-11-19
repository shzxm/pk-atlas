#!/usr/bin/env python3
"""One-time customization of the public origin in source and example files.

Never use this helper on an already deployed production checkout without
reviewing the resulting Git diff first.
"""
from __future__ import annotations
import argparse
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILES=[*ROOT.glob('frontend/**/*.js'), *ROOT.glob('web/*.html'),
       *ROOT.glob('web/*.js'), ROOT/'backend/push_service.py',
       ROOT/'config/cloudflare-cache-rules-yao.md',
       ROOT/'scripts/check_cloudflare_cache.py',ROOT/'tests/test_modern_web.py']
def main():
    p=argparse.ArgumentParser()
    p.add_argument("hostname",help="The exact public HTTPS domain; no scheme")
    a=p.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+",a.hostname):
        p.error("Supply a hostname like pk.example.com, not an IP/URL")
    count=0
    for f in FILES:
        if not f.is_file():continue
        s=f.read_text()
        if "pk.example.com" in s:
            f.write_text(s.replace("pk.example.com",a.hostname))
            count+=1
    print(f"Configured {count} source files; set PK_PUBLIC_HOST={a.hostname}")
if __name__=="__main__":
    main()
