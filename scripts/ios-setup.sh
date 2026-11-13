#!/usr/bin/env bash
# Builds the iPhone project in ios/ from this repo (run by the GitHub Actions workflow, or on a Mac).
#   APPLE_TEAM_ID   optional; your Apple Developer Team ID for signing
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="$(node -p "require('./capacitor.config.json').appName")"

npm install --no-audit --no-fund
node scripts/build-www.mjs

if [ ! -d ios/App ]; then
  npx cap add ios --packagemanager SPM
fi

# Icon and launch screen
ICONSET=ios/App/App/Assets.xcassets/AppIcon.appiconset
for f in "$ICONSET"/*.png; do [ -e "$f" ] && cp native/ios/assets/AppIcon-1024.png "$f"; done
SPLASH=ios/App/App/Assets.xcassets/Splash.imageset
for f in "$SPLASH"/*.png; do [ -e "$f" ] && cp native/ios/assets/splash-2732.png "$f"; done

# Info.plist
PL=ios/App/App/Info.plist
setk() { /usr/libexec/PlistBuddy -c "Delete :$1" "$PL" >/dev/null 2>&1 || true; /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PL"; }
setk CFBundleDisplayName string "$APP_NAME"
setk ITSAppUsesNonExemptEncryption bool false

# Xcode project: iPhone only, signing team
gem list -i xcodeproj >/dev/null 2>&1 || gem install --user-install xcodeproj
ruby scripts/ios-project.rb

npx cap sync ios
echo "iOS project ready in ios/App"
