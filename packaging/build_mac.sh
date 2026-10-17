#!/bin/bash
# Build Shepherd for macOS
# Output: dist/Shepherd.app and Shepherd.dmg
set -e

echo "=== Building Shepherd for macOS ==="

# 1. Install dependencies
pip3 install -r requirements.txt pyinstaller

# 2. Create assets dir if missing
mkdir -p assets

# 3. Build with PyInstaller
# The derived library caches (.library_index.json, .workout_facts.json) are not
# tracked: they rebuild themselves, and a checkout resets the .zwo mtimes their
# headers pin. PyInstaller copies workouts/ as it finds it, so build them here.
python3 tools/build-library-caches.py || {
    echo "FATAL: could not build the library caches" >&2; exit 1; }

pyinstaller packaging/shepherd.spec --clean --noconfirm

echo ""
echo "=== Build complete ==="
echo "App: dist/Shepherd.app"

# 4. Create DMG (if create-dmg is installed)
if command -v create-dmg &> /dev/null; then
    echo "Creating DMG..."
    create-dmg \
        --volname "Shepherd" \
        --volicon "assets/icon.icns" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon "Shepherd.app" 150 190 \
        --app-drop-link 450 190 \
        "Shepherd.dmg" \
        "dist/Shepherd.app"
    echo "DMG: Shepherd.dmg"
else
    echo ""
    echo "To create a DMG installer, install create-dmg:"
    echo "  brew install create-dmg"
    echo "Then re-run this script."
fi
