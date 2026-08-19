#!/usr/bin/env python3
"""
Content-pipeline pass 1 (drafting) for the 72-row equipment_catalog.xlsx.

Converts each catalog row that ISN'T already a shipped asset into a full
data/assets/*.json file matching the Asset schema in src/types.ts. Verification
(pass 2) is deliberately NOT done here — sources with real URLs are supplied
separately (see SOURCES_OVERRIDE below, filled in from targeted research) and
`node scripts/audit-content.mjs --write` computes `verification` afterward,
exactly like the original 27. Nothing here writes a confidence label; the
catalog's own "Verification" column is read for context only and is not
trusted (see docs/CONTENT_PIPELINE.md and the session that added this batch).
"""
import json, re, os, hashlib

ROWS_PATH = "/tmp/claude-0/-home-user-Warfare/8341a50d-6747-53ae-8fca-57b1c7d1a0fd/scratchpad/catalog/rows.json"
OUT_DIR = "data/assets"

SIDE_MAP = {"Ukraine": "side_a", "Russia": "side_b"}

# Rows that duplicate an already-shipped asset — verified by hand, see
# session decision log. Skipped entirely; the existing curated file is left
# untouched.
SKIP = {
    ("side_a", "Leopard 2 (A4/A6)"),
    ("side_a", "Patriot (PAC-3 MSE)"),
    ("side_a", "Gepard"),
    ("side_a", "M777 155mm Towed Howitzer"),
    ("side_a", "M142 HIMARS"),
    ("side_a", "Leleka-100"),
    ("side_a", "Magura V5"),
    ("side_b", "T-72B3 / T-72B3M"),
    ("side_b", "Pantsir-S1"),
    ("side_b", "BM-21 Grad"),
    ("side_b", "Orlan-10"),
    ("side_b", "Lancet (Izdelie-52)"),
}

