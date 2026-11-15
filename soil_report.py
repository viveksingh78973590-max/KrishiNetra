"""Soil test report logic: unit conversion, ratings (Indian Soil Health Card ranges), health score,
the AI prompt, and a rule-based fallback that works without Gemini.

Ratings are guidance only. Fertilizer amounts depend on crop, variety and yield target, so the farmer should
confirm with the Soil Health Card recommendation or the nearest KVK / agriculture officer.
"""

# key: (label, unit, low_below, high_above)   "Optimal" is between the two.
PARAMS = {
    "ph":            ("pH", "", 6.5, 7.8),
    "ec":            ("Salinity (EC)", "dS/m", None, 1.0),
    "organicCarbon": ("Organic carbon", "%", 0.5, 0.75),
    "nitrogen":      ("Nitrogen (N)", "kg/ha", 280, 560),
    "phosphorus":    ("Phosphorus (P)", "kg/ha", 10, 25),
    "potassium":     ("Potassium (K)", "kg/ha", 108, 280),
    "sulphur":       ("Sulphur (S)", "ppm", 10, None),
    "zinc":          ("Zinc (Zn)", "ppm", 0.6, None),
    "iron":          ("Iron (Fe)", "ppm", 4.5, None),
    "manganese":     ("Manganese (Mn)", "ppm", 2.0, None),
    "copper":        ("Copper (Cu)", "ppm", 0.2, None),
    "boron":         ("Boron (B)", "ppm", 0.5, None),
}
ORDER = list(PARAMS)

# kg/acre or lb/acre -> kg/ha, % organic matter -> organic carbon
def to_standard(key, value, unit):
    u = (unit or "").lower().replace(" ", "")
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if "kg/acre" in u or "kgperacre" in u or "kg/ac" in u:
        v *= 2.471
    elif "lb/acre" in u or "lbs/acre" in u:
        v *= 1.121
    if key == "organicCarbon" and ("organicmatter" in u or u in ("om", "om%")):
        v /= 1.724
    if key == "ec" and ("ms/cm" in u):
        pass                       # mS/cm == dS/m
    elif key == "ec" and ("us/cm" in u or "µs/cm" in u or "μs/cm" in u):
        v /= 1000.0
    return round(v, 3)


def rate(key, v):
    label, unit, low, high = PARAMS[key]
    if key == "ph":
        if v < 5.5: st, note = "Very low", "strongly acidic"
        elif v < 6.5: st, note = "Low", "acidic"
        elif v <= 7.8: st, note = "Optimal", "neutral to slightly alkaline"
        elif v <= 8.5: st, note = "High", "alkaline"
        else: st, note = "Very high", "strongly alkaline / sodic"
        return st, note
    if key == "ec":
        if v < 1.0: return "Optimal", "normal, no salt problem"
        if v < 2.0: return "High", "slightly saline, sensitive crops may suffer"
        return "Very high", "saline, most crops will suffer"
    if low is not None and v < low:
        return "Low", "deficient"
    if high is not None and v > high:
        return "High", "more than needed"
    return "Optimal", "adequate"


def evaluate(values):
    """values: {key: number}. -> (rows, score) where rows are in display order."""
    rows, pts = [], []
    for k in ORDER:
        v = values.get(k)
        if v is None:
            continue
        label, unit, *_ = PARAMS[k]
        status, note = rate(k, v)
        rows.append({"key": k, "name": label, "value": v, "unit": unit, "status": status, "note": note})
        pts.append({"Optimal": 100, "High": 65 if k not in ("ec", "ph") else 50, "Low": 45, "Very low": 20, "Very high": 25}[status])
    score = round(sum(pts) / len(pts)) if pts else None
    return rows, score


