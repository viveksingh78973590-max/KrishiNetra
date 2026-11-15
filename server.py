
import os, re, json, base64, secrets, threading, sys, urllib.request, urllib.parse, traceback, time
from dotenv import load_dotenv, dotenv_values
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template, session, Response
from werkzeug.security import generate_password_hash, check_password_hash
import db
import schemes_updater
import nasa_outlook
import gemini_config
import soil_report
import mandi_live
try:
    import imagecheck
except Exception as _ie:          # numpy / Pillow missing -> photo checks are skipped, app still runs
    imagecheck = None
    print("imagecheck unavailable:", repr(_ie), flush=True)

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, ".env"))
# For the Gemini settings, what is written in .env wins over an old value left in the Windows environment
# (otherwise a stale GEMINI_API_KEY there would silently beat the new key you just saved). Other settings (PORT ...) are unchanged.
for _k, _v in dotenv_values(os.path.join(BASE, ".env")).items():
    if _k in ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODEL") and _v is not None:
        os.environ[_k] = _v
app = Flask(__name__, template_folder=os.path.join(BASE, "templates"), static_folder=os.path.join(BASE, "static"))
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="Photo upload is too large. Choose a smaller image and try again."), 413

def _secret_key():
    """Session cookie signing key: SECRET_KEY from .env, else generated once and kept in .secret_key."""
    k = os.getenv("SECRET_KEY")
    if k:
        return k
    path = os.path.join(BASE, ".secret_key")
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        k = secrets.token_hex(32)
        with open(path, "w") as f:
            f.write(k)
        return k

app.secret_key = _secret_key()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", PERMANENT_SESSION_LIFETIME=60*60*24*30)

GEMINI_API_KEY = gemini_config.clean_key(os.getenv("GEMINI_API_KEY", ""))
GEMINI_MODEL, GEMINI_MODEL_CHAIN = gemini_config.build_chain(os.getenv("GEMINI_MODEL"), os.getenv("GEMINI_FALLBACK_MODEL"))
GEMINI_FALLBACK_MODEL = ",".join(GEMINI_MODEL_CHAIN[1:])   # kept for backwards compatibility

WMO = {
    0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",
    51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Violent showers",
    95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with hail"
}
_weather_cache = {}
db.init_db()

def anon_client_id():
    return db.clean_client_id(request.headers.get("X-Client-Id"))

def current_user_id():
    return session.get("uid")

def client_id():
    """History is stored per logged-in user, or per anonymous browser id when nobody is logged in."""
    uid = current_user_id()
    return f"u{uid}" if uid else anon_client_id()


def login_required_json():
    """AI features (chat, Fasal Vaidya, search) are only for registered, logged-in farmers."""
    if not current_user_id():
        return jsonify(error="Please login or register to use this feature. / Is feature ke liye pehle login ya register karein.", loginRequired=True), 401
    return None

LANGUAGES = {"English","Hindi","Hinglish","Marathi","Gujarati","Punjabi","Bengali","Tamil","Telugu","Kannada","Malayalam","Odia","Urdu"}

def clean_language(raw):
    """Any language name is accepted (letters, spaces, hyphens, brackets only) so the app can work in every language."""
    raw = re.sub(r"\s+", " ", str(raw or "").strip())
    if not raw or len(raw) > 40 or not re.fullmatch(r"[^\W\d_][\w \-\(\)\.\u0900-\u0DFF\u0600-\u06FF]*", raw, flags=re.UNICODE):
        return None
    return raw if raw in LANGUAGES or raw[:1].isupper() or not raw.isascii() else raw.title()

def _grounding_sources(response):
    """Web pages Gemini used (from Google Search grounding), as [{title, uri}]."""
    out, seen = [], set()
    try:
        cand = (response.candidates or [None])[0]
        gm = getattr(cand, "grounding_metadata", None)
        for ch in (getattr(gm, "grounding_chunks", None) or []):
            w = getattr(ch, "web", None)
            uri = getattr(w, "uri", None)
            if isinstance(uri, str) and uri.startswith("http") and uri not in seen:
                seen.add(uri)
                out.append({"title": (getattr(w, "title", None) or uri)[:120], "uri": uri})
    except Exception:
        pass
    return out[:6]

def grounded_generate(prompt, system=None):
    """-> (text, sources). Uses Google Search grounding; if that is unavailable, falls back to a normal answer (sources=[])."""
    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    try:
        return gemini_generate(contents, system, grounded=True, want_sources=True)
    except Exception as e:
        if is_key_error(e):          # a bad key fails the same way without search - do not waste a second call
            raise
        print("Grounded call failed, retrying without search:", repr(e), flush=True)
        return gemini_generate(contents, system) or "", []

def grounded_only_generate(prompt, system=None):
    """-> (text, sources) with Google Search grounding and NO ungrounded retry.
    Used by the government-scheme updater, which discards answers that have no web sources anyway,
    so an ungrounded retry would only waste Gemini quota that Chat and Fasal Vaidya need."""
    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    return gemini_generate(contents, system, grounded=True, want_sources=True)

def err_code(e):
    """google-genai errors expose the HTTP status as `.code` (not `.status_code`)."""
    for attr in ("code", "status_code"):
        v = getattr(e, attr, None)
        if isinstance(v, int):
            return v
    return None

def is_key_error(e):
    """True when Google rejected the API key itself (invalid / expired / restricted) - no other model can help."""
    code, low = err_code(e), str(e).lower()
    if code == 401:
        return True
    return code in (400, 403) and ("api key" in low or "api_key" in low or "api-key" in low)

def is_quota_error(e):
    return err_code(e) == 429 or "RESOURCE_EXHAUSTED" in str(e)

def _classify_error(e):
    """-> 'key' | 'thinking' | 'quota' | 'missing' | 'busy' | 'timeout' | 'grounding' | 'other'"""
    code, low = err_code(e), str(e).lower()
    if is_key_error(e):
        return "key"
    if code == 400 and "thinking" in low:
        return "thinking"
    if code == 429:
        return "quota"
    if code in (404, 403):          # model name unknown / model not enabled for this project
        return "missing"
    if code in (500, 502, 503, 504):
        return "busy"
    if code is None and any(w in low for w in ("timed out", "timeout", "deadline", "connection reset", "connecterror", "remoteprotocol")):
        return "timeout"
    if code == 400 and any(w in low for w in ("google_search", "google search", "grounding", "search tool")):
        return "grounding"
    return "other"

def friendly_error(e):
    code = err_code(e)
    kind = _classify_error(e)
    if kind == "key":
        return 401, "Gemini API key galat, expired ya allowed nahi hai. Google AI Studio (aistudio.google.com/apikey) se nayi key banayein, use .env me GEMINI_API_KEY me dalein (ya SET_GEMINI_KEY.bat chalayein) aur server restart karein."
    if kind == "missing":
        return 502, "Gemini model is key ke liye available nahi hai. .env me GEMINI_MODEL=gemini-3.8-flash rakhein aur server restart karein."
    if kind == "quota":
        return 429, "Gemini ka free quota abhi khatam hai (sab models try kiye gaye). Thodi der baad dobara try karein - quota roz Pacific midnight (India me lagbhag dopahar 12:30-1:30 baje) reset hota hai. Turant chalane ke liye kisi NAYE Google project me nayi API key banayein (ya billing on karein), use .env me dalein aur server restart karein. Key chat me kabhi share na karein."
    if kind in ("busy", "timeout") or code in (500, 503, 504):
        return 503, "Gemini abhi busy hai ya jawab dene me der lag rahi hai. Thodi der baad dobara try karein."
    return 502, "Gemini request fail hui. Server terminal me exact error dekhein (python check_gemini.py se bhi jaanch sakte hain)."

