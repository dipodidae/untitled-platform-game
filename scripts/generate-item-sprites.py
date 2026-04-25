#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["google-genai>=1.0.0", "pillow>=10.0.0"]
# ///
"""
Generate pickup item sprites using Gemini image generation.
Each sprite is 128x128 PNG with transparency.

Usage:
    uv run scripts/generate-item-sprites.py [--api-key KEY]
"""

import argparse, os, sys, time, base64, colorsys
from pathlib import Path
from io import BytesIO

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "items"

STYLE = (
    "Single game pickup item sprite, front view, dark moody pixel art style, "
    "16-bit retro aesthetic, sharp crisp edges. Item centered on solid magenta "
    "#FF00FF background. Small item filling roughly 60% of the frame. "
    "No text, no UI, no ground, no shadows on background. Glowing magical item. "
)

ITEMS = {
    "coin": (
        "A shiny golden coin, round with a raised star or emblem in the center, "
        "gleaming gold with bright yellow highlights and warm orange rim. "
        "Radiates golden sparkle light. Classic game collectible treasure coin."
    ),
    "platinumCoin": (
        "A gleaming platinum coin, round with an ornate embossed eagle or laurel "
        "wreath in the center, silvery-white with cool blue-white highlights and "
        "polished mirror-like sheen. Radiates cold platinum sparkle light. Rare "
        "high-value collectible treasure."
    ),
    "crown": (
        "A regal diamond-crested crown, golden crown with three tall points each "
        "topped by a brilliant diamond gemstone, encrusted with small blue sapphires "
        "along the band. Radiates majestic golden and diamond-white light. "
        "Ultra-rare treasure crown."
    ),
    "healthPack": (
        "A glowing green health pack crystal, heart-shaped or cross-shaped healing "
        "item with bright emerald green glow and white sparkle highlights. "
        "Radiates soft green light. Magical healing energy."
    ),
    "armorShard": (
        "A glowing blue armor shard, angular shield-shaped defensive crystal with "
        "bright cyan-blue glow and metallic steel highlights. "
        "Radiates soft blue protective light. Magical shield energy."
    ),
    "bigShot": (
        "A glowing orange-red heavy ammunition pickup, large bullet or shell shape "
        "with warm orange glow and golden metallic highlights. "
        "Radiates fiery warmth. Powerful heavy weapon ammo."
    ),
}


def call_gemini(client, prompt, retries=3):
    """Generate an image with Gemini, return PIL Image or None."""
    from google.genai import types
    from PIL import Image as PILImage

    full_prompt = STYLE + prompt

    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=[full_prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                ),
            )
            for part in response.parts:
                if part.inline_data is not None:
                    data = part.inline_data.data
                    if isinstance(data, str):
                        data = base64.b64decode(data)
                    return PILImage.open(BytesIO(data))
            print(f"  Warning: No image in response (attempt {attempt + 1})")
        except Exception as e:
            wait = 2 ** attempt * 5
            print(f"  Warning: API error: {e}")
            if attempt < retries - 1:
                print(f"    Retrying in {wait}s...")
                time.sleep(wait)
    return None


def is_magenta_ish(r, g, b, a):
    if a < 10:
        return True
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    if 0.75 <= h <= 0.97 and s > 0.3 and v > 0.15:
        return True
    if (h >= 0.94 or h <= 0.05) and s > 0.4 and r > 150 and g < 100:
        return True
    return False


def remove_bg(img):
    """Remove magenta-ish background using flood-fill from edges."""
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()

    magenta_mask = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if is_magenta_ish(r, g, b, a):
                magenta_mask.add((x, y))

    to_remove = set()
    visited = set()
    queue = []

    for x in range(w):
        for y in [0, h - 1]:
            if (x, y) in magenta_mask:
                queue.append((x, y))
                visited.add((x, y))
    for y in range(h):
        for x in [0, w - 1]:
            if (x, y) in magenta_mask and (x, y) not in visited:
                queue.append((x, y))
                visited.add((x, y))

    while queue:
        cx, cy = queue.pop()
        to_remove.add((cx, cy))
        for nx, ny in [(cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)]:
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited and (nx, ny) in magenta_mask:
                visited.add((nx, ny))
                queue.append((nx, ny))

    for x, y in to_remove:
        pixels[x, y] = (0, 0, 0, 0)

    return img


def process_sprite(img):
    """Remove bg, tight-crop, center in 128x128."""
    from PIL import Image as PILImage

    img = remove_bg(img)

    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    max_dim = max(img.width, img.height)
    if max_dim > 120:
        scale = 120 / max_dim
        new_w = max(1, int(img.width * scale))
        new_h = max(1, int(img.height * scale))
        img = img.resize((new_w, new_h), PILImage.LANCZOS)

    final = PILImage.new("RGBA", (128, 128), (0, 0, 0, 0))
    ox = (128 - img.width) // 2
    oy = (128 - img.height) // 2
    final.paste(img, (ox, oy), img)

    return final


def main():
    from google import genai

    p = argparse.ArgumentParser(description="Generate item sprites")
    p.add_argument("--api-key")
    p.add_argument("--only", help="Comma-separated list of item names to generate")
    args = p.parse_args()

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("No API key. Set GEMINI_API_KEY or pass --api-key.")

    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    items = {k: v for k, v in ITEMS.items() if only is None or k in only}

    total = len(items)
    print(f"Generating {total} item sprites into {OUT_DIR}")

    for i, (name, desc) in enumerate(items.items(), 1):
        out_path = OUT_DIR / f"{name}.png"
        if out_path.exists():
            print(f"  [{i}/{total}] {name} — already exists, skipping")
            continue

        print(f"  [{i}/{total}] {name}...")
        img = call_gemini(client, desc)
        if img is None:
            print(f"    FAILED to generate {name}")
            continue

        final = process_sprite(img)
        final.save(out_path)
        print(f"    Saved {out_path.name} ({final.size[0]}x{final.size[1]})")

        if i < total:
            time.sleep(2)

    print(f"\nDone! Sprites saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
