import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter

ASSETS_DIR = r"C:\Users\informatics\.gemini\antigravity\scratch\thai-horror-buu\public\assets"
BRAIN_DIR = r"C:\Users\informatics\.gemini\antigravity\brain\fee0325a-3181-42ab-a76f-7ae9be66bfff"
os.makedirs( os.path.join(ASSETS_DIR, "frames"), exist_ok=True)

def make_8frame_student_walk(prefix):
    """
    Create a seamless 8-frame articulated pixel-art walk cycle:
    - Split below the hem of the shorts/skirt (67% height)
    - Render the swinging lower legs FIRST, then composite the upper body + shorts/skirt ON TOP
      so the hem naturally covers the leg joint with zero seam!
    """
    base_frames = [
        Image.open(os.path.join(ASSETS_DIR, f"{prefix}_{i}.png")).convert("RGBA")
        for i in range(4)
    ]
    cw, ch = 220, 330
    out_frames = []

    stride_swings = [-14, -7, 0, 8, 14, 7, 0, -8]
    bobs = [0, -3, -6, -2, 0, -3, -6, -2]
    leans = [-2, -1, 0, 1, 2, 1, 0, -1]

    for f_idx in range(8):
        src = base_frames[f_idx % 4].copy()
        sw, sh = src.size

        # Clean any stray left-edge smudge from previous cell's cone
        pix = src.load()
        for x in range(min(22, sw)):
            for y in range(sh):
                r, g, b, a = pix[x, y]
                if a > 0 and (max(r, g, b) - min(r, g, b)) < 35 and (r + g + b) < 260:
                    pix[x, y] = (0, 0, 0, 0)

        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

        # Split right at the bottom hem of the shorts/skirt (67% height), overlapping by 10px
        hem_y = int(sh * 0.66)
        upper = src.crop((0, 0, sw, hem_y + 6))
        lower = src.crop((0, hem_y - 6, sw, sh))

        mid_x = int(sw * 0.48)
        leg_back = lower.crop((0, 0, mid_x + 6, lower.height))
        leg_front = lower.crop((max(0, mid_x - 6), 0, sw, lower.height))

        swing = stride_swings[f_idx]
        bob = bobs[f_idx]

        leg_back_rot = leg_back.rotate(-swing * 0.75, resample=Image.NEAREST, expand=False)
        leg_front_rot = leg_front.rotate(swing * 0.75, resample=Image.NEAREST, expand=False)
        upper_rot = upper.rotate(leans[f_idx], resample=Image.NEAREST, expand=False)

        base_x = (cw - sw) // 2
        base_y = ch - sh - 6 + bob

        # 1. Draw lower legs FIRST
        canvas.alpha_composite(
            leg_back_rot,
            (base_x - int(swing * 0.35), base_y + hem_y - 6 - max(0, swing // 4))
        )
        canvas.alpha_composite(
            leg_front_rot,
            (base_x + mid_x - 6 + int(swing * 0.35), base_y + hem_y - 6 - max(0, -swing // 4))
        )
        # 2. Draw upper torso + shorts/skirt ON TOP so the hem overlaps the leg tops seamlessly!
        canvas.alpha_composite(upper_rot, (base_x, base_y))

        # 3. Crisp pixel-art flashlight in hand
        draw = ImageDraw.Draw(canvas)
        hx = base_x + int(sw * 0.80)
        hy = base_y + int(sh * 0.435)
        draw.rectangle([hx - 12, hy - 4, hx + 8, hy + 4], fill=(38, 40, 48, 255), outline=(15, 16, 20, 255))
        draw.rectangle([hx + 6, hy - 5, hx + 11, hy + 5], fill=(255, 232, 135, 255))

        out_path = os.path.join(ASSETS_DIR, "frames", f"{prefix}_walk_{f_idx}.png")
        canvas.save(out_path, "PNG")
        out_frames.append(canvas)

    return out_frames

male_frames = make_8frame_student_walk("student_male")
female_frames = make_8frame_student_walk("student_female")

# Save Combined 8-Frame Walk Cycle Contact Sheet for User Review
walk_sheet = Image.new("RGBA", (220 * 8 + 40, 330 * 2 + 80), (20, 18, 26, 255))
w_draw = ImageDraw.Draw(walk_sheet)
for i in range(8):
    x = 20 + i * 220
    # Frame border box
    w_draw.rectangle([x + 4, 25, x + 216, 345], outline=(60, 55, 75, 255), width=1)
    walk_sheet.alpha_composite(male_frames[i], (x, 20))
    w_draw.text((x + 75, 6), f"FRAME {i+1}", fill=(220, 200, 160, 255))

    w_draw.rectangle([x + 4, 385, x + 216, 705], outline=(60, 55, 75, 255), width=1)
    walk_sheet.alpha_composite(female_frames[i], (x, 380))
    w_draw.text((x + 75, 366), f"FRAME {i+1}", fill=(220, 200, 160, 255))

walk_sheet_path = os.path.join(BRAIN_DIR, "review_sheet_1_walk_8frames.png")
walk_sheet.convert("RGB").save(walk_sheet_path, "PNG")
print("Saved review_sheet_1_walk_8frames.png")

# -------------------------------------------------------------------------
# 2. Generate 8-Frame Ghost Animation Sheet (Dancer Ghost & Samphawesi)
# -------------------------------------------------------------------------
dancer_src = [Image.open(os.path.join(ASSETS_DIR, f"ghost_dancer_{i}.png")).convert("RGBA") for i in range(3)]
sam_src = [Image.open(os.path.join(ASSETS_DIR, f"ghost_samphawesi_{i}.png")).convert("RGBA") for i in range(3)]

dancer_8 = []
sam_8 = []

# Dancer 8 frames: eerie floating -> neck snapping tilt -> backward contortion -> glitch shadow -> lunge
dancer_plan = [
    (0, 0, 0, 1.0),
    (0, -6, -8, 1.0),
    (0, -14, -14, 0.92),
    (1, 0, -6, 1.0),
    (1, 8, -12, 0.88),
    (2, -4, -4, 1.0),
    (2, 4, 4, 0.95),
    (2, 10, 0, 1.0),
]
for idx, (src_i, angle, dy, alpha_mult) in enumerate(dancer_plan):
    cell = Image.new("RGBA", (260, 370), (0, 0, 0, 0))
    spr = dancer_src[src_i].rotate(angle, resample=Image.NEAREST, expand=True)
    spr.thumbnail((240, 340), Image.NEAREST)
    if alpha_mult < 1.0:
        # Glitch horizontal slice offset
        gw, gh = spr.size
        band = spr.crop((0, gh // 3, gw, (gh * 2) // 3))
        spr.paste(band, (6 if idx % 2 == 0 else -6, gh // 3))
    cx = (260 - spr.width) // 2
    cy = (370 - spr.height) // 2 + dy
    cell.alpha_composite(spr, (cx, cy))
    cell.save(os.path.join(ASSETS_DIR, "frames", f"dancer_anim_{idx}.png"), "PNG")
    dancer_8.append(cell)

# Samphawesi 8 frames: crouching eating (heaving shoulders) -> head twitching -> rising -> crawling stride
sam_plan = [
    (0, 0, 0, (1.0, 1.0)),
    (0, -2, -4, (1.03, 0.97)),
    (0, 4, -2, (0.98, 1.04)),
    (2, -6, 0, (1.0, 1.0)),
    (2, 3, -6, (1.02, 1.02)),
    (1, -4, 10, (1.0, 1.0)),
    (1, 2, 4, (1.05, 0.96)),
    (1, 6, 8, (0.96, 1.04)),
]
for idx, (src_i, angle, dy, scale_xy) in enumerate(sam_plan):
    cell = Image.new("RGBA", (280, 350), (0, 0, 0, 0))
    spr = sam_src[src_i].copy()
    spr.thumbnail((250, 310), Image.NEAREST)
    nw = int(spr.width * scale_xy[0])
    nh = int(spr.height * scale_xy[1])
    spr = spr.resize((nw, nh), Image.NEAREST).rotate(angle, resample=Image.NEAREST, expand=True)
    cx = (280 - spr.width) // 2
    cy = 340 - spr.height + dy
    cell.alpha_composite(spr, (max(0, cx), max(0, cy)))
    cell.save(os.path.join(ASSETS_DIR, "frames", f"sam_anim_{idx}.png"), "PNG")
    sam_8.append(cell)

ghost_sheet = Image.new("RGBA", (265 * 8 + 40, 370 * 2 + 80), (18, 15, 22, 255))
g_draw = ImageDraw.Draw(ghost_sheet)
for i in range(8):
    x = 20 + i * 265
    g_draw.rectangle([x + 4, 25, x + 258, 385], outline=(90, 35, 45, 255), width=1)
    ghost_sheet.alpha_composite(dancer_8[i], (x, 20))
    g_draw.text((x + 85, 6), f"DANCER F{i+1}", fill=(240, 150, 150, 255))

    g_draw.rectangle([x + 4, 415, x + 258, 755], outline=(65, 90, 65, 255), width=1)
    ghost_sheet.alpha_composite(sam_8[i], (x - 8, 410))
    g_draw.text((x + 70, 396), f"SAMPHAWESI F{i+1}", fill=(170, 220, 170, 255))

ghost_sheet_path = os.path.join(BRAIN_DIR, "review_sheet_2_ghosts_8frames.png")
ghost_sheet.convert("RGB").save(ghost_sheet_path, "PNG")
print("Saved review_sheet_2_ghosts_8frames.png")

# -------------------------------------------------------------------------
# 3. Generate Frame-by-Frame Cutscene Sequences (6 Frames each)
# -------------------------------------------------------------------------
bg1 = Image.open(os.path.join(ASSETS_DIR, "bg_scene1_forest.jpg")).convert("RGBA").resize((640, 360), Image.NEAREST)
bg2 = Image.open(os.path.join(ASSETS_DIR, "bg_scene2_hallway.jpg")).convert("RGBA").resize((640, 360), Image.NEAREST)
bg3_cut = Image.open(os.path.join(ASSETS_DIR, "bg_scene3_cutscene.jpg")).convert("RGBA").resize((640, 360), Image.NEAREST)
bg5 = Image.open(os.path.join(ASSETS_DIR, "bg_scene5_dawn.jpg")).convert("RGBA").resize((640, 360), Image.NEAREST)

door_l = Image.open(os.path.join(ASSETS_DIR, "door_left.png")).convert("RGBA")
door_r = Image.open(os.path.join(ASSETS_DIR, "door_right.png")).convert("RGBA")
uncle_img = Image.open(os.path.join(ASSETS_DIR, "uncle_0.png")).convert("RGBA")
frame_broken = Image.open(os.path.join(ASSETS_DIR, "photo_frame_broken.png")).convert("RGBA")
p1_img = Image.open(os.path.join(ASSETS_DIR, "photo_piece_1.png")).convert("RGBA")
p2_img = Image.open(os.path.join(ASSETS_DIR, "photo_piece_2.png")).convert("RGBA")
p3_img = Image.open(os.path.join(ASSETS_DIR, "photo_piece_3.png")).convert("RGBA")

def build_6frame_sheet(frames_list, captions, out_filename):
    # 3 cols x 2 rows of 640x360 frames
    sheet = Image.new("RGB", (640 * 3 + 40, 360 * 2 + 90), (14, 12, 18))
    draw = ImageDraw.Draw(sheet)
    for idx, frame in enumerate(frames_list):
        col = idx % 3
        row = idx // 3
        x = 10 + col * 650
        y = 32 + row * 395
        sheet.paste(frame.convert("RGB"), (x, y))
        draw.rectangle([x - 2, y - 2, x + 642, y + 362], outline=(210, 170, 100), width=2)
        draw.text((x + 8, y - 22), f"FRAME {idx+1}: {captions[idx]}", fill=(245, 225, 180))
    path = os.path.join(BRAIN_DIR, out_filename)
    sheet.save(path, "PNG")
    print(f"Saved {out_filename}")

# --- CUTSCENE A: 6-Frame Door Opening Sequence ---
door_frames = []
open_ratios = [1.0, 0.88, 0.65, 0.38, 0.22, 0.08]
for idx, ratio in enumerate(open_ratios):
    f = Image.new("RGBA", (640, 360), (5, 4, 8, 255))
    # Interior room revealed behind the opening door gap
    gap_half = int((1.0 - ratio) * 145)
    if gap_half > 2:
        interior = bg2.copy()
        if idx == 3:
            # Frame 4: Eerie Dancer Ghost silhouette inside the doorway!
            g = dancer_src[0].copy()
            g.thumbnail((150, 250), Image.NEAREST)
            interior.alpha_composite(g, (250, 75))
        elif idx == 4:
            # Frame 5: Flash of light before ghost vanishes
            interior = ImageEnhance.Brightness(interior).enhance(1.45)
            g = dancer_src[2].copy()
            g.thumbnail((170, 260), Image.NEAREST)
            interior.alpha_composite(g, (240, 70))
        crop_int = interior.crop((320 - gap_half, 30, 320 + gap_half, 330))
        f.alpha_composite(crop_int, (320 - gap_half, 30))

    # Left and Right wooden door panels perspective-scaled by ratio
    panel_w = max(8, int(145 * ratio))
    dl = door_l.resize((panel_w, 300), Image.NEAREST)
    dr = door_r.resize((panel_w, 300), Image.NEAREST)
    # Darken angled panels slightly as they swing inward
    dl = ImageEnhance.Brightness(dl).enhance(0.5 + 0.5 * ratio)
    dr = ImageEnhance.Brightness(dr).enhance(0.5 + 0.5 * ratio)
    f.alpha_composite(dl, (320 - gap_half - panel_w, 30))
    f.alpha_composite(dr, (320 + gap_half, 30))

    # Wooden doorframe border
    fd = ImageDraw.Draw(f)
    fd.rectangle([168, 24, 472, 336], outline=(58, 38, 24, 255), width=8)
    f.convert("RGB").save(os.path.join(ASSETS_DIR, "frames", f"cutscene_door_{idx}.jpg"), "JPEG", quality=92)
    door_frames.append(f)

build_6frame_sheet(
    door_frames,
    [
        "Closed Thai Teak Door",
        "Latch Unlocks & Creaks",
        "Door Swings Open 35%",
        "Ghost Silhouette Inside!",
        "Flashlight Flicker Glitch",
        "Door Fully Open into Hall"
    ],
    "review_sheet_3_cutscene_door.png"
)

# --- CUTSCENE B: 6-Frame Samphawesi Encounter Sequence ---
sam_cut_frames = []
for idx in range(6):
    if idx == 0:
        # Wide dark view of offering room before flashlight hits
        f = ImageEnhance.Brightness(bg3_cut.copy()).enhance(0.45)
    elif idx == 1:
        # Medium zoom on offering tray and crouching spirit
        crop = bg3_cut.crop((140, 60, 620, 350)).resize((640, 360), Image.NEAREST)
        f = ImageEnhance.Brightness(crop).enhance(0.8)
    elif idx == 2:
        # Full HD reveal with flashlight beam hitting the spirit
        f = bg3_cut.copy()
    elif idx == 3:
        # Close-up zoom on the decaying spirit turning its head
        crop = bg3_cut.crop((340, 120, 610, 340)).resize((640, 360), Image.NEAREST)
        f = crop
    elif idx == 4:
        # Spirit rears up in decaying standing pose
        f = ImageEnhance.Brightness(bg2.copy()).enhance(0.35)
        s2 = sam_src[2].copy()
        s2.thumbnail((290, 320), Image.NEAREST)
        f.alpha_composite(s2, (190, 30))
    else:
        # Frame 6: Crawling lunge right at camera with red horror vignette!
        f = ImageEnhance.Brightness(bg2.copy()).enhance(0.25)
        s1 = sam_src[1].copy()
        s1 = s1.resize((480, 270), Image.NEAREST)
        f.alpha_composite(s1, (80, 65))
        fd = ImageDraw.Draw(f)
        fd.rectangle([0, 0, 639, 359], outline=(190, 20, 20, 255), width=10)

    f.convert("RGB").save(os.path.join(ASSETS_DIR, "frames", f"cutscene_sam_{idx}.jpg"), "JPEG", quality=92)
    sam_cut_frames.append(f)

build_6frame_sheet(
    sam_cut_frames,
    [
        "Entering Dark Offering Room",
        "Spotting Crouching Figure",
        "Flashlight Hits Samphawesi",
        "Close-Up Head Turn",
        "Decaying Spirit Rears Up",
        "Crawling Lunge Chase Start!"
    ],
    "review_sheet_4_cutscene_samphawesi.png"
)

# --- CUTSCENE C: 6-Frame Photo Puzzle & Ending Uncle Sequence ---
end_cut_frames = []
for idx in range(6):
    if idx == 0:
        # Photo frame with pieces flying in
        f = ImageEnhance.Brightness(bg2.copy()).enhance(0.3)
        fr = frame_broken.resize((280, 230), Image.NEAREST)
        f.alpha_composite(fr, (180, 65))
        f.alpha_composite(p1_img.resize((95, 78), Image.NEAREST), (80, 140))
        f.alpha_composite(p2_img.resize((95, 78), Image.NEAREST), (270, 25))
        f.alpha_composite(p3_img.resize((95, 78), Image.NEAREST), (465, 140))
    elif idx == 1:
        # Restored glowing memory photo revealing truth
        f = ImageEnhance.Brightness(bg2.copy()).enhance(0.45)
        fr = frame_broken.resize((300, 245), Image.NEAREST)
        f.alpha_composite(fr, (170, 58))
        f.alpha_composite(p1_img.resize((95, 110), Image.NEAREST), (205, 125))
        f.alpha_composite(p2_img.resize((95, 110), Image.NEAREST), (275, 125))
        f.alpha_composite(p3_img.resize((95, 110), Image.NEAREST), (345, 125))
        fd = ImageDraw.Draw(f)
        fd.rectangle([166, 54, 474, 306], outline=(90, 240, 200, 255), width=4)
    elif idx == 2:
        # Stepping out the back gate into morning mist
        f = bg5.copy()
        st = male_frames[1].copy()
        st.thumbnail((140, 210), Image.NEAREST)
        f.alpha_composite(st, (95, 125))
    elif idx == 3:
        # Meeting the Elderly Man in white Raj Pattern suit
        f = bg5.copy()
        st = male_frames[0].copy()
        st.thumbnail((140, 210), Image.NEAREST)
        un = uncle_img.copy()
        un.thumbnail((140, 215), Image.NEAREST)
        f.alpha_composite(st, (160, 125))
        f.alpha_composite(un, (410, 120))
    elif idx == 4:
        # Close-up on the Raj Pattern Uncle making the promise
        crop = bg5.crop((220, 40, 620, 280)).resize((640, 360), Image.NEAREST)
        f = crop
        un = uncle_img.resize((190, 310), Image.NEAREST)
        f.alpha_composite(un, (225, 45))
    else:
        # Final Golden Dawn BUU Open House 20-21 Title Card Frame
        f = ImageEnhance.Brightness(bg5.copy()).enhance(0.55)
        fd = ImageDraw.Draw(f)
        fd.rectangle([70, 65, 570, 295], fill=(16, 14, 24, 235), outline=(235, 185, 90, 255), width=4)
        fd.text((195, 110), "PROMISE TO MEET AT", fill=(210, 195, 165, 255))
        fd.text((165, 155), "OPEN HOUSE BUU", fill=(255, 215, 100, 255))
        fd.text((225, 205), "20 - 21 THIS MONTH", fill=(255, 255, 255, 255))

    f.convert("RGB").save(os.path.join(ASSETS_DIR, "frames", f"cutscene_end_{idx}.jpg"), "JPEG", quality=92)
    end_cut_frames.append(f)

build_6frame_sheet(
    end_cut_frames,
    [
        "Collecting 3 Torn Photo Pieces",
        "Restored Frame Unlocks Truth",
        "Escaping into Morning Mist",
        "Meeting Raj Pattern Uncle",
        "The Promise to Return",
        "OPEN HOUSE BUU 20-21 Finale"
    ],
    "review_sheet_5_cutscene_ending.png"
)
print("All frame sheets generated!")