def slugify(s):
    s = s.lower()
    s = re.sub(r"[\'\"‘’“”]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

# ── category → schema mapping ──────────────────────────────────────────
# (domain, group, category_slug_fn(row), echelon, key_fact_labels)
def categorize(cat, role):
    c = cat.lower()
    r = (role or "").lower()
    if "armor - mbt" in c or "mbt" in c:
        return dict(domain="land", group="armor", category="armor-main-battle-tank",
                    echelon="tactical", kf=["Main armament", "Crew", "Protection"])
    if "ifv" in c or "apc" in c:
        kind = "ifv" if "ifv" in c and "apc" not in c.replace("ifv/apc","") else ("apc" if "apc" in c else "ifv")
        return dict(domain="land", group="armor", category=f"armor-{ 'ifv' if 'ifv' in c else 'apc' }",
                    echelon="tactical", kf=["Crew + dismounts", "Armament", "Protection"])
    if "artillery" in c:
        sp = "self-propelled" in r or "self-propelled" in c
        return dict(domain="land", group="artillery",
                    category="artillery-self-propelled" if sp else "artillery",
                    echelon="tactical", kf=["Caliber", "Range", "Rate of fire"])
    if "mlrs" in c:
        return dict(domain="land", group="artillery", category="artillery-rocket",
                    echelon="operational", kf=["Rocket type", "Range", "Salvo"])
    if "air defense" in c:
        if "long" in c:
            band = "long-range"
        elif "short" in c:
            band = "short-range"
        else:
            band = "medium-range"
        return dict(domain="air", group="air_defense", category=f"air-defense-{band}",
                    echelon="operational", kf=["Engagement range", "Target types", "Deployment time"])
    if "uav - long range" in c:
        return dict(domain="air", group="uav", category="uav-strike-deep",
                    echelon="strategic", kf=["Range", "Warhead", "Guidance"])
    if "uav - strike" in c or "uav - multifunctional/decoy" in c:
        return dict(domain="air", group="uav", category="uav-strike",
                    echelon="tactical", kf=["Warhead", "Loiter/range", "Guidance"])
    if "uav - reconnaissance" in c or "reconnaissance" in c and "uav" in c:
        return dict(domain="air", group="uav", category="uav-reconnaissance",
                    echelon="tactical", kf=["Endurance", "Range", "Sensor"])
    if "uav" in c:
        return dict(domain="air", group="uav", category="uav-multirole",
                    echelon="tactical", kf=["Role", "Range", "Payload"])
    if "ugv" in c:
        if "logistic" in c:
            sub = "logistics"
        elif "engineering" in c or "mine" in c:
            sub = "engineering"
        elif "combat" in c:
            sub = "combat"
        else:
            sub = "multipurpose"
        return dict(domain="land", group="ground_robots", category=f"ground-robot-{sub}",
                    echelon="tactical", kf=["Payload / role", "Range", "Control link"])
    if "naval" in c:
        return dict(domain="sea", group="naval", category="naval-usv",
                    echelon="operational", kf=["Range", "Warhead / payload", "Signature"])
    raise ValueError(f"unmapped category: {cat}")

# ── distance placement ─────────────────────────────────────────────────
# Base per (group, category) km, matched against the existing 27's own
# placements (see session notes) so a new MBT lands in the same
# neighbourhood as Leopard 2 / T-72, not an arbitrary new number.
BASE_KM = {
    "armor-main-battle-tank": 4, "armor-ifv": 5, "armor-apc": 6,
    "artillery": 12, "artillery-self-propelled": 15, "artillery-rocket": 20,
    "air-defense-long-range": 45, "air-defense-medium-range": 20, "air-defense-short-range": 6,
    "uav-reconnaissance": 5, "uav-strike": 6, "uav-multirole": 8, "uav-strike-deep": 250,
    "ground-robot-combat": 2, "ground-robot-logistics": 3, "ground-robot-engineering": 3,
    "ground-robot-multipurpose": 3, "naval-usv": 130,
}

RANGE_RE = re.compile(r"(?:range|reach|radius)[^.;]*?(\d[\d,]*)\s*(?:\+)?\s*km", re.I)

def extract_range_km(text):
    m = RANGE_RE.search(text or "")
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None

def place_distance(cat_slug, name_seed, characteristics_text):
    base = BASE_KM.get(cat_slug, 10)
    # A UAV/USV's own stated range is a better placement signal than a flat
    # category default when the source text actually gives one — same
    # reasoning the original 27 used (HIMARS/Grad/Patriot sourced their
    # numbers from real engagement envelopes, not a round guess).
    stated = extract_range_km(characteristics_text)
    if stated and cat_slug in ("uav-strike-deep", "naval-usv", "uav-reconnaissance", "uav-strike", "uav-multirole"):
        # Deep-strike UAVs: place at a meaningful fraction of true range (not
        # the full range, which is a capability envelope, not a "where it
        # typically operates from" point) — matches how the original 27's
        # Spiderweb entry and Magura (120km, well under its 800km range) are
        # both representative points inside the envelope, not the envelope's
        # own edge.
        if cat_slug == "uav-strike-deep":
            return max(150, min(stated // 2, 1300))
        if cat_slug == "naval-usv":
            return max(60, min(stated // 3, 400))
        return max(base, min(stated, base * 3))
    # Deterministic small jitter so same-category items don't stack exactly —
    # same hashing approach src/three/worldMapping.ts already uses.
    h = int(hashlib.sha1(name_seed.encode()).hexdigest()[:6], 16) / 0xFFFFFF
    jitter = round((h - 0.5) * base * 0.5)
    return max(1, base + jitter)

def band_for(km):
    if km <= 5: return "tactical"
    if km <= 30: return "op_near"
    if km <= 150: return "op_deep"
    if km <= 500: return "strategic_rear"
    return "deep_strategic"

# ── cost parsing ────────────────────────────────────────────────────────
# Anchored on a literal "$" on purpose — the earlier, unanchored version
# matched any bare number in the prose (a T-80BVM's own model number, a
# quantity figure) and silently produced nonsense unit costs. Requiring $
# means "no unit price disclosed" text with no dollar figure anywhere
# correctly falls through to unknown/None instead of grabbing a stray digit.
COST_RANGE_RE = re.compile(r"\$\s*([\d,]+(?:\.\d+)?)\s*(?:[-–to]+\s*\$?\s*([\d,]+(?:\.\d+)?))?\s*([MmKk])?")

def parse_cost(text):
    text = (text or "").strip()
    low = text.lower()
    if not text:
        return dict(unit_cost_usd=None, display="Not recorded", confidence="unknown")
    m = COST_RANGE_RE.search(text)
    if not m:
        return dict(unit_cost_usd=None, display=text, confidence="unknown")
    mult = {"m": 1_000_000, "k": 1_000}.get((m.group(3) or "").lower(), 1)
    lo = float(m.group(1).replace(",", ""))
    hi = float(m.group(2).replace(",", "")) if m.group(2) else lo
    usd = round((lo + hi) / 2 * mult)
    # Every non-empty catalog cost cell is a range/estimate by the sheet's
    # own convention (README: filled even when the honest answer is "not
    # disclosed") — never claim "reported" (a real transaction/contract
    # figure) from prose extraction like this.
    return dict(unit_cost_usd=usd, display=text, confidence="estimated")

# ── key facts extraction ───────────────────────────────────────────────
# Content-derived labels, not a per-category template matched by keyword
# search. An earlier version tried the latter (fixed labels like "Warhead"
# per category, keyword-search each bit of text to fill them) and it kept
# mislabeling data — a survey USV's "running time up to 9 hours" landing
# under a "Signature" label because Signature ran out of real candidates
# and fell back positionally. A label that can be wrong is worse than one
# that's merely inconsistent across a category, so this derives each fact's
# label FROM its own value — they cannot disagree by construction.
def split_bits(text):
    return [b.strip().rstrip(".") for b in re.split(r"[;\n]", text or "") if b.strip()]

def infer_label(bit):
    b = bit.lower()
    if "crew" in b:
        return "Crew"
    if "mm" in b and any(k in b for k in ["gun", "cannon", "smoothbore", "rifled", "autocannon"]):
        return "Main armament"
    if any(k in b for k in ["armor", "armour", "protection", "era", "composite", "reactive"]):
        return "Protection"
    if "warhead" in b or "explosive charge" in b:
        return "Warhead"
    if "payload" in b or "carries" in b or "cargo" in b:
        return "Payload"
    if "endurance" in b or "flight time" in b:
        return "Endurance"
    if "range" in b or re.search(r"\d+\s*km\b", b):
        return "Range"
    if "speed" in b or re.search(r"\bkt\b", b) or "km/h" in b or "mph" in b:
        return "Speed"
    if "rate of fire" in b or "rpm" in b or "rounds per minute" in b or "rounds/min" in b:
        return "Rate of fire"
    if any(k in b for k in ["camera", "sensor", "thermal", "eo/ir", "gimbal", "optic"]):
        return "Sensor"
    if any(k in b for k in ["guidance", "gps", "navigation"]):
        return "Guidance"
    if any(k in b for k in ["control", "link", "radio", "fiber", "fibre"]):
        return "Control link"
    if re.search(r"\d+\s*t\b", b) or "tonne" in b or "weight" in b:
        return "Weight"
    if "engine" in b or "hp" in b:
        return "Engine"
    if any(k in b for k in ["salvo", "tube", "launcher", "rail"]):
        return "Salvo / launcher"
    if "signature" in b or "radar cross" in b or "stealth" in b:
        return "Signature"
    return "Spec"

def key_facts_for(_labels, characteristics_text):
    bits = split_bits(characteristics_text)[:3]
    facts, seen = [], set()
    for b in bits:
        label = infer_label(b)
        if label in seen:
            label = f"Spec {len(facts) + 1}"
        seen.add(label)
        facts.append({"label": label, "value": b})
    while len(facts) < 3:
        facts.append({"label": f"Spec {len(facts) + 1}", "value": "See characteristics"})
    return facts

# ── characteristics / narrative fields ─────────────────────────────────
def build_characteristics(row):
    out = split_bits(row.get("Key Characteristics"))
    strengths = row.get("Strengths")
    weaknesses = row.get("Weaknesses")
    if strengths:
        out.append(f"Strength: {strengths.strip().rstrip('.')}")
    if weaknesses:
        out.append(f"Limitation: {weaknesses.strip().rstrip('.')}")
    return out

def build(row, side_key):
    cat_info = categorize(row["Category"], row.get("Type / Role"))
    name = row["Asset Name"].strip()
    slug = slugify(name)
    asset_id = f"{side_key}-{cat_info['group'].replace('_','-')}-{slug}"[:90]

    characteristics_text = row.get("Key Characteristics") or ""
    km = place_distance(cat_info["category"], asset_id, characteristics_text)
    km = round(km, 1) if km < 20 else round(km)

    cost = parse_cost(row.get("Unit Cost"))

    asset = {
        "id": asset_id,
        "name": name,
        "side": side_key,
        "domain": cat_info["domain"],
        "echelon": cat_info["echelon"],
        "group": cat_info["group"],
        "distance_km_from_zero": km,
        "operating_range_km": None,
        "band_id": band_for(km),
        "category": cat_info["category"],
        "representative_system": f"{name} — {row.get('Type / Role','').strip()}" if row.get("Type / Role") else name,
        "icon_image": f"/icons/{slug}.png",
        "gallery_images": [],
        "cost": cost,
        "key_facts": key_facts_for(cat_info["kf"], characteristics_text),
        "short_role": (row.get("Type / Role") or name).strip(),
        "characteristics": build_characteristics(row),
        "employment_notes": (row.get("How Used in This War / What Changed") or "").strip(),
        "contrast_vs_traditional": "",  # filled by fill-contrast pass below
        "connections": [],
        "sources": [],  # filled by the research pass — see fill-sources.py
        "editable": True,
    }
    qty = row.get("Est. Quantity Available")
    if qty:
        asset["characteristics"].append(f"Estimated quantity available: {qty.strip().rstrip('.')}")
    return asset, row.get("3D Model Tier", ""), row.get("Sources (min. 2 for Verified)", "")

def main():
    data = json.load(open(ROWS_PATH))
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []
    for side_name, side_key in SIDE_MAP.items():
        sheet_key = "side_a" if side_key == "side_a" else "side_b"
        for row in data[sheet_key]:
            key = (side_key, row["Asset Name"])
            if key in SKIP:
                continue
            asset, hero_tier, sheet_sources = build(row, side_key)
            manifest.append({
                "id": asset["id"], "name": asset["name"], "side": side_key,
                "category": asset["category"], "hero_tier": hero_tier,
                "sheet_sources_raw": sheet_sources,
            })
            path = os.path.join(OUT_DIR, f"{asset['id']}.json")
            with open(path, "w") as f:
                json.dump(asset, f, indent=2, ensure_ascii=False)
                f.write("\n")
    with open("/tmp/claude-0/-home-user-Warfare/8341a50d-6747-53ae-8fca-57b1c7d1a0fd/scratchpad/catalog/manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Generated {len(manifest)} draft asset files.")

if __name__ == "__main__":
    main()
