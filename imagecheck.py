"""Local image forensics + quality repair: blur check, enhancement, AI/edit metadata signals, ELA."""
import io, numpy as np
from PIL import Image, ImageOps, ImageFilter, ImageChops, ImageEnhance

AI_MARKERS = [b"c2pa", b"trainedAlgorithmicMedia", b"midjourney", b"Midjourney", b"DALL-E", b"DALL\xc2\xb7E",
              b"Stable Diffusion", b"stable-diffusion", b"Firefly", b"ComfyUI", b"NovelAI", b"SynthID",
              b"Sampler:", b"Negative prompt", b"Made with Google AI", b"OpenAI"]
EDIT_SOFT = ["photoshop", "gimp", "lightroom", "snapseed", "canva", "picsart", "facetune", "pixlr", "photoroom",
             "remini", "meitu", "vsco", "affinity", "capture one", "adobe", "paint.net", "fotor", "beautyplus"]

def load(data):
    im = Image.open(io.BytesIO(data)); im.load()
    return im

def blur_score(im):
    g = im.convert("L"); g.thumbnail((800, 800))
    a = np.asarray(g, dtype=np.float32)
    lap = -4 * a[1:-1, 1:-1] + a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:]
    return float(lap.var()), float(a.mean())

def metadata_signals(data, im):
    head = data[:262144] + data[-65536:]
    ai = next((m.decode("latin1") for m in AI_MARKERS if m in head), None)
    for k, v in (im.info or {}).items():  # PNG text chunks
        if str(k).lower() in ("parameters", "prompt", "workflow", "negative_prompt") and ai is None:
            ai = f"PNG:{k}"
    soft, cam = None, False
    try:
        ex = im.getexif()
        s = str(ex.get(0x0131, "") or "")
        cam = bool(ex.get(0x010F) or ex.get(0x0110))
        if any(x in s.lower() for x in EDIT_SOFT): soft = s
    except Exception:
        pass
    low = head.lower()
    if soft is None:
        for x in EDIT_SOFT:
            if b"creatortool" in low and x.encode() in low: soft = x; break
    return ai, soft, cam

def ela_ratio(im):
    rgb = im.convert("RGB"); rgb.thumbnail((900, 900))
    buf = io.BytesIO(); rgb.save(buf, "JPEG", quality=90); buf.seek(0)
    d = np.asarray(ImageChops.difference(rgb, Image.open(buf)).convert("L"), dtype=np.float32)
    b = 32; h, w = d.shape[0] // b * b, d.shape[1] // b * b
    if h == 0 or w == 0: return 0.0
    blocks = d[:h, :w].reshape(h // b, b, w // b, b).mean(axis=(1, 3))
    return float(np.percentile(blocks, 98) / (blocks.mean() + 1e-6))

def enhance(im):
    im = ImageOps.exif_transpose(im).convert("RGB")
    if max(im.size) < 1000:
        k = min(2, 1600 / max(im.size)); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=230, threshold=2))
    im = ImageOps.autocontrast(im, cutoff=1)
    if np.asarray(im.convert("L")).mean() < 70: im = ImageEnhance.Brightness(im).enhance(1.35)
    return im

def to_jpeg(im, maxside=1568, q=88):
    im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((maxside, maxside))
    b = io.BytesIO(); im.save(b, "JPEG", quality=q); return b.getvalue()

def analyze(data):
    im = load(data)
    bs, bright = blur_score(im)
    ai, soft, cam = metadata_signals(data, im)
    ela = ela_ratio(im)
    blurry = bs < 90 or bright < 60
    sig = dict(blur_score=round(bs, 1), brightness=round(bright, 1), is_blurry=blurry, ai_marker=ai,
               edit_software=soft, has_camera_exif=cam, ela_ratio=round(ela, 2), ela_suspicious=ela > 3.8,
               width=im.width, height=im.height)
    fixed = enhance(im) if blurry else None
    return im, fixed, sig

def vegetation_stats(im):
    s = im.convert("RGB"); s.thumbnail((400, 400))
    hsv = np.asarray(s.convert("HSV"), dtype=np.float32); h, sa, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    n = h.size
    green = ((h > 42) & (h < 120) & (sa > 50) & (v > 40)).sum() / n
    yellow = ((h >= 25) & (h <= 42) & (sa > 70) & (v > 100)).sum() / n
    brown = ((h >= 5) & (h < 25) & (sa > 60) & (v < 190) & (v > 30)).sum() / n
    white = ((sa < 35) & (v > 215)).sum() / n
    dark = (v < 45).sum() / n
    return dict(green=green, yellow=yellow, brown=brown, white=white, dark=dark)
