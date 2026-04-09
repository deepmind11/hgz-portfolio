#!/usr/bin/env bash
# Download Inter + JetBrains Mono TTFs for OG image generation.
# Idempotent — won't re-download if fonts already exist.

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/.og-fonts"
mkdir -p "$DIR"

INTER_VERSION="v4.1"
JBM_VERSION="v2.304"

INTER_ZIP="$DIR/inter.zip"
JBM_ZIP="$DIR/jbm.zip"

if [ ! -f "$DIR/Inter-Regular.ttf" ] || [ ! -f "$DIR/Inter-Bold.ttf" ]; then
    echo "Downloading Inter $INTER_VERSION..."
    curl -sL -o "$INTER_ZIP" "https://github.com/rsms/inter/releases/download/${INTER_VERSION}/Inter-${INTER_VERSION#v}.zip"
    unzip -o -j -q "$INTER_ZIP" "extras/ttf/Inter-Regular.ttf" "extras/ttf/Inter-Bold.ttf" -d "$DIR"
    rm "$INTER_ZIP"
fi

if [ ! -f "$DIR/JetBrainsMono-Regular.ttf" ]; then
    echo "Downloading JetBrains Mono $JBM_VERSION..."
    curl -sL -o "$JBM_ZIP" "https://github.com/JetBrains/JetBrainsMono/releases/download/${JBM_VERSION}/JetBrainsMono-${JBM_VERSION#v}.zip"
    unzip -o -j -q "$JBM_ZIP" "fonts/ttf/JetBrainsMono-Regular.ttf" -d "$DIR"
    rm "$JBM_ZIP"
fi

echo "Fonts ready in $DIR"
ls -la "$DIR" | grep ttf
