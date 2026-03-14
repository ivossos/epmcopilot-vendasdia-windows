#!/usr/bin/env python3
"""
Search Diario/VendaDia for non-empty data across years, months, filials, and scenarios.
Run until data is found: python find_data.py
"""
import os
import sys
import base64
import httpx
import json
from pathlib import Path

# Load credentials from Cursor MCP config
mcp_path = Path.home() / ".cursor/mcp.json"
if not mcp_path.exists():
    print("Error: ~/.cursor/mcp.json not found")
    sys.exit(1)
mcp = json.load(open(mcp_path))
env = mcp["mcpServers"]["epbcs-vendas"]["env"]
BASE = env["EPBCS_VENDAS_URL"]
USER = env["EPBCS_VENDAS_USER"]
PASS = env["EPBCS_VENDAS_PASS"]

API = f"{BASE}/HyperionPlanning/rest/v3/applications/Vendas"
token = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def has_data(val):
    if val is None:
        return False
    s = str(val).strip()
    return bool(s) and s not in ("#MISSING", "Missing", "")


def query(pt, pov, account, period):
    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "pov": {"members": [[v] for v in pov]},
            "rows": [{"members": [[account]]}],
            "columns": [{"members": [[period]]}],
        }
    }
    try:
        r = httpx.post(
            f"{API}/plantypes/{pt}/exportdataslice",
            headers=headers,
            json=body,
            timeout=30,
        )
        if r.status_code != 200:
            return None
        rows = r.json().get("rows", [])
        return rows[0].get("data", [None])[0] if rows else None
    except Exception:
        return None


def main():
    years = ["FY22", "FY23", "FY24", "FY25", "FY26", "FY27"]
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    filiais = ["All BU", "01 - SVG", "02 - APS", "000"]
    cenarios = [("Real", "Oficial"), ("Orc", "Oficial"), ("Real", "Trabalho"), ("Orc", "Trabalho")]
    accounts = [
        "Total Venda",
        "Qtd Venda",
        "Lucratividade Total",
        "Custo Bruto Produto",
        "Custo Liquido Produto",
        "Promocao de Venda",
        "Impostos Venda",
        "Comissao",
        "Verba PDV",
        "Despesa",
    ]

    base = [
        "Real", "Oficial", "FY26", "All BU", "Valor Original",
        "Total Categoria", "Total Canal", "Total Comprador", "Total Fornecedor",
        "Total Negocio", "Total Produto", "Total CGO", "Total Centro de Resultado",
        "All Dia", "Total Modalidade",
    ]

    found = []
    total = 0

    for pt in ["VendaDia", "Diario"]:
        for cen, ver in cenarios:
            base[0], base[1] = cen, ver
            for yr in years:
                base[2] = yr
                for mo in months:
                    for fil in filiais:
                        base[3] = fil
                        for acc in accounts:
                            v = query(pt, base, acc, mo)
                            total += 1
                            if has_data(v):
                                found.append(f"{pt} | {cen}/{ver} | {yr} {mo} | {fil} | {acc} = {v}")
                                print(f"FOUND: {found[-1]}")

    print(f"\nSearched {total} intersections. Found {len(found)} with data.")
    if found:
        print("\nSample data:")
        for f in found[:10]:
            print(f"  {f}")
    return 0 if found else 1


if __name__ == "__main__":
    sys.exit(main())
