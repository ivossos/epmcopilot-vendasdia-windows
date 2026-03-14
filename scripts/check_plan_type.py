#!/usr/bin/env python3
"""
check_plan_type.py — Engenharia: Validação de membros por Plan Type
====================================================================

PROBLEMA IDENTIFICADO (Mar 2026):
  Ao tentar exportar dados por produto do VendaDia, as queries de F-codes
  (dimensão Produto, parent = "Familias") falhavam com HTTP 400.

  Causa raiz: F-codes têm Plan Type (VendaDia) = FALSE nos metadados.
  Apenas P-codes (parent = "All Produto") são habilitados no VendaDia.

  O atributo "Data Storage = never share" é interno do Essbase e NÃO
  impede consultas — foi uma pista falsa.

REGRA GERAL:
  Antes de usar membros de uma dimensão em queries do VendaDia (ou qualquer
  plan type), verifique a coluna "Plan Type (VendaDia)" no CSV de metadados.
  Apenas membros com valor TRUE nessa coluna podem ser usados como filtros
  ou em linhas/colunas do exportdataslice.

USO:
  python3 scripts/check_plan_type.py --dim Produto --plan VendaDia
  python3 scripts/check_plan_type.py --dim Produto --plan VendaDia --parent "Familias"
  python3 scripts/check_plan_type.py --dim Conta --plan VendaDia --show-all

SAÍDA:
  Para cada parent-group da dimensão, mostra quantos membros são habilitados
  e quantos não são — e avisa se você vai usar membros inválidos.
"""
import argparse
import csv
import sys
from pathlib import Path
from collections import defaultdict

PROJECT = Path(__file__).resolve().parent.parent
DATA    = PROJECT / "data"

