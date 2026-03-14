#!/usr/bin/env python3
"""
fetch_vendasdia_data.py
-----------------------
Fetches daily VendaDia data from Oracle EPBCS for the Acompanhamento Diário
de Vendas dashboard. Outputs data/vendasdia_data.json.

Queries (all async / parallel):
  por_dia          – contas × Dia 1-31   (All BU, mes atual)
  por_filial       – contas × TODOS os nós da hierarquia Filial (grupos + folhas)
                     → dividido em 4 batches para não sobrecarregar a API
  por_canal        – contas × Canal
  por_categoria    – contas × Categoria/Setor

Substitution variables (dia_realizado, mes_realizado, ano_realizado, ano_orc)
lidas do endpoint /substitutionvariables.

Usage:
    python scripts/fetch_vendasdia_data.py [--mes Mar] [--ano FY26]
"""
import argparse
import asyncio
import base64
import json
import sys
from datetime import datetime
from pathlib import Path

import httpx

# ── Credentials ──────────────────────────────────────────────────────────────
mcp_path = Path.home() / ".cursor/mcp.json"
if not mcp_path.exists():
    print("Error: ~/.cursor/mcp.json not found", file=sys.stderr)
    sys.exit(1)
mcp  = json.load(open(mcp_path))
env  = mcp["mcpServers"]["epbcs-vendas"]["env"]
BASE_URL = env["EPBCS_VENDAS_URL"]
USER     = env["EPBCS_VENDAS_USER"]
PASS     = env["EPBCS_VENDAS_PASS"]

APP     = "Vendas"
API     = f"{BASE_URL}/HyperionPlanning/rest/v3/applications/{APP}"
token   = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
HEADERS = {
    "Authorization": f"Basic {token}",
    "Content-Type":  "application/json",
    "Accept":        "application/json",
}

PROJECT  = Path(__file__).resolve().parent.parent
OUT_PATH = PROJECT / "data" / "vendasdia_data.json"

MAX_CONCURRENT = 8

# ── Hierarquia de filiais ─────────────────────────────────────────────────────
# Nós intermediários (totalizadores)
FILIAIS_GRUPOS = [
    "All BU",
    "01 - SVG", "TOTAL SVG", "TOTAL PLT", "TOTAL PRT", "TOTAL CDS", "TOTAL ADM",
    "02 - APS",  "TOTAL APS",
    "TOTAL CDM", "TOTAL PEP", "TOTAL SEP",
    "Total ACS", "000",
]

# Lojas folha — divididas em batches de ~30 para não sobrecarregar a API
FILIAIS_SVG_A = [f"SVG{str(i).zfill(4)}" for i in range(1, 34)]    # SVG0001-SVG0033
FILIAIS_SVG_B = [f"SVG{str(i).zfill(4)}" for i in range(34, 66)    # SVG0034-SVG0065
                 if i != 64]                                         # SVG0064 não existe
FILIAIS_OUTROS = (
    [f"PLT{str(i).zfill(4)}" for i in range(1, 16)]  +  # PLT0001-PLT0015
    [f"PRT{str(i).zfill(4)}" for i in range(1,  4)]  +  # PRT0001-PRT0003
    ["CDM0001"] +
    [f"CDS{str(i).zfill(4)}" for i in range(1,  9)]  +  # CDS0001-CDS0008
    [f"ADM{str(i).zfill(4)}" for i in range(1,  3)]  +  # ADM0001-ADM0002
    [f"APS{str(i).zfill(4)}" for i in range(0,  8)]  +  # APS0000-APS0007
    ["ACS0001", "0000000"]
)

# Outros eixos
DIAS       = [str(d) for d in range(1, 32)]
CANAIS     = ["C01", "C02", "C03", "C04", "C06", "C08", "C09", "C10"]
CATEGORIAS = ["Total Categoria", "All Categoria", "N01_7384", "N01_7756", "N01_4315"]

ACCOUNTS = [
    "Total Venda", "Qtd Venda", "Lucratividade Total",
    "Custo Bruto Produto", "Custo Liquido Produto",
    "Promocao de Venda", "Impostos Venda", "Comissao",
]

CENARIOS = [
    ("Real",         "Trabalho"),
    ("Orc",          "Oficial"),
    ("Orc Original", "Oficial"),
]

# ── POV base ─────────────────────────────────────────────────────────────────
BASE_COMMON = [
    "Valor Original",
    "Total Comprador", "Total Fornecedor", "Total Negocio",
    "Total Produto",   "Total CGO",        "Total Centro de Resultado",
    "Total Modalidade",
]

def pov_por_dia(c, v, ano, mes):
    return [c, v, ano, "All BU", *BASE_COMMON, "Total Categoria", "Total Canal", mes]

def pov_por_filial(c, v, ano, mes):
    return [c, v, ano, *BASE_COMMON, "Total Categoria", "Total Canal", mes, "All Dia"]

def pov_por_canal(c, v, ano, mes):
    return [c, v, ano, "All BU", *BASE_COMMON, "Total Categoria", mes, "All Dia"]

def pov_por_categoria(c, v, ano, mes):
    return [c, v, ano, "All BU", *BASE_COMMON, "Total Canal", mes, "All Dia"]

# ── HTTP helper ───────────────────────────────────────────────────────────────
def is_valid(val):
    return val is not None and str(val).strip() not in ("", "#MISSING", "Missing", "#ERROR")

