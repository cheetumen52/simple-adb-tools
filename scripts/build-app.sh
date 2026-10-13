#!/bin/bash
# Builds dist/Simple ADB tools.app. Pass --install to copy it into ~/Applications.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_NAME="Simple ADB tools"
APP="$ROOT/dist/$APP_NAME.app"
ICON_DIR="$ROOT/.build/icon"

swift build -c release

rm -rf "$ICON_DIR" "$APP"
swift scripts/make-icon.swift "$ICON_DIR/AppIcon.iconset"
iconutil -c icns "$ICON_DIR/AppIcon.iconset" -o "$ICON_DIR/AppIcon.icns"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build -c release --show-bin-path)/SimpleAdbTools" "$APP/Contents/MacOS/"
cp Support/Info.plist "$APP/Contents/Info.plist"
cp "$ICON_DIR/AppIcon.icns" "$APP/Contents/Resources/"
codesign --force --deep -s - "$APP"
echo "Built: $APP"

if [ "${1:-}" = "--install" ]; then
  DEST="$HOME/Applications/$APP_NAME.app"
  pkill -f "$DEST/Contents/MacOS/SimpleAdbTools" 2>/dev/null || true
  rm -rf "$DEST"
  cp -R "$APP" "$DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST"
  echo "Installed: $DEST"
fi
