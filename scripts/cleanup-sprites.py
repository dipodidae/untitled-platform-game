#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10.0.0"]
# ///
"""
Reprocess all enemy sprites to:
1. Remove magenta/pink-ish backgrounds (broad hue detection, not just exact #FF00FF)
2. Tight-crop to content bounding box
3. Resize to 128x128 with content centered
"""

from pathlib import Path
from PIL import Image
import colorsys

ASSET_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "enemies"


def is_magenta_ish(r: int, g: int, b: int, a: int) -> bool:
    """Detect magenta/pink background pixels using HSV hue range.
    Magenta hues fall roughly in the 280-340 degree range (or 0.78-0.94 in 0-1).
    We also catch near-black pixels that are part of the bg."""
    if a < 10:
        return True  # already transparent
    
    # Normalize to 0-1
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    
    # Magenta/pink hue range: roughly 270-340 degrees = 0.75 - 0.944 in 0-1 scale
    # With decent saturation (not gray) and not too dark
    if 0.75 <= h <= 0.97 and s > 0.3 and v > 0.15:
        return True
    
    # Also catch reddish-magenta: hue 0.94-1.0 or 0.0-0.05 with high red, low green
    if (h >= 0.94 or h <= 0.05) and s > 0.4 and r > 150 and g < 100:
        return True
    
    return False


def remove_bg(img: Image.Image) -> Image.Image:
    """Remove magenta-ish background using flood-fill from edges."""
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()
    
    # Build a mask of magenta-ish pixels
    magenta_mask = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if is_magenta_ish(r, g, b, a):
                magenta_mask.add((x, y))
    
    # Flood fill from all edge pixels that are magenta — this ensures we only
    # remove connected background, not interior pinkish pixels on the character.
    to_remove = set()
    visited = set()
    queue = []
    
    # Seed from edges
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
    
    # BFS flood fill
    while queue:
        cx, cy = queue.pop()
        to_remove.add((cx, cy))
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                visited.add((nx, ny))
                if (nx, ny) in magenta_mask:
                    queue.append((nx, ny))
    
    # Set removed pixels to transparent
    for x, y in to_remove:
        pixels[x, y] = (0, 0, 0, 0)
    
    return img


def process_sprite(path: Path) -> None:
    """Remove bg, tight-crop, center in 128x128."""
    img = Image.open(path)
    img = remove_bg(img)
    
    # Tight crop to content
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    
    # Center in 128x128
    # Scale down if content is larger than 120px in either dimension
    # (leave 4px padding on each side)
    max_dim = max(img.width, img.height)
    if max_dim > 120:
        scale = 120 / max_dim
        new_w = max(1, int(img.width * scale))
        new_h = max(1, int(img.height * scale))
        img = img.resize((new_w, new_h), Image.LANCZOS)
    
    final = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    ox = (128 - img.width) // 2
    oy = (128 - img.height) // 2
    final.paste(img, (ox, oy), img)
    
    final.save(path)


def main():
    pngs = sorted(ASSET_DIR.glob("*.png"))
    print(f"Processing {len(pngs)} sprites in {ASSET_DIR}")
    
    for i, p in enumerate(pngs, 1):
        img = Image.open(p).convert("RGBA")
        data = list(img.getdata())
        transparent_before = sum(1 for r, g, b, a in data if a == 0)
        
        process_sprite(p)
        
        img2 = Image.open(p).convert("RGBA")
        data2 = list(img2.getdata())
        transparent_after = sum(1 for r, g, b, a in data2 if a == 0)
        
        pct = 100 * transparent_after / len(data2)
        print(f"  [{i}/{len(pngs)}] {p.name}: {transparent_before} -> {transparent_after} transparent px ({pct:.0f}%)")
    
    print("\nDone!")


if __name__ == "__main__":
    main()
