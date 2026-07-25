"""Generate a polished 1290x2796 paywall screenshot for App Store Connect.
iPhone 6.7" portrait resolution, accepted by ASC for subscription review
screenshots and App Store listing screenshots."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, textwrap

# Brand tokens
INK = (31, 68, 88)
INK_LIFTED = (54, 92, 113)
BLUEPRINT = (61, 122, 153)
BLUEPRINT_LIFTED = (95, 153, 184)
CREAM = (250, 248, 243)
CREAM_SOFT = (243, 240, 232)
STONE = (224, 220, 212)
STONE_SOFT = (236, 232, 224)
GRAPHITE = (54, 64, 73)
SLATE = (107, 119, 130)
SLATE_SOFT = (148, 158, 168)
WHITE = (255, 255, 255)
BLUEPRINT_TINT = (228, 238, 244)
BLUEPRINT_TINT_BORDER = (200, 218, 228)

W, H = 1290, 2796
img = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(img)

def font(name, size):
    p = f"C:/Windows/Fonts/{name}"
    if os.path.exists(p):
        return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# Fonts
f_time = font("seguisb.ttf", 38)
f_eyebrow = font("seguisb.ttf", 30)
f_h1 = font("georgia.ttf", 108)
f_h1_italic = font("georgiai.ttf", 108)
f_sub = font("segoeui.ttf", 42)
f_card_t = font("seguisb.ttf", 40)
f_card_s = font("segoeui.ttf", 28)
f_price_label = font("seguisb.ttf", 24)
f_price = font("seguisb.ttf", 96)
f_price_unit = font("segoeui.ttf", 30)
f_btn = font("seguisb.ttf", 42)
f_link = font("seguisb.ttf", 28)
f_legal = font("segoeui.ttf", 26)
f_compare_t = font("seguisb.ttf", 26)
f_compare = font("segoeui.ttf", 26)
f_disclosure = font("segoeui.ttf", 22)
f_icon = font("seguisym.ttf", 54)

PAD = 80

# ============================================================
# Status bar (thin, restrained — leaves real estate to content)
# ============================================================
status_y = 60
d.text((PAD, status_y), "9:41", font=f_time, fill=INK)
# minimal "system" badges on right
right_x = W - PAD
for label_w in [(54, "wifi"), (32, "")]:  # placeholder bars
    pass
# Right side: small connection indicators as faux iOS pills
def signal_dots(x, y):
    # 4 vertical bars
    for i in range(4):
        bh = 8 + i*4
        bx = x + i*8
        by = y + (24 - bh)
        d.rectangle([bx, by, bx + 6, by + bh], fill=INK)

signal_dots(W - PAD - 200, status_y + 4)
# "wifi" tri
wifi_x = W - PAD - 120
for i, w in enumerate([28, 20, 12]):
    d.arc([wifi_x - w, status_y + 8 + i*4, wifi_x + w, status_y + 8 + i*4 + w*2], 200, 340, fill=INK, width=4)
# Battery
bat_x = W - PAD - 80
d.rounded_rectangle([bat_x, status_y + 6, bat_x + 64, status_y + 32], radius=6, outline=INK, width=3)
d.rectangle([bat_x + 4, status_y + 10, bat_x + 56, status_y + 28], fill=INK)
d.rectangle([bat_x + 65, status_y + 14, bat_x + 70, status_y + 24], fill=INK)

# ============================================================
# Hero
# ============================================================
y = 200
d.text((PAD, y), "PRO", font=f_eyebrow, fill=BLUEPRINT)

y = 250
# Headline — tighter spacing using manual draw
parts = [("AI that ", f_h1, INK), ("actually", f_h1_italic, BLUEPRINT), (" works", f_h1, INK)]
x = PAD
for txt, fnt, col in parts:
    d.text((x, y), txt, font=fnt, fill=col)
    x += d.textlength(txt, font=fnt)

# Subhead
d.text((PAD, 420), "Real answers. No daily limits.", font=f_sub, fill=SLATE)

# ============================================================
# Benefits — refined cards with subtle shadow
# ============================================================
benefits = [
    ("\U0001F310", "Web search", "Live results with real source citations."),
    ("⚡",     "500 fast messages a day", "Quick, fluent responses to anything."),
    ("\U0001F4A1", "50 advanced messages a day", "Deeper reasoning when you need it."),
    ("\U0001F4F7", "25 image-aware messages", "Send screenshots, photos, diagrams."),
]

card_w = W - 2 * PAD
card_h = 200
gap = 22
start_y = 560

# Draw shadow first
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow_layer)
for i in range(len(benefits)):
    yc = start_y + i * (card_h + gap)
    sd.rounded_rectangle([PAD + 4, yc + 8, PAD + card_w + 4, yc + card_h + 8],
                          radius=30, fill=(0, 0, 0, 16))
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=10))
img = Image.alpha_composite(img.convert("RGBA"), shadow_layer).convert("RGB")
d = ImageDraw.Draw(img)

for i, (icon, title, sub) in enumerate(benefits):
    yc = start_y + i * (card_h + gap)
    d.rounded_rectangle([PAD, yc, PAD + card_w, yc + card_h], radius=30, fill=WHITE, outline=STONE_SOFT, width=2)
    # Icon square
    icon_size = 112
    icon_y = yc + (card_h - icon_size) // 2
    d.rounded_rectangle([PAD + 32, icon_y, PAD + 32 + icon_size, icon_y + icon_size],
                        radius=20, fill=BLUEPRINT_TINT, outline=BLUEPRINT_TINT_BORDER, width=1)
    iw = d.textlength(icon, font=f_icon)
    d.text((PAD + 32 + (icon_size - iw)/2, icon_y + 22), icon, font=f_icon, fill=BLUEPRINT)
    # Title + sub
    text_x = PAD + 32 + icon_size + 36
    text_y = yc + 56
    d.text((text_x, text_y), title, font=f_card_t, fill=GRAPHITE)
    d.text((text_x, text_y + 58), sub, font=f_card_s, fill=SLATE)

# ============================================================
# Price card — bigger emphasis, better hierarchy
# ============================================================
price_y = start_y + len(benefits) * (card_h + gap) + 50
price_h = 220

# Price card shadow
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow_layer)
sd.rounded_rectangle([PAD + 4, price_y + 10, W - PAD + 4, price_y + price_h + 10],
                      radius=32, fill=(0, 0, 0, 28))
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=14))
img = Image.alpha_composite(img.convert("RGBA"), shadow_layer).convert("RGB")
d = ImageDraw.Draw(img)

d.rounded_rectangle([PAD, price_y, W - PAD, price_y + price_h], radius=32, fill=INK)

# Eyebrow with letter-spacing simulation (manual char draw)
label = "MONTHLY"
lx = PAD + 50
ly = price_y + 44
for ch in label:
    d.text((lx, ly), ch, font=f_price_label, fill=BLUEPRINT_LIFTED)
    lx += d.textlength(ch, font=f_price_label) + 4

# Price + unit baseline aligned
price_text = "$12.99"
unit_text = " / month"
d.text((PAD + 50, price_y + 84), price_text, font=f_price, fill=WHITE)
pw = d.textlength(price_text, font=f_price)
d.text((PAD + 50 + pw + 4, price_y + 144), unit_text, font=f_price_unit, fill=(220, 215, 205))

# "Cancel anytime" pill on right
ca = "Cancel anytime"
caw = d.textlength(ca, font=f_card_s)
pill_w = caw + 50
pill_x = W - PAD - 40 - pill_w
pill_y = price_y + (price_h - 56) // 2
d.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + 56], radius=28, fill=INK_LIFTED)
d.text((pill_x + 25, pill_y + 13), ca, font=f_card_s, fill=CREAM)

# ============================================================
# CTA button
# ============================================================
cta_y = price_y + price_h + 36
cta_h = 124
d.rounded_rectangle([PAD, cta_y, W - PAD, cta_y + cta_h], radius=30, fill=INK)
cta = "Subscribe — $12.99/month"
cw = d.textlength(cta, font=f_btn)
d.text(((W - cw)/2, cta_y + 38), cta, font=f_btn, fill=WHITE)

# Restore + Maybe later row (side by side, more "real app" feel)
secondary_y = cta_y + cta_h + 28
restore = "Restore Purchases"
maybe = "Maybe later"
sep = "·"
rw = d.textlength(restore, font=f_link)
mw = d.textlength(maybe, font=f_link)
sw = d.textlength(sep, font=f_link)
total = rw + 30 + sw + 30 + mw
sx = (W - total) / 2
d.text((sx, secondary_y), restore, font=f_link, fill=BLUEPRINT)
d.text((sx + rw + 30, secondary_y), sep, font=f_link, fill=SLATE_SOFT)
d.text((sx + rw + 30 + sw + 30, secondary_y), maybe, font=f_link, fill=SLATE)

# ============================================================
# Compare table — refined
# ============================================================
table_y = secondary_y + 100
d.text((PAD, table_y), "Free vs. Pro", font=f_compare_t, fill=SLATE)
table_y += 50

rows = [
    ("Messages per day", "50", "500"),
    ("Web search", "—", "Yes"),
    ("Fast model", "Yes", "Yes"),
    ("Advanced model", "—", "50/day"),
    ("Image input", "—", "25/day"),
]
row_h = 64
header_h = 56
table_h = header_h + len(rows) * row_h + 8

d.rounded_rectangle([PAD, table_y, W - PAD, table_y + table_h], radius=24, fill=WHITE, outline=STONE_SOFT, width=2)

# Header
hdr_y = table_y
d.rounded_rectangle([PAD + 2, hdr_y + 2, W - PAD - 2, hdr_y + header_h], radius=22, fill=CREAM_SOFT)
# Column positions
col_free_x = W - PAD - 360
col_pro_x = W - PAD - 160
d.text((col_free_x, hdr_y + 14), "Free", font=f_compare_t, fill=SLATE)
d.text((col_pro_x, hdr_y + 14), "Pro", font=f_compare_t, fill=BLUEPRINT)

row_y = hdr_y + header_h
for i, (label, free, pro) in enumerate(rows):
    if i < len(rows) - 1:
        d.line([(PAD + 36, row_y + row_h - 1), (W - PAD - 36, row_y + row_h - 1)],
                fill=STONE_SOFT, width=1)
    d.text((PAD + 40, row_y + 18), label, font=f_compare, fill=GRAPHITE)
    d.text((col_free_x, row_y + 18), free, font=f_compare, fill=SLATE)
    d.text((col_pro_x, row_y + 18), pro, font=f_compare_t, fill=INK)
    row_y += row_h

# ============================================================
# Auto-renew disclosure
# ============================================================
disc_y = table_y + table_h + 36
disclosure = ("Subscription automatically renews unless canceled at least 24 hours "
              "before the end of the current period. Manage in Apple ID settings.")
for i, line in enumerate(textwrap.wrap(disclosure, width=70)):
    d.text((PAD, disc_y + i * 34), line, font=f_disclosure, fill=SLATE)

# Terms · Privacy small footer
foot_y = disc_y + 120
legal = "Terms of Use   ·   Privacy Policy"
lw = d.textlength(legal, font=f_legal)
d.text(((W - lw)/2, foot_y), legal, font=f_legal, fill=BLUEPRINT)

out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", "..", "2", "legal", "paywall-asc-screenshot.png"))
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "PNG", optimize=True)
print(f"Saved: {out}")
print(f"Dimensions: {W}x{H}")
print(f"Size: {os.path.getsize(out)} bytes")
