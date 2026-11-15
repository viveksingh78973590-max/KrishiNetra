"""Live mandi prices from the Government of India's Agmarknet feed on data.gov.in.

Resource: "Current Daily Price of Various Commodities from Various Markets (Mandi)".
You need a FREE key from https://data.gov.in (register -> My Account -> generate API key)
and put it in .env as DATA_GOV_API_KEY=...

Prices are Rs per quintal, as reported by each mandi for its latest arrival date.
"""
import json, re, urllib.request, urllib.parse
from datetime import datetime

RESOURCE_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"


STATE_ALIASES = {"Chhattisgarh": "Chattisgarh", "Chattisgarh": "Chhattisgarh", "Delhi": "NCT of Delhi",
                 "Jammu and Kashmir": "Jammu & Kashmir", "Andaman and Nicobar Islands": "Andaman and Nicobar"}


class MandiError(Exception):
    pass


def _norm(k):
    """'Min_x0020_Price' / 'min_price' / 'Min Price' -> 'minprice'."""
    return re.sub(r"[^a-z]", "", str(k).lower().replace("x0020", ""))


def _num(v):
    try:
        f = float(str(v).replace(",", "").strip())
        return f if f > 0 else None
    except Exception:
        return None


def _iso(d):
    """'15/11/2026' or '2026-11-15' -> '2026-11-15' (so dates sort correctly)."""
    d = str(d or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(d, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return d


def parse(records):
    out, seen = [], set()
    for r in records or []:
        n = {_norm(k): v for k, v in r.items()}
        crop = str(n.get("commodity", "")).strip()
        modal = _num(n.get("modalprice"))
        if not crop or modal is None:
            continue
        mn, mx = _num(n.get("minprice")), _num(n.get("maxprice"))
        row = {
            "crop": crop, "variety": str(n.get("variety", "")).strip(),
            "state": str(n.get("state", "")).strip(), "district": str(n.get("district", "")).strip(),
            "mandi": str(n.get("market", "")).strip(), "minPrice": mn or modal, "maxPrice": mx or modal,
            "modalPrice": modal, "arrivalDate": _iso(n.get("arrivaldate")),
        }
        rid = re.sub(r"[^a-z0-9]+", "-", f"{row['state']}-{row['district']}-{row['mandi']}-{crop}-{row['variety']}".lower()).strip("-")
        row["id"] = "L-" + rid[:120]
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        out.append(row)
    return out


def _get(api_key, filters, limit, offset, timeout):
    params = {"api-key": api_key, "format": "json", "limit": limit, "offset": offset}
    for k, v in filters.items():
        params[f"filters[{k}]"] = v
    req = urllib.request.Request(RESOURCE_URL + "?" + urllib.parse.urlencode(params), headers={"Accept": "application/json", "User-Agent": "KrishiNetra/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise MandiError("The data.gov.in API key was rejected. Check DATA_GOV_API_KEY in .env.")
        if e.code == 429:
            raise MandiError("data.gov.in rate limit reached. Please try again in a few minutes.")
        raise MandiError(f"data.gov.in returned an error (HTTP {e.code}).")
    except Exception as e:
        raise MandiError(f"Could not reach data.gov.in ({type(e).__name__}). Check the internet connection.")


def fetch(api_key, state=None, district=None, max_records=1500, timeout=25):
    """-> list of parsed price rows for the state/district (latest data the government feed has)."""
    filters = {}
    if state and state != "All":
        filters["state.keyword"] = state
    if district:
        filters["district"] = district
    records, offset, page = [], 0, 500
    while len(records) < max_records:
        data = _get(api_key, filters, page, offset, timeout)
        got = data.get("records") or []
        records += got
        if len(got) < page:
            break
        offset += page
    if not records and "state.keyword" in filters:       # some feed versions use plain field names
        filters["state"] = filters.pop("state.keyword")
        records = (_get(api_key, filters, page, 0, timeout).get("records") or [])
    alt = STATE_ALIASES.get(state or "")
    if not records and alt:                              # the feed spells a few states differently
        f2 = {k: v for k, v in filters.items() if not k.startswith("state")}
        f2["state"] = alt
        records = (_get(api_key, f2, page, 0, timeout).get("records") or [])
    return parse(records)