# ---- Gemini model health: a model that just failed with quota / not-found is skipped for a while ----
_model_cool = {}                       # (model, grounded) -> unix time until which it is skipped
_model_cool_lock = threading.Lock()

def _cool_model(model, grounded, seconds):
    with _model_cool_lock:
        _model_cool[(model, bool(grounded))] = time.time() + seconds

def _model_is_cool(model, grounded):
    with _model_cool_lock:
        return _model_cool.get((model, bool(grounded)), 0) > time.time()

def _thinking_variants(model, fast):
    """Thinking settings to try for `model`, best first; None = send no thinking setting at all.
    Gemini 3.8 / 4 reject 'minimal' (and thinking_budget=0), so they get 'low'; older 3.x models accept 'minimal';
    2.5 flash models accept a zero budget. If a setting is rejected the next variant is tried automatically."""
    if not fast:
        return [None]
    m, variants = model.lower(), []
    try:
        if m.startswith(("gemini-4", "gemini-3.8")):
            variants.append(types.ThinkingConfig(thinking_level="low"))
        elif m.startswith("gemini-3"):
            variants.append(types.ThinkingConfig(thinking_level="minimal"))
        elif m.startswith("gemini-2.5") and "pro" not in m:
            variants.append(types.ThinkingConfig(thinking_budget=0))
    except Exception as ex:             # SDK too old for this field -> just do not set it
        print("Thinking setting not supported by installed google-genai:", repr(ex)[:120], flush=True)
    variants.append(None)
    return variants

def gemini_generate(contents, system_instruction=None, response_mime=None, grounded=False, want_sources=False, timeout_s=45, max_tokens=None, fast=False, max_attempts=3, allow_fallback=True):
    """Generate content with the official Google GenAI Python SDK.

    Model chain: GEMINI_MODEL first, then the fallback models. A model is skipped (next one is tried) when it
    is out of quota (429), unknown / not enabled for the key (404/403), still overloaded after retries (500/503)
    or too slow. A rejected thinking setting is retried without it. A rejected API key stops immediately,
    because no other model can fix that. `max_attempts` is the number of tries per model for 500/503 errors.
    """
    if not GEMINI_API_KEY:
        return None
    if genai is None or types is None:
        raise RuntimeError("google-genai package is not installed. Run: pip install -U google-genai")

    # Hard timeout so a request can never hang forever (value is in milliseconds).
    client = genai.Client(api_key=GEMINI_API_KEY, http_options=types.HttpOptions(timeout=int(timeout_s * 1000)))

    sdk_contents = []
    for item in contents:
        role = item.get("role", "user")
        parts = []
        for part in item.get("parts", []):
            if "text" in part:
                parts.append(types.Part.from_text(text=part["text"]))
            elif "inlineData" in part:
                data = base64.b64decode(part["inlineData"]["data"])
                parts.append(types.Part.from_bytes(
                    data=data,
                    mime_type=part["inlineData"].get("mimeType", "image/jpeg")
                ))
        sdk_contents.append(types.Content(role=role, parts=parts))

    base_kwargs = {}
    if system_instruction:
        base_kwargs["system_instruction"] = system_instruction
    if response_mime:
        base_kwargs["response_mime_type"] = response_mime
    if grounded:   # let Gemini use Google Search for fresh, source-backed answers
        base_kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]
    if max_tokens:
        base_kwargs["max_output_tokens"] = max_tokens

    chain = list(GEMINI_MODEL_CHAIN) if allow_fallback else list(GEMINI_MODEL_CHAIN[:1])
    models = [m for m in chain if not _model_is_cool(m, grounded)] or chain   # all cooling down -> try them anyway
    deadline = time.time() + max(timeout_s * 2, 45)

    last_error = None
    for model_index, model_name in enumerate(models):
        is_last_model = model_index == len(models) - 1
        skip_model = False
        for thinking in _thinking_variants(model_name, fast):
            if skip_model:
                break
            kwargs = dict(base_kwargs)
            if thinking is not None:
                kwargs["thinking_config"] = thinking
            config = types.GenerateContentConfig(**kwargs) if kwargs else None
            attempt = 0
            while attempt < max_attempts:
                attempt += 1
                if last_error is not None and time.time() > deadline:
                    raise last_error
                try:
                    print(f"Gemini request: model={model_name}, attempt={attempt}"
                          f"{', thinking=' + str(getattr(thinking, 'thinking_level', None) or getattr(thinking, 'thinking_budget', '')) if thinking is not None else ''}", flush=True)
                    response = client.models.generate_content(
                        model=model_name,
                        contents=sdk_contents,
                        config=config,
                    )
                    text = response.text or ""
                    return (text, _grounding_sources(response)) if want_sources else text
                except Exception as e:
                    last_error = e
                    kind = _classify_error(e)

                    if kind == "key":
                        raise                                    # bad key: nothing else can work

                    if kind == "thinking" and thinking is not None:
                        print(f"{model_name} rejected the thinking setting; retrying without it.", flush=True)
                        break                                    # next thinking variant, same model

                    if kind == "busy" and attempt < max_attempts:
                        delay = 2 * attempt
                        print(f"Gemini temporarily unavailable. Retrying in {delay}s... ({attempt}/{max_attempts - 1})", flush=True)
                        time.sleep(delay)
                        continue

                    if kind in ("quota", "missing", "busy", "timeout", "grounding"):
                        if kind == "quota":
                            _cool_model(model_name, grounded, 120)       # per-minute limits recover fast
                        elif kind in ("missing", "grounding"):
                            _cool_model(model_name, grounded, 1800)
                        if is_last_model:
                            raise
                        print(f"Gemini model {model_name} not usable right now ({kind}, HTTP {err_code(e)}); "
                              f"trying {models[model_index + 1]}", flush=True)
                        skip_model = True
                        break

                    raise

    if last_error is not None:
        raise last_error
    raise RuntimeError("No Gemini model could be tried")

