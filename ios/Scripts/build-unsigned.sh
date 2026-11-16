#!/bin/bash
# Create unsigned iOS binary archive for user-provided signing.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# The Mac mini may still have CommandLineTools selected globally. Pin the
# verified complete Xcode locally without changing other projects' toolchains.
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
export USER="$(id -un)"
export LOGNAME="$(id -un)"
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "缺少 Xcode 27.2，不能构建 iOS App。" >&2
  exit 1
fi
if [[ "$(xcodebuild -version)" != *"Xcode 27.2"* ]]; then
  echo "需要 Xcode 27.2；当前 Xcode 版本不符合要求。" >&2
  xcodebuild -version >&2
  exit 1
fi
SDK="$(xcrun --sdk iphoneos --show-sdk-version)"
if [[ "$SDK" != 27.2* ]]; then
  echo "SDK 必须为 iOS 27.2，检测到：$SDK" >&2
  exit 1
fi
command -v xcodegen >/dev/null || { echo "先运行 brew install xcodegen"; exit 1; }
xcodegen generate --spec project.yml
xcodebuild \
  -project PKAtlas.xcodeproj -scheme PKAtlas \
  -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$PWD/.build/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  DEVELOPMENT_TEAM='' \
  clean build
APP="$PWD/.build/DerivedData/Build/Products/Release-iphoneos/PKAtlas.app"
test -f "$APP/PKAtlas"
mkdir -p dist
OUT="$PWD/dist/PKAtlas-iOS27.2-unsigned.ipa"
rm -f "$OUT"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/Payload"
ditto "$APP" "$STAGING/Payload/PKAtlas.app"
(
  cd "$STAGING"
  zip -qry "$OUT" Payload
)
unzip -tq "$OUT" >/dev/null
echo "未签名 IPA：$OUT"
echo "需使用你的证书及设备 provisioning profile 签名才能安装。"
