#!/usr/bin/env python3
"""Composites captions onto the recorded frames and encodes the walkthrough.

    python3 scripts/caption-frames.py .demo-frames docs/verity-demo.mp4

Captions are drawn with PIL rather than ffmpeg's drawtext, which is not
available in this ffmpeg build. Each frame becomes a still of its own duration
via a concat demuxer file, so a beat holds for as long as it needs rather than
every beat getting the same time.
"""
import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1440, 1000
CAPTION_BAND = 100
BG = (10, 11, 16)
FG = (235, 237, 243)
ACCENT = (110, 130, 255)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    "/Library/Fonts/Arial.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def wrap(draw, text, font, max_width):
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def compose(src, caption, dest):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)

    font = load_font(27)
    lines = wrap(draw, caption, font, WIDTH - 120)
    y = 26
    for line in lines[:2]:
        draw.text((60, y), line, font=font, fill=FG)
        y += 36

    # A thin rule under the caption, so the band reads as a caption rather than
    # as empty space above a screenshot.
    draw.rectangle([(60, CAPTION_BAND - 8), (WIDTH - 60, CAPTION_BAND - 7)], fill=(38, 41, 52))

    shot = Image.open(src).convert("RGB")
    available = HEIGHT - CAPTION_BAND
    scale = min((WIDTH - 80) / shot.width, available / shot.height, 1.0)
    resized = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)
    x = (WIDTH - resized.width) // 2
    canvas.paste(resized, (x, CAPTION_BAND))

    # A hairline border around the screenshot so it separates from the backdrop.
    draw.rectangle(
        [(x - 1, CAPTION_BAND - 1), (x + resized.width, CAPTION_BAND + resized.height)],
        outline=(44, 48, 60),
    )
    canvas.save(dest, "PNG")


def main():
    frame_dir = sys.argv[1] if len(sys.argv) > 1 else ".demo-frames"
    out = sys.argv[2] if len(sys.argv) > 2 else "docs/verity-demo.mp4"

    with open(os.path.join(frame_dir, "beats.json"), encoding="utf-8") as fh:
        beats = json.load(fh)

    composed_dir = os.path.join(frame_dir, "composed")
    os.makedirs(composed_dir, exist_ok=True)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    entries = []
    for i, beat in enumerate(beats):
        src = os.path.join(frame_dir, f"{i:03d}.png")
        if not os.path.exists(src):
            raise SystemExit(f"missing frame {src}; rerun scripts/record-demo.mts")
        dest = os.path.join(composed_dir, f"{i:03d}.png")
        compose(src, beat["caption"], dest)
        entries.append((os.path.abspath(dest), float(beat["hold"])))
        print(f"  composed {i + 1}/{len(beats)}")

    concat_path = os.path.join(frame_dir, "concat.txt")
    with open(concat_path, "w", encoding="utf-8") as fh:
        for path, hold in entries:
            fh.write(f"file '{path}'\nduration {hold:.2f}\n")
        # The concat demuxer drops the final entry's duration unless the last
        # file is repeated, which otherwise cuts the closing frame instantly.
        fh.write(f"file '{entries[-1][0]}'\n")

    total = sum(hold for _, hold in entries)
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", concat_path,
            "-vf", "fps=30,format=yuv420p",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-movflags", "+faststart",
            out,
        ],
        check=True,
    )
    size_mb = os.path.getsize(out) / 1e6
    print(f"\nWrote {out} — {len(entries)} beats, {total:.1f}s, {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
