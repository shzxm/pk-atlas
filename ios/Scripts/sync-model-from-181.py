#!/usr/bin/env python3
"""Reconcile build-time executable model resources with authoritative 181.

The installed App downloads and verifies MODEL DATA; never downloads or
evaluates newly executable JavaScript. Developer signing builds may fetch JS.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://pk.example.com"
OUT = ROOT / "Resources" / "Model"
DRY_RUN = os.environ.get("PKATLAS_MODEL_DRY_RUN") == "1"

def download(path: str, folder: Path) -> bytes:
    assert path.startswith("/") and ".." not in path
    name = "model" if path.startswith("/api/") else "app"
    output = folder / (name + ".data")
    subprocess.run(["curl", "--fail", "--silent", "--show-error",
        "--location", "--proto", "=https", "--connect-timeout", "12",
        "--max-time", "40", "--output", str(output), ENDPOINT + path],check=True)
    data=output.read_bytes()
    if not data or len(data)>750000:
        raise ValueError("服务器模型包大小不符合预期："+path)
    return data

def embedded_catalog(script: str):
    dec=json.JSONDecoder()
    for field in ("const DRUGS = ", "const FOOD_INFO = "):
        if script.count(field)!=1:
            raise ValueError("模型脚本中缺少唯一药物目录字段")
    drugs=dec.raw_decode(script.split("const DRUGS = ",1)[1])[0]
    food=dec.raw_decode(script.split("const FOOD_INFO = ",1)[1])[0]
    return {"drugs":drugs,"food":food}

def main():
    with tempfile.TemporaryDirectory(prefix="pk-model-build-") as temp:
        folder=Path(temp)
        package=json.loads(download("/api/native/model",folder))
        fingerprint=package.get("engineVersion","")
        if not isinstance(fingerprint,str) or not re.fullmatch("[a-f0-9]{64}",fingerprint):
            raise ValueError("服务器引擎指纹不合法")
        # Cache-bust by the authority's exact engine ID; fixed URLs can
        # remain stale in Cloudflare even after the origin is upgraded.
        # Formula fingerprint may remain unchanged when other JS files are
        # fixed. A unique revision query avoids using a stale Cloudflare shell.
        import secrets
        script_raw=download("/app.js?v=model-"+fingerprint[:16]+"-"+secrets.token_hex(6),folder)
        script=script_raw.decode("utf-8")
        if package.get("schemaVersion")!=1 or package.get("maxSupportedClientSchema",0)<1:
            raise ValueError("模型格式版本不受支持")
        raw=base64.b64decode(package["catalogBase64"],validate=True)
        if not raw or len(raw)>512*1024:raise ValueError("药物目录大小无效")
        model_hash=hashlib.sha256(raw).hexdigest()
        if model_hash!=package["catalogVersion"]:raise ValueError("SHA256不匹配")
        obj=json.loads(raw)
        # The same server-reviewed Health medication aliases are bundled into
        # each IPA. Community-submitted feedback is not part of this endpoint.
        aliases_raw = download("/api/native/health-aliases", folder)
        curated = json.loads(aliases_raw)
        allowed_ids = {item["id"] for item in obj["drugs"]}
        if (curated.get("schemaVersion") != 1 or not isinstance(curated.get("version"), str)
                or not isinstance(curated.get("aliases"), dict)
                or set(curated["aliases"]) != allowed_ids):
            raise ValueError("181 审核药名词库与 App 药物目录不一致，拒绝构建")
        if not isinstance(obj.get("drugs"),list) or not isinstance(obj.get("food"),dict):
            raise ValueError("目录字段不合法")
        fingerprint=re.search(r'const PK_MODEL_ENGINE_VERSION = "([a-f0-9]{64})";',script)
        if not fingerprint or fingerprint.group(1)!=package["engineVersion"]:
            raise ValueError("181 网页与API公式版本不一致，拒绝构建")
        if embedded_catalog(script)!=obj:
            raise ValueError("181 网页与API模型目录不一致")
        compatibility=(json.dumps(
            {"schemaVersion":1,"engineVersion":package["engineVersion"]},
            ensure_ascii=False,separators=(",",":"))+"\n").encode()
        print("181 formula:",package["engineVersion"])
        print("181 catalog:",model_hash)
        print("181 HealthKit aliases:",curated["version"],hashlib.sha256(aliases_raw).hexdigest())
        print("web JS bytes:",len(script_raw))
        if DRY_RUN:
            print("核对通过，dry-run 未写入");return
        OUT.mkdir(parents=True,exist_ok=True)
        for filename,data in [
            ("drug-catalog.json",raw),
            ("health-medication-aliases.json", aliases_raw),
            ("engine-compat.json",compatibility),
            ("site-engine.js",script_raw)]:
            target=OUT/filename
            staged=OUT/("."+filename+".tmp")
            try:
                staged.write_bytes(data);staged.replace(target)
            finally:staged.unlink(missing_ok=True)
        print("签名构建资源已对齐181发布版本")

if __name__=="__main__":main()
