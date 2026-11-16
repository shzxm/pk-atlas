#!/usr/bin/env python3
"""Read-only Cloudflare cache audit. Never sends account credentials or cookies.

Run from an external machine for a same-colo comparison.
A DYNAMIC HTML result means Cloudflare edge caching is not active, even
when the public origin includes Cache-Control: s-maxage.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from urllib.parse import urljoin

SAFE_TARGETS = (
    ("/", "public_shell"),
    ("/data-center.html", "public_shell"),
    ("/notifications.html", "public_shell"),
    ("/app.js?v=stable-point-20261116", "public_asset"),
    ("/api/me", "private_api"),
    ("/sw.js", "service_worker"),
)


def probe(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "PKAtlas-Cache-Audit/1", "Accept": "text/html,application/json,*/*"},
        method="GET",
    )
    try:
        response = urllib.request.urlopen(request, timeout=16)
    except urllib.error.HTTPError as exc:
        response = exc  # Authenticated APIs intentionally respond 401.
    with response:
        status = response.status
        headers = response.headers
        # Drain response without displaying, saving or parsing private data.
        response.read(8192)
        return {
            "http": status,
            "cf_cache": headers.get("CF-Cache-Status", "NOT_PRESENT"),
            "cf_ray_colo": (headers.get("CF-RAY", "-").rsplit("-", 1)[-1]),
            "cache_control": headers.get("Cache-Control", ""),
            "content_type": (headers.get("Content-Type", "").split(";")[0]),
        }


def audit(host: str) -> tuple[bool, list[dict], bool]:
    results = []
    private_safe = True
    shell_hit = True
    for path, kind in SAFE_TARGETS:
        url = urljoin(host, path)
        attempts = [probe(url), probe(url)]
        record = {"path": path, "kind": kind, "attempts": attempts}
        if kind in ("private_api", "service_worker"):
            private_safe &= all("no-store" in p["cache_control"].lower()
                                and p["cf_cache"].upper() != "HIT"
                                for p in attempts)
        if kind == "public_shell":
            shell_hit &= any(p["cf_cache"].upper() == "HIT" for p in attempts)
        results.append(record)
    return private_safe, results, shell_hit


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="https://yao.shzxm.com/")
    parser.add_argument("--json", action="store_true", help="Machine-readable headers only, never API payload")
    args = parser.parse_args()
    if args.host != "https://yao.shzxm.com/":
        parser.error("This audit is restricted to PK Atlas production HTTPS.")
    try:
        private_safe, results, shell_hit = audit(args.host)
    except (urllib.error.URLError, OSError) as exc:
        print("NETWORK_CHECK_FAILED:", type(exc).__name__, str(exc))
        return 3
    summary = {
        "public_html_edge_hit": shell_hit,
        "private_api_and_worker_not_cached": private_safe,
        "paths": results,
        "note": "DYNAMIC means Cloudflare edge caching not enabled; no login information was sent.",
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        for item in results:
            p = item["attempts"]
            print(item["path"], p[0]["cf_cache"], "→", p[1]["cf_cache"],
                  "HTTP", p[1]["http"], "colo", p[1]["cf_ray_colo"])
        print("PUBLIC_HTML_EDGE_CACHE:", "ACTIVE" if shell_hit else "NOT_CONFIRMED")
        print("API_AND_WORKER_EXCLUDED:", "YES" if private_safe else "CHECK_REQUIRED")
    return 0 if shell_hit and private_safe else 2


if __name__ == "__main__":
    raise SystemExit(main())
