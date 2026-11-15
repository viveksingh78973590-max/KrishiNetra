"""Check (and set) the Gemini API key used by KrishiNetra.

  python check_gemini.py            test the key saved in .env against every model KrishiNetra uses
  python check_gemini.py --set      paste a NEW key, test it, and save it into .env
  python check_gemini.py --set KEY  same, with the key given on the command line
  python check_gemini.py --ensure   (used by run_windows.bat) ask for a key only if none is saved yet

AI KrishiNetra (chat) and Fasal Vaidya (photo diagnosis) both need a working key.
Create one at https://aistudio.google.com/apikey  ("Create API key"; pick "in new project" if the old one says quota exhausted).
"""
import os, sys, struct, zlib, base64

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import gemini_config

ENV_PATH = os.path.join(BASE, ".env")
EXAMPLE_PATH = os.path.join(BASE, ".env.example")


# ---------------------------------------------------------------- .env helpers
def read_env():
    values = {}
    try:
        with open(ENV_PATH, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    values[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def save_key(key):
    """Write GEMINI_API_KEY=key into .env (created from .env.example if needed); other lines stay untouched."""
    try:
        with open(ENV_PATH, encoding="utf-8-sig") as f:
            lines = f.read().splitlines()
    except OSError:
        try:
            with open(EXAMPLE_PATH, encoding="utf-8-sig") as f:
                lines = f.read().splitlines()
        except OSError:
            lines = ["GEMINI_MODEL=" + gemini_config.DEFAULT_PRIMARY_MODEL,
                     "GEMINI_FALLBACK_MODEL=" + gemini_config.DEFAULT_FALLBACK_MODELS]
    out, done = [], False
    for line in lines:
        if line.strip().startswith("GEMINI_API_KEY") and "=" in line:
            if not done:
                out.append("GEMINI_API_KEY=" + key)
                done = True
        else:
            out.append(line)
    if not done:
        out.insert(0, "GEMINI_API_KEY=" + key)
    tmp = ENV_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    os.replace(tmp, ENV_PATH)


# ---------------------------------------------------------------- Gemini probes
def tiny_png_b64():
    """A valid 16x16 green PNG, built without Pillow, to test photo (vision) requests."""
    w = h = 16
    raw = b"".join(b"\x00" + b"\x2e\x9b\x3a" * w for _ in range(h))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) \
          + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode()


def describe(e):
    """-> (kind, short text). kind: key | quota | missing | busy | other"""
    code = getattr(e, "code", None)
    low = str(e).lower()
    if code == 401 or (code in (400, 403) and ("api key" in low or "api_key" in low)):
        return "key", "API key rejected by Google (invalid, expired or restricted)"
    if code == 429 or "resource_exhausted" in low:
        return "quota", "quota used up / not included for this key (HTTP 429)"
    if code in (404, 403):
        return "missing", f"model not available for this key (HTTP {code})"
    if code in (500, 502, 503, 504):
        return "busy", f"Google is busy right now (HTTP {code}) - try again in a minute"
    return "other", (str(e).replace("\n", " ")[:160])


def run_checks(key, verbose=True):
    """Test `key` on every model in the chain. -> dict(working=[...], key_rejected=bool, chat_ok, vision_ok, search_ok)"""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("[FAIL] The google-genai package is not installed.")
        print("       Run:  python -m pip install -r requirements.txt")
        sys.exit(2)

    env = read_env()
    _, chain = gemini_config.build_chain(env.get("GEMINI_MODEL"), env.get("GEMINI_FALLBACK_MODEL"))
    client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=30000))
    result = dict(working=[], key_rejected=False, chat_ok=False, vision_ok=False, search_ok=None, chain=chain)

    if verbose:
        print(f"Key: {key[:4]}...{key[-3:]}  ({len(key)} characters)")
        if not key.startswith(("AIza", "AQ.")):
            print("[WARN] Google AI Studio keys start with 'AIza' or 'AQ.' - this one does not. Make sure you copied the whole key.")
        print("Testing models in the order KrishiNetra uses them:\n")

    for model in chain:
        try:
            r = client.models.generate_content(model=model, contents="Reply with only the word OK.",
                                               config=types.GenerateContentConfig(max_output_tokens=256))
            snippet = (r.text or "").strip().replace("\n", " ")[:30]
            result["working"].append(model)
            if verbose:
                print(f"  [OK]   {model:<24} replied{(': ' + snippet) if snippet else ''}")
        except Exception as e:
            kind, text = describe(e)
            if verbose:
                print(f"  [FAIL] {model:<24} {text}")
            if kind == "key":
                result["key_rejected"] = True
                break

    if result["working"]:
        result["chat_ok"] = True
        first = result["working"][0]
        try:   # photo + JSON answer = what Fasal Vaidya sends
            parts = [types.Part.from_bytes(data=base64.b64decode(tiny_png_b64()), mime_type="image/png"),
                     types.Part.from_text(text='Return JSON {"ok": true}')]
            client.models.generate_content(model=first, contents=[types.Content(role="user", parts=parts)],
                                           config=types.GenerateContentConfig(response_mime_type="application/json",
                                                                              max_output_tokens=512))
            result["vision_ok"] = True
        except Exception as e:
            result["vision_error"] = describe(e)[1]
        try:   # Google Search grounding = Search page + scheme auto-update (optional)
            client.models.generate_content(model=first, contents="Name the capital of India in one word.",
                                           config=types.GenerateContentConfig(
                                               tools=[types.Tool(google_search=types.GoogleSearch())], max_output_tokens=256))
            result["search_ok"] = True
        except Exception as e:
            result["search_ok"] = False
            result["search_error"] = describe(e)[1]

    if verbose:
        print()
        if result["key_rejected"]:
            print("RESULT: Google rejected this key. Create a fresh one at https://aistudio.google.com/apikey and copy the WHOLE key.")
        elif not result["working"]:
            print("RESULT: The key is accepted, but no model has quota right now, so the AI cannot answer yet.")
            print("        Fix: create a key in a NEW project (aistudio.google.com/apikey -> Create API key -> new project),")
            print("        or turn on billing for the project, or wait for the daily reset (Pacific midnight = about 12:30-1:30 pm India).")
        else:
            print(f"RESULT: AI KrishiNetra (chat):    READY  (main model in use: {result['working'][0]})")
            print(f"        Fasal Vaidya (photos):    " + ("READY" if result["vision_ok"] else f"NOT READY - {result.get('vision_error', '')}"))
            if result["search_ok"]:
                print("        Google Search lookups:    available")
            else:
                print("        Google Search lookups:    not available on this key/plan (Search-page details and the scheme auto-update")
                print("                                  will be skipped; chat, Fasal Vaidya and translation still work)")
    return result