# ---------------------------------------------------------------- fallback advice (no AI)
_ADVICE = {
    "nitrogen": {"Low": ("Low nitrogen", "Leaves turn pale yellow and plants grow slowly, because the soil cannot feed them enough nitrogen.",
                         "Apply nitrogen (urea or organic manure) in 2-3 split doses instead of once. Add FYM/compost and grow a legume (moong, dhaincha) in rotation.")},
    "phosphorus": {"Low": ("Low phosphorus", "Roots stay weak and flowering/grain filling suffers.",
                           "Apply DAP or single super phosphate at sowing, placed near the root zone. Add compost to help release phosphorus.")},
    "potassium": {"Low": ("Low potassium", "Plants become weak against disease, drought and lodging, and grain/fruit quality drops.",
                          "Apply muriate of potash (MOP) as per crop need, and return crop residue or compost to the field.")},
    "sulphur": {"Low": ("Low sulphur", "Oilseeds, pulses and onion are hit first: pale young leaves and low oil content.",
                        "Use single super phosphate or gypsum as a sulphur source (about 100-150 kg gypsum per acre is common; confirm with KVK).")},
    "zinc": {"Low": ("Low zinc", "Stunted plants, small leaves and white/yellow patches (khaira disease in paddy).",
                     "Apply zinc sulphate about 10 kg per acre once every 2-3 years, or a 0.5% zinc sulphate spray on standing crop.")},
    "iron": {"Low": ("Low iron", "Young leaves turn yellow with green veins.", "Spray 0.5% ferrous sulphate (with a little lime) on the leaves and add compost.")},
    "manganese": {"Low": ("Low manganese", "Grey-yellow spots between veins, mostly in wheat on light soils.", "Spray 0.5% manganese sulphate on the leaves.")},
    "copper": {"Low": ("Low copper", "Tip dieback and poor grain setting in cereals.", "Apply copper sulphate about 2 kg per acre once in 2-3 years, as advised by KVK.")},
    "boron": {"Low": ("Low boron", "Poor flowering, hollow or cracked fruit/roots.", "Apply borax about 4 kg per acre (mixed well, never in the seed row), or a 0.2% borax spray.")},
    "organicCarbon": {"Low": ("Low organic carbon", "The soil holds less water and food, and its useful microbes are few.",
                              "Add 2-4 tonnes of well-rotted FYM or compost per acre every year, grow green manure, and do not burn crop residue.")},
}


def fallback_analysis(rows, score, profile):
    problems, solutions, organic, what = [], [], [], []
    status = {r["key"]: r for r in rows}
    for r in rows:
        k, st = r["key"], r["status"]
        if k in _ADVICE and st in ("Low", "Very low"):
            title, why, fix = _ADVICE[k]["Low"]
            problems.append(title)
            what.append({"topic": title, "explanation": why})
            solutions.append({"title": title, "steps": [fix]})
    ph = status.get("ph")
    if ph:
        if ph["status"] in ("Low", "Very low"):
            problems.append("Acidic soil")
            what.append({"topic": "Acidic soil (low pH)", "explanation": "Many nutrients get locked up and roots are damaged, so crops cannot use the fertilizer you apply."})
            solutions.append({"title": "Correct acidity", "steps": ["Apply agricultural lime based on a lime-requirement test from your soil lab or KVK.", "Add compost; it buffers the soil."]})
        elif ph["status"] in ("High", "Very high"):
            problems.append("Alkaline soil")
            what.append({"topic": "Alkaline soil (high pH)", "explanation": "Zinc, iron and phosphorus become hard for plants to take up, even if they are present."})
            solutions.append({"title": "Manage alkalinity", "steps": ["Apply gypsum (amount from a gypsum-requirement test, especially if pH is above 8.5).", "Use FYM/compost and green manure; prefer ammonium-based or sulphate fertilizers.", "Give proper irrigation drainage so salts do not build up."]})
    ec = status.get("ec")
    if ec and ec["status"] != "Optimal":
        problems.append("Salinity")
        what.append({"topic": "Salt build-up", "explanation": "Salts pull water away from roots, so plants wilt even when the soil is wet."})
        solutions.append({"title": "Reduce salts", "steps": ["Leach salts with good-quality irrigation water and keep drainage channels open.", "Choose salt-tolerant crops (barley, mustard, cotton) until EC falls.", "Add organic matter and avoid heavy muriate of potash."]})
    if not problems:
        what.append({"topic": "Soil looks balanced", "explanation": "None of the readings you gave is in the low or high danger zone."})
        solutions.append({"title": "Maintain", "steps": ["Keep adding compost/FYM every year.", "Rotate crops and test the soil again after 2-3 years."]})
    if any(r["key"] in ("organicCarbon", "nitrogen") and r["status"] == "Low" for r in rows):
        organic.append("Compost / vermicompost / FYM every season")
    organic += ["Green manure (dhaincha or sunnhemp) before paddy", "Leave crop residue in the field or mix it in instead of burning"]
    if any(r["key"] == "nitrogen" and r["status"] == "Low" for r in rows):
        organic.append("Rhizobium / Azotobacter bio-fertilizer, with legumes in rotation")
    summary = (f"Your soil health score is {score}/100. " if score is not None else "") + \
              (("Main problems: " + ", ".join(problems[:4]) + ".") if problems else "The readings you gave look healthy.")
    return {"summary": summary, "whatIsHappening": what, "problems": problems, "solutions": solutions,
            "fertilizerPlan": ["Exact fertilizer quantity depends on your crop and target yield. Ask your nearest KVK or use the Soil Health Card recommendation before buying."],
            "organicOptions": organic, "suitableCrops": [], "cropsToAvoid": [],
            "retestAdvice": "Test your soil again every 2-3 years, or sooner if you change crops or fix a problem."}


