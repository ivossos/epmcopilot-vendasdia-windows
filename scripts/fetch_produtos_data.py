#!/usr/bin/env python3
"""
fetch_produtos_data.py
----------------------
Busca dados por produto (All Produto = P-codes, último nível habilitado no VendaDia)
e por setor (totalizadores S01-S12) do cubo VendaDia para Mar/FY26.

NOTA: F-codes (Familias) NÃO estão habilitados no VendaDia (Plan Type = false).
      P-codes (All Produto) SÃO habilitados e retornam dados corretamente.
      "never share" é propriedade interna do Essbase, não impede consultas.

Cenário: Real/Trabalho  |  Tipo de Valor: Valor Original
Saída: data/produtos_data.json
"""
import asyncio
import base64
import json
import sys
import csv
from pathlib import Path

import httpx

# ── Credentials ───────────────────────────────────────────────────────────────
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
OUT_PATH = PROJECT / "data" / "produtos_data.json"

# ── Parâmetros ─────────────────────────────────────────────────────────────────
MES     = "Mar"
ANO     = "FY26"
CENARIO = "Real"
VERSAO  = "Trabalho"
LOTE    = 40      # produtos por batch
SAMPLE  = 2000    # P-codes amostrados para ranking inicial

ACCOUNTS = [
    "Total Venda",
    "Qtd Venda",
    "Lucratividade Total",
    "Custo Bruto Produto",
    "Custo Liquido Produto",
    "Promocao de Venda",
    "Impostos Venda",
]

SETORES = ["All Setor", "S01", "S02", "S03", "S04", "S05",
           "S06", "S07", "S08", "S09", "S10", "S11", "S12"]

SETOR_NAMES = {
    "All Setor": "Total Geral",
    "S01": "Açougue",
    "S02": "Frios",
    "S03": "FLV",
    "S04": "Padaria",
    "S05": "Lanchonete",
    "S06": "Casa de Massas",
    "S07": "Mercearia",
    "S08": "Cinema",
    "S09": "Serviços",
    "S10": "Material de Apoio",
    "S11": "Almoxarifado",
    "S12": "Posto Combustível",
}

# ── POV builders ───────────────────────────────────────────────────────────────
def pov_produto(setor="All Setor"):
    """15 membros no POV + Conta (rows) + Produto (columns) = 17 dimensões."""
    return [
        CENARIO, VERSAO, ANO,
        "All BU",           # Filial
        "Valor Original",   # Tipo de Valor
        setor,              # Setor
        "Total Canal",
        "Total Comprador",
        "Total Fornecedor",
        "Total Negocio",
        "Total CGO",
        "Total Centro de Resultado",
        "Total Modalidade",
        MES,                # Periodo
        "All Dia",          # Dia
    ]

def pov_setor():
    """Produto = Total Produto, Setor em columns."""
    return [
        CENARIO, VERSAO, ANO,
        "All BU",
        "Valor Original",
        "Total Canal",
        "Total Comprador",
        "Total Fornecedor",
        "Total Negocio",
        "Total Produto",    # Produto total
        "Total CGO",
        "Total Centro de Resultado",
        "Total Modalidade",
        MES,
        "All Dia",
    ]

# ── Slice query ────────────────────────────────────────────────────────────────
def is_valid(val):
    return val is not None and str(val).strip() not in ("", "#MISSING", "Missing", "#ERROR")