def fallback_chat(query):
    q = (query or "").lower()
    if any(x in q for x in ["yellow","leaf","leaves","peele patte","peela"]):
        return """### Diagnostic Assessment: Leaf Yellowing (Chlorosis)

**1. Summary / Direct Answer:**
Yellowing of leaves in Indian crops is commonly caused by nitrogen deficiency, waterlogging/poor drainage, or iron/zinc deficiency. Some fungal diseases can also cause yellowing.

**2. Possible Causes:**
- Nitrogen deficiency, especially on older lower leaves.
- Root waterlogging or poor drainage.
- Zinc or iron deficiency causing interveinal chlorosis.
- Early rust/blight when yellow spots or pustules appear.

**3. Basic Prevention:**
- Maintain field drainage and avoid standing water.
- Use well-decomposed farmyard manure and balanced nutrition.
- Rotate with suitable legume crops.

**4. Recommended Next Steps:**
- Check soil moisture and the pattern of yellowing before applying fertilizer.
- Use a soil test to confirm nutrient deficiency.
- If disease symptoms spread quickly, take a sample to a KVK for diagnosis.

**5. When to Contact an Agriculture Expert:**
If yellowing spreads rapidly, plants wilt, or distinct fungal/pest signs appear, contact your local KVK or Kisan Call Centre at 1800-180-1551."""
    if any(x in q for x in ["fertilizer","wheat","npk","urea","dap","khaad","gehun"]):
        return """### Nutrient & Fertilizer Guidance

**1. Summary / Direct Answer:**
For wheat and cereal crops, fertilizer rates should be based on soil testing, variety, target yield and local recommendations.

**2. Recommended Schedule:**
- Apply the basal phosphorus/potassium dose and part of nitrogen at sowing.
- Split nitrogen applications, with an important dose around the crown-root-initiation stage.
- Avoid excessive nitrogen and apply urea when soil and weather conditions are suitable.

**3. Basic Prevention:**
- Prefer a Soil Health Card/soil test before the season.
- Use balanced NPK and micronutrients only when indicated.

**4. When to Contact an Agriculture Expert:**
Ask the local agriculture officer or KVK for a field-specific fertilizer recommendation."""
    if any(x in q for x in ["scheme","pm kisan","kisan credit","fasal bima","yojana"]):
        return """### Agriculture Government Schemes Overview

**PM-KISAN:** Income support is transferred directly to eligible farmer families subject to current government rules and verification.

**PM Fasal Bima Yojana:** Crop insurance support is available under notified crops/areas and applicable premium rules.

**Kisan Credit Card (KCC):** Institutional agricultural credit is available to eligible farmers subject to bank and government norms.

Use the Government Schemes section in KrishiNetra for official portal links and application guidance."""
    return """### KrishiNetra Agronomy Advisory

**1. Summary / Direct Answer:**
Good farm decisions depend on timely sowing, balanced nutrition, soil testing, irrigation management, weather monitoring and regular pest scouting.

**2. Basic Prevention:**
- Test soil before major fertilizer decisions.
- Use certified seed suitable for your agro-climatic zone.
- Check weather before spraying or irrigating.
- Compare mandi prices before selling.

**3. When to Contact an Agriculture Expert:**
For severe disease, unknown pests, rapid crop decline or soil salinity, contact your District Agriculture Officer, block agriculture officer or KVK."""

def fallback_diagnosis(crop):
    c = (crop or "").lower()
    if "tomato" in c:
        return {
            "diseaseName":"Early Blight (Alternaria solani)","scientificName":"Alternaria solani","confidence":92,"severity":"Moderate",
            "symptoms":["Concentric dark rings on older leaves","Yellow halo around brown lesions","Premature lower-leaf defoliation"],
            "possibleCauses":["Leaf wetness and moderate temperatures","Infected crop debris","High humidity and splashing rain"],
            "prevention":["Crop rotation","Mulch to reduce soil splash","Prefer drip irrigation"],
            "recommendedNextSteps":["Remove infected leaves","Use only locally approved crop-protection products at label rates","Consult KVK if symptoms spread"],
            "expertAdvice":"Consult a local KVK plant-protection officer if symptoms reach stems or spread rapidly."
        }
    if "rice" in c or "paddy" in c:
        return {
            "diseaseName":"Rice Blast","scientificName":"Magnaporthe oryzae","confidence":89,"severity":"High",
            "symptoms":["Spindle-shaped lesions with pale centres","Lesions may merge and dry leaves","Neck infection can cause poorly filled panicles"],
            "possibleCauses":["Excess nitrogen","High humidity and dew","Dense planting"],
            "prevention":["Avoid excessive nitrogen","Maintain balanced potassium","Use locally recommended resistant varieties"],
            "recommendedNextSteps":["Improve field aeration and drainage where appropriate","Use only locally approved fungicides at label rates","Seek extension advice quickly if neck blast is suspected"],
            "expertAdvice":"Rice blast can spread quickly; contact your local agriculture extension service for field-specific control."
        }
    if "potato" in c:
        return {
            "diseaseName":"Late Blight of Potato","scientificName":"Phytophthora infestans","confidence":94,"severity":"High",
            "symptoms":["Water-soaked dark lesions","White growth may appear under leaves in humid conditions","Rapid foliage collapse in conducive weather"],
            "possibleCauses":["Cool humid weather","Infected seed tubers","Poor drainage"],
            "prevention":["Use certified seed","Good ridge/field drainage","Follow locally recommended preventive schedule"],
            "recommendedNextSteps":["Remove badly affected foliage where appropriate","Use only locally approved fungicides at label rates","Contact the agriculture office during an outbreak"],
            "expertAdvice":"Late blight can cause rapid losses; seek local extension guidance."
        }
    return {
        "diseaseName":"Stripe Rust / Yellow Rust of Wheat","scientificName":"Puccinia striiformis f. sp. tritici","confidence":91,"severity":"Moderate",
        "symptoms":["Yellow/orange pustules in stripes on leaves","Yellow powder may rub off","Premature leaf drying can occur"],
        "possibleCauses":["Cool temperatures with dew","Susceptible varieties","Spore movement from cooler regions"],
        "prevention":["Use locally recommended rust-resistant varieties","Follow recommended sowing windows","Scout field boundaries regularly"],
        "recommendedNextSteps":["Confirm diagnosis before spraying","Use only locally approved fungicides at label rates if confirmed","Contact KVK/extension service for outbreak guidance"],
        "expertAdvice":"Report suspected outbreaks to the local agriculture extension service."
    }

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/weather")
def live_weather():
    try:
        lat = float(request.args.get("lat",""))
        lon = float(request.args.get("lon",""))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError()
    except Exception:
        return jsonify(error="Valid lat and lon are required"), 400
    key = f"{lat:.2f},{lon:.2f}"
    hit = _weather_cache.get(key)
    if hit and (datetime.now().timestamp() - hit["at"] < 600):
        return jsonify(hit["data"])
    try:
        params = {
            "latitude":lat,"longitude":lon,"current":"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
            "daily":"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,precipitation_sum",
            "timezone":"Asia/Kolkata","forecast_days":7
        }
        url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=15) as r:
            j = json.loads(r.read().decode())
        days=[]
        for i,d in enumerate(j["daily"]["time"]):
            dt=datetime.fromisoformat(d)
            days.append({
                "day":"Today" if i==0 else dt.strftime("%a"),
                "date":f"{dt.day} {dt.strftime('%b')}",
                "tempMax":round(j["daily"]["temperature_2m_max"][i]),
                "tempMin":round(j["daily"]["temperature_2m_min"][i]),
                "condition":WMO.get(j["daily"]["weather_code"][i],"Mixed"),
                "rainProbability":j["daily"]["precipitation_probability_max"][i] or 0,
                "rainMm":j["daily"]["precipitation_sum"][i] or 0
            })
        alerts=[]
        nxt=days[:3]
        if any(d["rainProbability"]>=60 for d in nxt):
            alerts.append({"severity":"high","title":"Rain expected","message":"High chance of rain in the next 3 days. Postpone spraying and fertilizer; check field drainage."})
        if any(d["tempMax"]>=42 for d in nxt):
            alerts.append({"severity":"high","title":"Heat wave","message":"Very high temperature expected. Irrigate in the evening or early morning and protect young plants."})
        if any(d["tempMin"]<=4 for d in nxt):
            alerts.append({"severity":"high","title":"Cold / frost risk","message":"Very low night temperature expected. Light irrigation in the evening can reduce frost damage."})
        data={"source":"open-meteo","fetchedAt":datetime.now().isoformat(),"alerts":alerts,
              "current":{"temp":round(j["current"]["temperature_2m"]),"feelsLike":round(j["current"]["apparent_temperature"]),
                         "condition":WMO.get(j["current"]["weather_code"],"Mixed"),"humidity":j["current"]["relative_humidity_2m"],
                         "windSpeed":round(j["current"]["wind_speed_10m"]),"rainProbability":days[0]["rainProbability"],
                         "uvIndex":round(j["daily"]["uv_index_max"][0] or 0),"rainNowMm":j["current"]["precipitation"] or 0},
              "forecast":days}
        _weather_cache[key]={"at":datetime.now().timestamp(),"data":data}
        return jsonify(data)
    except Exception as e:
        return jsonify(error="Live weather unavailable right now"), 502

