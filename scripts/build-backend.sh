#!/bin/bash
# Build the Python backend as a standalone binary using PyInstaller
# Output: backend/dist/ots-backend

set -e

echo "=== Building OTS Backend Binary ==="

cd "$(dirname "$0")/../backend"

# Ensure venv and pyinstaller
if [ ! -d ".venv" ]; then
  echo "Creating Python venv..."
  python3.11 -m venv .venv
fi

source .venv/bin/activate

# Install deps
pip install -q -r requirements.txt
pip install -q pyinstaller

# Build single binary
echo "Running PyInstaller..."
pyinstaller --onefile \
  --name ots-backend \
  --runtime-hook pyinstaller-hooks/rthook_pyiceberg.py \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.lifespan.off \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import anthropic \
  --hidden-import pillow_heif \
  --collect-all reportlab \
  main.py 2>&1 | tail -5

# Clean up PyInstaller artifacts that confuse electron-builder
rm -rf build/ *.spec

echo ""
echo "Binary: backend/dist/ots-backend"
ls -lh dist/ots-backend 2>/dev/null || echo "Build failed!"
