#!/usr/bin/env python3
"""Collect Sarajevo power, water, heating and traffic notices, then alert.

Runs as the app's scheduled job: `fetch.py <app-id>` with $APP_TOKEN.
For a safe preview that writes nothing and sends nothing:

  python3 fetch.py --dry-run [--watch watch.json]

Sources
  power    EPBiH planned outages table (street + house numbers + time)
  water    KJKP ViK "servisne informacije" (street lists)
  traffic  GRAS public-transport regime changes, BIHAMK road conditions
  all      Klix / N1 / FENA / Avaz news feeds filtered for Sarajevo outages
  heating  Toplane Sarajevo site when reachable, otherwise the news feeds
"""
import concurrent.futures as cf
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Sarajevo")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124 Safari/537.36")
API = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.environ.get("APP_TOKEN", "")

MUNICIPALITIES = ["Centar", "Stari Grad", "Novo Sarajevo", "Novi Grad",
                  "Ilidža", "Vogošća", "Hadžići", "Ilijaš", "Trnovo"]
EP_MUNI_FIX = {"hadzici": "Hadžići", "ilidza": "Ilidža", "vogosca": "Vogošća",
               "ilijas": "Ilijaš", "novi grad": "Novi Grad", "centar": "Centar",
               "novo sarajevo": "Novo Sarajevo", "stari grad": "Stari Grad",
               "trnovo": "Trnovo"}
SARAJEVO_RE = re.compile(
    r"sarajev|ilid[zž]|vogo[sš]|had[zž]i[cć]|ilija[sš]|trnov|novi grad|stari grad|"
    r"dobrinj|grbavic|otok|ba[sš][cč]ar|alipa[sš]in|hrasn|bistrik|koševo|ko[sš]ev|"
    r"marijin dvor|stup\b|buća potok|rajlovac|butmir|igman", re.I)
NEWS_KINDS = [
    ("heating", re.compile(r"toplan|grijanj|grijanje|radijator|isporuk\w* toplot", re.I)),
    ("power", re.compile(r"bez (elektri[cč]ne energije|struje)|nestan\w* struj|"
                         r"isklju[cč]enj\w* (struje|elektri)|elektrodistribuc", re.I)),
    ("water", re.compile(r"bez vode|vodosnabdij|redukcij\w* vod|vik sarajevo|"
                         r"vodovod", re.I)),
    ("traffic", re.compile(r"obustav\w* saobra|saobra[cć]\w* (je )?(obustav|zatvor|"
                           r"preusmjer|blokir|otežan|usporen)|zatvoren\w* (ulic|cest|put)|"
                           r"izmjen\w* re[zž]ima saobra|kolon\w* vozila|gu[zž]v\w* u saobra|"
                           r"zastoj", re.I)),
]


# ---------------------------------------------------------------- helpers

def now():
    return dt.datetime.now(TZ)


def get(url, timeout=25):
    headers = {"User-Agent": UA, "Accept-Language": "bs,hr;q=0.9,en;q=0.5",
               "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code != 403:
            raise
    # Some feeds reject a browser-looking client without browser headers.
    headers["User-Agent"] = "curl/8.5.0"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def text_of(fragment):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", t, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t ]+", " ", t)
    t = "\n".join(line.strip() for line in t.split("\n"))
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def norm(s):
    s = (s or "").lower().replace("đ", "dj")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("dj", "d")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def eid(*parts):
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:14]


def parse_date(s):
    m = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", s or "")
    if not m:
        return None
    try:
        return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


def parse_times(s):
    m = re.search(r"od\s*(\d{1,2})[:.,]?\s?(\d{2})?\s*(?:sati\s*)?do\s*(\d{1,2})[:.,]?\s?(\d{2})?", s or "", re.I)
    if not m:
        return None, None
    a = f"{int(m.group(1)):02d}:{m.group(2) or '00'}"
    b = f"{int(m.group(3)):02d}:{m.group(4) or '00'}"
    return a, b


