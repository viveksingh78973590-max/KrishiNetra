"""NASA POWER satellite/model data -> early warnings (heat, cold, rain/dry) for a farm location.

NASA POWER gives real satellite+MERRA-2 records with a 2-7 day delay and NO future values,
so the outlook is built like this:
  1. NASA POWER climatology  = what is NORMAL for this place and this time of year (30+ years of NASA data)
  2. NASA POWER last 30 days = what has actually been happening (satellite records)
  3. Forecast models (Open-Meteo, 16 days) = what is coming
  Early warnings = coming values compared with NASA's normal for this exact place.
"""
import json, datetime as dt, urllib.request, urllib.parse

POWER = "https://power.larc.nasa.gov/api/temporal"
_cache = {}

def _get(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": "KrishiNetra/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def _ok(v):
    return v is not None and v > -900

def _avg(xs):
    xs = [x for x in xs if _ok(x)]
    return round(sum(xs) / len(xs), 1) if xs else None

def climatology(lat, lon):
    """NASA POWER monthly climatology: normal temp / max / min / rain per month at this point."""
    key = ("clim", round(lat, 1), round(lon, 1))
    if key in _cache: return _cache[key]
    q = urllib.parse.urlencode(dict(parameters="T2M,T2M_MAX,T2M_MIN,PRECTOTCORR", community="AG",
                                    longitude=lon, latitude=lat, format="JSON"))
    p = _get(f"{POWER}/climatology/point?{q}")["properties"]["parameter"]
    months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
    out = {}
    for i, m in enumerate(months, 1):
        out[i] = dict(t=p["T2M"].get(m), tmax=p["T2M_MAX"].get(m), tmin=p["T2M_MIN"].get(m),
                      rain_day=p["PRECTOTCORR"].get(m))       # mm/day
    _cache[key] = out
    return out

def recent(lat, lon, days=30):
    """NASA POWER daily records for the last `days` days (latest available, ~3 days behind)."""
    key = ("rec", round(lat, 2), round(lon, 2), dt.date.today())
    if key in _cache: return _cache[key]
    end = dt.date.today() - dt.timedelta(days=3)
    start = end - dt.timedelta(days=days)
    q = urllib.parse.urlencode(dict(parameters="T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT", community="AG",
                                    longitude=lon, latitude=lat, start=start.strftime("%Y%m%d"),
                                    end=end.strftime("%Y%m%d"), format="JSON"))
    p = _get(f"{POWER}/daily/point?{q}")["properties"]["parameter"]
    dates = sorted(p["T2M"])
    g = lambda k: [p[k].get(d) for d in dates]
    out = dict(period=f"{dates[0]} to {dates[-1]}", days=len(dates),
               avg_temp=_avg(g("T2M")), max_temp=max([x for x in g("T2M_MAX") if _ok(x)], default=None),
               min_temp=min([x for x in g("T2M_MIN") if _ok(x)], default=None),
               rain_total=round(sum(x for x in g("PRECTOTCORR") if _ok(x)), 1),
               soil_wetness=_avg(g("GWETROOT")[-7:]))
    _cache[key] = out
    return out

def forecast(lat, lon, days=16):
    q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "forecast_days": days, "timezone": "auto",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"})
    d = _get(f"https://api.open-meteo.com/v1/forecast?{q}", timeout=20)["daily"]
    return [dict(date=d["time"][i], tmax=d["temperature_2m_max"][i], tmin=d["temperature_2m_min"][i],
                 rain=d["precipitation_sum"][i] or 0, prob=d["precipitation_probability_max"][i] or 0)
            for i in range(len(d["time"]))]

def _fmt(date):
    d = dt.date.fromisoformat(date)
    return f"{d.day} {d.strftime('%b')}"

def _span(days):
    return _fmt(days[0]["date"]) if len(days) == 1 else f"{_fmt(days[0]['date'])} to {_fmt(days[-1]['date'])}"

def build_warnings(fc, clim):
    """Compare the coming 16 days with NASA's normal for the same month. Returns a list of early warnings."""
    warns = []
    if not fc: return warns
    def normal(date):
        return clim.get(int(date[5:7])) or {}
    # --- heat: hot in absolute terms OR well above NASA normal
    heat = [d for d in fc if d["tmax"] is not None and (d["tmax"] >= 40 or
            (normal(d["date"]).get("tmax") and d["tmax"] >= normal(d["date"])["tmax"] + 5 and d["tmax"] >= 33))]
    if heat:
        peak = max(heat, key=lambda d: d["tmax"]); n = normal(peak["date"]).get("tmax")
        extra = f" (NASA normal for this month: {round(n)}°C)" if n else ""
        warns.append(dict(type="heat", severity="high" if peak["tmax"] >= 42 else "medium", when=_span(heat),
            title="Hot spell coming", message=f"Peak {round(peak['tmax'])}°C around {_fmt(peak['date'])}{extra}. "
            "Irrigate early morning or evening, mulch the soil and protect young plants."))
    # --- cold / frost
    cold = [d for d in fc if d["tmin"] is not None and (d["tmin"] <= 5 or
            (normal(d["date"]).get("tmin") and d["tmin"] <= normal(d["date"])["tmin"] - 4 and d["tmin"] <= 12))]
    if cold:
        low = min(cold, key=lambda d: d["tmin"]); n = normal(low["date"]).get("tmin")
        extra = f" (NASA normal night low: {round(n)}°C)" if n else ""
        warns.append(dict(type="cold", severity="high" if low["tmin"] <= 3 else "medium", when=_span(cold),
            title="Cold spell / frost risk", message=f"Night temperature may fall to {round(low['tmin'])}°C around {_fmt(low['date'])}{extra}. "
            "A light evening irrigation and covering nursery beds helps against frost."))
    # --- rain
    wet = [d for d in fc if d["rain"] >= 10 or (d["prob"] >= 70 and d["rain"] >= 3)]
    if wet:
        tot = round(sum(d["rain"] for d in wet)); big = max(wet, key=lambda d: d["rain"])
        warns.append(dict(type="rain", severity="high" if big["rain"] >= 40 else "medium", when=_span(wet),
            title="Rain coming", message=f"About {tot} mm of rain expected, heaviest around {_fmt(big['date'])} ({round(big['rain'])} mm). "
            "Postpone spraying and fertilizer, clear field drainage and keep harvested produce covered."))
    # --- dry spell
    run, best = [], []
    for d in fc:
        if d["rain"] < 1 and d["prob"] < 30: run.append(d)
        else:
            best = run if len(run) > len(best) else best; run = []
    best = run if len(run) > len(best) else best
    # a dry spell is only news when rain is NORMAL for this month at this place (NASA climatology >= 1.5 mm/day)
    normal_rain = (normal(best[0]["date"]).get("rain_day") if best else None) or 0
    if len(best) >= 10 and not wet and normal_rain >= 1.5:
        warns.append(dict(type="dry", severity="medium", when=_span(best), title="Long dry spell",
            message=f"Almost no rain expected for {len(best)} days. Plan irrigation and avoid sowing water-hungry crops without a water source."))
    return warns

def outlook(lat, lon):
    """Everything the Weather page needs for the NASA outlook card."""
    res = dict(ok=True, lat=lat, lon=lon, sources=[], warnings=[], recent=None, normal=None, timeline=[])
    clim = {}
    try:
        clim = climatology(lat, lon)
        m = dt.date.today().month
        res["normal"] = clim.get(m); res["sources"].append("NASA POWER climatology")
    except Exception as e:
        res["climatology_error"] = str(e)[:120]
    try:
        res["recent"] = recent(lat, lon); res["sources"].append("NASA POWER satellite records")
    except Exception as e:
        res["recent_error"] = str(e)[:120]
    try:
        fc = forecast(lat, lon); res["timeline"] = fc; res["sources"].append("Open-Meteo 16-day forecast")
        res["warnings"] = build_warnings(fc, clim)
    except Exception as e:
        res["ok"] = False; res["error"] = "Forecast unavailable right now"; res["detail"] = str(e)[:120]
    res["updated"] = dt.datetime.now().isoformat(timespec="seconds")
    return res
