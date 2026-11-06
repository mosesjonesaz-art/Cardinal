#!/usr/bin/env bash
# Rebuild gpt/lyric-tools.zip: lyrics.py plus the pure-Python wheels it needs,
# so ChatGPT's Python sandbox (no internet) can install and run it offline.
# Rerun after any change to lyrics.py, then commit the new zip.
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
mkdir -p "$tmp/lyric-tools/wheels"
pip download -q -d "$tmp/lyric-tools/wheels" --only-binary=:all: --python-version 3.11 \
  pronouncing==0.3.0 cmudict==1.1.3 syllables==1.1.5
cp ../lyrics.py "$tmp/lyric-tools/"
rm -f lyric-tools.zip
(cd "$tmp" && zip -qr - lyric-tools) > lyric-tools.zip
rm -rf "$tmp"
echo "Built gpt/lyric-tools.zip"
