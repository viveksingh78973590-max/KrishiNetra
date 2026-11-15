"""SQLite database for KrishiNetra (no extra install needed - sqlite3 ships with Python)."""
import os, re, json, sqlite3
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("KRISHI_DB", os.path.join(BASE, "krishisathi.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user','bot')),
    text       TEXT NOT NULL,
    source     TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_client ON chat_messages (client_id, id);

CREATE TABLE IF NOT EXISTS diagnoses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    TEXT NOT NULL,
    crop         TEXT,
    disease_name TEXT,
    confidence   INTEGER,
    severity     TEXT,
    result_json  TEXT NOT NULL,
    source       TEXT,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diag_client ON diagnoses (client_id, id);

CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    phone            TEXT UNIQUE,
    email            TEXT UNIQUE,
    password_hash    TEXT NOT NULL,
    state            TEXT,
    district         TEXT,
    village          TEXT,
    land_size_acres  REAL,
    saved_crops      TEXT NOT NULL DEFAULT '[]',
    saved_mandis     TEXT NOT NULL DEFAULT '[]',
    user_crops       TEXT NOT NULL DEFAULT '[]',
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crops (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, hindi_name TEXT, category TEXT, season TEXT, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schemes (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, hindi_name TEXT, category TEXT, is_popular INTEGER, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mandi_prices (
    id TEXT PRIMARY KEY, crop TEXT NOT NULL, state TEXT, district TEXT, mandi TEXT,
    min_price REAL, max_price REAL, modal_price REAL, previous_price REAL, last_updated TEXT, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS translations (
    lang TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (lang, src)
);
CREATE TABLE IF NOT EXISTS scheme_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scheme_id TEXT, checked_at TEXT NOT NULL, status TEXT NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY, value TEXT
);
CREATE TABLE IF NOT EXISTS soil_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source TEXT, health_score INTEGER,
    summary TEXT, result_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_soil_user ON soil_reports (user_id, id);
-- live prices from Agmarknet (data.gov.in), refreshed on demand and cached
CREATE TABLE IF NOT EXISTS mandi_live (
    id TEXT PRIMARY KEY, crop TEXT, variety TEXT, state TEXT, district TEXT, mandi TEXT,
    min_price REAL, max_price REAL, modal_price REAL, previous_price REAL,
    arrival_date TEXT, fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mlive_state ON mandi_live (state, district);
CREATE TABLE IF NOT EXISTS mandi_history (
    row_id TEXT NOT NULL, day TEXT NOT NULL, modal_price REAL,
    PRIMARY KEY (row_id, day)
);
-- other reference data (soil, tips, calendar, weather, states ...) stored as one JSON document per name
CREATE TABLE IF NOT EXISTS reference_data (
    name TEXT PRIMARY KEY, data TEXT NOT NULL
);
"""

def _conn():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c

SEED_PATH = os.path.join(BASE, "seed_data.json")

def _migrate(c):
    """Add columns that older krishisathi.db files do not have yet (existing data is kept)."""
    have = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
    for col, ddl in (("soil_type", "TEXT"), ("irrigation", "TEXT")):
        if col not in have:
            c.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")

def init_db():
    with _conn() as c:
        c.executescript(SCHEMA)
        _migrate(c)
    seed_if_empty()

def seed_if_empty():
    """Fill the reference tables from seed_data.json the first time (or when a table is empty)."""
    if not os.path.exists(SEED_PATH):
        return
    with open(SEED_PATH, encoding="utf-8") as f:
        seed = json.load(f)
    dump = lambda o: json.dumps(o, ensure_ascii=False)
    with _conn() as c:
        if c.execute("SELECT COUNT(*) FROM crops").fetchone()[0] == 0:
            for x in seed.get("CROPS_DATA", []):
                c.execute("INSERT OR REPLACE INTO crops VALUES (?,?,?,?,?,?)",
                          (x["id"], x.get("name"), x.get("hindiName"), x.get("category"), x.get("season"), dump(x)))
        if c.execute("SELECT COUNT(*) FROM schemes").fetchone()[0] == 0:
            for x in seed.get("GOVERNMENT_SCHEMES_DATA", []):
                c.execute("INSERT OR REPLACE INTO schemes VALUES (?,?,?,?,?,?)",
                          (x["id"], x.get("name"), x.get("hindiName"), x.get("category"), 1 if x.get("isPopular") else 0, dump(x)))
        if c.execute("SELECT COUNT(*) FROM mandi_prices").fetchone()[0] == 0:
            for x in seed.get("MANDI_PRICES_DATA", []):
                c.execute("INSERT OR REPLACE INTO mandi_prices VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                          (x["id"], x.get("crop"), x.get("state"), x.get("district"), x.get("mandi"), x.get("minPrice"),
                           x.get("maxPrice"), x.get("modalPrice"), x.get("previousPrice"), x.get("lastUpdated"), dump(x)))
        if c.execute("SELECT COUNT(*) FROM reference_data").fetchone()[0] == 0:
            for name in ("MANDI_TREND_HISTORY", "STATES_LIST", "DISTRICT_WEATHER", "SOIL_TYPES", "NPK_EXPLANATION",
                         "FARMING_TIPS_DATA", "FARMING_CALENDAR_DATA", "SAMPLE_DISEASE_CASES"):
                if name in seed:
                    c.execute("INSERT OR REPLACE INTO reference_data VALUES (?,?)", (name, dump(seed[name])))

def frontend_data():
    """All reference data as {JS_GLOBAL_NAME: value}, in the same shape the old static/data/*.js files had."""
    out = {}
    with _conn() as c:
        out["CROPS_DATA"] = [json.loads(r["data"]) for r in c.execute("SELECT data FROM crops ORDER BY rowid")]
        out["GOVERNMENT_SCHEMES_DATA"] = [json.loads(r["data"]) for r in c.execute("SELECT data FROM schemes ORDER BY rowid")]
        out["SCHEMES_META"] = {"lastRun": get_meta("schemes_last_run"), "summary": get_meta("schemes_last_summary")}
        out["MANDI_PRICES_DATA"] = [json.loads(r["data"]) for r in c.execute("SELECT data FROM mandi_prices ORDER BY rowid")]
        for r in c.execute("SELECT name,data FROM reference_data"):
            out[r["name"]] = json.loads(r["data"])
    return out

# ---------- users ----------
def _user_row(r):
    if not r:
        return None
    return {"id": r["id"], "name": r["name"], "phone": r["phone"] or "", "email": r["email"] or "",
            "state": r["state"] or "", "district": r["district"] or "", "village": r["village"] or "",
            "landSizeAcres": r["land_size_acres"] if r["land_size_acres"] is not None else 0,
            "soilType": r["soil_type"] or "", "irrigation": r["irrigation"] or "",
            "savedCrops": json.loads(r["saved_crops"]), "savedMandis": json.loads(r["saved_mandis"]),
            "userCrops": json.loads(r["user_crops"])}

def create_user(name, phone, email, password_hash, state, district):
    """Returns user dict, or None if the phone/email already exists."""
    try:
        with _conn() as c:
            cur = c.execute("""INSERT INTO users (name,phone,email,password_hash,state,district,land_size_acres,
                               saved_crops,saved_mandis,user_crops,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            (name, phone, email, password_hash, state, district, 0,
                             '["wheat","rice"]', '["m1"]', '[]', _now()))
            uid = cur.lastrowid
    except sqlite3.IntegrityError:
        return None
    return get_user(uid)

def get_user(uid):
    with _conn() as c:
        return _user_row(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())

def find_user_for_login(contact):
    """Returns (user_dict, password_hash) or (None, None). Contact is a phone number or an email."""
    with _conn() as c:
        r = c.execute("SELECT * FROM users WHERE phone=? OR email=?", (contact, contact.lower())).fetchone()
    return (_user_row(r), r["password_hash"]) if r else (None, None)

def update_user(uid, fields):
    cols = {"name": "name", "state": "state", "district": "district", "village": "village",
            "landSizeAcres": "land_size_acres", "soilType": "soil_type", "irrigation": "irrigation"}
    jcols = {"savedCrops": "saved_crops", "savedMandis": "saved_mandis", "userCrops": "user_crops"}
    sets, vals = [], []
    for k, col in cols.items():
        if k in fields:
            sets.append(f"{col}=?"); vals.append(fields[k])
    for k, col in jcols.items():
        if k in fields and isinstance(fields[k], list):
            sets.append(f"{col}=?"); vals.append(json.dumps(fields[k], ensure_ascii=False))
    if sets:
        with _conn() as c:
            c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, uid))
    return get_user(uid)

def migrate_client(old_id, new_id):
    """Move an anonymous browser's chat/diagnosis history to a user account after login."""
    if old_id == new_id or old_id == "anonymous":
        return
    with _conn() as c:
        c.execute("UPDATE chat_messages SET client_id=? WHERE client_id=?", (new_id, old_id))
        c.execute("UPDATE diagnoses SET client_id=? WHERE client_id=?", (new_id, old_id))

def clean_client_id(raw):
    raw = (raw or "").strip()
    return raw if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", raw) else "anonymous"

def _now():
    return datetime.now().isoformat(timespec="seconds")

def save_chat(client_id, user_text, bot_text, source):
    with _conn() as c:
        c.execute("INSERT INTO chat_messages (client_id,role,text,source,created_at) VALUES (?,?,?,?,?)",
                  (client_id, "user", user_text, None, _now()))
        c.execute("INSERT INTO chat_messages (client_id,role,text,source,created_at) VALUES (?,?,?,?,?)",
                  (client_id, "bot", bot_text, source, _now()))

def get_chat(client_id, limit=100):
    with _conn() as c:
        rows = c.execute("SELECT role,text,created_at FROM chat_messages WHERE client_id=? ORDER BY id DESC LIMIT ?",
                         (client_id, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]

def clear_chat(client_id):
    with _conn() as c:
        c.execute("DELETE FROM chat_messages WHERE client_id=?", (client_id,))

def save_diagnosis(client_id, crop, data, source):
    d = data if isinstance(data, dict) else {}
    conf = d.get("confidence")
    with _conn() as c:
        c.execute("""INSERT INTO diagnoses (client_id,crop,disease_name,confidence,severity,result_json,source,created_at)
                     VALUES (?,?,?,?,?,?,?,?)""",
                  (client_id, crop, d.get("diseaseName"), conf if isinstance(conf, int) else None,
                   d.get("severity"), json.dumps(data, ensure_ascii=False), source, _now()))

def get_diagnoses(client_id, limit=20):
    with _conn() as c:
        rows = c.execute("SELECT id,crop,disease_name,confidence,severity,result_json,source,created_at "
                         "FROM diagnoses WHERE client_id=? ORDER BY id DESC LIMIT ?", (client_id, limit)).fetchall()
    out = []
    for r in rows:
        x = dict(r)
        x["result"] = json.loads(x.pop("result_json"))
        out.append(x)
    return out

def delete_diagnoses(client_id):
    with _conn() as c:
        c.execute("DELETE FROM diagnoses WHERE client_id=?", (client_id,))


# ---------- meta + scheme auto-update helpers ----------
def get_meta(key):
    with _conn() as c:
        r = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None

def set_meta(key, value):
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)", (key, value))

def list_schemes():
    with _conn() as c:
        return [json.loads(r["data"]) for r in c.execute("SELECT data FROM schemes ORDER BY rowid")]

def save_scheme(x):
    """Insert or replace one scheme (x is the full scheme dict)."""
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO schemes (id,name,hindi_name,category,is_popular,data) VALUES (?,?,?,?,?,?)",
                  (x["id"], x.get("name"), x.get("hindiName"), x.get("category"), 1 if x.get("isPopular") else 0,
                   json.dumps(x, ensure_ascii=False)))

def log_scheme_update(scheme_id, status, note=""):
    with _conn() as c:
        c.execute("INSERT INTO scheme_updates (scheme_id,checked_at,status,note) VALUES (?,?,?,?)",
                  (scheme_id, _now(), status, note[:500]))


# ---------------- translation cache (whole-app language switch) ----------------
def get_translations(lang, srcs):
    """-> {src: dst} for the texts already translated into `lang`."""
    out = {}
    if not srcs:
        return out
    with _conn() as c:
        for i in range(0, len(srcs), 400):
            chunk = srcs[i:i + 400]
            q = ",".join("?" * len(chunk))
            for r in c.execute(f"SELECT src, dst FROM translations WHERE lang=? AND src IN ({q})", [lang, *chunk]):
                out[r["src"]] = r["dst"]
    return out

def save_translations(lang, pairs):
    if not pairs:
        return
    now = _now()
    with _conn() as c:
        c.executemany("INSERT OR REPLACE INTO translations (lang, src, dst, created_at) VALUES (?,?,?,?)",
                      [(lang, k, v, now) for k, v in pairs.items()])


# ---------------- soil reports ----------------
def save_soil_report(uid, source, result):
    with _conn() as c:
        cur = c.execute("INSERT INTO soil_reports (user_id,source,health_score,summary,result_json,created_at) VALUES (?,?,?,?,?,?)",
                        (uid, source, result.get("healthScore"), (result.get("summary") or "")[:300],
                         json.dumps(result, ensure_ascii=False), _now()))
        return cur.lastrowid

def list_soil_reports(uid, limit=10):
    with _conn() as c:
        rows = c.execute("SELECT id,source,health_score,summary,result_json,created_at FROM soil_reports "
                         "WHERE user_id=? ORDER BY id DESC LIMIT ?", (uid, limit)).fetchall()
    out = []
    for r in rows:
        x = dict(r); x["result"] = json.loads(x.pop("result_json")); out.append(x)
    return out

def delete_soil_reports(uid):
    with _conn() as c:
        c.execute("DELETE FROM soil_reports WHERE user_id=?", (uid,))


# ---------------- live mandi prices ----------------
def save_live_mandi(rows):
    """rows: list of dicts from mandi_live.parse(). Keeps the earlier price as 'previous' and a per-day history."""
    now = _now()
    with _conn() as c:
        for x in rows:
            old = c.execute("SELECT modal_price, arrival_date, previous_price FROM mandi_live WHERE id=?", (x["id"],)).fetchone()
            prev = None
            if old:
                prev = old["modal_price"] if old["arrival_date"] != x["arrivalDate"] else old["previous_price"]
            if prev is None:   # first time we see this row: use yesterday from history if we have it
                h = c.execute("SELECT modal_price FROM mandi_history WHERE row_id=? AND day<? ORDER BY day DESC LIMIT 1",
                              (x["id"], x["arrivalDate"])).fetchone()
                prev = h["modal_price"] if h else None
            c.execute("INSERT OR REPLACE INTO mandi_live VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                      (x["id"], x["crop"], x["variety"], x["state"], x["district"], x["mandi"], x["minPrice"],
                       x["maxPrice"], x["modalPrice"], prev, x["arrivalDate"], now))
            c.execute("INSERT OR REPLACE INTO mandi_history VALUES (?,?,?)", (x["id"], x["arrivalDate"], x["modalPrice"]))

def get_live_mandi(state=None, district=None, limit=1500):
    q, args = "SELECT * FROM mandi_live WHERE 1=1", []
    if state and state != "All":
        q += " AND lower(state)=lower(?)"; args.append(state)
    if district:
        q += " AND lower(district)=lower(?)"; args.append(district)
    q += " ORDER BY arrival_date DESC, crop LIMIT ?"; args.append(limit)
    with _conn() as c:
        rows = c.execute(q, args).fetchall()
    out = []
    for r in rows:
        prev = r["previous_price"]; modal = r["modal_price"]
        change = (modal - prev) if (prev is not None and modal is not None) else None
        out.append({"id": r["id"], "crop": r["crop"], "variety": r["variety"], "state": r["state"], "district": r["district"],
                    "mandi": r["mandi"], "minPrice": r["min_price"], "maxPrice": r["max_price"], "modalPrice": modal,
                    "previousPrice": prev, "arrivalDate": r["arrival_date"], "fetchedAt": r["fetched_at"],
                    "changeAmount": None if change is None else round(change),
                    "trend": None if change is None else ("up" if change > 0 else "down" if change < 0 else "flat")})
    return out

def mandi_history(row_id, limit=10):
    with _conn() as c:
        rows = c.execute("SELECT day, modal_price FROM mandi_history WHERE row_id=? ORDER BY day DESC LIMIT ?", (row_id, limit)).fetchall()
    return [{"day": r["day"], "modalPrice": r["modal_price"]} for r in reversed(rows)]