# ---------------------------------------------------------------- AI prompt
RANGES_TEXT = """Use these Indian Soil Health Card ranges: pH <6.5 acidic, 6.5-7.8 normal, >7.8 alkaline (>8.5 sodic); EC <1 dS/m normal, 1-2 slightly saline, >2 saline;
organic carbon <0.5% low, 0.5-0.75% medium, >0.75% high; available N <280 kg/ha low, 280-560 medium, >560 high; available P (Olsen) <10 kg/ha low, 10-25 medium, >25 high;
available K <108 kg/ha low, 108-280 medium, >280 high; S <10 ppm low; Zn <0.6 ppm low; Fe <4.5 ppm low; Mn <2 ppm low; Cu <0.2 ppm low; B <0.5 ppm low."""

NARRATIVE_KEYS = """summary (2-3 simple sentences: the overall condition of this soil),
whatIsHappening (array of up to 6 objects {topic, explanation}: what is going on in the soil for each problem and why it hurts the crop, in plain words a farmer understands),
problems (array of short strings, the main problems found),
solutions (array of up to 6 objects {title, steps: array of 1-3 short practical steps}, most important first),
fertilizerPlan (array of up to 6 short strings: fertilizer or amendment, approximate quantity per acre for the farmer's NEXT crop, and when to apply; say these are approximate and must be confirmed with Soil Health Card / KVK),
organicOptions (array of up to 4 short strings),
suitableCrops (array of up to 6 crop names that suit this soil and region),
cropsToAvoid (array of up to 4 crop names, empty if none),
retestAdvice (one short sentence)."""


def profile_text(profile):
    bits = []
    for label, k in (("State", "state"), ("District", "district"), ("Field area (acres)", "landSizeAcres"),
                     ("Soil type", "soilType"), ("Irrigation", "irrigation"), ("Crop the farmer plans/grows", "crop")):
        v = profile.get(k)
        if v not in (None, "", 0):
            bits.append(f"{label}: {v}")
    return "; ".join(bits) or "not given"


def file_prompt(profile, language):
    return f"""You are KrishiNetra Soil Doctor, an expert Indian soil scientist. The attached file should be a soil test report (lab report or Soil Health Card).
Farmer profile: {profile_text(profile)}.

STEP 1. Decide whether the file is really a soil test report. If not, set isSoilReport=false and leave everything else empty.
STEP 2. Read the values EXACTLY as printed. Do not guess a value that is not on the report (use null). Copy the unit printed next to each value into `units`.
STEP 3. {RANGES_TEXT}
Explain what is happening in this soil and give the best practical solution for THIS farmer's soil, area and region.
Never give pesticide doses or brand names. Keep every sentence simple. Write ALL text values in simple {language}; JSON keys stay English.

Return JSON with exactly these keys:
isSoilReport (boolean),
reportInfo (object: lab string or null, date string or null, sampleId string or null),
values (object with keys ph, ec, organicCarbon, nitrogen, phosphorus, potassium, sulphur, zinc, iron, manganese, copper, boron; each a number or null),
units (object, same keys; the unit string printed on the report, or null),
{NARRATIVE_KEYS}"""


def values_prompt(rows, score, profile, language):
    table = "; ".join(f"{r['name']} = {r['value']} {r['unit']} ({r['status']})" for r in rows)
    return f"""You are KrishiNetra Soil Doctor, an expert Indian soil scientist.
Farmer profile: {profile_text(profile)}.
Soil test values (already rated with the Indian Soil Health Card ranges): {table}.
Explain what is happening in this soil and give the best practical solution for THIS farmer's soil, area and region.
Never give pesticide doses or brand names. Keep every sentence simple. Write ALL text values in simple {language}; JSON keys stay English.

Return JSON with exactly these keys:
{NARRATIVE_KEYS}"""
