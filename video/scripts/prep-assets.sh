#!/usr/bin/env bash
# Copy the assets the film uses into public/ (Remotion's static dir) and
# extract the three freeze frames scene 3 pauses on. Idempotent; public/ is
# gitignored so nothing here lands in the repo. Run from the video/ directory
# or anywhere; paths are resolved relative to this script.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
assets="$root/assets"
pub="$root/public"

mkdir -p "$pub/stills" "$pub/vo" "$pub/sfx" "$pub/music" "$pub/gameplay" "$pub/fonts"

echo "copying stills"
cp -f "$assets"/stills/*.png "$pub/stills/"

echo "copying vo"
cp -f "$assets"/audio/vo/*.wav "$pub/vo/"

echo "copying sfx"
cp -f "$assets"/audio/sfx/*.wav "$pub/sfx/"

echo "copying music"
cp -f "$assets"/audio/music/music-tense-loop.wav "$pub/music/"
cp -f "$assets"/audio/music/music-tail.wav "$pub/music/"

echo "copying gameplay take"
cp -f "$assets"/gameplay/take.mp4 "$pub/gameplay/"

echo "copying font"
cp -f "$root/../frontend/public/fonts/fraunces-latin-var.woff2" "$pub/fonts/"

# Freeze frames: exact source-seconds that match the scene-3 segment boundaries
# in src/timing.ts (strike hold, bingo hold, final withdrawn hold). Extract at
# the seek time so a still <Img> reads continuous with the OffthreadVideo it
# replaces. Times are real source seconds (the take is 25 fps; ffmpeg -ss and
# Remotion trimBefore both address real time).
echo "extracting freeze stills"
take="$assets/gameplay/take.mp4"
ffmpeg -y -loglevel error -ss 79.87 -i "$take" -frames:v 1 "$pub/gameplay/frame-strike.png"
ffmpeg -y -loglevel error -ss 143.67 -i "$take" -frames:v 1 "$pub/gameplay/frame-bingo.png"
ffmpeg -y -loglevel error -ss 190.20 -i "$take" -frames:v 1 "$pub/gameplay/frame-withdrawn.png"

echo "done"
