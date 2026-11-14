import os
import shutil
from PIL import Image, ImageFilter, ImageEnhance
from collections import deque

# Paths are relative to the repository. The original source art (not stored in git)
# is read from ASSET_SOURCE_DIR, e.g.  ASSET_SOURCE_DIR=path/to/art python tools/process_assets.py
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "public", "assets")
BRAIN_DIR = os.environ.get("ASSET_SOURCE_DIR", os.path.join(REPO_ROOT, "art-source"))
os.makedirs(OUT_DIR, exist_ok=True)

def remove_bg_border_only(img, tolerance=19, strip_flashlight_cone=False):
    """
    Strictly remove only the outer solid #1a1a22 background connected to the image border.
    NEVER delete interior dark pixels (like black hair, black shorts, or dark outlines).
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()

    # Sample top-left & bottom-left corners as background reference
    corners = [pixels[0, 0][:3], pixels[0, h-1][:3], pixels[w-1, 0][:3], pixels[w-1, h-1][:3]]
    bg_r = sum(c[0] for c in corners) // 4
    bg_g = sum(c[1] for c in corners) // 4
    bg_b = sum(c[2] for c in corners) // 4

    def color_dist(r, g, b):
        return ((r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2) ** 0.5

    visited = [[False] * h for _ in range(w)]
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if color_dist(*pixels[x, y][:3]) <= tolerance + 4:
                visited[x][y] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[x][y] and color_dist(*pixels[x, y][:3]) <= tolerance + 4:
                visited[x][y] = True
                q.append((x, y))

    while q:
        cx, cy = q.popleft()
        pixels[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                r, g, b, _ = pixels[nx, ny]
                # Only flood into flat matte background gray (never pure black outlines < 15)
                brightness = (r + g + b) / 3.0
                if color_dist(r, g, b) <= tolerance and brightness > 16:
                    visited[nx][ny] = True
                    q.append((nx, ny))

    # If student sprite: remove ONLY the baked-in gray flashlight cone (preserving the hand & front shoe!)
    if strip_flashlight_cone:
        cone_start_x = int(w * 0.53)
        for x in range(cone_start_x, w):
            for y in range(int(h * 0.25), int(h * 0.65)):
                r, g, b, a = pixels[x, y]
                # The flashlight cone is a desaturated warm-gray gradient; skin/shirt has higher saturation or is further left
                if a > 0 and x > int(w * 0.55) and (max(r, g, b) - min(r, g, b)) < 38:
                    pixels[x, y] = (0, 0, 0, 0)

    # Soft 1px alpha feather on outer boundary
    for x in range(1, w - 1):
        for y in range(1, h - 1):
            r, g, b, a = pixels[x, y]
            if a > 0:
                transparent_neighbors = sum(
                    1 for nx, ny in ((x+1,y), (x-1,y), (x,y+1), (x,y-1))
                    if pixels[nx, ny][3] == 0
                )
                if transparent_neighbors > 0 and color_dist(r, g, b) <= tolerance + 10:
                    pixels[x, y] = (r, g, b, 110)

    bbox = rgba.getbbox()
    if bbox:
        pad = 4
        rgba = rgba.crop((
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad)
        ))
    return rgba

def slice_grid(src_filename, row_bounds, col_bounds, names, tolerance=19, strip_flashlight_cone=False):
    path = os.path.join(BRAIN_DIR, src_filename)
    img = Image.open(path)
    w, h = img.size
    for r_idx, (y0_pct, y1_pct) in enumerate(row_bounds):
        for c_idx, (x0_pct, x1_pct) in enumerate(col_bounds):
            name = names[r_idx][c_idx]
            if not name:
                continue
            box = (int(w * x0_pct), int(h * y0_pct), int(w * x1_pct), int(h * y1_pct))
            cell = img.crop(box)
            clean = remove_bg_border_only(cell, tolerance=tolerance, strip_flashlight_cone=strip_flashlight_cone)
            out_path = os.path.join(OUT_DIR, f"{name}.png")
            clean.save(out_path, "PNG")
            print(f"Saved {name}.png ({clean.size})")

# 1. Copy & prepare all 5 HD Scene Backgrounds
shutil.copyfile(
    os.path.join(BRAIN_DIR, "thai_horror_mansion_entrance_pixel_art_1794654432648.jpg"),
    os.path.join(OUT_DIR, "bg_scene1_forest.jpg")
)
shutil.copyfile(
    os.path.join(BRAIN_DIR, "scene2_mansion_hallway_1794654432208.jpg"),
    os.path.join(OUT_DIR, "bg_scene2_hallway.jpg")
)
shutil.copyfile(
    os.path.join(BRAIN_DIR, "scene5_peaceful_dawn_mansion_gate_1794654435693.jpg"),
    os.path.join(OUT_DIR, "bg_scene5_dawn.jpg")
)

# Build clean Scene 3 (Offering Room) & Scene 4 (Inner Ritual Hall) from bg_scene2_hallway
# by horizontally flipping/compositing and color-grading in PIL so every room looks crisp 32-bit pixel art
base_hall = Image.open(os.path.join(BRAIN_DIR, "scene2_mansion_hallway_1794654432208.jpg")).convert("RGB")
bw, bh = base_hall.size

# Scene 3: Offering Room (flipped architecture + warm eerie candlelit tone, portrait wall replaced with clean wood planks)
scene3 = base_hall.transpose(Image.FLIP_LEFT_RIGHT).copy()
# Clone clean wood planks over the flipped portrait gallery area so Scene 3 looks like a distinct room
plank_strip = scene3.crop((int(bw * 0.30), int(bh * 0.14), int(bw * 0.42), int(bh * 0.78)))
for offset_x in (0.42, 0.54, 0.66, 0.74):
    scene3.paste(plank_strip, (int(bw * offset_x), int(bh * 0.14)))
scene3 = ImageEnhance.Brightness(scene3).enhance(0.88)
scene3.save(os.path.join(OUT_DIR, "bg_scene3_room.jpg"), "JPEG", quality=95)

# Scene 4: Ritual & Escape Hall (deep moody crimson-amber wood tone)
scene4 = base_hall.copy()
plank_strip4 = scene4.crop((int(bw * 0.58), int(bh * 0.14), int(bw * 0.68), int(bh * 0.78)))
for offset_x in (0.14, 0.24, 0.34, 0.44):
    scene4.paste(plank_strip4, (int(bw * offset_x), int(bh * 0.14)))
scene4 = ImageEnhance.Contrast(scene4).enhance(1.12)
scene4.save(os.path.join(OUT_DIR, "bg_scene4_room.jpg"), "JPEG", quality=95)
print("Prepared crisp HD backgrounds for Scenes 1-5")

# 2. Slice Students (without the baked-in gray flashlight cone and preserving black hair/shorts!)
slice_grid(
    "thai_students_horror_spritesheet_1794654428942.jpg",
    [(0.02, 0.50), (0.50, 0.98)],
    [(0.04, 0.28), (0.28, 0.52), (0.52, 0.76), (0.76, 0.99)],
    [
        ["student_male_0", "student_male_1", "student_male_2", "student_male_3"],
        ["student_female_0", "student_female_1", "student_female_2", "student_female_3"],
    ],
    tolerance=18,
    strip_flashlight_cone=True
)

# 3. Slice Dancer Ghost (Row 1 from first contorted ghost sheet)
slice_grid(
    "thai_ghosts_spritesheet_1794654583961.jpg",
    [(0.01, 0.54)],
    [(0.02, 0.32), (0.32, 0.65), (0.65, 0.98)],
    [
        ["ghost_dancer_0", "ghost_dancer_1", "ghost_dancer_2"]
    ],
    tolerance=18
)

# 4. Slice Decaying Samphawesi Ghost (Row 2 from second contorted ghost sheet)
slice_grid(
    "thai_horror_spritesheet_1794654744508.jpg",
    [(0.50, 0.99)],
    [(0.02, 0.32), (0.32, 0.68), (0.68, 0.98)],
    [
        ["ghost_samphawesi_0", "ghost_samphawesi_1", "ghost_samphawesi_2"]
    ],
    tolerance=18
)

# 5. Slice Uncle in Raj Pattern Suit
slice_grid(
    "thai_horror_pixel_spritesheet_1794654221040.jpg",
    [(0.65, 0.99)],
    [(0.55, 0.72), (0.72, 0.90)],
    [
        ["uncle_0", "uncle_1"]
    ],
    tolerance=18
)

# 6. Slice Offerings, Photo Puzzle & Mansion Props
slice_grid(
    "thai_mansion_pixel_spritesheet_v2_1794654246028.jpg",
    [(0.01, 0.33), (0.33, 0.62), (0.62, 0.99)],
    [(0.02, 0.26), (0.26, 0.50), (0.50, 0.74), (0.74, 0.98)],
    [
        ["offering_krathong", "offering_garland", "offering_incense", "offering_dessert"],
        ["photo_piece_1", "photo_piece_2", "photo_piece_3", "photo_frame_broken"],
        ["prop_cabinet", "prop_jar", "prop_door", "prop_table"],
    ],
    tolerance=18
)

# 7. Slice Altar & Talisman
slice_grid(
    "thai_horror_spritesheet_1794650197015.jpg",
    [(0.62, 0.89)],
    [(0.31, 0.48), (0.77, 0.95)],
    [
        ["prop_altar", "prop_talisman"]
    ],
    tolerance=18
)

# 8. Split prop_door.png into door_left.png and door_right.png
door_img = Image.open(os.path.join(OUT_DIR, "prop_door.png"))
dw, dh = door_img.size
mid = dw // 2
door_img.crop((0, 0, mid, dh)).save(os.path.join(OUT_DIR, "door_left.png"), "PNG")
door_img.crop((mid, 0, dw, dh)).save(os.path.join(OUT_DIR, "door_right.png"), "PNG")
print("All assets processed cleanly!")
