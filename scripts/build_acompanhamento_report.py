#!/usr/bin/env python3
"""
Build Acompanhamento Diário de Vendas report from VendaDia data.
Reads data/dashboard_data.json and outputs reports/acompanhamento_diario.html.
Run: python scripts/build_acompanhamento_report.py
"""
import json
from pathlib import Path
from collections import defaultdict

PROJECT = Path(__file__).resolve().parent.parent
DATA_FILE = PROJECT / "data" / "dashboard_data.json"
OUT_FILE = PROJECT / "reports" / "acompanhamento_diario.html"

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
YEARS = ["FY24", "FY25", "FY26"]
FILIAIS_ORDER = ["01 - SVG", "02 - APS", "TOTAL CDM", "TOTAL PEP", "TOTAL SEP", "Total ACS", "000", "All BU"]


def load_records():
    with open(DATA_FILE) as f:
        data = json.load(f)
    return data.get("records", data) if isinstance(data, dict) else data


def aggregate_by_filial_year_month_scenario(records):
    """Aggregate: (filial, scenario) -> year -> month -> {account: value}"""
    out = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
    for r in records:
        scn = r.get("scenario", "")
        yr = r.get("year", "")
        mo = r.get("month", "")
        fil = r.get("filial", "")
        acc = r.get("account", "")
        val = float(r.get("value") or 0)
        if not yr or not mo or not acc:
            continue
        key = (fil, scn)
        out[key][yr][mo][acc] += val
    return out


def build_report_data(records):
    agg = aggregate_by_filial_year_month_scenario(records)
    filiais_set = set()
    for (fil, _) in agg.keys():
        if fil and fil not in ("All BU", "All_BU"):
            filiais_set.add(fil)
    filiais = sorted(filiais_set, key=lambda x: (FILIAIS_ORDER.index(x) if x in FILIAIS_ORDER else 99, x))
    if not filiais:
        filiais = list(set(f for (f, _) in agg.keys() if f))

    yr_cur = "FY26"
    yr_aa = "FY25"
    months_with_data = [m for m in MONTHS if any(
        agg.get((f, "Real/Trabalho"), {}).get(yr_cur, {}).get(m, {}).get("Total Venda", 0) > 0
        for f in filiais
    )]
    if not months_with_data:
        months_with_data = MONTHS[:3]

    rows = []
    for fil in filiais:
        cur = agg.get((fil, "Real/Trabalho"), {}).get(yr_cur, {})
        orc = agg.get((fil, "Orc/Trabalho"), {}).get(yr_cur, {})
        if not orc:
            orc = agg.get((fil, "Orc/Oficial"), {}).get(yr_cur, {})
        aa = agg.get((fil, "Real/Trabalho"), {}).get(yr_aa, {})

        venda_ytd = sum(cur.get(m, {}).get("Total Venda", 0) for m in months_with_data)
        orc_ytd = sum(orc.get(m, {}).get("Total Venda", 0) for m in months_with_data)
        venda_aa_ytd = sum(aa.get(m, {}).get("Total Venda", 0) for m in months_with_data)
        promo_ytd = sum(cur.get(m, {}).get("Promocao de Venda", 0) for m in months_with_data)
        luc_ytd = sum(cur.get(m, {}).get("Lucratividade Total", 0) for m in months_with_data)

        pct_ating = (venda_ytd / orc_ytd * 100) if orc_ytd and orc_ytd > 0 else None
        var_aa = ((venda_ytd - venda_aa_ytd) / venda_aa_ytd * 100) if venda_aa_ytd and venda_aa_ytd > 0 else None
        pct_promo = (promo_ytd / venda_ytd * 100) if venda_ytd and venda_ytd > 0 else None
        pct_margem = (luc_ytd / venda_ytd * 100) if venda_ytd and venda_ytd > 0 else None

        rows.append({
            "filial": fil,
            "cota_mes": orc_ytd or None,
            "cota": orc_ytd or None,
            "venda": venda_ytd,
            "pct_ating": pct_ating,
            "venda_aa": venda_aa_ytd,
            "var_aa": var_aa,
            "pct_promo": pct_promo,
            "objetiva": pct_margem,
        })
    return {
        "filiais": filiais,
        "rows": rows,
        "year": yr_cur,
        "year_aa": yr_aa,
        "months": months_with_data,
    }


def fmt_num(v):
    if v is None:
        return "—"
    a = abs(v)
    if a >= 1e9:
        return f"R$ {v/1e9:.2f}B"
    if a >= 1e6:
        return f"R$ {v/1e6:.1f}M"
    return f"R$ {v:,.0f}"