@app.post("/api/chat")
def chat():
    denied=login_required_json()
    if denied: return denied
    body=request.get_json(silent=True) or {}
    message=body.get("message")
    if not isinstance(message,str) or not message.strip():
        return jsonify(error="Message text is required"),400
    history=body.get("history") if isinstance(body.get("history"),list) else []
    language=clean_language(body.get("language"))
    if GEMINI_API_KEY:
        system="""You are AI KrishiNetra, a friendly and knowledgeable agriculture assistant for Indian farmers.

LANGUAGE: __LANG_RULE__ Use simple words and short sentences.

HOW TO ANSWER:
- ALWAYS give a direct, useful answer to the question first. Never reply only with questions.
- If some detail is missing (crop, state, stage), make a sensible general assumption, answer anyway, and at the end ask ONE short follow-up question to make the advice more specific.
- Be practical: explain what to do, when to do it, and why, in clear steps a farmer can follow. Normal length is about 120-250 words. Use a longer answer only for big topics. Greetings and simple questions get a short reply.
- You can answer anything about farming: crops, seeds, sowing time, soil, fertilizer, irrigation, pests and diseases, weather and seasons, farm machinery, organic farming, dairy and livestock, government schemes, loans, insurance and marketing.
- If the question is clearly not about farming, politely say you help with farming topics and offer to help with a farming question.

ACCURACY RULES:
- Do not invent facts. If you are not sure, say so briefly and suggest the nearest KVK or Kisan Call Centre (1800-180-1551).
- Never invent today's mandi prices or exact scheme amounts/dates; say prices change daily and to check eNAM/Agmarknet or the official scheme website.
- For pesticides give only generic names/types, never brand names or exact doses; say to follow the product label and local KVK advice.
- You cannot see the farmer's field and do not know today's weather.

FORMAT: Use short headings with ### and bullet points starting with "- ", and **bold** for key words. No tables."""

        if language:
            lang_rule=f"Write the whole reply in {language} (use the {language} script, except Hinglish which is Hindi written in English letters). Keep crop, scheme and chemical names understandable."
        else:
            lang_rule="Reply in the same language/script the farmer used (Hindi, English or Hinglish)."
        system=system.replace("__LANG_RULE__",lang_rule)
        # The frontend already includes the current message at the end of `history`;
        # drop it so the model does not see the same question twice.
        turns=[]
        for item in history:
            if isinstance(item,dict) and item.get("sender") in ("user","bot") and isinstance(item.get("text"),str) and item["text"].strip():
                turns.append(("user" if item["sender"]=="user" else "model", item["text"]))
        if turns and turns[-1][0]=="user" and turns[-1][1].strip()==message.strip():
            turns.pop()
        turns=turns[-8:]
        while turns and turns[0][0]!="user":   # Gemini needs the conversation to start with a user turn
            turns.pop(0)
        contents=[]
        for role,text in turns:
            if contents and contents[-1]["role"]==role:   # merge consecutive same-role turns
                contents[-1]["parts"][0]["text"]+="\n"+text
            else:
                contents.append({"role":role,"parts":[{"text":text}]})
        if contents and contents[-1]["role"]=="user":
            contents[-1]["parts"][0]["text"]+="\n"+message
        else:
            contents.append({"role":"user","parts":[{"text":message}]})
        try:
            reply=gemini_generate(contents,system,timeout_s=40,max_tokens=4096,fast=True)
            if reply:
                try: db.save_chat(client_id(), message, reply, "gemini-live")
                except Exception as dbe: print("DB save error:", repr(dbe), flush=True)
                return jsonify(reply=reply,source="gemini-live")
            return jsonify(error="Gemini returned an empty response"), 502
        except Exception as e:
            print("Gemini /api/chat error:", repr(e), flush=True)
            traceback.print_exc()
            status, msg = friendly_error(e)
            return jsonify(error=msg, detail=str(e)[:300]), status
    reply=fallback_chat(message)
    try: db.save_chat(client_id(), message, reply, "krishi-knowledgebase")
    except Exception as dbe: print("DB save error:", repr(dbe), flush=True)
    return jsonify(reply=reply,source="krishi-knowledgebase",
                   warning="Gemini is not configured; this is general offline guidance, not a live AI answer.")


_outlook_cache = {}
@app.get("/api/nasa-outlook")
def nasa_outlook_api():
    try:
        lat = float(request.args.get("lat",""))
        lon = float(request.args.get("lon",""))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError()
    except Exception:
        return jsonify(error="Valid lat and lon are required"), 400
    key = f"{lat:.2f},{lon:.2f}"
    hit = _outlook_cache.get(key)
    if hit and (datetime.now().timestamp() - hit["at"] < 1800):
        return jsonify(hit["data"])
    data = nasa_outlook.outlook(lat, lon)
    if data.get("ok") or data.get("recent"):
        _outlook_cache[key] = {"at": datetime.now().timestamp(), "data": data}
        return jsonify(data)
    return jsonify(data), 502

def _parse_json(raw, unwrap=True):
    """Parse a model reply that should be JSON (fences are removed).
    unwrap=True: a one-item wrapper list [ {...} ] is reduced to its first item (used for diagnoses).
    unwrap=False: the parsed value is returned as it is (used for the translation array)."""
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").removeprefix("json").strip()
    data = json.loads(raw)
    return data[0] if unwrap and isinstance(data, list) and data else data

REJECT_MSG = {
    "Hindi": "यह फोटो AI से बनी हुई लग रही है। कृपया अपने खेत/पौधे की असली फोटो अपलोड करें।",
    "English": "This looks like an AI-generated image. Please upload a real photo of your plant or field.",
    "Hinglish": "Yeh photo AI se bani hui lag rahi hai. Please apne khet/paudhe ki asli photo upload karein.",
}

NOT_PLANT_MSG = {
    "English": "This photo does not look like a plant, crop or field. Please upload a clear photo of the plant leaf, crop or field.",
    "Hindi": "यह फोटो किसी पौधे, फसल या खेत की नहीं लग रही। कृपया पत्ती, फसल या खेत की साफ़ फोटो अपलोड करें।",
    "Hinglish": "Yeh photo kisi paudhe, fasal ya khet ki nahi lag rahi. Please patti ya khet ki saaf photo upload karein.",
}

