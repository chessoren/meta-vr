#!/bin/sh
# Self-host the on-device English speech model (Vosk small, ~40 MB, Apache-2.0) for voice answers.
# vosk-browser expects a .tar.gz of the model folder. Run once, then deploy: public/models/ is served as /models/.
set -e
NAME=vosk-model-small-en-us-0.15
TMP=$(mktemp -d)
curl -L -o "$TMP/$NAME.zip" "https://alphacephei.com/vosk/models/$NAME.zip"
unzip -q "$TMP/$NAME.zip" -d "$TMP"
mkdir -p public/models
tar -czf "public/models/$NAME.tar.gz" -C "$TMP" "$NAME"
rm -rf "$TMP"
echo "✓ public/models/$NAME.tar.gz ($(du -h public/models/$NAME.tar.gz | cut -f1))"
