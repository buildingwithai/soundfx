#!/bin/bash
# Build SoundFX 6·7 into a self-contained, ad-hoc-signed .app — no Xcode project.
set -euo pipefail

cd "$(dirname "$0")"

APP="SoundFX 67.app"
BIN="SixSeven"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp Info.plist "$APP/Contents/Info.plist"
cp sixseven.mp3 "$APP/Contents/Resources/sixseven.mp3"

swiftc -O \
  -framework AppKit \
  -framework CoreGraphics \
  -framework IOKit \
  -framework ServiceManagement \
  -o "$APP/Contents/MacOS/$BIN" \
  main.swift

# Ad-hoc signature gives the app a stable identity so the Input Monitoring grant
# sticks across relaunches (a plain unsigned binary would re-prompt every time).
codesign --force --options runtime --sign - "$APP"

echo "Built: $(pwd)/$APP"
echo "Install: drag it to /Applications, then open it once."
