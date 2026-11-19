#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
export USER="$(id -un)"
export LOGNAME="$(id -un)"
python3 - <<'PY'
from pathlib import Path
import json, plistlib
paths=list(Path("Sources").glob("*.swift"))
assert len(paths)>=5
source="\n".join(x.read_text() for x in paths)
checks={
 "exact HTTPS domain":'components.host?.lowercased() == Self.allowedHost' in source,
 "persistent WebKit session":'configuration.websiteDataStore = .default()' in source,
 "main-frame bridge check":'message.frameInfo.isMainFrame' in source,
 "Duo toolbar":'placement: .bottomBar' in source and 'placement: .topBarLeading' in source,
 "Liquid Glass":'.glassEffect(.regular' in source,
 "return button":'func goBack()' in source,
 "web confirmation":'runJavaScriptConfirmPanelWithMessage' in source,
 "download export":'WKDownloadDelegate' in source,
 "notification opt-in":'requestAuthorization(options:' in source,
 "privacy on lock screen":'content.body = ' in source,
 "medical disclaimer":'不代表血药实测' in source,
}
for label,success in checks.items():
 assert success,label
 print("PASS",label)
info=plistlib.loads(Path("Resources/Info.plist").read_bytes())
assert info["CFBundleDisplayName"]=="药时"
assert info["UIApplicationSceneManifest"]["UIApplicationSupportsMultipleScenes"] is False
privacy=plistlib.loads(Path("Resources/PrivacyInfo.xcprivacy").read_bytes())
assert privacy["NSPrivacyTracking"] is False
icon=json.loads(Path("Resources/Assets.xcassets/AppIcon.appiconset/Contents.json").read_text())
assert icon["images"][0]["size"]=="1024x1024"
print("PASS plist/icon/privacy metadata")
PY
swiftc -frontend -parse Sources/*.swift
plutil -lint Resources/Info.plist Resources/PrivacyInfo.xcprivacy
if command -v xcodegen >/dev/null; then
  xcodegen generate --spec project.yml
  plutil -lint PKAtlas.xcodeproj/project.pbxproj
fi
echo "已通过源码静态检查（不等于 iOS SDK 编译）。"