def split_streets(s):
    s = re.sub(r"\s+i\s+", ", ", s)
    out = []
    for part in s.split(","):
        part = part.strip(" .;:-\n")
        if 2 < len(part) < 60 and not re.search(r"\d{3}", part):
            out.append(part[0].upper() + part[1:])
    return out


# ---------------------------------------------------------------- sources

def src_epbih():
    s = get("https://www.epbih.ba/stranica/servisne-informacije")
    groups = {}
    for m in re.finditer(r'<tr class="item" data-ed="edsa"[^>]*>(.*?)</tr>', s, re.S):
        cells = [text_of(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", m.group(1), re.S)]
        if len(cells) < 5:
            continue
        muni = EP_MUNI_FIX.get(norm(cells[0]))
        if not muni:  # e.g. Goražde — served by ED Sarajevo but not in the canton
            continue
        date = parse_date(cells[3])
        t = cells[4].replace(" ", "")
        a, _, b = t.partition("-")
        key = (muni, date, t)
        g = groups.setdefault(key, {"muni": muni, "date": date, "from": a, "to": b, "streets": []})
        g["streets"].append({"name": cells[1], "numbers": cells[2]})
    events = []
    for (muni, date, t), g in groups.items():
        names = [x["name"] for x in g["streets"]]
        events.append({
            "id": "ep-" + eid(muni, date, t),  # stable while EPBiH adds streets
            "kind": "power", "source": "epbih", "sourceName": "Elektroprivreda BiH",
            "title": f"Planirano isključenje struje · {muni}",
            "area": muni, "streets": g["streets"],
            "text": "Planirano isključenje električne energije: " + ", ".join(names),
            "date": date, "timeFrom": g["from"], "timeTo": g["to"],
            "url": "https://www.epbih.ba/stranica/servisne-informacije#planska-iskljucenja-elektricne-energije",
        })
    return events


def src_vik(cache):
    s = get("https://www.viksa.ba/objave/servisne_informacije")
    items = re.findall(r'href="(/clanak/(\d+))"[^>]*>(.*?)</a>', s, re.S)
    events, seen = [], set()
    for path, num, inner in items[:14]:
        if num in seen:
            continue
        seen.add(num)
        label = text_of(inner)
        if "kanalizacion" in label.lower():
            continue  # sewer cleaning, not a supply interruption
        url = "https://www.viksa.ba" + path
        body = cache.get(url)
        if body is None:
            page = text_of(get(url))
            a = page.find("\nservisne informacije\n")
            b = page.find("Za sve informacije")
            if b < 0:
                b = page.find("Direkcija KJKP")
            body = page[a + 22:b].strip() if a >= 0 else page[:2000]
            cache[url] = body
        lines = [l for l in body.split("\n") if l.strip()]
        title = lines[0] if lines else label
        rest = "\n".join(lines[2:]) if len(lines) > 2 else body
        low = (title + " " + rest).lower()
        if not re.search(r"vod|prekid|bez vode|redukc", low):
            continue
        streets = []
        for m in re.finditer(r"(?:ulicama|ulici|naseljima|naselju|lokalitetima)\s*:?\s*([^.\n]+)", rest, re.I):
            streets += split_streets(m.group(1))
        tf, tt = parse_times(rest)
        events.append({
            "id": "vik-" + num, "kind": "water", "source": "vik",
            "sourceName": "ViK Sarajevo",
            "title": "Prekid vodosnabdijevanja" if "planiran" not in low else "Planirani radovi na vodovodu",
            "area": None, "streets": [{"name": n, "numbers": ""} for n in dict.fromkeys(streets)],
            "text": rest[:1500], "date": parse_date(title) or parse_date(lines[1] if len(lines) > 1 else ""),
            "timeFrom": tf, "timeTo": tt, "url": url,
            "published": parse_date(lines[1]) if len(lines) > 1 else None,
        })
    return events


def src_gras():
    raw = get("https://gras.ba/wp-json/wp/v2/posts?categories=13&per_page=8"
              "&_fields=id,date,link,title,content")
    events = []
    for p in json.loads(raw):
        title = html.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"])).strip()
        if not re.search(r"saobra|obustav|linij|tramvaj|trolejbus|autobus|prevoz|JGP", title, re.I):
            continue
        body = text_of(p["content"]["rendered"])
        body = re.sub(r"^Poštovani,?\s*", "", body).replace("Služba za odnose sa javnošću", "").strip()
        tf, tt = parse_times(body)
        events.append({
            "id": f"gras-{p['id']}", "kind": "traffic", "source": "gras",
            "sourceName": "GRAS (javni prevoz)", "title": title, "area": None,
            "streets": [], "text": body[:1500],
            "date": parse_date(title) or parse_date(body) or p["date"][:10],
            "timeFrom": tf, "timeTo": tt, "url": p["link"], "published": p["date"][:10],
        })
    return events


def src_bihamk():
    s = get("https://bihamk.ba/spi/stanje-na-cesti-u-bih/rss")
    events = []
    today = now().date().isoformat()
    for head, body in re.findall(r"<h3>(.*?)</h3>\s*(.*?)</div>", s, re.S):
        head, body = text_of(head), text_of(body)
        local = SARAJEVO_RE.search(head) or SARAJEVO_RE.search(
            re.sub(r"(iz )?pravc\w* Sarajev\w*", "", body))
        if not local or head.startswith("GP "):
            continue
        streets = []
        m = re.search(r"ulicama\s*:?\s*(.+)", body, re.I | re.S)
        if m:
            streets = split_streets(re.sub(r"\(.*?\)", "", m.group(1)))
        events.append({
            # Ongoing condition: identity follows its text so a change re-alerts.
            "id": "bh-" + eid(head, body), "kind": "traffic", "source": "bihamk",
            "sourceName": "BIHAMK stanje na cestama", "title": head, "area": None,
            "streets": [{"name": n, "numbers": ""} for n in streets],
            "text": body[:1500], "date": today, "ongoing": True,
            "timeFrom": None, "timeTo": None,
            "url": "https://bihamk.ba/spi/stanje-na-cesti-u-bih",
        })
    return events


def src_toplane():
    s = get("https://www.toplanesa.com/", timeout=12)
    events = []
    for href, inner in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', s, re.S):
        t = text_of(inner)
        if len(t) > 25 and re.search(r"bez grijanj|prekid|isporuk|obavje", t, re.I):
            url = href if href.startswith("http") else "https://www.toplanesa.com" + href
            events.append({
                "id": "top-" + eid(url), "kind": "heating", "source": "toplane",
                "sourceName": "Toplane Sarajevo", "title": t[:160], "area": None,
                "streets": [], "text": t, "date": parse_date(t), "timeFrom": None,
                "timeTo": None, "url": url,
            })
    return events[:10]


NEWS_FEEDS = [("Klix", "https://www.klix.ba/rss"), ("N1", "https://n1info.ba/feed/"),
              ("FENA", "https://www.fena.ba/rss"), ("Avaz", "https://avaz.ba/rss")]


def src_news():
    events, errors = [], []
    cutoff = now() - dt.timedelta(days=2)
    for name, url in NEWS_FEEDS:
        try:
            s = get(url)
        except Exception as e:  # one feed failing must not hide the others
            errors.append(f"{name}: {e}")
            continue
        for item in re.findall(r"<item>(.*?)</item>", s, re.S):
            def tag(t):
                m = re.search(rf"<{t}[^>]*>(.*?)</{t}>", item, re.S)
                return html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", m.group(1))).strip() if m else ""
            title, link = text_of(tag("title")), tag("link")
            desc = text_of(tag("description"))[:600]
            blob = title + " " + desc
            if not (SARAJEVO_RE.search(title) or re.search(
                    r"u sarajevu|kanton\w* sarajevo|sarajevsk|u ksu?\b", desc, re.I)):
                continue
            kind = next((k for k, rx in NEWS_KINDS if rx.search(title) or rx.search(desc)), None)
            if not kind:
                continue
            pub = None
            raw = tag("pubDate")
            try:
                pub = parsedate_to_datetime(raw)
            except Exception:
                try:
                    pub = dt.datetime.fromisoformat(raw).replace(tzinfo=TZ)
                except Exception:
                    pub = None
            if pub and pub.astimezone(TZ) < cutoff:
                continue
            day = pub.astimezone(TZ).date().isoformat() if pub else now().date().isoformat()
            events.append({
                "id": "news-" + eid(link or title), "kind": kind, "source": "news",
                "sourceName": name, "title": title, "area": None, "streets": [],
                "text": desc, "date": day, "timeFrom": None, "timeTo": None,
                "url": link, "news": True,
            })
    if len(errors) == len(NEWS_FEEDS):
        raise RuntimeError("; ".join(errors))
    return events


# ---------------------------------------------------------------- neighbourhoods

def load_hoods():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hoods.json")) as f:
            return json.load(f)["streets"]
    except Exception:
        return {}


HOODS = load_hoods()  # norm street -> {municipality: [neighbourhoods]}
HOOD_NAMES = sorted({h for e in HOODS.values() for hs in e.values() for h in hs}, key=len, reverse=True)


def add_hoods(ev):
    """Label an event with its municipality (when unambiguous) and neighbourhoods."""
    counts, munis = {}, set()
    for st in ev.get("streets", []):
        entry = HOODS.get(norm(st["name"]))
        if not entry:
            continue
        if ev.get("area") and ev["area"] in entry:
            pick = {ev["area"]: entry[ev["area"]]}
        else:
            pick = entry
        munis.update(pick)
        for hs in pick.values():
            for h in hs:
                counts[h] = counts.get(h, 0) + 1
    if ev["source"] == "news":
        hay = " " + norm(ev["title"] + " " + ev.get("text", "")) + " "
        for h in HOOD_NAMES:
            # Names that are also streets (Željeznička, Breka) would mislabel.
            if len(h) >= 5 and norm(h) not in HOODS and f" {norm(h)} " in hay:
                counts[h] = counts.get(h, 0) + 1
    if not ev.get("area") and len(munis) == 1:
        ev["area"] = next(iter(munis))
    ev["hoods"] = [h for h, _ in sorted(counts.items(), key=lambda x: -x[1])][:8]
    return ev


# ---------------------------------------------------------------- matching

def number_matches(want, numbers):
    want = want.strip().upper().replace(" ", "")
    if not want or not numbers:
        return True
    m = re.match(r"(\d+)", want)
    n = int(m.group(1)) if m else None
    for tok in re.split(r",\s*", numbers.upper()):
        tok = tok.strip().rstrip(".").replace(" ", "")
        if tok == want:
            return True
        r = re.fullmatch(r"(\d+)-(\d+)", tok)
        if r and n is not None and int(r.group(1)) <= n <= int(r.group(2)) and want.isdigit():
            return True
    return False


def match_event(ev, watch, street_muni):
    """Return a short reason string when this watch covers the event."""
    if watch.get("kinds") and ev["kind"] not in watch["kinds"]:
        return None
    if watch["type"] == "area":
        area = watch["value"]
        if ev.get("area") == area:
            return area
        for st in ev.get("streets", []):
            if street_muni.get(norm(st["name"])) == area or (
                    not ev.get("area") and area in HOODS.get(norm(st["name"]), {})):
                return f"{st['name']} ({area})"
        if re.search(r"\b" + re.escape(norm(area)) + r"\b", norm(ev["title"] + " " + ev.get("text", ""))):
            return area
        return None
    q = norm(watch["value"])
    if not q:
        return None
    hood = next((h for h in ev.get("hoods", []) if norm(h) == q), None)
    if hood and not watch.get("number"):
        return hood
    for st in ev.get("streets", []):
        if norm(st["name"]) == q:
            if watch.get("number") and not number_matches(watch["number"], st.get("numbers", "")):
                return None
            return st["name"] + (f" {watch['number']}" if watch.get("number") else "")
    hay = " " + norm(ev["title"] + " " + ev.get("text", "")) + " "
    if f" {q} " in hay:
        return watch["value"]
    return None


# ---------------------------------------------------------------- storage

def st_get(app_id, path):
    req = urllib.request.Request(f"{API}/api/storage/apps/{app_id}/{path}",
                                 headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def st_put(app_id, path, value):
    data = json.dumps(value, ensure_ascii=False).encode()
    req = urllib.request.Request(f"{API}/api/storage/apps/{app_id}/{path}", data=data,
                                 method="PUT", headers={"Authorization": f"Bearer {TOKEN}",
                                                        "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=20).read()


def notify(title, body, target, tag):
    data = json.dumps({"title": title, "body": body, "target": target, "tag": tag}).encode()
    req = urllib.request.Request(f"{API}/api/notifications/send", data=data, method="POST",
                                 headers={"Authorization": f"Bearer {TOKEN}",
                                          "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=20).read()


# ---------------------------------------------------------------- run

KIND_LABEL = {"power": "Struja", "water": "Voda", "heating": "Grijanje",
              "traffic": "Saobraćaj"}
DAYS = ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"]


def when_text(ev):
    if not ev.get("date"):
        return ""
    d = dt.date.fromisoformat(ev["date"])
    today = now().date()
    day = ("danas" if d == today else "sutra" if d == today + dt.timedelta(days=1)
           else f"{DAYS[d.weekday()]} {d.day}.{d.month}.")
    if ev.get("timeFrom"):
        return f"{day} {ev['timeFrom']}–{ev.get('timeTo') or ''}".strip("–")
    return day


def run(app_id, dry=False, watch_file=None):
    started = now()
    prev = (json.load(open("events.json")) if dry and os.path.exists("events.json")
            else (st_get(app_id, "events.json") if not dry else None)) or {}
    cache = {} if dry else (st_get(app_id, "cache.json") or {})
    street_muni = ({} if dry else st_get(app_id, "streets.json")) or {}
    if dry:
        watches = json.load(open(watch_file)) if watch_file else []
        notified = {}
    else:
        watches = (st_get(app_id, "watch.json") or {}).get("places", [])
        notified = st_get(app_id, "notified.json") or {}
        settings = st_get(app_id, "watch.json") or {}
        if settings.get("paused"):
            watches = []

    jobs = {"epbih": src_epbih, "vik": lambda: src_vik(cache), "gras": src_gras,
            "bihamk": src_bihamk, "toplane": src_toplane, "news": src_news}
    status, collected = {}, []
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(fn): name for name, fn in jobs.items()}
        for f in cf.as_completed(futs):
            name = futs[f]
            try:
                evs = f.result()
                collected += evs
                status[name] = {"ok": True, "count": len(evs)}
            except Exception as e:
                status[name] = {"ok": False, "error": str(e)[:200]}

    # Learn which municipality each street belongs to (from EPBiH), for area alerts.
    for ev in collected:
        if ev["source"] == "epbih":
            for st in ev["streets"]:
                street_muni[norm(st["name"])] = ev["area"]
    names = {}
    for ev in collected:
        for st in ev.get("streets", []):
            names.setdefault(norm(st["name"]), st["name"])

    # Keep sources that failed this run from vanishing: carry their last events.
    failed = {k for k, v in status.items() if not v["ok"]}
    prev_events = prev.get("events", []) if isinstance(prev, dict) else []
    collected += [e for e in prev_events if e.get("source") in failed]

    first_seen = {e["id"]: e.get("firstSeen") for e in prev_events}
    today = started.date()
    keep, seen_ids = [], set()
    for ev in collected:
        if ev["id"] in seen_ids:
            continue
        seen_ids.add(ev["id"])
        d = dt.date.fromisoformat(ev["date"]) if ev.get("date") else None
        if d and d < today - dt.timedelta(days=1):
            continue
        ev["firstSeen"] = first_seen.get(ev["id"]) or started.isoformat(timespec="seconds")
        keep.append(ev)
    for ev in keep:
        add_hoods(ev)
    keep.sort(key=lambda e: (e.get("date") or "9999", e.get("timeFrom") or "", e["kind"]))

    # Match and alert. Only upcoming/current events, each once.
    alerts = []
    for ev in keep:
        d = dt.date.fromisoformat(ev["date"]) if ev.get("date") else today
        if d < today:
            continue
        ended = (d == today and ev.get("timeTo")
                 and re.fullmatch(r"\d\d:\d\d", ev["timeTo"])
                 and ev["timeTo"] < started.strftime("%H:%M"))
        reasons = [r for w in watches if (r := match_event(ev, w, street_muni))]
        if reasons:
            ev["matches"] = sorted(set(reasons))
            # One alert per outage and place: a street added later still alerts.
            ev["_key"] = ev["id"] + ":" + ",".join(ev["matches"])
            if ev["_key"] not in notified and not ended:
                alerts.append(ev)

    sent = []
    if alerts:
        if len(alerts) > 4:
            kinds = sorted({KIND_LABEL[a["kind"]].lower() for a in alerts})
            places = sorted({m for a in alerts for m in a["matches"]})
            msgs = [(f"Novih upozorenja za vaša mjesta: {len(alerts)}",
                     f"{', '.join(kinds)} · {', '.join(places)[:180]}",
                     f"/shell/?app={app_id}", "sa-batch")]
        else:
            msgs = []
            for a in alerts:
                w = when_text(a)
                where = ", ".join(dict.fromkeys(a["matches"] + a.get("hoods", [])))[:140]
                body = " · ".join(x for x in [where, w,
                                              a["sourceName"]] if x)
                head = (a["title"] if a["source"] in ("epbih", "vik")
                        else f"{KIND_LABEL[a['kind']]}: {a['title']}")
                msgs.append((head[:110], body,
                             f"/shell/?app={app_id}&intent=event:{a['id']}", f"sa-{a['id']}"))
        for title, body, target, tag in msgs:
            if dry:
                print(f"[dry-run] would notify: {title} — {body} → {target}")
            else:
                try:
                    notify(title, body, target, tag)
                except Exception as e:
                    status["notify"] = {"ok": False, "error": str(e)[:200]}
                    break
            sent.append(title)
        else:
            for a in alerts:
                notified[a["_key"]] = started.isoformat(timespec="seconds")

    for ev in keep:
        ev.pop("_key", None)
    cutoff = (started - dt.timedelta(days=21)).isoformat()
    notified = {k: v for k, v in notified.items() if v >= cutoff}
    out = {"updatedAt": started.isoformat(timespec="seconds"), "status": status,
           "events": keep, "lastAlerts": sent}
    if dry:
        json.dump(out, open("events.json", "w"), ensure_ascii=False, indent=1)
        print(json.dumps(status, indent=1))
        print(f"{len(keep)} events, {len(alerts)} alerts")
        return
    st_put(app_id, "events.json", out)
    st_put(app_id, "streets.json", street_muni)
    known = st_get(app_id, "street-names.json") or []
    st_put(app_id, "street-names.json", sorted(set(names.values()) | set(known))[:4000])
    st_put(app_id, "notified.json", notified)
    st_put(app_id, "cache.json", {k: v for k, v in list(cache.items())[-60:]})


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--dry-run" in args:
        wf = args[args.index("--watch") + 1] if "--watch" in args else None
        run(0, dry=True, watch_file=wf)
    else:
        run(int(args[0]))