def fmt_pct(v):
    if v is None:
        return "—"
    return f"{v:.1f}%"


def render_html(report_data):
    rows_html = ""
    for r in report_data["rows"]:
        rows_html += f"""
        <tr>
          <td><strong>{r['filial']}</strong></td>
          <td class="num">{fmt_num(r['cota_mes'])}</td>
          <td class="num">{fmt_num(r['cota'])}</td>
          <td class="num">{fmt_num(r['venda'])}</td>
          <td class="num pct">{fmt_pct(r['pct_ating'])}</td>
          <td class="num">{fmt_num(r['venda_aa'])}</td>
          <td class="num var {'pos' if r['var_aa'] and r['var_aa'] >= 0 else 'neg'}">{fmt_pct(r['var_aa'])}</td>
          <td class="num pct">{fmt_pct(r['pct_promo'])}</td>
          <td class="num pct">{fmt_pct(r['objetiva'])}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acompanhamento Diário de Vendas — Savegnago</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {{ --red:#c41e3a; --bg:#0b0f14; --card:#1a2332; --border:rgba(255,255,255,0.07); --text:#e2e8f0; --muted:#64748b; }}
* {{ box-sizing:border-box; margin:0; padding:0; }}
body {{ font-family:'Outfit',sans-serif; background:var(--bg); color:var(--text); min-height:100vh; padding:1.5rem 2rem; }}
.hdr {{ background:linear-gradient(135deg,#9e1830,var(--red)); padding:1rem 1.5rem; border-radius:12px; margin-bottom:1.5rem; display:flex; align-items:center; gap:1rem; }}
.hdr h1 {{ font-size:1.25rem; font-weight:700; color:#fff; }}
.hdr .sub {{ font-size:.8rem; color:rgba(255,255,255,.8); }}
.pov {{ display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; font-size:.8rem; color:var(--muted); }}
.pov span {{ background:var(--card); padding:.25rem .6rem; border-radius:6px; border:1px solid var(--border); }}
.section {{ margin-bottom:1rem; }}
.section h2 {{ font-size:.9rem; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:.6rem; }}
.card {{ background:var(--card); border-radius:12px; border:1px solid var(--border); overflow:hidden; }}
table {{ width:100%; border-collapse:collapse; font-size:.85rem; }}
th {{ text-align:left; padding:.6rem .85rem; background:rgba(0,0,0,.2); color:var(--muted); font-weight:600; font-size:.7rem; text-transform:uppercase; letter-spacing:.04em; }}
td {{ padding:.5rem .85rem; border-bottom:1px solid var(--border); }}
td.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
td.num.pct {{ color:#94a3b8; }}
td.num.var.pos {{ color:#4ade80; }}
td.num.var.neg {{ color:#f87171; }}
tr:hover td {{ background:rgba(255,255,255,.03); }}
.ds {{ font-size:.7rem; color:var(--muted); margin-top:1rem; }}
</style>
</head>
<body>
<header class="hdr">
  <div>
    <h1>Acompanhamento Diário de Vendas</h1>
    <div class="sub">Fonte: EPBCS VendaDia · {report_data['year']} YTD ({', '.join(report_data['months'][:3])}{'...' if len(report_data['months'])>3 else ''})</div>
  </div>
</header>
<div class="pov">
  <span>Periodo: Default</span>
  <span>Negocio: Descendants of Total</span>
  <span>Canal: Descendants of Total</span>
  <span>Setor: Descendants of Total</span>
  <span>Comprador: Descendants of Total</span>
  <span>Fornecedor: Descendants of Total</span>
  <span>Produto: Total Produto</span>
  <span>Tipo de Valor: Valor Final</span>
</div>
<div class="section">
  <h2>Por Filial</h2>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Filial</th>
          <th class="num">Cota Mês</th>
          <th class="num">Cota</th>
          <th class="num">Venda</th>
          <th class="num">% Ating</th>
          <th class="num">Venda AA</th>
          <th class="num">Δ vs AA</th>
          <th class="num">% Promo</th>
          <th class="num">Objetiva</th>
        </tr>
      </thead>
      <tbody>
        {rows_html}
      </tbody>
    </table>
  </div>
</div>
<div class="section">
  <h2>Desempenho de Vendas</h2>
  <p class="ds">Métricas calculadas a partir dos dados VendaDia: Venda (Real/Trabalho), Cota (Orçamento), Venda AA (ano anterior), % Promo (Promocao de Venda/Total Venda), Objetiva (% Margem = Lucratividade/Total Venda).</p>
</div>
</body>
</html>"""


def main():
    records = load_records()
    report_data = build_report_data(records)
    html = render_html(report_data)
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"Report saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
