#!/usr/bin/env bash
# Build the Linux AppImage in the pinned ubuntu:22.04 (glibc 2.35) container and
# copy the result out, without touching the working tree (#12).
# Usage: tools/build_appimage_poc.sh [output-dir]      default: ./dist-appimage
# Mirrors the "Build AppImage" job in .github/workflows/release.yml: Python 3.12
# from deadsnakes, appimagetool in extract-and-run mode, packaging/build_linux.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(realpath -m "${1:-dist-appimage}")
mkdir -p "$OUT"
git ls-files -z | tar --null -T - -cf - | docker run --rm -i \
  -v "$OUT":/out -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -e APPIMAGE_EXTRACT_AND_RUN=1 -e PIP_BREAK_SYSTEM_PACKAGES=1 -e DEBIAN_FRONTEND=noninteractive \
  ubuntu:22.04 bash -euxo pipefail -c '
    mkdir /src && tar -x -C /src && cd /src
    apt-get update -qq
    apt-get install -y --no-install-recommends software-properties-common gnupg python3-launchpadlib \
      curl ca-certificates wget binutils libc-bin git file xz-utils zsync build-essential pkg-config \
      desktop-file-utils libglib2.0-0 libgl1 libegl1 libopengl0 libgbm1 libdrm2 libxkbcommon-x11-0 \
      libdbus-1-3 libnss3 libnspr4 libasound2 libxcomposite1 libxdamage1 libxrandr2 libxtst6 libxi6 \
      libxfixes3 libxrender1 libxext6 libfontconfig1 libfreetype6 libxcb-cursor0 >/dev/null
    add-apt-repository -y ppa:deadsnakes/ppa >/dev/null
    apt-get update -qq
    apt-get install -y --no-install-recommends python3.12 python3.12-venv python3.12-dev libpython3.12 >/dev/null
    python3.12 -m ensurepip --upgrade >/dev/null
    mkdir -p /opt/py312
    ln -sf /usr/bin/python3.12 /opt/py312/python3; ln -sf /usr/bin/python3.12 /opt/py312/python
    for p in pip pip3; do printf "#!/bin/sh\nexec /usr/bin/python3.12 -m pip \"\$@\"\n" > /opt/py312/$p; chmod +x /opt/py312/$p; done
    export PATH=/opt/py312:$PATH
    curl -fsSL -o /usr/local/bin/appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
    chmod +x /usr/local/bin/appimagetool
    git config --global --add safe.directory "*"
    : > .oauth.env   # no client secret in a local proof of concept
    chmod +x packaging/build_linux.sh && ./packaging/build_linux.sh
    cp dist/Shepherd-v*-x86_64.AppImage dist/host-deps*.txt /out/ 2>/dev/null || true
    chown -R "$HOST_UID:$HOST_GID" /out
  '
ls -la "$OUT"
