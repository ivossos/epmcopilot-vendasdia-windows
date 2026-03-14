#!/usr/bin/env python3
"""
Fast search for a period with data in EPBCS VendaDia.
Uses batch queries (all accounts × all months per request) to minimize API calls.
Run: python scripts/find_period_with_data.py
"""
import base64
import json
import sys
from pathlib import Path

import httpx

# Load credentials from Cursor MCP config (same as fetch_dashboard_data)
mcp_path = Path.home() / ".cursor/mcp.json"
if not mcp_path.exists():
    print("Error: ~/.cursor/mcp.json not found")
    sys.exit(1)
mcp = json.load(open(mcp_path))
env = mcp.get("mcpServers", {}).get("epbcs-vendas", {}).get("env", {})
if not env:
    for k, v in mcp.get("mcpServers", {}).items():
        if "epbcs" in k.lower() or "vendas" in k.lower():
            env = v.get("env", {})
            break
BASE = env.get("EPBCS_VENDAS_URL", "")
USER = env.get("EPBCS_VENDAS_USER", "")
PASS = env.get("EPBCS_VENDAS_PASS", "")
if not all([BASE, USER, PASS]):
    print("Error: EPBCS_VENDAS_URL, USER, PASS not found in mcp config")
    sys.exit(1)

API = f"{BASE}/HyperionPlanning/rest/v3/applications/Vendas"
token = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# POV base: Cenario, Versao, Ano, Filial, Tipo de Valor, Setor, Canal, Comprador, Fornecedor, Negocio, Produto, CGO, Centro Resultado, Dia, Modalidade
POV_BASE = [
    "Real", "Trabalho", "FY26", "All BU", "Valor Original",
    "Total Categoria", "Total Canal", "Total Comprador", "Total Fornecedor",
    "Total Negocio", "Total Produto", "Total CGO", "Total Centro de Resultado",
    "All Dia", "Total Modalidade",
]

ACCOUNTS = ["Total Venda", "Qtd Venda", "Lucratividade Total", "Promocao de Venda"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
YEARS = ["FY26", "FY25", "FY24", "FY23"]
CENARIOS = [("Real", "Trabalho"), ("Real", "Oficial"), ("Orc", "Trabalho"), ("Orc", "Oficial")]
FILIAIS = ["All BU", "01 - SVG", "02 - APS"]


def has_data(val):
    if val is None:
        return False
    s = str(val).strip()
    return bool(s) and s not in ("", "#MISSING", "Missing")


def query_batch(pov):
    """One request: all accounts (rows) × all months (columns)."""
    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "pov": {"members": [[v] for v in pov]},
            "rows": [{"members": [[acc]]} for acc in ACCOUNTS],
            "columns": [{"members": [[mo]]} for mo in MONTHS],
        }
    }
    try:
        r = httpx.post(
            f"{API}/plantypes/VendaDia/exportdataslice",
            headers=headers,
            json=body,
            timeout=30,
        )
        if r.status_code != 200:
            return None, r.status_code, r.text[:200]
        data = r.json()
        rows_data = data.get("rows", [])
        return rows_data, r.status_code, None
    except Exception as e:
        return None, 0, str(e)


def main():
    print("Searching EPBCS VendaDia for periods with data...")
    print("(Uses batch queries: 1 request per scenario/year/filial)\n")

    found = []
    for cen, ver in CENARIOS:
        for yr in YEARS:
            for fil in FILIAIS:
                pov = POV_BASE.copy()
                pov[0], pov[1], pov[2], pov[3] = cen, ver, yr, fil
                rows_data, status, err = query_batch(pov)
                if err:
                    if status == 500 and "Essbase" in str(err):
                        print(f"\n⚠️  EPBCS Essbase unavailable (HTTP 500).")
                        print("   The Oracle cloud instance cannot connect to the Essbase backend.")
                        print("   Try again later or contact your EPBCS administrator.\n")
                        sys.exit(2)
                    continue
                if not rows_data:
                    continue
                for row in rows_data:
                    acc = row.get("headers", ["?"])[0]
                    vals = row.get("data", [])
                    for i, v in enumerate(vals):
                        if i < len(MONTHS) and has_data(v):
                            mo = MONTHS[i]
                            found.append(f"{cen}/{ver} | {yr} {mo} | {fil} | {acc} = {v}")
                            print(f"FOUND: {found[-1]}")

    if found:
        print(f"\n✅ Found {len(found)} cells with data.")
        print("\nUse these in fetch_dashboard_data.py:")
        # Extract unique year/scenario
        parts = found[0].split(" | ")
        yr = parts[1].split()[0] if len(parts) > 1 else "FY26"
        cen_ver = parts[0] if parts else "Real/Trabalho"
        print(f"  Year: {yr}, Scenario: {cen_ver}")
        return 0
    else:
        print("\n❌ No data found. EPBCS may be down or cube may be empty.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