# ---------------------------------------------------------------- commands
def ask_and_save(preset=None):
    print("Create a free key at  https://aistudio.google.com/apikey  (Create API key).")
    print("If it says quota exhausted, choose 'Create API key in NEW project'.\n")
    key = gemini_config.clean_key(preset)
    while True:
        if not key:
            try:
                key = gemini_config.clean_key(input("Paste your NEW Gemini API key and press Enter: "))
            except (EOFError, KeyboardInterrupt):
                print("\nCancelled - nothing was changed.")
                return 1
        if not key:
            print("Nothing entered.")
            continue
        if any(ch.isspace() for ch in key) or len(key) < 20:
            print("That does not look like a full key (it must be one long word with no spaces). Try again.\n")
            key = ""
            continue
        break

    result = run_checks(key)
    if result["key_rejected"]:
        print("\nThe key was NOT saved because Google rejected it.")
        return 1
    if not result["working"]:
        try:
            answer = input("\nSave this key anyway? [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            answer = "n"
        if answer != "y":
            print("Nothing was changed.")
            return 1
    save_key(key)
    print(f"\nSaved to {ENV_PATH}")
    print("Now (re)start the app:  python server.py   (or run_windows.bat)")
    return 0


def main(argv):
    args = [a for a in argv[1:] if a]
    if args and args[0] == "--ensure":
        if gemini_config.clean_key(read_env().get("GEMINI_API_KEY")):
            return 0
        print("No Gemini API key is saved yet - AI KrishiNetra and Fasal Vaidya need one.\n")
        if not sys.stdin or not sys.stdin.isatty():
            print("Run SET_GEMINI_KEY.bat (or: python check_gemini.py --set) to add it.")
            return 1
        return ask_and_save()
    if args and args[0] == "--set":
        return ask_and_save(args[1] if len(args) > 1 else None)
    if args and args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    env = read_env()   # same rule as server.py: a key written in .env wins over one in the Windows environment
    key = gemini_config.clean_key(env["GEMINI_API_KEY"] if "GEMINI_API_KEY" in env else os.getenv("GEMINI_API_KEY"))
    if not key:
        print("[FAIL] No GEMINI_API_KEY in .env.  Run:  python check_gemini.py --set")
        return 1
    result = run_checks(key)
    return 0 if result["working"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
