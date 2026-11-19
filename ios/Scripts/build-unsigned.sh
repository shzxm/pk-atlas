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
# Pin the developer-signed local algorithm to 181's published source.
if [[ "${PKATLAS_MODEL_OFFLINE_BUILD:-0}" != "1" ]]; then
  python3 Scripts/sync-model-from-181.py
else
  echo "明确启用了离线构建：使用已有本地数学模型资源"
fi
# Guard the COMPLETE on-device model source, not just the Swift compiler.
# Without this step, a stray syntax error in the downloaded site bundle can
# pass XCTest yet invalidate all JSContext-based math and inverse functions.
if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js，无法对即将封装到 IPA 的 JavaScript 计算内核做语法验证。" >&2
  exit 1
fi
node --check Resources/Model/site-engine.js || {
  echo "云端计算代码 JavaScript 语法不合法：拒绝生成 IPA。" >&2
  exit 1
}
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
# The user's canonical unsigned-IPA destination is iCloud Drive / Downloads.
# Refuse silent fallback to a local folder if iCloud is unavailable.
ICLOUD_DRIVE="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
OUTPUT_DIR="${PKATLAS_IPA_OUTPUT_DIR:-$ICLOUD_DRIVE/Downloads}"
if [[ -z "${PKATLAS_IPA_OUTPUT_DIR:-}" && ! -d "$ICLOUD_DRIVE" ]]; then
  echo "iCloud 云盘不可用，未发布 IPA。" >&2
  exit 1
fi
mkdir -p "$OUTPUT_DIR"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
if [[ ! "$VERSION" =~ ^[0-9]+([.][0-9]+)*$ || ! "$BUILD" =~ ^[0-9]+$ ]]; then
  echo "App 版本号无法安全识别，拒绝发布 IPA。" >&2
  exit 1
fi
BASE="PKAtlas-iOS${SDK}-v${VERSION}-build${BUILD}"
OUT="$OUTPUT_DIR/${BASE}-unsigned.ipa"
if [[ -e "$OUT" ]]; then
  OUT="$OUTPUT_DIR/${BASE}-$(date +%Y%m%d-%H%M%S)-unsigned.ipa"
fi
STAGING="$(mktemp -d)"
TEMP_DEST="$OUTPUT_DIR/.${BASE}-$$.ipa"
trap 'rm -rf "$STAGING"; rm -f "$TEMP_DEST"' EXIT
mkdir -p "$STAGING/Payload"
ditto "$APP" "$STAGING/Payload/PKAtlas.app"
(
  cd "$STAGING"
  zip -qry "$STAGING/archive.ipa" Payload
)
unzip -tq "$STAGING/archive.ipa" >/dev/null
# Copy to iCloud under a hidden temporary name and atomically publish only
# after verifying that cloud-local contents match the built archive.
cp "$STAGING/archive.ipa" "$TEMP_DEST"
cmp "$STAGING/archive.ipa" "$TEMP_DEST"
mv -n "$TEMP_DEST" "$OUT"
test -s "$OUT"
unzip -tq "$OUT" >/dev/null
echo "未签名 IPA（iCloud 云盘/下载）：$OUT"
echo "需使用你的证书及设备 provisioning profile 签名才能安装。"
# Mandatory private GitHub distribution for regular release builds. When CLI
# authorization is missing, publishing fails visibly; the verified IPA stays
# in iCloud so no binaries or credentials are silently sent elsewhere.
if [[ "${PKATLAS_GITHUB_PUBLISH:-1}" == "1" ]]; then
  "$PWD/Scripts/publish-private-github.sh" "$OUT"
else
  echo "显式关闭 GitHub 上传（PKATLAS_GITHUB_PUBLISH=0）：仅在验证/隔离构建时使用。"
fi