def load_metadata(dim: str) -> list[dict]:
    """Carrega CSV de metadados para uma dimensão."""
    csv_files = list(DATA.glob(f"*ExportedMetadata_{dim}.csv"))
    if not csv_files:
        # Tenta nome sem acentos / case-insensitive
        csv_files = [f for f in DATA.glob("*ExportedMetadata_*.csv")
                     if dim.lower() in f.stem.lower()]
    if not csv_files:
        print(f"[ERRO] Não encontrei CSV de metadados para dimensão '{dim}'", file=sys.stderr)
        print(f"       Arquivos disponíveis:", file=sys.stderr)
        for f in sorted(DATA.glob("*ExportedMetadata_*.csv")):
            print(f"         {f.name}", file=sys.stderr)
        sys.exit(1)
    with open(csv_files[0], encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

def norm(d: dict, key: str) -> str:
    """Normaliza leitura de campo — lida com espaços extras nos nomes de coluna."""
    for k, v in d.items():
        if k.strip() == key.strip():
            return v.strip()
    return ""

def plan_type_col(row: dict, plan: str) -> str:
    """Busca coluna 'Plan Type (VendaDia)' no dict de forma tolerante."""
    target = f"Plan Type ({plan})"
    for k in row:
        if k.strip() == target:
            return row[k].strip()
    # Fallback: busca case-insensitive
    for k in row:
        if target.lower() in k.lower():
            return row[k].strip()
    return "?"

def check_members(members: list[str], rows: list[dict], dim: str, plan: str) -> tuple[list, list]:
    """
    Verifica quais membros da lista estão habilitados para o plan type.
    Retorna (enabled, disabled).
    """
    member_col = dim  # nome da coluna = nome da dimensão (geralmente)
    pt_map = {}
    for row in rows:
        nome = norm(row, member_col) or norm(row, " " + member_col)
        if not nome:
            # Tenta a primeira coluna que parece um código de membro
            nome = list(row.values())[0].strip()
        pt = plan_type_col(row, plan)
        pt_map[nome] = pt.lower() in ("true", "1", "yes", "sim")

    enabled  = [m for m in members if pt_map.get(m, False)]
    disabled = [m for m in members if not pt_map.get(m, False)]
    return enabled, disabled

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dim",    required=True, help="Nome da dimensão (ex: Produto, Conta, Filial)")
    parser.add_argument("--plan",   default="VendaDia", help="Plan Type (default: VendaDia)")
    parser.add_argument("--parent", default=None, help="Filtrar por parent específico")
    parser.add_argument("--show-all", action="store_true", help="Mostrar todos os grupos, não só problemáticos")
    args = parser.parse_args()

    rows = load_metadata(args.dim)
    dim_col = args.dim

    # Descobrir coluna do nome do membro e do parent
    if not rows:
        print("[ERRO] CSV vazio", file=sys.stderr); sys.exit(1)

    first = rows[0]
    member_key = next((k for k in first if k.strip() == dim_col), None)
    parent_key = next((k for k in first if k.strip() == "Parent" or k.strip() == " Parent"), None)
    pt_key     = next((k for k in first if f"Plan Type ({args.plan})" in k), None)

    if not member_key:
        print(f"[AVISO] Coluna '{dim_col}' não encontrada. Colunas disponíveis: {list(first.keys())[:6]}", file=sys.stderr)

    print(f"\n{'═'*70}")
    print(f"  Dimensão : {args.dim}")
    print(f"  Plan Type: {args.plan}")
    print(f"  CSV      : {len(rows):,} membros")
    print(f"  Coluna PT: {pt_key or 'NÃO ENCONTRADA'}")
    print(f"{'═'*70}\n")

    if not pt_key:
        print("[ERRO] Coluna Plan Type não encontrada neste CSV.")
        print("       Plan types disponíveis neste CSV:")
        for k in first:
            if "Plan Type" in k:
                print(f"         '{k}'")
        sys.exit(1)

    # Agrupar por parent
    by_parent = defaultdict(list)
    for row in rows:
        parent = row.get(parent_key, "?").strip() if parent_key else "?"
        nome   = row.get(member_key, "").strip() if member_key else ""
        pt_val = row.get(pt_key, "").strip()
        enabled = pt_val.lower() in ("true", "1", "yes", "sim")
        by_parent[parent].append({
            "name": nome, "plan_enabled": enabled, "pt_raw": pt_val,
            "storage": norm(row, f"Data Storage ({args.plan})"),
        })

    # Filtrar parent se especificado
    parents_to_show = [args.parent] if args.parent else sorted(by_parent.keys())

    total_ok, total_nok = 0, 0
    for parent in parents_to_show:
        members = by_parent.get(parent, [])
        if not members:
            print(f"[AVISO] Parent '{parent}' não encontrado."); continue

        enabled_list  = [m for m in members if m["plan_enabled"]]
        disabled_list = [m for m in members if not m["plan_enabled"]]
        total_ok  += len(enabled_list)
        total_nok += len(disabled_list)

        has_problem = len(disabled_list) > 0
        if not args.show_all and not has_problem:
            continue  # Pula grupos sem problemas

        icon = "⚠️ " if len(disabled_list) == len(members) else ("✅ " if len(disabled_list) == 0 else "🔶 ")
        print(f"{icon}Parent: {parent}")
        print(f"   Total   : {len(members):,}")
        print(f"   ✅ Habilitados ({args.plan}): {len(enabled_list):,}")
        print(f"   ❌ Desabilitados            : {len(disabled_list):,}")

        if disabled_list:
            print(f"   ❌ Motivo: Plan Type ({args.plan}) = false")
            print(f"   💡 Não use esses membros em rows/columns do exportdataslice!")
            # Mostrar exemplos
            examples = disabled_list[:5]
            print(f"   Exemplos desabilitados: {[m['name'] for m in examples]}")

        if enabled_list:
            examples = enabled_list[:3]
            print(f"   Exemplos habilitados  : {[m['name'] for m in examples]}")

        # Verificar storage (never share, store, dynamic calc)
        storages = set(m["storage"] for m in members if m["storage"])
        if storages:
            print(f"   Data Storage valores  : {storages}")
            if "never share" in storages:
                print(f"   ℹ️  'never share' = propriedade interna Essbase, NÃO impede consultas")

        print()

    # Resumo global
    print(f"{'═'*70}")
    print(f"  RESUMO GLOBAL — {args.dim} × {args.plan}")
    print(f"  ✅ Total habilitados    : {total_ok:,}")
    print(f"  ❌ Total desabilitados  : {total_nok:,}")
    print(f"  📋 Use apenas os {total_ok:,} membros habilitados em queries do {args.plan}!")
    print(f"{'═'*70}\n")

    # Recomendação de código Python
    if args.parent:
        print("  # Código Python para filtrar apenas membros habilitados:")
        print("  # ─────────────────────────────────────────────────────")
        print(f"  # with open(csv_path) as f:")
        print(f"  #     rows = list(csv.DictReader(f))")
        print(f"  # valid_members = [")
        print(f"  #     r['{dim_col}'].strip() for r in rows")
        print(f"  #     if r.get(' Parent','').strip() == '{args.parent}'")
        print(f"  #     and r.get('Plan Type ({args.plan})','').strip().lower() == 'true'")
        print(f"  # ]")

if __name__ == "__main__":
    main()
