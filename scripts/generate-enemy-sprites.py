#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["google-genai>=1.0.0", "pillow>=10.0.0"]
# ///
"""
Generate unique enemy sprites for all 25 enemy types using Gemini image generation.
Each sprite is 128x128 PNG with transparency, designed for a dark CRT-filtered platformer.

Usage:
    uv run scripts/generate-enemy-sprites.py [--api-key KEY] [--only NAME1,NAME2]
"""

import argparse, os, sys, time, base64
from pathlib import Path
from io import BytesIO

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "enemies"

# Style prefix applied to every prompt
STYLE = (
    "Single game enemy character sprite, side view, dark moody pixel art style, "
    "16-bit retro aesthetic, sharp crisp edges. Character centered on solid magenta "
    "#FF00FF background. Small character filling roughly 70% of the frame. "
    "No text, no UI, no ground, no shadows on background. "
)

# Per-enemy prompt descriptions keyed by output filename (no extension)
ENEMIES = {
    # === Dummy ===
    "dummy": (
        "A wooden training dummy target, crude humanoid shape made of stacked "
        "planks and burlap sack head, arrow-riddled, battered. Warm brown tones "
        "with rusty nail accents."
    ),
    # === Prowler ===
    "prowler": (
        "An angular crystalline predator, faceted diamond-shaped body made of "
        "dark violet-blue crystal, with sharp geometric edges. Two thin slit-eyes "
        "glow cold white. Unstable energy crackles at the seams. Cold desaturated "
        "blue-purple palette."
    ),
    # === Specials (10) ===
    "mirror": (
        "A ghostly mirror-shade doppelganger, semi-transparent humanoid silhouette "
        "made of dark smoke with a reflective mirror-like face. Hollow eye-bracket "
        "markings. Ash-gray with faint bone-white outlines."
    ),
    "hush": (
        "A translucent jellyfish-like floating creature, bell-shaped body with "
        "trailing luminescent tendrils. Deep indigo-purple body with cold blue "
        "bioluminescent glow. Silence aura ripples around it."
    ),
    "candlewick": (
        "A small hunched lantern-bearer creature, dark robed body carrying an "
        "ornate brass lantern with a warm golden flame. Body is dark brown-black, "
        "lantern casts warm amber glow above its head."
    ),
    "knight": (
        "A heavy armored pendulum knight, bulky dark steel plate armor with a "
        "T-shaped visor glowing amber-orange. Massive two-handed blade at rest. "
        "Intimidating silhouette, dark gunmetal with warm gold visor slit."
    ),
    "bloomrot": (
        "A grotesque fungal mass, bulbous corrupted plant-creature with pulsing "
        "purple-magenta fruiting bodies and toxic spore clouds. Sickly organic "
        "textures, dark plum and infected pink-violet palette."
    ),
    "echo": (
        "An ethereal phase-shifting wraith, translucent flickering humanoid form "
        "that shifts between solid and ghostly. Cold blue inner glow, bone-white "
        "outer shell that seems to glitch and stutter. Adaptive intelligence "
        "shown by a memory-dot floating above its head."
    ),
    "huskcrow": (
        "A mechanical undead crow, skeletal bird with tattered dark feathers and "
        "exposed bone-metal framework. Glowing oxblood-red beak. Pure black body "
        "with rust-iron accents. Chain link dangling from one leg."
    ),
    "cartographer": (
        "A hooded scholar-creature, dark robed figure with a concealing cowl, "
        "holding a bone-colored quill. No visible face — just darkness under "
        "the hood. Dark crimson-black robes with bone trim."
    ),
    "shrine": (
        "A deceptive mimic shrine, looks like a stone checkpoint pedestal but "
        "with a wrong-colored cold-red flame instead of warm. Subtle teeth-like "
        "cracks in the stone. Sandy-brown stone with an unsettling red flame."
    ),
    "pilgrim": (
        "A faceless robed pilgrim, tall thin figure in deep indigo-black robes "
        "with a pointed hood. Cold blue light where the face should be. Slow "
        "and deliberate posture. Dark midnight blue-black palette."
    ),
    # === Classics (13) ===
    "medusa": (
        "A floating Medusa head, stone-like female face with writhing snake-hair "
        "tendrils, glowing hateful eyes. Trailing spectral wisps. Dark olive-brown "
        "stone face with oxblood-red snake highlights."
    ),
    "beetle": (
        "A armored buzzy beetle, low squat insect with an impenetrable dark blue "
        "metallic shell, stubby legs, and tiny determined eyes. Shell has a cold "
        "steel-blue sheen. Compact and tank-like."
    ),
    "boo": (
        "A shy ghost, round white spectral blob with hollow black eyes and a "
        "wide surprised mouth. Translucent edges. When scared it covers its face "
        "with stubby ghost-hands. Bone-white with dark eye hollows."
    ),
    "wallmaster": (
        "A giant disembodied grabbing hand, dark leathery skin with grasping "
        "fingers, descending from above on a thin tether line. Dark maroon-brown "
        "flesh with bone-colored fingertips."
    ),
    "stalker": (
        "A persistent shadow predator (Nosk-like), elongated dark insectoid body "
        "with spindly legs and two burning red eyes. Pitch black body with deep "
        "oxblood-red eye glow. Menacing and relentless."
    ),
    "wizard": (
        "An eggplant wizard, short robed sorcerer with a tall pointed purple hat "
        "and a gnarled staff. Launches cursed produce. Deep purple robes with "
        "lavender trim and a mischievous hidden face."
    ),
    "garpede": (
        "A segmented centipede-like dash hazard, long armored body made of "
        "interlocking red-hot segments with spiky legs. Blazing hot-red leading "
        "segment fading to dark crimson at the tail."
    ),
    "ironknuckle": (
        "A front-armored knight guardian, facing forward with a massive shield "
        "covering the front. Heavy dark steel armor with bone-colored shield face. "
        "Only vulnerable from behind. Stoic and immovable."
    ),
    "cagney": (
        "A carnivorous flower boss, large sinister flower creature with snapping "
        "petal-jaws and thorny vines. Dark green stem-body with warm golden petals "
        "that look like they could bite. Phase-shifting expressions."
    ),
    "drybones": (
        "A skeletal warrior that reassembles, bone-white skeleton in tattered armor "
        "scraps with hollow dark eye sockets. Can crumble into a bone pile and "
        "rebuild. Bone-cream white with dark edge outlines."
    ),
    "plantera": (
        "An enraged carnivorous plant, massive bulbous plant-beast with thrashing "
        "vine-tendrils and a gaping maw full of thorn-teeth. Dark plum body with "
        "hot-pink tendril tips. Rooted but furious."
    ),
    "hammerbro": (
        "A hammer-throwing soldier, stocky armored warrior with a crested helmet, "
        "winding up to throw a heavy hammer. Dark green-brown military armor with "
        "a bone-colored helmet crest."
    ),
    "mantislord": (
        "An elegant mantis warrior boss, tall regal insectoid with scythe-blade "
        "arms extended, armored carapace. Cold steel-blue armor with bone-white "
        "blade edges. Telegraphed strike pose."
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
    import struct

    img = img.convert("RGBA")
    data = img.tobytes()
    new_data = bytearray(len(data))

    for i in range(0, len(data), 4):
        r, g, b, a = data[i], data[i + 1], data[i + 2], data[i + 3]
        # Detect magenta-ish pixels: high R, low G, high B
        if r > 180 and g < 100 and b > 180:
            new_data[i:i + 4] = b'\x00\x00\x00\x00'
        # Also catch near-black background
        elif r < 30 and g < 30 and b < 30:
            new_data[i:i + 4] = b'\x00\x00\x00\x00'
        else:
            new_data[i:i + 4] = bytes([r, g, b, a])

    return PILImage.frombytes("RGBA", img.size, bytes(new_data))


def main():
    from PIL import Image
    from google import genai

    p = argparse.ArgumentParser(description="Generate enemy sprites")
    p.add_argument("--api-key")
    p.add_argument("--only", help="Comma-separated list of enemy names to generate")
    args = p.parse_args()

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("No API key. Set GEMINI_API_KEY or pass --api-key.")

    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    enemies = {k: v for k, v in ENEMIES.items() if only is None or k in only}

    total = len(enemies)
    print(f"Generating {total} enemy sprites into {OUT_DIR}")

    for i, (name, desc) in enumerate(enemies.items(), 1):
        out_path = OUT_DIR / f"{name}.png"
        if out_path.exists():
            print(f"  [{i}/{total}] {name} — already exists, skipping")
            continue

        print(f"  [{i}/{total}] {name}...")
        img = call_gemini(client, desc)
        if img is None:
            print(f"    ✗ Failed to generate {name}")
            continue

        # Process: remove background, resize to 128x128
        img = remove_magenta_bg(img)

        # Crop to content bounding box, then resize to 128x128
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)

        # Resize to 128x128 maintaining aspect ratio with padding
        img.thumbnail((128, 128), Image.NEAREST)
        final = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        offset_x = (128 - img.width) // 2
        offset_y = (128 - img.height) // 2
        final.paste(img, (offset_x, offset_y), img)

        final.save(out_path)
        print(f"    ✓ Saved {out_path.name} ({final.size[0]}x{final.size[1]})")

        # Small delay to avoid rate limits
        if i < total:
            time.sleep(2)

    print(f"\nDone! Sprites saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
