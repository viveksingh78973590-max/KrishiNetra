"""Shared Gemini settings, used by server.py and check_gemini.py so both always agree on the key and model list."""
import re

PLACEHOLDER_KEYS = {"YOUR_KEY", "YOUR_API_KEY", "YOUR_GEMINI_API_KEY", "YOUR_NEW_GEMINI_API_KEY",
                    "PASTE_YOUR_KEY_HERE", "PASTE_YOUR_NEW_GEMINI_API_KEY_HERE"}

# Models that Google has retired. Google silently routes them to a newer model, so keeping one in the
# list as a "fallback" only repeats the same model (this was the old default fallback: gemini-3.7-flash).
RETIRED_MODELS = {"gemini-3.7-flash": "gemini-3.8-flash", "gemini-3.5-flash": "gemini-3.6-flash",
                  "gemini-2.0-flash": "gemini-3.6-flash", "gemini-2.0-flash-lite": "gemini-3.1-flash-lite",
                  "gemini-3-pro-preview": "gemini-3.8-flash", "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite"}

DEFAULT_PRIMARY_MODEL = "gemini-3.8-flash"
# Tried in this order when the one before is out of quota (429), missing (404) or overloaded (503).
# Free-tier quota is counted per model, so a different model can still answer when one is used up.
DEFAULT_FALLBACK_MODELS = "gemini-3.6-flash,gemini-3.1-flash-lite,gemini-2.5-flash"


def clean_key(raw):
    """Strip quotes/spaces; return "" for empty values and for the placeholder text from .env.example."""
    key = str(raw or "").strip().strip('"').strip("'").strip()
    if key.upper() in {p.upper() for p in PLACEHOLDER_KEYS}:
        return ""
    return key


def model_list(raw):
    """'a, b;c' -> ['a','b','c'] (no duplicates, 'models/' prefix removed, retired names replaced by their successor)."""
    out = []
    for m in re.split(r"[,;\s]+", str(raw or "")):
        m = m.strip().strip('"').strip("'")
        if m.startswith("models/"):
            m = m[len("models/"):]
        m = RETIRED_MODELS.get(m, m)
        if m and m not in out:
            out.append(m)
    return out


def build_chain(primary_raw, fallback_raw):
    """-> (primary, [primary, fallback1, fallback2, ...])"""
    primary = (model_list(primary_raw) or [DEFAULT_PRIMARY_MODEL])[0]
    fallbacks = [m for m in model_list(fallback_raw) if m != primary]
    if not fallbacks:   # not set, or only listed retired models that point back at the primary model
        fallbacks = [m for m in model_list(DEFAULT_FALLBACK_MODELS) if m != primary]
    return primary, [primary] + fallbacks