def _check_authenticity(clean_b64, mime, language):
    """Gemini vision look at the ORIGINAL photo -> {verdict, confidence, reason, userMessage, isPlant}."""
    prompt = f"""You are a forensic image examiner for a farming app. Decide whether this photo is a REAL camera photograph or AI-generated / AI-edited.
Look for: unnatural perfect textures, melted or repeated leaf patterns, impossible lighting, garbled text, glossy plastic look, wrong plant anatomy, stock-photo perfection, signs of heavy digital editing or pasted objects.
Do not accuse without reason: ordinary phone photos of real leaves, even blurry, dark or low quality, are REAL.
Return JSON with exactly these keys:
verdict: one of "real", "ai_generated", "ai_edited", "uncertain"
confidence: integer 0-100 (how sure you are of the verdict)
isPlantOrFarm: true/false (is the photo of a plant, crop, leaf, fruit, soil or field at all)
reason: one short sentence in English
userMessage: if verdict is ai_generated, one friendly sentence in {language} telling the farmer this looks AI-generated and asking them to upload the real photo; otherwise empty string."""
    contents = [{"role": "user", "parts": [{"inlineData": {"mimeType": mime, "data": clean_b64}}, {"text": prompt}]}]
    raw = gemini_generate(contents, None, "application/json")
    return _parse_json(raw)

@app.post("/api/diagnose")
def diagnose():
    denied = login_required_json()
    if denied: return denied
    body = request.get_json(silent=True) or {}
    image = body.get("imageBase64")
    crop = body.get("cropName", "Crop")
    mime = body.get("mimeType", "image/jpeg")
    language = clean_language(body.get("language")) or "English"
    if not image:
        return jsonify(error="Image data is required"), 400
    if not isinstance(image, str) or not isinstance(crop, str) or not isinstance(mime, str):
        return jsonify(error="Image, crop name and MIME type must be valid strings"), 400
    clean = image.split(",", 1)[1] if "," in image else image
    try:
        raw_bytes = base64.b64decode(clean, validate=True)
    except Exception:
        return jsonify(error="Image could not be read"), 400

    # ---------- Step 1: local forensics + quality check ----------
    quality = {"enhanced": False}
    notices = []
    sig = None
    work_b64, work_mime = clean, mime
    if imagecheck is not None:
        try:
            im, fixed, sig = imagecheck.analyze(raw_bytes)
            # hard evidence of AI generation inside the file itself (C2PA / SynthID / prompt metadata ...)
            if sig.get("ai_marker"):
                msg = REJECT_MSG.get(language) or (REJECT_MSG["Hindi"] + " / " + REJECT_MSG["English"])
                return jsonify(success=False, rejected=True, verdict="ai_generated",
                               reason=f"AI marker found in the file ({sig['ai_marker']})", message=msg, signals=sig)
            if sig.get("edit_software"):
                notices.append(f"Photo was edited with {sig['edit_software']}. Results may be less reliable - an untouched photo is best.")
            elif sig.get("ela_suspicious") and not sig.get("has_camera_exif"):
                notices.append("Parts of this photo look digitally altered. Please upload an original, unedited photo for the best result.")
            # ---------- Step 2: repair blurry / dark photos BEFORE diagnosis ----------
            if fixed is not None:
                fixed_bytes = imagecheck.to_jpeg(fixed)
                work_b64 = base64.b64encode(fixed_bytes).decode()
                work_mime = "image/jpeg"
                quality = {"enhanced": True, "blurScore": sig.get("blur_score"), "brightness": sig.get("brightness"),
                           "reason": "dark" if sig.get("brightness", 100) < 60 else "blurry",
                           "before": "data:image/jpeg;base64," + base64.b64encode(imagecheck.to_jpeg(im, maxside=900)).decode(),
                           "after": "data:image/jpeg;base64," + base64.b64encode(imagecheck.to_jpeg(fixed, maxside=900)).decode()}
            else:
                work_b64 = base64.b64encode(imagecheck.to_jpeg(im)).decode(); work_mime = "image/jpeg"
        except Exception as e:
            print("imagecheck error:", repr(e), flush=True)

    if not GEMINI_API_KEY:
        return jsonify(error="Fasal Vaidya needs a configured Gemini API key with available quota. Add it to .env and restart the app."), 503

    try:
        # ---------- Step 3: ONE Gemini call = photo authenticity check + full diagnosis ----------
        # (Earlier this was two slow calls one after the other. Now it is a single fast call.)
        small = work_b64
        small_mime = work_mime
        if imagecheck is not None:
            try:
                small = base64.b64encode(imagecheck.to_jpeg(imagecheck.load(raw_bytes), maxside=1024, q=82)).decode()
                small_mime = "image/jpeg"
            except Exception:
                small, small_mime = work_b64, work_mime

        prompt = f"""You are KrishiNetra Fasal Vaidya, an expert Indian plant pathologist and soil scientist, and also a careful image examiner.
Farmer says the crop is: {crop or 'Unknown'}.

STEP A - AUTHENTICITY. Decide if this is a REAL camera photograph or AI-generated/AI-edited.
Signs of AI: unnaturally perfect textures, melted or repeated leaf patterns, impossible lighting, glossy plastic look, wrong plant anatomy, stock-photo perfection.
Ordinary phone photos of real leaves - even blurry, dark, close-up or low quality - are REAL. Never accuse without clear reasons; when unsure use "uncertain".
STEP B - DIAGNOSIS. Describe ONLY what is visible. Do not guess.
- If the photo is not a plant/leaf/fruit/soil/field, set isPlantOrFarm=false.
- If the plant looks healthy, set diseaseName to "No disease detected (looks healthy)" (translated into {language}).
- If the photo shows a different crop than the farmer said, mention it in expertAdvice.
- If no soil is visible, set soilAssessment.visible=false and give one short general soil tip.
- confidence is an honest integer 0-100.
- Never give pesticide doses or brand names; mention only generic types and tell the farmer to confirm with KVK / local agriculture officer.
- Keep every list to at most 4 short items, each item one short sentence.

Return JSON with exactly these keys:
authenticity: object {{verdict: "real"|"ai_generated"|"ai_edited"|"uncertain", confidence: integer 0-100, isPlantOrFarm: boolean, reason: one short English sentence}}
plantName, healthScore (integer 0-100), diseaseName, scientificName, confidence (integer), severity (Low/Moderate/High),
symptoms (array), possibleCauses (array), prevention (array), recommendedNextSteps (array), organicRemedies (array), expertAdvice (string),
soilAssessment (object: visible boolean, condition string, problems array, improvements array),
severityLabel (the severity word in {language}),
labels (object, keys plantName, healthScore, symptoms, possibleCauses, prevention, recommendedNextSteps, organicRemedies, expertAdvice, confidence, severity, soil, soilCondition, soilProblems, soilImprovements; values are those headings translated into {language}).
Write ALL text values in simple {language}. JSON keys stay English. scientificName stays Latin. severity stays one of the English words Low/Moderate/High."""
        contents = [{"role": "user", "parts": [{"inlineData": {"mimeType": small_mime, "data": small}}, {"text": prompt}]}]
        raw = gemini_generate(contents, None, "application/json", timeout_s=50, max_tokens=8192, fast=True)
        if not raw:
            return jsonify(error="Gemini returned an empty vision response"), 502
        try:
            data = _parse_json(raw)
        except Exception:
            print("diagnose: could not parse JSON:", raw[:300], flush=True)
            return jsonify(error="AI ka jawab samajh nahi aaya. Dobara try karein."), 502
        if not isinstance(data, dict):
            return jsonify(error="AI ka jawab samajh nahi aaya. Dobara try karein."), 502

        authenticity = data.pop("authenticity", None)
        authenticity = authenticity if isinstance(authenticity, dict) else {}
        verdict = str(authenticity.get("verdict", "uncertain")).lower()
        try: conf = int(authenticity.get("confidence", 0))
        except Exception: conf = 0
        if verdict == "ai_generated" and conf >= 75:
            msg = REJECT_MSG.get(language) or (REJECT_MSG["Hindi"] + " / " + REJECT_MSG["English"])
            return jsonify(success=False, rejected=True, verdict="ai_generated", confidence=conf,
                           reason=authenticity.get("reason", ""), message=msg)
        if verdict == "ai_edited" and conf >= 65:
            notices.append("This photo looks digitally edited. For a reliable diagnosis please upload an original, unedited photo.")
        if authenticity.get("isPlantOrFarm") is False:
            return jsonify(success=False, rejected=True, verdict="not_plant", reason=authenticity.get("reason", ""),
                           message=NOT_PLANT_MSG.get(language) or NOT_PLANT_MSG["English"])

        try: db.save_diagnosis(client_id(), crop, data, "gemini-vision")
        except Exception as dbe: print("DB save error:", repr(dbe), flush=True)
        return jsonify(success=True, data=data, source="gemini-vision", quality=quality, notices=notices,
                       authenticity={"verdict": verdict, "confidence": conf})
    except Exception as e:
        print("Gemini /api/diagnose error:", repr(e), flush=True)
        traceback.print_exc()
        status, msg = friendly_error(e)
        return jsonify(error=msg, detail=str(e)[:300]), status

