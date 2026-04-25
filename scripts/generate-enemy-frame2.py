#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["google-genai>=1.0.0", "pillow>=10.0.0"]
# ///
"""
Generate second animation frame for each enemy by editing the existing sprite.
Uses image-to-image to create a pose variant for 2-frame animation.

Usage:
    uv run scripts/generate-enemy-frame2.py [--api-key KEY] [--only NAME1,NAME2]
"""

import argparse, os, sys, time, base64
from pathlib import Path
from io import BytesIO

BASE_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "enemies"

# Per-enemy edit instructions for creating a second animation frame
EDITS = {
    "dummy": "Shift the training dummy slightly — tilt it a few degrees to the right, as if swaying from an impact. Keep everything else identical.",
    "prowler": "Shift the crystal predator's body into a slightly compressed crouch pose, edges angled more sharply. Energy crackles more intensely. Keep style identical.",
    "mirror": "Make the smoke silhouette shift and waver — body leans slightly forward, smoke tendrils reach in a different direction. Keep style identical.",
    "hush": "Compress the jellyfish bell slightly and extend the tendrils longer, as in a swimming pulse downstroke. Keep style identical.",
    "candlewick": "Shift the lantern-bearer's walking pose — opposite leg forward, lantern swings slightly to the other side. Keep style identical.",
    "knight": "Shift the armored knight into a forward-leaning attack stance — blade raised slightly higher, visor glowing brighter. Keep style identical.",
    "bloomrot": "Expand the fungal mass slightly — fruiting bodies puff outward, spore cloud denser. Like a breathing exhale pose. Keep style identical.",
    "echo": "Shift the wraith's flickering form — body partially phased/offset, as if glitching between positions. Inner glow pulses brighter. Keep style identical.",
    "huskcrow": "Shift the crow's wing position — wings angled downward in a flap downstroke, body tilted slightly. Keep style identical.",
    "cartographer": "Shift the hooded figure's walking pose — opposite foot forward, quill hand in a different writing position. Keep style identical.",
    "shrine": "Make the shrine's flame flicker to the opposite side, teeth-cracks slightly wider, stone subtly shifted. Keep style identical.",
    "pilgrim": "Shift the robed pilgrim's walking pose — opposite leg forward, robes swaying the other direction. Keep style identical.",
    "medusa": "Shift the Medusa head's snake-hair — tendrils writhing in different directions, mouth slightly more open. Keep style identical.",
    "beetle": "Shift the beetle into a mid-step pose — legs in alternating positions from the original, shell tilted slightly. Keep style identical.",
    "boo": "Shift the ghost's expression — mouth wider, eyes slightly narrower, body squished rounder as if lunging forward. Keep style identical.",
    "wallmaster": "Shift the grabbing hand — fingers more spread/grasping, wrist angled differently, tether line curves. Keep style identical.",
    "stalker": "Shift the shadow predator into a more aggressive pose — legs in different stride position, body lower and more lunging. Keep style identical.",
    "wizard": "Shift the sorcerer's casting pose — staff angled differently, free hand raised with magic energy, hat tilts. Keep style identical.",
    "garpede": "Shift the centipede's body segments — curved in the opposite direction, legs in alternating positions. Keep style identical.",
    "ironknuckle": "Shift the armored guardian's stance slightly — shield angled differently, weight on opposite foot. Keep style identical.",
    "cagney": "Shift the carnivorous flower — petals rotated to different positions, stem curved the other way, jaw in different open position. Keep style identical.",
    "drybones": "Shift the skeleton's walking pose — opposite arm and leg forward, skull tilted slightly the other direction. Keep style identical.",
    "plantera": "Shift the plant-beast's tendrils — thrashing in opposite directions, maw angled differently, body pulsed slightly larger. Keep style identical.",
    "hammerbro": "Shift the soldier into a throwing follow-through pose — arm extended after throw, body leaning forward. Keep style identical.",
    "mantislord": "Shift the mantis warrior's scythe arms — one raised high, one lowered, body turned slightly. Keep style identical.",
}


def call_gemini_edit(client, input_image, prompt, retries=3):
    """Edit an image with Gemini, return PIL Image or None."""
    from google.genai import types
    from PIL import Image as PILImage

    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=[input_image, prompt],
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
            print(f"  ⚠ No image in response (attempt {attempt + 1})")
        except Exception as e:
            wait = 2 ** attempt * 5
            print(f"  ⚠ API error: {e}")
            if attempt < retries - 1:
                print(f"    Retrying in {wait}s...")
                time.sleep(wait)
    return None


def remove_magenta_bg(img):
    """Remove magenta (#FF00FF) background, replacing with transparency."""
    from PIL import Image as PILImage

    img = img.convert("RGBA")
    data = img.tobytes()
    new_data = bytearray(len(data))

    for i in range(0, len(data), 4):
        r, g, b, a = data[i], data[i + 1], data[i + 2], data[i + 3]
        if r > 180 and g < 100 and b > 180:
            new_data[i:i + 4] = b'\x00\x00\x00\x00'
        elif r < 30 and g < 30 and b < 30:
            new_data[i:i + 4] = b'\x00\x00\x00\x00'
        else:
            new_data[i:i + 4] = bytes([r, g, b, a])

    return PILImage.frombytes("RGBA", img.size, bytes(new_data))


def main():
    from PIL import Image
    from google import genai

    p = argparse.ArgumentParser(description="Generate enemy sprite frame 2")
    p.add_argument("--api-key")
    p.add_argument("--only", help="Comma-separated list of enemy names to generate")
    args = p.parse_args()

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("No API key. Set GEMINI_API_KEY or pass --api-key.")

    client = genai.Client(api_key=api_key)

    only = set(args.only.split(",")) if args.only else None
    edits = {k: v for k, v in EDITS.items() if only is None or k in only}

    total = len(edits)
    print(f"Generating {total} second-frame sprites into {BASE_DIR}")

    for i, (name, edit_prompt) in enumerate(edits.items(), 1):
        frame1_path = BASE_DIR / f"{name}.png"
        out_path = BASE_DIR / f"{name}_b.png"

        if out_path.exists():
            print(f"  [{i}/{total}] {name}_b — already exists, skipping")
            continue

        if not frame1_path.exists():
            print(f"  [{i}/{total}] {name} — frame 1 missing, skipping")
            continue

        print(f"  [{i}/{total}] {name}_b...")

        # Load frame 1 as input
        input_img = Image.open(frame1_path)

        img = call_gemini_edit(client, input_img, edit_prompt)
        if img is None:
            print(f"    ✗ Failed to generate {name}_b")
            continue

        # Process: remove background, resize to 128x128
        img = remove_magenta_bg(img)
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)

        img.thumbnail((128, 128), Image.NEAREST)
        final = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        offset_x = (128 - img.width) // 2
        offset_y = (128 - img.height) // 2
        final.paste(img, (offset_x, offset_y), img)

        final.save(out_path)
        print(f"    ✓ Saved {out_path.name} ({final.size[0]}x{final.size[1]})")

        if i < total:
            time.sleep(2)

    print(f"\nDone! Second frames saved to {BASE_DIR}")


if __name__ == "__main__":
    main()