async def query_slice(client, sem, pov_members, row_members, col_members,
                      scenario_label, dim_tag):
    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "pov":     {"members": [[v] for v in pov_members]},
            "rows":    [{"members": [[a]]} for a in row_members],
            "columns": [{"members": [[c]]} for c in col_members],
        }
    }
    async with sem:
        try:
            r = await client.post(
                f"{API}/plantypes/VendaDia/exportdataslice",
                headers=HEADERS, json=body, timeout=120,
            )
            if r.status_code != 200:
                print(f"  [WARN] {scenario_label}/{dim_tag} → HTTP {r.status_code}", file=sys.stderr)
                return []
            data = r.json()
        except Exception as exc:
            print(f"  [ERROR] {scenario_label}/{dim_tag}: {exc}", file=sys.stderr)
            return []

    rows_data   = data.get("rows",    [])
    col_headers = data.get("columns", [])
    cols = col_headers[0] if (col_headers and isinstance(col_headers[0], list)) else (col_headers or col_members)

    records = []
    for row in rows_data:
        acc  = row.get("headers", ["?"])[0]
        vals = row.get("data", [])
        for i, v in enumerate(vals):
            if i >= len(cols):
                break
            if is_valid(v):
                try:
                    num = float(v)
                except (ValueError, TypeError):
                    continue
                records.append({
                    "scenario": scenario_label,
                    "dim_tag":  dim_tag,
                    "col":      cols[i] if isinstance(cols[i], str) else str(cols[i]),
                    "account":  acc,
                    "value":    num,
                })
    return records

async def fetch_subst_vars(client):
    try:
        r = await client.get(f"{API}/substitutionvariables", headers=HEADERS, timeout=30)
        if r.status_code == 200:
            data  = r.json()
            items = data.get("items", data) if isinstance(data, dict) else data
            if isinstance(items, list):
                return {sv["name"]: sv["value"] for sv in items if "name" in sv and "value" in sv}
    except Exception as exc:
        print(f"  [WARN] substitution vars: {exc}", file=sys.stderr)
    return {}

# ── Fetch ─────────────────────────────────────────────────────────────────────
async def fetch_all(mes, ano):
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    tasks = []

    async with httpx.AsyncClient() as client:
        print("  → substitution variables …")
        subst = await fetch_subst_vars(client)

        for c, v in CENARIOS:
            lbl = f"{c}/{v}"

            # 1. Por dia
            tasks.append(query_slice(client, sem, pov_por_dia(c, v, ano, mes),
                                     ACCOUNTS, DIAS, lbl, "por_dia"))

            # 2. Por filial — 4 batches cobrindo toda a hierarquia
            for batch_tag, batch in [
                ("por_filial", FILIAIS_GRUPOS),
                ("por_filial", FILIAIS_SVG_A),
                ("por_filial", FILIAIS_SVG_B),
                ("por_filial", FILIAIS_OUTROS),
            ]:
                tasks.append(query_slice(client, sem, pov_por_filial(c, v, ano, mes),
                                         ACCOUNTS, batch, lbl, batch_tag))

            # 3. Por canal
            tasks.append(query_slice(client, sem, pov_por_canal(c, v, ano, mes),
                                     ACCOUNTS, CANAIS, lbl, "por_canal"))

            # 4. Por categoria
            tasks.append(query_slice(client, sem, pov_por_categoria(c, v, ano, mes),
                                     ACCOUNTS, CATEGORIAS, lbl, "por_categoria"))

        print(f"  → {len(tasks)} queries em paralelo …")
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_records = []
    for r in results:
        if isinstance(r, list):
            all_records.extend(r)
        elif isinstance(r, Exception):
            print(f"  [ERROR] {r}", file=sys.stderr)

    return subst, all_records

# ── Build output ──────────────────────────────────────────────────────────────
def build_output(subst, records, mes, ano):
    dia_realizado = int(subst.get("Dia_Realizado", 0))
    mes_realizado = subst.get("Mes_Realizado", mes)
    ano_realizado = subst.get("Ano_Realizado", ano)
    ano_orc       = subst.get("Ano_Orc",       ano)

    def clean(tag):
        return [
            {"scenario": r["scenario"], "col": r["col"],
             "account": r["account"],   "value": r["value"]}
            for r in records if r["dim_tag"] == tag
        ]

    return {
        "meta": {
            "dia_realizado": dia_realizado,
            "mes_realizado": mes_realizado,
            "ano_realizado": ano_realizado,
            "ano_orc":       ano_orc,
            "mes_query":     mes,
            "ano_query":     ano,
            "generated_at":  datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source":        "EPBCS VendaDia",
        },
        "por_dia":       clean("por_dia"),
        "por_filial":    clean("por_filial"),   # inclui grupos + todas as lojas folha
        "por_canal":     clean("por_canal"),
        "por_categoria": clean("por_categoria"),
    }

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mes", default="Mar",  help="Membro Periodo (ex: Mar)")
    ap.add_argument("--ano", default="FY26", help="Membro Ano (ex: FY26)")
    args = ap.parse_args()

    print(f"Fetching VendasDia  mes={args.mes}  ano={args.ano} …")
    subst, records = asyncio.run(fetch_all(args.mes, args.ano))
    output = build_output(subst, records, args.mes, args.ano)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    counts = {k: len(output[k]) for k in ("por_dia", "por_filial", "por_canal", "por_categoria")}
    print(f"Saved → {OUT_PATH}")
    for k, n in counts.items():
        print(f"  {k}: {n} registros")
    print(f"  dia_realizado={output['meta']['dia_realizado']}  "
          f"mes={output['meta']['mes_realizado']}  ano={output['meta']['ano_realizado']}")

if __name__ == "__main__":
    main()