# ---------------- whole-app translation ----------------
_tr_hits = {}   # ip -> [timestamps]  (protects the Gemini quota; cached texts never count)

def _translate_batch(lang, texts):
    """Translate a list of UI strings into `lang` with one Gemini call. -> list of strings (same length/order)."""
    system = (f"You are a professional translator for an Indian farming app. Translate each item of the JSON array the user sends "
              f"into {lang}. Rules: keep the SAME number of items in the SAME order; keep numbers, units, currency signs, emojis, "
              f"HTML tags, URLs, placeholders and proper names (KrishiNetra, NASA, PM-KISAN, eNAM, KVK, Gemini) unchanged; "
              f"keep it short and simple, natural for farmers. Return ONLY a JSON array of strings.")
    contents = [{"role": "user", "parts": [{"text": json.dumps(texts, ensure_ascii=False)}]}]
    raw = gemini_generate(contents, system, "application/json", timeout_s=30, max_tokens=10000, fast=True,
                          max_attempts=1, allow_fallback=True)
    data = _parse_json(raw, unwrap=False)   # the answer IS a list; do not reduce it to its first item
    if isinstance(data, dict):              # tolerate {"translations": [...]}
        data = next((v for v in data.values() if isinstance(v, list)), data)
    if not isinstance(data, list) or len(data) != len(texts):
        raise ValueError("translation size mismatch")
    return [str(x) for x in data]

@app.post("/api/translate")
def translate_api():
    """Public (works before login, so the Home page can switch language). Body: {lang, texts:[...]} -> {map:{src:dst}}."""
    body = request.get_json(silent=True) or {}
    lang = clean_language(body.get("lang"))
    texts = body.get("texts")
    if not lang or not isinstance(texts, list):
        return jsonify(error="lang and texts are required"), 400
    uniq, seen = [], set()
    for t in texts[:300]:
        if isinstance(t, str) and t.strip() and len(t) <= 700 and t not in seen:
            seen.add(t); uniq.append(t)
    if lang == "English" or not uniq:
        return jsonify(map={}, pending=0)
    result = db.get_translations(lang, uniq)
    missing = [t for t in uniq if t not in result]
    failed = 0
    if missing:
        if not GEMINI_API_KEY:
            return jsonify(map=result, pending=len(missing), error="Gemini API key not set")
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
        now = time.time()
        _tr_hits[ip] = [t for t in _tr_hits.get(ip, []) if now - t < 600]
        if len(_tr_hits[ip]) >= 60:
            return jsonify(map=result, pending=len(missing), error="Too many translation requests. Try again in a few minutes."), 429
        _tr_hits[ip].append(now)
        # translate in chunks of ~40 strings, a few chunks in parallel so big pages stay fast
        chunks = [missing[i:i + 40] for i in range(0, len(missing), 40)]
        done, lock = {}, threading.Lock()
        def work(ch):
            nonlocal failed
            try:
                out = _translate_batch(lang, ch)
                with lock: done.update(dict(zip(ch, out)))
            except Exception as e:
                print("translate chunk failed:", repr(e), flush=True)
                with lock: failed += len(ch)
        threads = [threading.Thread(target=work, args=(ch,)) for ch in chunks]
        for th in threads: th.start()
        for th in threads: th.join(timeout=75)
        if done:
            try: db.save_translations(lang, done)
            except Exception as dbe: print("DB save error:", repr(dbe), flush=True)
            result.update(done)
    return jsonify(map=result, pending=failed, error="Some translations could not be completed." if failed else None)

