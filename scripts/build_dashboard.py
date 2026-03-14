#!/usr/bin/env python3
"""
build_dashboard.py
------------------
Reads data/dashboard_data.json and rebuilds dashboard/index.html
with a fresh embedded data payload.

Usage:
    python scripts/build_dashboard.py
"""

import json, re, os, sys
from collections import defaultdict

# ── Locate project root ─────────────────────────────────────────────────────
# Cross-platform: works on Windows, macOS, Linux
def find_project_root():
    # 1. Try relative to this script (scripts/ -> project root)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.dirname(script_dir)  # one level up from scripts/
    if os.path.isfile(os.path.join(candidate, "dashboard", "index.html")):
        return candidate
    # 2. Try current working directory
    cwd = os.getcwd()
    if os.path.isfile(os.path.join(cwd, "dashboard", "index.html")):
        return cwd
    # 3. Try dynamic session mount (macOS/Linux Cursor)
    import glob
    mounts = glob.glob("/sessions/*/mnt/epmcopilot-vendasdia")
    if mounts:
        return mounts[0]
    raise RuntimeError("Cannot locate project root. Run from project directory or ensure dashboard/index.html exists.")

PROJECT = find_project_root()
DATA_FILE      = os.path.join(PROJECT, "data", "dashboard_data.json")
DASHBOARD_FILE = os.path.join(PROJECT, "dashboard", "index.html")

# ── Category mapping ─────────────────────────────────────────────────────────
CAT_MAP = {
    "Total Categoria": "Total",
    "All Categoria":   "Total",
    "N01_7756":        "Mercearia",
    "N01_7384":        "Pereciveis",
}

# ── Load raw records ─────────────────────────────────────────────────────────
print(f"Reading {DATA_FILE} ...")
with open(DATA_FILE) as f:
    records = json.load(f)
if isinstance(records, dict) and "records" in records:
    records = records["records"]
print(f"  {len(records)} records loaded")

# ── Aggregate ────────────────────────────────────────────────────────────────
# yoy[yr][cat][month][account]  → value (All BU only)
# filial[yr][cat][filial]       → {"Total Venda": val, ...}

yoy    = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
filial = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))

years_set    = set()
months_order = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
months_set   = set()
accounts_set = set()
cats_seen    = set()
filials_set  = set()

for r in records:
    # HTML dashboard shows Real only (avoid mixing Real + Orc)
    if r.get("scenario") != "Real/Trabalho":
        continue
    yr  = r.get("year", "")
    mo  = r.get("month", "")
    cat_raw = r.get("categoria", "Total Categoria")
    cat = CAT_MAP.get(cat_raw, cat_raw)
    acc = r.get("account", "")
    fil = r.get("filial", "")
    val = float(r.get("value") or 0)

    if not yr or not mo or not acc or val == 0:
        continue

    years_set.add(yr)
    months_set.add(mo)
    accounts_set.add(acc)
    cats_seen.add(cat)

    # YoY: aggregate "All BU" filial only (avoids double-count)
    if fil in ("All BU", "All_BU", ""):
        yoy[yr][cat][mo][acc] += val

    # Filial breakdown: skip "All BU" to allow per-filial breakdown
    if fil not in ("All BU", "All_BU", ""):
        filials_set.add(fil)
        filial[yr][cat][fil][acc] += val

# Sort years descending, months in calendar order
years  = sorted(years_set, reverse=True)
months = [m for m in months_order if m in months_set]
cats   = [c for c in ["Total", "Mercearia", "Pereciveis"] if c in cats_seen]
filials = sorted(filials_set)

# Build cat labels
cat_labels = {"Total": "Total", "Mercearia": "Mercearia", "Pereciveis": "Perecíveis"}

# Serialize — convert nested defaultdicts to plain dicts
def to_plain(obj):
    if isinstance(obj, defaultdict):
        return {k: to_plain(v) for k, v in obj.items()}
    return obj

payload = {
    "years":     years,
    "months":    months,
    "cats":      cats,
    "catLabels": cat_labels,
    "filials":   filials,
    "yoy":       to_plain(yoy),
    "filial":    to_plain(filial),
}

payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
print(f"  Aggregated payload: {len(payload_json):,} bytes")

# ── Inject into dashboard HTML ───────────────────────────────────────────────
print(f"Reading {DASHBOARD_FILE} ...")
with open(DASHBOARD_FILE) as f:
    html = f.read()

# Replace const D = {...}; block
new_block = f"const D = {payload_json};"
html_new = re.sub(
    r"const D\s*=\s*\{[^;]*\};",
    new_block,
    html,
    count=1,
)

if html_new == html:
    print("  WARNING: Pattern 'const D = {...};' not found — dashboard not updated!")
    sys.exit(1)

with open(DASHBOARD_FILE, "w") as f:
    f.write(html_new)

size_kb = len(html_new) / 1024
print(f"  Dashboard updated: {DASHBOARD_FILE} ({size_kb:.1f} KB)")
print("Done.")
