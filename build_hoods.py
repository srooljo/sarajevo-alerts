#!/usr/bin/env python3
"""Build hoods.json (street -> municipality -> neighbourhoods) and hoods.js.

One-off generator from OpenStreetMap (© OpenStreetMap contributors, ODbL).
Re-run when the neighbourhood data needs refreshing:

  python3 build_hoods.py <osm-dir>

<osm-dir> must hold three Overpass JSON exports for bbox 43.70,18.10,44.02,18.55:
  ways.json    way["highway"]["name"]; out tags geom qt;
  places.json  node["place"~"^(suburb|neighbourhood|quarter|village|hamlet|town)$"]; out;
  adm.json     relation["boundary"="administrative"]["admin_level"~"^(7|8|9|10)$"]; out geom;

Neighbourhood of a street point: the official mjesna zajednica polygon
(admin_level 8) when OSM has one, else the nearest named neighbourhood node
within 1.2 km, else the nearest village/hamlet within 1.5 km.
"""
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import norm  # noqa: E402  same normalisation as matching

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
MUNIS = {"Centar", "Stari Grad", "Novo Sarajevo", "Novi Grad", "Ilidža",
         "Vogošća", "Hadžići", "Ilijaš", "Trnovo (FBiH)"}
ALIASES = {"Faza A": "Alipašino polje", "B-faza": "Alipašino polje", "Faza C": "Alipašino polje",
           "Kvadrant C5": "Dobrinja", "Trnovo (FBiH)": "Trnovo",
           "Hrid-Jarčedoli": "Hrid-Jarčedoli", "Sokolović-kolonija": "Sokolović Kolonija"}


def clean(name):
    n = re.sub(r'^(MZ|Mjesna zajednica)\s+', "", name).strip().strip('"').strip()
    n = re.sub(r"\s+(I|II|III|IV|V|VI)$", "", n)  # Grbavica II -> Grbavica
    n = re.sub(r"\s*\((FBiH|RS)\)$", "", n)
    return ALIASES.get(n, n)


def rings(rel):
    """Join a relation's outer member ways into closed rings of (lon, lat)."""
    segs = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in rel.get("members", [])
            if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry")]
    out = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(ring) > 3:
            out.append(ring)
    return out


def poly(rel, name):
    rs = rings(rel)
    if not rs:
        return None
    xs = [x for r in rs for x, _ in r]
    ys = [y for r in rs for _, y in r]
    return {"name": name, "rings": rs, "bbox": (min(xs), min(ys), max(xs), max(ys))}


def inside(pt, p):
    x, y = pt
    a, b, c, d = p["bbox"]
    if not (a <= x <= c and b <= y <= d):
        return False
    hit = False
    for r in p["rings"]:
        j = len(r) - 1
        for i in range(len(r)):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
    return hit


def km(a, b):
    dx = (a[0] - b[0]) * math.cos(math.radians(43.85)) * 111.32
    dy = (a[1] - b[1]) * 110.57
    return math.hypot(dx, dy)


adm = json.load(open(os.path.join(SRC, "adm.json")))["elements"]
munis, mzs = [], []
for rel in adm:
    t = rel["tags"]
    nm = t.get("name", "")
    if t.get("admin_level") == "7":
        short = nm.replace("Općina ", "")
        if short in MUNIS and (p := poly(rel, clean(short))):
            munis.append(p)
    elif t.get("admin_level") == "8" and (p := poly(rel, clean(nm))):
        mzs.append(p)

urban, rural = [], []
for e in json.load(open(os.path.join(SRC, "places.json")))["elements"]:
    t = e["tags"]
    if not t.get("name"):
        continue
    pt = (e["lon"], e["lat"])
    (urban if t.get("place") in ("suburb", "neighbourhood", "quarter") else
     rural if t.get("place") in ("village", "hamlet") else []).append((pt, clean(t["name"])))


def muni_of(pt):
    return next((m["name"] for m in munis if inside(pt, m)), None)


def hood_of(pt):
    for z in mzs:
        if inside(pt, z):
            return z["name"]
    best = min(urban, key=lambda u: km(pt, u[0]), default=None)
    if best and km(pt, best[0]) <= 1.2:
        return best[1]
    best = min(rural, key=lambda u: km(pt, u[0]), default=None)
    if best and km(pt, best[0]) <= 1.5:
        return best[1]
    return None


streets = defaultdict(lambda: defaultdict(Counter))  # norm street -> muni -> hood counts
for w in json.load(open(os.path.join(SRC, "ways.json")))["elements"]:
    geom = w.get("geometry") or []
    name = w["tags"].get("name")
    if not name or not geom:
        continue
    pts = [(p["lon"], p["lat"]) for p in geom][::3] + [(geom[-1]["lon"], geom[-1]["lat"])]
    for pt in pts:
        m = muni_of(pt)
        if not m:
            continue
        h = hood_of(pt)
        if h:
            streets[norm(name)][m][h] += 1

out = {}
for st, by_muni in streets.items():
    entry = {}
    for m, c in by_muni.items():
        total = sum(c.values())
        hoods = [h for h, n in c.most_common(4) if n / total >= 0.15 and norm(h) != norm(m)]
        if hoods:
            entry[m] = hoods
    if entry:
        out[st] = entry

json.dump({"attribution": "© OpenStreetMap contributors (ODbL)", "streets": out},
          open(os.path.join(HERE, "hoods.json"), "w"), ensure_ascii=False, separators=(",", ":"))
names = sorted({h for e in out.values() for hs in e.values() for h in hs}, key=norm)
with open(os.path.join(HERE, "hoods.js"), "w") as f:
    f.write("// Generated by build_hoods.py from OpenStreetMap (© OpenStreetMap contributors).\n")
    f.write("export const HOOD_NAMES = " + json.dumps(names, ensure_ascii=False) + "\n")
print(f"{len(munis)} municipalities, {len(mzs)} MZ polygons, {len(urban)} urban + {len(rural)} rural places")
print(f"{len(out)} streets mapped, {len(names)} neighbourhood names")