# ---------------- data served from the database ----------------
@app.get("/data.js")
def data_js():
    """Reference data (crops, schemes, mandi, soil, ...) from SQLite as the same window.* globals the old static files defined."""
    js = "\n".join(f"window.{k} = {json.dumps(v, ensure_ascii=False)};" for k, v in db.frontend_data().items())
    resp = Response(js, mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    return resp

# ---------------- farmer accounts ----------------
_failed = {}   # contact -> [timestamps]  (simple brute-force throttle)

def _throttled(contact):
    now = time.time()
    _failed[contact] = [t for t in _failed.get(contact, []) if now - t < 600]
    return len(_failed[contact]) >= 8

def _split_contact(contact):
    contact = (contact or "").strip()
    if "@" in contact:
        return None, contact.lower()
    digits = re.sub(r"[\s\-()]", "", contact)
    return (digits if re.fullmatch(r"\+?\d{10,13}", digits) else None), None

def _login_session(user):
    session.clear()
    session["uid"] = user["id"]
    session.permanent = True

@app.post("/api/auth/register")
def auth_register():
    b = request.get_json(silent=True) or {}
    name = str(b.get("name", "")).strip()[:80]
    password = str(b.get("password", ""))
    phone, email = _split_contact(b.get("contact"))
    if not name:
        return jsonify(error="Naam likhna zaroori hai."), 400
    if not phone and not email:
        return jsonify(error="Sahi 10-digit phone number ya email dalein."), 400
    if len(password) < 6:
        return jsonify(error="Password kam se kam 6 akshar ka hona chahiye."), 400
    user = db.create_user(name, phone, email, generate_password_hash(password),
                          str(b.get("state", "Uttar Pradesh"))[:60], str(b.get("district", ""))[:60])
    if not user:
        return jsonify(error="Is phone/email se account pehle se hai. Sign In karein."), 409
    db.migrate_client(anon_client_id(), f"u{user['id']}")
    _login_session(user)
    return jsonify(user=user)

@app.post("/api/auth/login")
def auth_login():
    b = request.get_json(silent=True) or {}
    contact = str(b.get("contact", "")).strip()
    phone, email = _split_contact(contact)
    key = phone or email or contact.lower()
    if _throttled(key):
        return jsonify(error="Bahut zyada galat koshish. 10 minute baad try karein."), 429
    user, pw_hash = db.find_user_for_login(phone or email or contact)
    if not user or not check_password_hash(pw_hash, str(b.get("password", ""))):
        _failed.setdefault(key, []).append(time.time())
        return jsonify(error="Phone/email ya password galat hai."), 401
    db.migrate_client(anon_client_id(), f"u{user['id']}")
    _login_session(user)
    return jsonify(user=user)

@app.post("/api/auth/logout")
def auth_logout():
    session.clear()
    return jsonify(ok=True)

@app.get("/api/auth/me")
def auth_me():
    uid = current_user_id()
    user = db.get_user(uid) if uid else None
    if uid and not user:
        session.clear()
    return jsonify(user=user)

@app.put("/api/auth/me")
def auth_update():
    uid = current_user_id()
    if not uid:
        return jsonify(error="Login zaroori hai."), 401
    b = request.get_json(silent=True) or {}
    fields = {}
    for k in ("name", "state", "district", "village", "soilType", "irrigation"):
        if isinstance(b.get(k), str):
            fields[k] = b[k].strip()[:80]
    if isinstance(b.get("landSizeAcres"), (int, float)) and 0 <= b["landSizeAcres"] <= 100000:
        fields["landSizeAcres"] = b["landSizeAcres"]
    for k in ("savedCrops", "savedMandis", "userCrops"):
        if isinstance(b.get(k), list) and len(b[k]) <= 200:
            fields[k] = b[k]
    return jsonify(user=db.update_user(uid, fields))

@app.get("/api/history")
def api_history():
    return jsonify(messages=db.get_chat(client_id()))

@app.delete("/api/history")
def api_history_clear():
    db.clear_chat(client_id())
    return jsonify(ok=True)

@app.get("/api/diagnoses")
def api_diagnoses():
    return jsonify(items=db.get_diagnoses(client_id()))

@app.delete("/api/diagnoses")
def api_diagnoses_clear():
    db.delete_diagnoses(client_id())
    return jsonify(ok=True)

_search_hits = {}   # client -> [timestamps]  (protects your Gemini quota)

@app.post("/api/search-details")
def search_details():
    """Fetch details about whatever the farmer searched for (uses Google Search grounding when available)."""
    denied = login_required_json()
    if denied: return denied
    body = request.get_json(silent=True) or {}
    q = str(body.get("query", "")).strip()[:200]
    if len(q) < 2:
        return jsonify(error="Kuch likhein (kam se kam 2 akshar)."), 400
    if not GEMINI_API_KEY:
        return jsonify(error="Gemini API key set nahi hai, isliye details fetch nahi ho sakti."), 503
    cid = client_id(); now = time.time()
    _search_hits[cid] = [t for t in _search_hits.get(cid, []) if now - t < 3600]
    if len(_search_hits[cid]) >= 30:
        return jsonify(error="Ek ghante mein bahut zyada search. Thodi der baad try karein."), 429
    _search_hits[cid].append(now)
    language = clean_language(body.get("language"))
    lang_rule = f"Write the answer in {language}." if language else "Answer in the same language the farmer used."
    system = f"""You are the search assistant of KrishiNetra, an app for Indian farmers.
{lang_rule} Use simple words and short sentences.
Search the web and give DETAILED, practical information about the topic: what it is, the key facts (benefits / eligibility / how to apply for schemes; symptoms, causes and control for crop problems; best practice for crops), latest updates with dates when relevant, and the official website if it is a government matter.
Rules: do not invent numbers, dates or rules. If reliable information is not found, say so clearly. For pesticide/chemical advice give only generic names and tell the farmer to confirm with KVK or the agriculture office.
Format with short headings (### ) and "- " bullet points."""
    try:
        text, sources = grounded_generate(f"Farmer's search: {q}", system)
    except Exception as e:
        print("search-details error:", repr(e), flush=True)
        status, msg = friendly_error(e)
        return jsonify(error=msg, detail=str(e)[:300]), status
    if not text.strip():
        return jsonify(error="Gemini ne khaali jawab diya, dobara try karein."), 502
    return jsonify(reply=text, sources=sources, grounded=bool(sources))

@app.post("/api/schemes/refresh")
def schemes_refresh():
    """Manual trigger. Disabled unless ADMIN_TOKEN is set in .env; send it as header X-Admin-Token."""
    token = os.getenv("ADMIN_TOKEN", "")
    if not token or not secrets.compare_digest(request.headers.get("X-Admin-Token", ""), token):
        return jsonify(error="Not allowed."), 403
    if not GEMINI_API_KEY:
        return jsonify(error="Gemini API key missing."), 503
    threading.Thread(target=lambda: print("[schemes] manual refresh:", schemes_updater.refresh_all(grounded_only_generate), flush=True), daemon=True).start()
    return jsonify(started=True), 202


# ---------------- soil report analysis ----------------
SOIL_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
SOIL_LIMITS = {"ph": (0, 14), "ec": (0, 60), "organicCarbon": (0, 20)}

def _clean_list(v, n, objs=False):
    out = []
    for x in (v if isinstance(v, list) else []):
        if objs:
            if isinstance(x, dict):
                if "steps" in x:
                    out.append({"title": str(x.get("title", ""))[:120], "steps": [str(t)[:300] for t in (x.get("steps") or []) if t][:4]})
                else:
                    out.append({"topic": str(x.get("topic", ""))[:120], "explanation": str(x.get("explanation", ""))[:500]})
        elif x not in (None, ""):
            out.append(str(x)[:400])
    return out[:n]

def _clean_narrative(d):
    d = d if isinstance(d, dict) else {}
    return {"summary": str(d.get("summary", ""))[:700],
            "whatIsHappening": _clean_list(d.get("whatIsHappening"), 6, True),
            "problems": _clean_list(d.get("problems"), 8),
            "solutions": _clean_list(d.get("solutions"), 6, True),
            "fertilizerPlan": _clean_list(d.get("fertilizerPlan"), 6),
            "organicOptions": _clean_list(d.get("organicOptions"), 5),
            "suitableCrops": _clean_list(d.get("suitableCrops"), 8),
            "cropsToAvoid": _clean_list(d.get("cropsToAvoid"), 5),
            "retestAdvice": str(d.get("retestAdvice", ""))[:300]}

def _numeric_values(raw, units=None):
    out = {}
    for k in soil_report.PARAMS:
        v = (raw or {}).get(k)
        if v in (None, ""):
            continue
        v = soil_report.to_standard(k, v, (units or {}).get(k))
        lo, hi = SOIL_LIMITS.get(k, (0, 100000))
        if v is not None and lo <= v <= hi:
            out[k] = v
    return out

@app.post("/api/soil-report")
def soil_report_api():
    denied = login_required_json()
    if denied: return denied
    uid = current_user_id()
    user = db.get_user(uid) or {}
    body = request.get_json(silent=True) or {}
    language = clean_language(body.get("language")) or "English"
    profile = {k: user.get(k) for k in ("state", "district", "landSizeAcres", "soilType", "irrigation")}
    profile["crop"] = str(body.get("crop") or "")[:40]
    manual = body.get("values")
    info = {}
    try:
        if isinstance(manual, dict):                      # ---- typed-in values
            values = _numeric_values(manual)
            if not values:
                return jsonify(error="Please enter at least one soil value (for example pH)."), 400
            rows, score = soil_report.evaluate(values)
            narrative, ai_used = None, False
            if GEMINI_API_KEY:
                try:
                    raw = gemini_generate([{"role": "user", "parts": [{"text": soil_report.values_prompt(rows, score, profile, language)}]}],
                                          None, "application/json", timeout_s=50, max_tokens=8192, fast=True)
                    narrative, ai_used = _clean_narrative(_parse_json(raw)), True
                    if not narrative["solutions"]: narrative, ai_used = None, False
                except Exception as e:
                    print("soil-report AI failed, using built-in advice:", repr(e), flush=True)
            if narrative is None:
                narrative = _clean_narrative(soil_report.fallback_analysis(rows, score, profile))
            source = "manual"
        else:                                             # ---- uploaded report (photo or PDF)
            fb64, mime = body.get("fileBase64"), str(body.get("mimeType") or "")
            if not isinstance(fb64, str) or not fb64:
                return jsonify(error="Please upload your soil report (photo or PDF), or type the values."), 400
            if mime not in SOIL_MIME:
                return jsonify(error="Please upload a JPG, PNG, WEBP photo or a PDF file."), 400
            clean = fb64.split(",", 1)[1] if "," in fb64 else fb64
            try: raw_bytes = base64.b64decode(clean, validate=True)
            except Exception: return jsonify(error="The file could not be read."), 400
            if len(raw_bytes) > 12 * 1024 * 1024:
                return jsonify(error="File is too large (max 12 MB). Please upload a smaller photo or PDF."), 413
            if not GEMINI_API_KEY:
                return jsonify(error="Reading a report needs a Gemini API key with quota. You can still type the values below and get advice."), 503
            contents = [{"role": "user", "parts": [{"inlineData": {"mimeType": mime, "data": clean}},
                                                   {"text": soil_report.file_prompt(profile, language)}]}]
            raw = gemini_generate(contents, None, "application/json", timeout_s=60, max_tokens=8192, fast=True)
            try: data = _parse_json(raw)
            except Exception:
                return jsonify(error="The AI answer could not be understood. Please try again with a clearer photo."), 502
            if not isinstance(data, dict): return jsonify(error="The AI answer could not be understood. Please try again."), 502
            if data.get("isSoilReport") is False:
                return jsonify(success=False, rejected=True, message="This does not look like a soil test report. Please upload the lab report or Soil Health Card, or type the values.")
            values = _numeric_values(data.get("values"), data.get("units"))
            if not values:
                return jsonify(success=False, rejected=True, message="No soil values could be read from this file. Please upload a clearer, straight photo, or type the values below.")
            rows, score = soil_report.evaluate(values)
            narrative, ai_used, source = _clean_narrative(data), True, "report"
            ri = data.get("reportInfo") if isinstance(data.get("reportInfo"), dict) else {}
            info = {k: str(ri.get(k))[:80] for k in ("lab", "date", "sampleId") if ri.get(k)}
            if not narrative["solutions"]:
                narrative = _clean_narrative(soil_report.fallback_analysis(rows, score, profile)); ai_used = False
        result = {"healthScore": score, "values": rows, "aiUsed": ai_used, "reportInfo": info, **narrative}
        try: result["id"] = db.save_soil_report(uid, source, result)
        except Exception as dbe: print("DB save error:", repr(dbe), flush=True)
        return jsonify(success=True, data=result, source=source)
    except Exception as e:
        print("Gemini /api/soil-report error:", repr(e), flush=True)
        traceback.print_exc()
        status, msg = friendly_error(e)
        return jsonify(error=msg, detail=str(e)[:300]), status

@app.get("/api/soil-reports")
def soil_reports_list():
    denied = login_required_json()
    if denied: return denied
    return jsonify(items=db.list_soil_reports(current_user_id()))

@app.delete("/api/soil-reports")
def soil_reports_clear():
    denied = login_required_json()
    if denied: return denied
    db.delete_soil_reports(current_user_id())
    return jsonify(ok=True)

# ---------------- live mandi prices ----------------
@app.get("/api/mandi")
def mandi_api():
    denied = login_required_json()
    if denied: return denied
    state = (request.args.get("state") or "").strip()[:40]
    district = (request.args.get("district") or "").strip()[:40]
    refresh = request.args.get("refresh") == "1"
    key = (os.getenv("DATA_GOV_API_KEY") or "").strip()
    meta_key = f"mandi_fetched:{state.lower()}|{district.lower()}"
    last = db.get_meta(meta_key)
    age = None
    if last:
        try: age = (datetime.now() - datetime.fromisoformat(last)).total_seconds()
        except Exception: age = None
    error = notice = None
    if key and (age is None or age > 3 * 3600 or (refresh and age > 60)):
        try:
            rows = mandi_live.fetch(key, state or None, district or None)
            if rows:
                db.save_live_mandi(rows)
                db.set_meta(meta_key, datetime.now().isoformat(timespec="seconds"))
            else:
                notice = "The government feed has no prices for this state right now."
        except mandi_live.MandiError as e:
            error = str(e)
        except Exception as e:
            print("mandi fetch error:", repr(e), flush=True)
            error = "Live prices could not be loaded right now."
    return jsonify(rows=db.get_live_mandi(state or None, district or None), keyConfigured=bool(key),
                   lastFetched=db.get_meta(meta_key), error=error, notice=notice)

@app.get("/api/mandi/history")
def mandi_history_api():
    denied = login_required_json()
    if denied: return denied
    return jsonify(items=db.mandi_history((request.args.get("id") or "")[:150]))

@app.get("/<path:path>")
def static_or_spa(path):
    # Keep SPA routing working for direct page loads.
    return render_template("index.html")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "refresh-schemes":      # python server.py refresh-schemes
        if not GEMINI_API_KEY:
            sys.exit("GEMINI_API_KEY is not set in .env")
        print("Updating schemes (takes a minute)...")
        print("Done:", schemes_updater.refresh_all(grounded_only_generate, ignore_pause=True))
        sys.exit(0)
    if GEMINI_API_KEY:
        masked = GEMINI_API_KEY[:4] + "..." + GEMINI_API_KEY[-3:] if len(GEMINI_API_KEY) > 10 else "(short key)"
        print(f"Gemini key loaded ({masked}). Models tried in order: {', '.join(GEMINI_MODEL_CHAIN)}", flush=True)
        if genai is None:
            print("WARNING: google-genai is not installed -> run: python -m pip install -r requirements.txt", flush=True)
        if not GEMINI_API_KEY.startswith(("AIza", "AQ.")):
            print("WARNING: this key does not look like a Google AI Studio key (they start with AIza or AQ.). Check .env", flush=True)
    else:
        print("WARNING: GEMINI_API_KEY is not set in .env -> AI KrishiNetra and Fasal Vaidya will not work. Run SET_GEMINI_KEY.bat (or: python check_gemini.py --set)", flush=True)
    if GEMINI_API_KEY and os.getenv("SCHEMES_AUTO_UPDATE", "1") != "0":
        days = float(os.getenv("SCHEMES_REFRESH_DAYS", "7"))
        schemes_updater.start_scheduler(grounded_only_generate, days=days)
        print(f"Schemes auto-update ON (every {days:g} days). Turn off with SCHEMES_AUTO_UPDATE=0", flush=True)
    port=int(os.getenv("PORT","5000"))
    app.run(host="0.0.0.0",port=port,debug=os.getenv("FLASK_DEBUG","0")=="1")
