"""Generate the remaining 4 App Store screenshots at 1290x2796.
Together with paywall-asc-screenshot.png these form a 5-screenshot set."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, textwrap

# ---------- Tokens ----------
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
USER_BUBBLE = (236, 230, 218)

W, H = 1290, 2796
PAD = 60

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                       "..", "..", "2", "legal", "screenshots"))
os.makedirs(OUT_DIR, exist_ok=True)

def font(name, size):
    p = f"C:/Windows/Fonts/{name}"
    if os.path.exists(p):
        return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# Fonts
F_TIME = font("seguisb.ttf", 38)
F_HEADER = font("seguisb.ttf", 36)
F_HERO = font("georgia.ttf", 96)
F_HERO_IT = font("georgiai.ttf", 96)
F_SUB = font("segoeui.ttf", 36)
F_BODY = font("segoeui.ttf", 34)
F_BODY_BOLD = font("seguisb.ttf", 34)
F_SMALL = font("segoeui.ttf", 28)
F_SMALL_BOLD = font("seguisb.ttf", 28)
F_CHIP = font("seguisb.ttf", 28)
F_INPUT_PLACEHOLDER = font("segoeui.ttf", 34)
F_ICON = font("seguisym.ttf", 44)
F_ICON_SMALL = font("seguisym.ttf", 32)
F_MONO = font("consola.ttf", 28)

def new_canvas():
    img = Image.new("RGB", (W, H), CREAM)
    return img, ImageDraw.Draw(img)

def add_shadow(img, rects, blur=14, alpha=22, dx=4, dy=10):
    """rects: list of (x0,y0,x1,y1,radius)"""
    shadow = Image.new("RGBA", img.size, (0,0,0,0))
    sd = ImageDraw.Draw(shadow)
    for x0,y0,x1,y1,r in rects:
        sd.rounded_rectangle([x0+dx, y0+dy, x1+dx, y1+dy], radius=r, fill=(0,0,0,alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")

def draw_status_bar(d, time_text="9:41"):
    y = 60
    d.text((PAD, y), time_text, font=F_TIME, fill=INK)
    # signal bars (right)
    sx = W - PAD - 200
    for i in range(4):
        bh = 8 + i*4
        d.rectangle([sx + i*8, y + (24 - bh), sx + i*8 + 6, y + 24], fill=INK)
    # wifi
    wx = W - PAD - 120
    for i, w in enumerate([28, 20, 12]):
        d.arc([wx - w, y + 8 + i*4, wx + w, y + 8 + i*4 + w*2], 200, 340, fill=INK, width=4)
    # battery
    bx = W - PAD - 80
    d.rounded_rectangle([bx, y+6, bx+64, y+32], radius=6, outline=INK, width=3)
    d.rectangle([bx+4, y+10, bx+56, y+28], fill=INK)
    d.rectangle([bx+65, y+14, bx+70, y+24], fill=INK)

def draw_chat_header(d, title="New chat"):
    # Hamburger + title + new chat icon
    y = 160
    # Hamburger
    hx = PAD
    for i in range(3):
        d.rounded_rectangle([hx, y + 10 + i*9, hx + 36, y + 14 + i*9], radius=2, fill=INK)
    # Title (centered)
    tw = d.textlength(title, font=F_HEADER)
    d.text(((W - tw)/2, y), title, font=F_HEADER, fill=INK)
    # New chat icon (pen)
    pen_x = W - PAD - 36
    d.text((pen_x - 6, y - 4), "✎", font=F_ICON, fill=INK)

def draw_composer(d, placeholder="Message Archius…", plus_active=False):
    cy = H - 220
    ch = 110
    d.rounded_rectangle([PAD, cy, W - PAD, cy + ch], radius=ch//2, fill=WHITE, outline=STONE, width=2)
    # plus button
    plus_size = 64
    px = PAD + 20
    py = cy + (ch - plus_size)//2
    plus_fill = INK if plus_active else CREAM_SOFT
    plus_ic = WHITE if plus_active else SLATE
    d.ellipse([px, py, px + plus_size, py + plus_size], fill=plus_fill)
    iw = d.textlength("+", font=F_ICON)
    d.text((px + (plus_size - iw)/2 - 2, py + 4), "+", font=F_ICON, fill=plus_ic)
    # placeholder
    d.text((px + plus_size + 24, cy + ch//2 - 18), placeholder, font=F_INPUT_PLACEHOLDER, fill=SLATE_SOFT)
    # send arrow
    sx = W - PAD - 84
    sy = cy + (ch - 64)//2
    d.ellipse([sx, sy, sx + 64, sy + 64], fill=INK_LIFTED)
    d.text((sx + 22, sy + 12), "↑", font=F_ICON, fill=WHITE)
    # home indicator (iOS)
    hib_y = H - 30
    d.rounded_rectangle([(W - 280)//2, hib_y, (W + 280)//2, hib_y + 8], radius=4, fill=INK)

def draw_user_bubble(d, img, text, y):
    """returns next y"""
    tw_max = W - 2*PAD - 100
    lines = []
    cur = ""
    for word in text.split():
        test = cur + (" " if cur else "") + word
        if d.textlength(test, font=F_BODY) > tw_max:
            lines.append(cur)
            cur = word
        else:
            cur = test
    if cur: lines.append(cur)
    bw = max(d.textlength(l, font=F_BODY) for l in lines) + 60
    bh = len(lines) * 48 + 40
    x1 = W - PAD
    x0 = x1 - bw
    d.rounded_rectangle([x0, y, x1, y + bh], radius=32, fill=USER_BUBBLE)
    for i, line in enumerate(lines):
        d.text((x0 + 30, y + 20 + i * 48), line, font=F_BODY, fill=GRAPHITE)
    return y + bh + 30

def draw_assistant_text(d, lines_data, y):
    """lines_data: list of (text, font, color)"""
    for txt, fnt, col in lines_data:
        d.text((PAD, y), txt, font=fnt, fill=col)
        y += fnt.size + 12
    return y + 16

# ============================================================
# Screen 1: Empty state (hero)
# ============================================================
def make_empty_state():
    img, d = new_canvas()
    draw_status_bar(d)
    # Hamburger + new chat icons
    d.rounded_rectangle([PAD, 170, PAD + 40, 174], radius=2, fill=INK)
    d.rounded_rectangle([PAD, 184, PAD + 40, 188], radius=2, fill=INK)
    d.rounded_rectangle([PAD, 198, PAD + 40, 202], radius=2, fill=INK)
    d.text((W - PAD - 36, 165), "✎", font=F_ICON, fill=INK)

    # Wordmark "ARCHIUS"
    wm_y = 700
    wordmark = "ARCHIUS"
    f_wm = font("seguisb.ttf", 88)
    wmw = d.textlength(wordmark, font=f_wm)
    # letter-spaced
    lx = (W - wmw - 7 * 12) / 2
    for ch in wordmark:
        d.text((lx, wm_y), ch, font=f_wm, fill=INK)
        lx += d.textlength(ch, font=f_wm) + 12

    # Tagline
    tag = "AI that actually works."
    parts = [("AI that ", F_HERO, INK), ("actually", F_HERO_IT, BLUEPRINT), (" works.", F_HERO, INK)]
    total = sum(d.textlength(t, font=f) for t,f,_ in parts)
    x = (W - total)/2
    y = wm_y + 140
    for t, f, c in parts:
        d.text((x, y), t, font=f, fill=c)
        x += d.textlength(t, font=f)

    sub_y = y + 140
    sub = "Direct answers, real sources, useful drafts."
    sw = d.textlength(sub, font=F_SUB)
    d.text(((W - sw)/2, sub_y), sub, font=F_SUB, fill=SLATE)

    # Example prompt chips
    chips = [
        "Draft an email to my landlord",
        "What's new in Apple's WWDC announcements?",
        "Summarize this screenshot",
        "Compare React Native vs Flutter for me",
    ]
    chip_y = sub_y + 200
    for c in chips:
        cw = d.textlength(c, font=F_CHIP) + 80
        cx = (W - cw)/2
        d.rounded_rectangle([cx, chip_y, cx + cw, chip_y + 80], radius=40, fill=WHITE, outline=STONE_SOFT, width=2)
        d.text((cx + 40, chip_y + 26), c, font=F_CHIP, fill=GRAPHITE)
        chip_y += 96

    draw_composer(d)
    out = os.path.join(OUT_DIR, "01-empty-state.png")
    img.save(out, "PNG", optimize=True)
    return out

# ============================================================
# Screen 2: Markdown chat response
# ============================================================
def make_markdown_chat():
    img, d = new_canvas()
    draw_status_bar(d)
    draw_chat_header(d, "Git commit help")
    y = 260
    y = draw_user_bubble(d, img, "Help me write a better git commit message for refactoring auth.", y)

    # Assistant response (no bubble, just left-aligned)
    text_y = y + 10
    para = "Here are the principles that matter most:"
    d.text((PAD, text_y), para, font=F_BODY, fill=GRAPHITE)
    text_y += 60

    # Numbered list
    items = [
        ("1.", "Subject ≤ 50 chars", "what changed, imperative voice"),
        ("2.", "Blank line", "then a body if context is needed"),
        ("3.", "Body: why, not what", "the diff already shows what"),
        ("4.", "Reference issues", "Closes #142 at the bottom"),
    ]
    for num, bold, rest in items:
        d.text((PAD, text_y), num, font=F_BODY_BOLD, fill=BLUEPRINT)
        nw = d.textlength(num, font=F_BODY_BOLD)
        d.text((PAD + nw + 16, text_y), bold, font=F_BODY_BOLD, fill=GRAPHITE)
        bw = d.textlength(bold, font=F_BODY_BOLD)
        d.text((PAD + nw + 16 + bw, text_y), " — " + rest, font=F_BODY, fill=GRAPHITE)
        text_y += 60

    text_y += 20
    d.text((PAD, text_y), "Example for your case:", font=F_BODY, fill=GRAPHITE)
    text_y += 60

    # Code block
    code_lines = [
        "refactor(auth): extract JWT validation",
        "",
        "Pull token verification out of the route",
        "handler so the middleware can reuse it",
        "for the new SSE endpoint. Closes #142.",
    ]
    code_h = len(code_lines) * 40 + 40
    img2 = add_shadow(img, [(PAD, text_y, W - PAD, text_y + code_h, 16)], blur=8, alpha=18, dy=4)
    d = ImageDraw.Draw(img2)
    d.rounded_rectangle([PAD, text_y, W - PAD, text_y + code_h], radius=16, fill=(245, 240, 230), outline=STONE, width=1)
    for i, line in enumerate(code_lines):
        d.text((PAD + 30, text_y + 20 + i*40), line, font=F_MONO, fill=GRAPHITE)
    img = img2

    draw_composer(d)
    out = os.path.join(OUT_DIR, "02-markdown-chat.png")
    img.save(out, "PNG", optimize=True)
    return out

# ============================================================
# Screen 3: Web search with sources
# ============================================================
def make_web_search():
    img, d = new_canvas()
    draw_status_bar(d)
    draw_chat_header(d, "Vision Pro 2")
    y = 260
    y = draw_user_bubble(d, img, "What's the latest on Apple's Vision Pro 2 release?", y)

    # Searching indicator with globe
    pill_y = y + 10
    pill_w = 380
    pill_x = PAD
    pill_h = 60
    d.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + pill_h], radius=30, fill=BLUEPRINT_TINT, outline=BLUEPRINT_TINT_BORDER, width=1)
    d.text((pill_x + 24, pill_y + 12), "\U0001F310", font=F_ICON_SMALL, fill=BLUEPRINT)
    d.text((pill_x + 78, pill_y + 14), "Searched 4 sources", font=F_SMALL_BOLD, fill=INK)
    y = pill_y + pill_h + 30

    # Sources card
    sources_h = 4 * 80 + 50
    img2 = add_shadow(img, [(PAD, y, W - PAD, y + sources_h, 24)], blur=10, alpha=18, dy=4)
    d = ImageDraw.Draw(img2)
    d.rounded_rectangle([PAD, y, W - PAD, y + sources_h], radius=24, fill=WHITE, outline=STONE_SOFT, width=2)
    d.text((PAD + 30, y + 20), "Sources", font=F_SMALL_BOLD, fill=SLATE)
    sources = [
        ("apple.com/newsroom", "Vision Pro 2 announced for late 2026"),
        ("bloomberg.com", "Apple delays Vision Pro 2 to Q4 2026"),
        ("9to5mac.com", "What we know about Vision Pro 2"),
        ("theverge.com", "Apple's mixed reality roadmap"),
    ]
    sy = y + 80
    for i, (dom, title) in enumerate(sources):
        # tiny num
        d.ellipse([PAD + 30, sy + 8, PAD + 30 + 32, sy + 8 + 32], fill=BLUEPRINT_TINT, outline=BLUEPRINT_TINT_BORDER, width=1)
        ns = str(i+1)
        nw = d.textlength(ns, font=F_SMALL_BOLD)
        d.text((PAD + 30 + (32-nw)/2, sy + 10), ns, font=F_SMALL_BOLD, fill=BLUEPRINT)
        d.text((PAD + 80, sy), title, font=F_SMALL_BOLD, fill=GRAPHITE)
        d.text((PAD + 80, sy + 36), dom, font=F_SMALL, fill=SLATE)
        sy += 80
    img = img2

    # Assistant response below
    y += sources_h + 30
    para = "Apple confirmed Vision Pro 2 for"
    d.text((PAD, y), para, font=F_BODY, fill=GRAPHITE)
    pw = d.textlength(para + " ", font=F_BODY)
    d.text((PAD + pw, y), "late 2026", font=F_BODY_BOLD, fill=GRAPHITE)
    pw2 = d.textlength("late 2026", font=F_BODY_BOLD)
    d.text((PAD + pw + pw2, y), ", per their", font=F_BODY, fill=GRAPHITE)
    y += 60
    d.text((PAD, y), "Q1 earnings call. The release was", font=F_BODY, fill=GRAPHITE)
    y += 60
    d.text((PAD, y), "originally targeted for early 2026 but", font=F_BODY, fill=GRAPHITE)
    y += 60
    d.text((PAD, y), "Bloomberg reports a Q4 delay due to", font=F_BODY, fill=GRAPHITE)
    y += 60
    d.text((PAD, y), "supply chain constraints.", font=F_BODY, fill=GRAPHITE)

    draw_composer(d)
    out = os.path.join(OUT_DIR, "03-web-search.png")
    img.save(out, "PNG", optimize=True)
    return out

# ============================================================
# Screen 4: Email draft card
# ============================================================
def make_email_card():
    img, d = new_canvas()
    draw_status_bar(d)
    draw_chat_header(d, "Email draft")
    y = 260
    y = draw_user_bubble(d, img, "Draft an email to my client saying I'm 2 days delayed on the project.", y)

    # Short assistant intro
    intro = "Here's a draft — edit any field before sending."
    d.text((PAD, y), intro, font=F_BODY, fill=GRAPHITE)
    y += 80

    # Email card
    card_h = 700
    img2 = add_shadow(img, [(PAD, y, W - PAD, y + card_h, 24)], blur=12, alpha=20, dy=6)
    d = ImageDraw.Draw(img2)
    d.rounded_rectangle([PAD, y, W - PAD, y + card_h], radius=24, fill=WHITE, outline=STONE_SOFT, width=2)
    # Mail icon + "Email draft"
    d.text((PAD + 30, y + 24), "✉", font=F_ICON, fill=BLUEPRINT)
    d.text((PAD + 90, y + 30), "Email draft", font=F_SMALL_BOLD, fill=SLATE)

    # Fields
    fy = y + 110
    fields = [
        ("To", "client@acme.com"),
        ("Subject", "Project update — 2-day extension"),
    ]
    for label, val in fields:
        d.text((PAD + 30, fy), label, font=F_SMALL, fill=SLATE)
        d.line([(PAD + 130, fy + 30), (W - PAD - 30, fy + 30)], fill=STONE_SOFT, width=1)
        d.text((PAD + 130, fy - 2), val, font=F_BODY, fill=GRAPHITE)
        fy += 80

    # Body
    d.text((PAD + 30, fy), "Body", font=F_SMALL, fill=SLATE)
    fy += 50
    body_text = (
        "Hi Sarah,\n\n"
        "Quick update on the build: I'm running about\n"
        "two days behind the original Thursday target.\n"
        "Nothing blocking — just want to flag it now so\n"
        "you can plan. New target is Monday morning.\n\n"
        "Sorry for the slip. — David"
    )
    for line in body_text.split("\n"):
        d.text((PAD + 30, fy), line, font=F_BODY, fill=GRAPHITE)
        fy += 44

    # Send button
    by = y + card_h - 90
    d.rounded_rectangle([PAD + 30, by, W - PAD - 30, by + 70], radius=35, fill=INK)
    sendtxt = "Send via Mail"
    sw = d.textlength(sendtxt, font=F_SMALL_BOLD)
    d.text(((W - sw)/2, by + 22), sendtxt, font=F_SMALL_BOLD, fill=WHITE)
    img = img2
    draw_composer(d)
    out = os.path.join(OUT_DIR, "04-email-draft.png")
    img.save(out, "PNG", optimize=True)
    return out

# ============================================================
# Generate all
# ============================================================
for fn in [make_empty_state, make_markdown_chat, make_web_search, make_email_card]:
    p = fn()
    print(f"Saved: {p} ({os.path.getsize(p)} bytes)")