async def query_slice(client, pov_members, row_members, col_members, tag, plan_type="VendaDia"):
    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "pov":     {"members": [[v] for v in pov_members]},
            "rows":    [{"members": [[a]]} for a in row_members],
            "columns": [{"members": [[c]]} for c in col_members],
        }
    }
    try:
        r = await client.post(
            f"{API}/plantypes/{plan_type}/exportdataslice",
            headers=HEADERS, json=body, timeout=120,
        )
        if r.status_code != 200:
            print(f"  [WARN] {tag} HTTP {r.status_code}: {r.text[:300]}", file=sys.stderr)
            return []
        data = r.json()
    except Exception as exc:
        print(f"  [ERROR] {tag}: {exc}", file=sys.stderr)
        return []

    rows_data   = data.get("rows",    [])
    col_headers = data.get("columns", [])
    cols = col_headers[0] if (col_headers and isinstance(col_headers[0], list)) else col_members

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
                    "col":     cols[i] if isinstance(cols[i], str) else str(cols[i]),
                    "account": acc,
                    "value":   num,
                })
    return records

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    # ── Carregar metadados de produto ─────────────────────────────────────────
    prod_csv = PROJECT / "data" / "ivossos@gmail.com_ExportedMetadata_Produto.csv"
    with open(prod_csv, encoding="utf-8-sig") as f:
        rows_csv = list(csv.DictReader(f))

    # Normalizar nomes de colunas
    def col(row, *candidates):
        for c in candidates:
            for k in row:
                if k.strip() == c.strip():
                    return row[k].strip()
        return ""

    # P-codes (All Produto) — habilitados no VendaDia [Plan Type = true]
    p_codes = [col(r, "Produto") for r in rows_csv
               if col(r, " Parent", "Parent") == "All Produto"]
    f_codes = [col(r, "Produto") for r in rows_csv
               if col(r, " Parent", "Parent") == "Familias"]

    print(f"P-codes (All Produto, VendaDia=true):  {len(p_codes)}")
    print(f"F-codes (Familias,    VendaDia=false): {len(f_codes)}")

    # Alias map
    alias_map = {}
    for r in rows_csv:
        nome  = col(r, "Produto")
        alias = col(r, "Alias: Default", " Alias: Default")
        alias_map[nome] = alias or nome

    # ── Step 1: Setor totalizadores ───────────────────────────────────────────
    print("\n[1/3] Totalizadores por SETOR...")
    async with httpx.AsyncClient() as client:
        setor_recs = await query_slice(
            client,
            pov_members=pov_setor(),
            row_members=ACCOUNTS,
            col_members=SETORES,
            tag="setor",
        )
    print(f"  {len(setor_recs)} registros")

    setor_venda = {r["col"]: r["value"] for r in setor_recs
                   if r["account"] == "Total Venda"}
    top_setores = sorted([s for s in setor_venda if s != "All Setor"],
                         key=lambda x: -setor_venda.get(x, 0))
    print(f"  Top setores: {top_setores}")

    # ── Step 2: Ranking inicial P-codes ──────────────────────────────────────
    # Usar P-codes (não F-codes) — confirmado que funcionam no VendaDia
    sample = p_codes[:SAMPLE]
    batches = [sample[i:i+LOTE] for i in range(0, len(sample), LOTE)]
    print(f"\n[2/3] Ranking {len(sample)} P-codes em {len(batches)} batches (apenas Total Venda)...")

    venda_por_prod = {}
    async with httpx.AsyncClient() as client:
        for idx, batch in enumerate(batches):
            print(f"  Batch {idx+1:3d}/{len(batches)}: ", end="", flush=True)
            recs = await query_slice(
                client,
                pov_members=pov_produto("All Setor"),
                row_members=["Total Venda"],
                col_members=batch,
                tag=f"rank_{idx}",
            )
            hits = [r for r in recs if r["value"] > 0]
            for r in hits:
                venda_por_prod[r["col"]] = r["value"]
            print(f"{len(hits)} com venda")

    top100 = sorted(venda_por_prod, key=lambda x: -venda_por_prod[x])[:100]
    print(f"\n  Top 100 identificados: {len(top100)}")
    if top100:
        print(f"  #1 produto: {top100[0]} ({alias_map.get(top100[0], top100[0])}) "
              f"= R$ {venda_por_prod[top100[0]]:,.2f}")

    # ── Step 3: Dados completos dos Top 100 ──────────────────────────────────
    print(f"\n[3/3] Todos os indicadores para Top 100...")
    prod_recs_all = []

    if top100:
        batches100 = [top100[i:i+40] for i in range(0, len(top100), 40)]

        # All Setor (total geral por produto)
        async with httpx.AsyncClient() as client:
            for idx, batch in enumerate(batches100):
                print(f"  All Setor batch {idx+1}/{len(batches100)}...", end=" ", flush=True)
                recs = await query_slice(
                    client,
                    pov_members=pov_produto("All Setor"),
                    row_members=ACCOUNTS,
                    col_members=batch,
                    tag=f"top100_all_{idx}",
                )
                for r in recs:
                    r["setor"] = "All Setor"
                prod_recs_all.extend(recs)
                print(f"{len(recs)} registros")

        # Por setor (top 4 com mais venda)
        for setor in top_setores[:4]:
            async with httpx.AsyncClient() as client:
                setor_count = 0
                for idx, batch in enumerate(batches100):
                    recs = await query_slice(
                        client,
                        pov_members=pov_produto(setor),
                        row_members=ACCOUNTS,
                        col_members=batch,
                        tag=f"top100_{setor}_{idx}",
                    )
                    for r in recs:
                        r["setor"] = setor
                    prod_recs_all.extend(recs)
                    setor_count += len(recs)
            print(f"  {setor} ({SETOR_NAMES.get(setor)}): {setor_count} registros")

    # ── Salvar ────────────────────────────────────────────────────────────────
    result = {
        "meta": {
            "mes": MES, "ano": ANO,
            "cenario": f"{CENARIO}/{VERSAO}",
            "total_p_codes": len(p_codes),
            "total_f_codes": len(f_codes),
            "sample_size": len(sample),
            "nota": "P-codes usados (habilitados no VendaDia). F-codes ignorados (Plan Type=false).",
        },
        "por_setor": [
            {
                "col": r["col"],
                "setor_nome": SETOR_NAMES.get(r["col"], r["col"]),
                "account": r["account"],
                "value": r["value"],
            }
            for r in setor_recs
        ],
        "setor_venda": setor_venda,
        "top_setores": top_setores,
        "top100_prods": top100,
        "venda_por_prod": venda_por_prod,
        "prod_meta": {
            p: {"alias": alias_map.get(p, p), "venda_total": venda_por_prod.get(p, 0)}
            for p in top100
        },
        "prod_recs": prod_recs_all,
    }

    OUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\nSalvo: {OUT_PATH}")
    print(f"  por_setor: {len(result['por_setor'])} registros")
    print(f"  top100:    {len(top100)} produtos")
    print(f"  prod_recs: {len(prod_recs_all)} registros")

if __name__ == "__main__":
    asyncio.run(main())
