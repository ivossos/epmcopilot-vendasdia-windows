#!/usr/bin/env python3
"""
Fetch VendaDia data for dashboard. Outputs JSON to data/dashboard_data.json.
OTIMIZADO: 1 request por (cenário, ano, filial, categoria) com todas contas e meses.
Run: python scripts/fetch_dashboard_data.py
"""
import asyncio
import base64
import json
import sys
from pathlib import Path

import httpx

# Load credentials from Cursor MCP config
mcp_path = Path.home() / ".cursor/mcp.json"
if not mcp_path.exists():
    print("Error: ~/.cursor/mcp.json not found", file=sys.stderr)
    sys.exit(1)
mcp = json.load(open(mcp_path))
env = mcp["mcpServers"]["epbcs-vendas"]["env"]
BASE_URL = env["EPBCS_VENDAS_URL"]
USER = env["EPBCS_VENDAS_USER"]
PASS = env["EPBCS_VENDAS_PASS"]
API = f"{BASE_URL}/HyperionPlanning/rest/v3/applications/Vendas"
token = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

PROJECT = Path(__file__).resolve().parent.parent
OUT_PATH = PROJECT / "data" / "dashboard_data.json"

POV_BASE = [
    "Real", "Trabalho", "FY26", "All BU", "Valor Original",
    "Total Categoria", "Total Canal", "Total Comprador", "Total Fornecedor",
    "Total Negocio", "Total Produto", "Total CGO", "Total Centro de Resultado",
    "All Dia", "Total Modalidade",
]

CENARIOS = [
    ("Real", "Trabalho"),
    ("Orc", "Oficial"),
    ("Orc", "Trabalho"),
    ("Orc Original", "Oficial"),
    ("Orc Original", "Trabalho"),
]

YEARS = ["FY24", "FY25", "FY26"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FILIAIS = ["All BU", "01 - SVG", "02 - APS", "TOTAL CDM", "TOTAL PEP", "TOTAL SEP", "Total ACS", "000"]
CATEGORIAS = [
    "Total Categoria",
    "All Categoria",
    "N01_7384",
    "N01_7756",
    "N01_4315",
]
ACCOUNTS = [
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

# Paralelismo: máx requests simultâneos
MAX_CONCURRENT = 8


def is_valid(val):
    if val is None:
        return False
    s = str(val).strip()
    return bool(s) and s not in ("", "#MISSING", "Missing")


async def query_batch(client, pov, scenario_label):
    """Uma request: todas contas (rows) × todos meses (columns)."""
    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "pov": {"members": [[v] for v in pov]},
            "rows": [{"members": [[acc]]} for acc in ACCOUNTS],
            "columns": [{"members": [[mo]]} for mo in MONTHS],
        }
    }
    try:
        r = await client.post(
            f"{API}/plantypes/VendaDia/exportdataslice",
            headers=headers,
            json=body,
            timeout=60,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        rows_data = data.get("rows", [])
        col_headers = data.get("columns", [])
        if col_headers and isinstance(col_headers[0], list):
            months = col_headers[0]
        elif col_headers:
            months = col_headers
        else:
            months = MONTHS[: len(rows_data[0].get("data", []))] if rows_data else []

        records = []
        yr, fil, cat = pov[2], pov[3], pov[5]
        for row in rows_data:
            acc = row.get("headers", ["?"])[0]
            vals = row.get("data", [])
            for i, v in enumerate(vals):
                if i >= len(months):
                    break
                if is_valid(v):
                    try:
                        num = float(v)
                    except (ValueError, TypeError):
                        num = 0
                    records.append({
                        "scenario": scenario_label,
                        "year": yr,
                        "month": months[i] if isinstance(months[i], str) else str(months[i]),
                        "filial": fil,
                        "categoria": cat,
                        "account": acc,
                        "value": num,
                    })
        return records
    except Exception:
        return []


async def fetch_all_async():
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    all_records = []

    async def bounded_query(client, pov, scenario_label):
        async with sem:
            return await query_batch(client, pov, scenario_label)

    async with httpx.AsyncClient() as client:
        tasks = []
        for cenario, versao in CENARIOS:
            scenario_label = f"{cenario}/{versao}"
            for yr in YEARS:
                for cat in CATEGORIAS:
                    for fil in FILIAIS:
                        pov = POV_BASE.copy()
                        pov[0], pov[1], pov[2], pov[3], pov[5] = cenario, versao, yr, fil, cat
                        tasks.append(bounded_query(client, pov, scenario_label))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, list):
                all_records.extend(r)
            elif isinstance(r, Exception):
                print(f"Error: {r}", file=sys.stderr)

    return all_records


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    print("Fetching (batch + parallel)...", flush=True)
    try:
        records = asyncio.run(fetch_all_async())
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    data = {"records": records, "source": "EPBCS VendaDia", "scenarios": [f"{c}/{v}" for c, v in CENARIOS]}
    OUT_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Saved {len(records)} records to {OUT_PATH}")


if __name__ == "__main__":
    main()
