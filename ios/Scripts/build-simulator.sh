#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export USER="$(id -un)" LOGNAME="$(id -un)"
xcodegen generate --spec project.yml
xcodebuild -project PKAtlas.xcodeproj -scheme PKAtlas \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$PWD/.build/SimulatorData" CODE_SIGNING_ALLOWED=NO build
printf 'Simulator App: %s\n' "$PWD/.build/SimulatorData/Build/Products/Debug-iphonesimulator/PKAtlas.app"
