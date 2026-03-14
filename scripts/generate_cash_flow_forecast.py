#!/usr/bin/env python3
"""
Cash Flow 90-Day Rolling Forecast Generator
============================================
Generates a 90-day rolling daily cash flow forecast for FMCG retail
anchored to Oracle EPBCS VendaDia planning accounts.

Operational Flow Model:
  Inflows  — Revenue collections with timing lag (Pix/cash D0, card D1-30, B2B D31-60)
  Outflows — Supplier payments (perecíveis D1-3, fuel D7-14, grocery D30-45)
             Tax cash-out (10th of following month)
             Payroll (40% on 5th, 60% last day of month)
             Commissions (D0), Promotions (15th next month), Verba PDV (D+30)

Predictive Algorithm:
  1. Trailing 3-month WMA as run-rate anchor
  2. Annual growth projection (8% FMCG/inflationary, account-specific)
  3. Monthly seasonality (Brazilian FMCG calendar)
  4. Day-of-week + week-of-month intra-month distribution
  5. Budget blend where available (70% projection / 30% budget)

Usage:
    python scripts/generate_cash_flow_forecast.py
Output:
    data/cash_flow_forecast.json
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
INPUT_FILE  = os.path.join(DATA_DIR, 'dashboard_data.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'cash_flow_forecast.json')

TODAY         = date.today()
FORECAST_DAYS = 90

# Opening balance — set via --opening-balance CLI arg or OPENING_BALANCE env var.
# Represents the cash & equivalents balance at start of the forecast window.
# Example: R$200M → pass  --opening-balance 200000000
_DEFAULT_OPENING_BALANCE = float(os.environ.get('OPENING_BALANCE', '0'))

# ──────────────────────────────────────────────────────────────────────────────
# Seasonality factors
# ──────────────────────────────────────────────────────────────────────────────

# Day-of-week (Mon=0 … Sun=6) — FMCG Brazilian supermarket pattern
DOW_FACTORS = {0: 0.84, 1: 0.87, 2: 0.91, 3: 0.95, 4: 1.07, 5: 1.30, 6: 1.06}

# Monthly seasonality — Brazilian FMCG retail (1.0 = average month)
MONTH_FACTORS = {
    1:  0.90,   # Jan — post-holiday pull-back
    2:  0.87,   # Feb — Carnaval slowdown
    3:  0.96,   # Mar — recovery
    4:  1.07,   # Apr — Easter, Tiradentes long-weekend
    5:  0.98,   # May — Dia das Mães boost (2nd week)
    6:  1.01,   # Jun — festas juninas, school holidays start
    7:  1.04,   # Jul — school holidays peak
    8:  0.97,   # Aug — mid-year slowdown
    9:  0.96,   # Sep — slowest quarter
    10: 1.02,   # Oct — Dia das Crianças
    11: 1.13,   # Nov — Black Friday, pre-Christmas loading
    12: 1.40,   # Dec — Christmas, 13th salary spending
}

# Week-of-month factor (1–5)
WEEK_FACTORS = {1: 0.93, 2: 1.00, 3: 1.02, 4: 1.05, 5: 1.08}

# Annual growth rates by planning account (nominal, includes Brazil CPI ~4%)
GROWTH_RATES = {
    'Total Venda':          0.085,
    'Custo Bruto Produto':  0.075,
    'Custo Liquido Produto':0.075,
    'Impostos Venda':       0.085,
    'Comissao':             0.065,
    'Promocao de Venda':    0.100,
    'Despesa':              0.055,
    'Verba PDV':            0.080,
    'Lucratividade Total':  0.120,
}

# ──────────────────────────────────────────────────────────────────────────────
# Operational flow profiles
# ──────────────────────────────────────────────────────────────────────────────

def _build_collection_profile():
    """Revenue → Cash received timing.
    60% D0 (Pix, debit, cash), 30% spread D1-D30 (credit card ~18d avg),
    10% spread D31-D60 (B2B/wholesale credit)."""
    p = defaultdict(float)
    p[0] = 0.60
    for d in range(1, 31):
        p[d] += 0.30 / 30
    for d in range(31, 61):
        p[d] += 0.10 / 30
    return dict(p)

def _build_payment_profile():
    """COGS → Supplier payments timing.
    Perecíveis (30% of COGS): D1-D3, Combustível (20%): D7-D14, Mercearia (50%): D30-D45."""
    p = defaultdict(float)
    for d in range(1, 4):
        p[d] += 0.30 / 3
    for d in range(7, 15):
        p[d] += 0.20 / 8
    for d in range(30, 46):
        p[d] += 0.50 / 16
    return dict(p)

COLLECTION_PROFILE = _build_collection_profile()
PAYMENT_PROFILE    = _build_payment_profile()

# Payroll as fraction of Despesa account
PAYROLL_FRACTION = 0.35

# ── Data quality: floor rates for accounts with missing EPBCS data ──────────
# "Promocao de Venda" in Brazilian FMCG EPM is a REVENUE sub-account
# (promotional sales tracked separately for mix analysis). It is NOT a cash
# outflow — the cash was already captured in Total Venda. Never treat as cost.
PROMO_IS_REVENUE_ACCOUNT = True   # flag: removes it from outflow computation

# "Despesa" (OpEx: payroll, logistics, overhead) is often missing in
# VendaDia exports at the consolidated BU level. Industry benchmark for
# Brazilian FMCG supermarkets that OWN their stores (no rent): ~13% of gross revenue.
# Note: aluguel (rent) is excluded — Savegnago owns its properties.
DESPESA_FLOOR_PCT  = 0.13   # applied when actual Despesa < threshold
DESPESA_FLOOR_THRESHOLD = 0.03   # if actual < 3% of revenue → use benchmark

# "Comissao" similarly can be sparse; benchmark ~0.8% of revenue
COMISSAO_FLOOR_PCT       = 0.008
COMISSAO_FLOOR_THRESHOLD = 0.001

BUDGET_WEIGHT = 0.30   # fraction of budget data blended into run-rate projection

# ──────────────────────────────────────────────────────────────────────────────
# Assumptions override  — reads config/assumptions.json (written by the UI)
# ──────────────────────────────────────────────────────────────────────────────

def _load_assumptions():
    """Override module-level constants from config/assumptions.json if present."""
    global DOW_FACTORS, MONTH_FACTORS, WEEK_FACTORS, GROWTH_RATES
    global COLLECTION_PROFILE, PAYMENT_PROFILE
    global PAYROLL_FRACTION, DESPESA_FLOOR_PCT, COMISSAO_FLOOR_PCT, BUDGET_WEIGHT
    global _DEFAULT_OPENING_BALANCE

    cfg = os.environ.get('ASSUMPTIONS_FILE') or os.path.join(SCRIPT_DIR, '..', 'config', 'assumptions.json')
    if not os.path.exists(cfg):
        return
    with open(cfg) as f:
        a = json.load(f)

    if 'dow_factors' in a:
        DOW_FACTORS = {int(k): float(v) for k, v in a['dow_factors'].items()}
    if 'month_factors' in a:
        MONTH_FACTORS = {int(k): float(v) for k, v in a['month_factors'].items()}
    if 'week_factors' in a:
        WEEK_FACTORS = {int(k): float(v) for k, v in a['week_factors'].items()}
    if 'growth_rates' in a:
        GROWTH_RATES.update(a['growth_rates'])
    if 'payroll_fraction' in a:
        PAYROLL_FRACTION = float(a['payroll_fraction'])
    if 'despesa_floor_pct' in a:
        DESPESA_FLOOR_PCT = float(a['despesa_floor_pct'])
    if 'comissao_floor_pct' in a:
        COMISSAO_FLOOR_PCT = float(a['comissao_floor_pct'])
    if 'budget_weight' in a:
        BUDGET_WEIGHT = float(a['budget_weight'])
    if 'opening_balance' in a and not os.environ.get('OPENING_BALANCE'):
        _DEFAULT_OPENING_BALANCE = float(a['opening_balance'])

    if 'collection' in a:
        c = a['collection']
        p = defaultdict(float)
        p[0] = float(c['pix_cash_pct'])
        card_span = int(c['card_days_max']) - int(c['card_days_min']) + 1
        for d in range(int(c['card_days_min']), int(c['card_days_max']) + 1):
            p[d] += float(c['card_pct']) / card_span
        b2b_span = int(c['b2b_days_max']) - int(c['b2b_days_min']) + 1
        for d in range(int(c['b2b_days_min']), int(c['b2b_days_max']) + 1):
            p[d] += float(c['b2b_pct']) / b2b_span
        COLLECTION_PROFILE = dict(p)

    if 'payment' in a:
        pm = a['payment']
        p = defaultdict(float)
        per_span = int(pm['pereciveis_days_max']) - int(pm['pereciveis_days_min']) + 1
        for d in range(int(pm['pereciveis_days_min']), int(pm['pereciveis_days_max']) + 1):
            p[d] += float(pm['pereciveis_pct']) / per_span
        com_span = int(pm['combustivel_days_max']) - int(pm['combustivel_days_min']) + 1
        for d in range(int(pm['combustivel_days_min']), int(pm['combustivel_days_max']) + 1):
            p[d] += float(pm['combustivel_pct']) / com_span
        mer_span = int(pm['mercearia_days_max']) - int(pm['mercearia_days_min']) + 1
        for d in range(int(pm['mercearia_days_min']), int(pm['mercearia_days_max']) + 1):
            p[d] += float(pm['mercearia_pct']) / mer_span
        PAYMENT_PROFILE = dict(p)

    print('📋  Assumptions loaded from', os.path.basename(cfg))

_load_assumptions()

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

def _m2i(name): return MONTH_NAMES.index(name) + 1
def _i2m(i):    return MONTH_NAMES[i - 1]
def _fy(y):     return f'FY{y - 2000}'       # 2026 → 'FY26'
def _yr(fy):    return 2000 + int(fy[2:])     # 'FY26' → 2026

def _days_in_month(y, m):
    if m == 12:
        return (date(y + 1, 1, 1) - date(y, m, 1)).days
    return (date(y, m + 1, 1) - date(y, m, 1)).days

def _week_of_month(d):
    return (d.day - 1) // 7 + 1

def _load_data():
    if not os.path.exists(INPUT_FILE):
        print(f'⚠  {INPUT_FILE} not found. Run fetch_dashboard_data.py first.', file=sys.stderr)
        return {}, {}
    with open(INPUT_FILE) as f:
        raw = json.load(f)
    actuals = defaultdict(float)
    budget  = defaultdict(float)
    for r in raw.get('records', []):
        scn = r.get('scenario', 'Real/Trabalho')
        key = (r['year'], r['month'], r['account'])
        if scn == 'Real/Trabalho':
            actuals[key] += r.get('value', 0)
        elif scn in ('Orc/Oficial', 'Orcamento/Oficial', 'Orc/Trabalho'):
            budget[key]  += r.get('value', 0)
    return dict(actuals), dict(budget)

# ──────────────────────────────────────────────────────────────────────────────
# Run-rate & projection
# ──────────────────────────────────────────────────────────────────────────────

def _run_rate(actuals, account, anchor_date):
    """Trailing 3-month weighted moving average (w = 3, 2, 1)."""
    vals, wts = [], []
    for lag, w in enumerate([3, 2, 1], start=1):
        # go back `lag` months from anchor
        m = anchor_date.month - lag
        y = anchor_date.year
        while m <= 0:
            m += 12; y -= 1
        key = (_fy(y), _i2m(m), account)
        v = actuals.get(key, 0)
        if v > 0:
            vals.append(v * w); wts.append(w)
    if not wts:
        return 0.0
    return sum(vals) / sum(wts)

def _project(base, months_fwd, account):
    rate = GROWTH_RATES.get(account, 0.08)
    monthly_rate = (1 + rate) ** (1 / 12) - 1
    return base * (1 + monthly_rate) ** months_fwd

def _monthly_value(actuals, budget, account, year, month, today):
    fy, mn = _fy(year), _i2m(month)
    ref    = date(year, month, 1)
    is_past    = ref < today.replace(day=1)
    is_current = (year == today.year and month == today.month)

    if is_past:
        v = actuals.get((fy, mn, account), 0)
        if v == 0:
            v = _run_rate(actuals, account, ref + timedelta(days=15))
        return v

    if is_current:
        elapsed = (today.day - 1) / _days_in_month(year, month)
        actual  = actuals.get((fy, mn, account), 0)
        rr      = _run_rate(actuals, account, today)
        if actual > 0 and elapsed > 0.05:
            # annualize current month pace
            monthly_pace = actual / elapsed
            projection   = rr * MONTH_FACTORS[month]
            v = monthly_pace * 0.6 + projection * 0.4
        else:
            v = rr * MONTH_FACTORS[month]
    else:
        mfwd = (year - today.year) * 12 + (month - today.month)
        rr   = _run_rate(actuals, account, today)
        v    = _project(rr, mfwd, account) * MONTH_FACTORS[month]

    # Budget blend for future months
    bv = budget.get((fy, mn, account), 0)
    if bv > 0:
        v = v * 0.70 + bv * 0.30
    return v

# ──────────────────────────────────────────────────────────────────────────────
# Daily distribution
# ──────────────────────────────────────────────────────────────────────────────

def _distribute(monthly_val, year, month):
    """Distribute monthly total to daily values preserving the total."""
    n    = _days_in_month(year, month)
    base = date(year, month, 1)
    raw  = {}
    for i in range(n):
        d = base + timedelta(days=i)
        raw[d] = DOW_FACTORS[d.weekday()] * WEEK_FACTORS[_week_of_month(d)]
    total_factor = sum(raw.values())
    return {d: monthly_val * f / total_factor for d, f in raw.items()}

# ──────────────────────────────────────────────────────────────────────────────
# Cash flow computation
# ──────────────────────────────────────────────────────────────────────────────

ACCOUNTS = [
    'Total Venda', 'Custo Bruto Produto', 'Impostos Venda',
    'Comissao', 'Promocao de Venda', 'Despesa', 'Verba PDV',
]

def _compute_cash_flows(daily):
    """Convert daily accrual values to cash-timed inflows/outflows per component."""
    inflow   = defaultdict(float)  # cash collected
    sup_pay  = defaultdict(float)  # supplier payments
    tax_pay  = defaultdict(float)  # tax payments
    payroll  = defaultdict(float)  # payroll cash-out
    opex_pay = defaultdict(float)  # non-payroll opex
    comm_pay = defaultdict(float)  # commissions
    promo_pay= defaultdict(float)  # promotions
    verba_pay= defaultdict(float)  # verba PDV

    # Revenue → collections with lag
    for d, v in daily['Total Venda'].items():
        for lag, frac in COLLECTION_PROFILE.items():
            inflow[d + timedelta(days=lag)] += v * frac

    # COGS → supplier payments with lag
    for d, v in daily['Custo Bruto Produto'].items():
        for lag, frac in PAYMENT_PROFILE.items():
            sup_pay[d + timedelta(days=lag)] += v * frac

    # Taxes → lump-sum on 10th of following month
    monthly_tax = defaultdict(float)
    for d, v in daily['Impostos Venda'].items():
        monthly_tax[(d.year, d.month)] += v
    for (y, m), tax in monthly_tax.items():
        pm, py = (m + 1, y) if m < 12 else (1, y + 1)
        try:
            tax_pay[date(py, pm, 10)] += tax
        except ValueError:
            pass

    # Despesa → payroll (35%) split 5th/last + non-payroll spread
    monthly_opex = defaultdict(float)
    for d, v in daily['Despesa'].items():
        monthly_opex[(d.year, d.month)] += v
    for (y, m), opex in monthly_opex.items():
        pay_amt = opex * PAYROLL_FRACTION
        nopex   = opex * (1 - PAYROLL_FRACTION)
        n       = _days_in_month(y, m)
        try:
            payroll[date(y, m, 5)]  += pay_amt * 0.40
            payroll[date(y, m, n)]  += pay_amt * 0.60
        except ValueError:
            pass
        daily_nopex = nopex / n
        for i in range(n):
            d = date(y, m, 1) + timedelta(days=i)
            opex_pay[d] += daily_nopex

    # Commissions → same day
    for d, v in daily['Comissao'].items():
        comm_pay[d] += v

    # Promotions: "Promocao de Venda" is a REVENUE sub-account in Brazilian FMCG EPM
    # (it tracks the value of goods sold on promotion for mix analysis, not a cost).
    # The cash was already captured under Total Venda → skip as cash outflow.
    # promo_pay remains zeroed.

    # Verba PDV → D+30
    for d, v in daily['Verba PDV'].items():
        verba_pay[d + timedelta(days=30)] += v

    return {
        'inflow':    inflow,
        'sup_pay':   sup_pay,
        'tax_pay':   tax_pay,
        'payroll':   payroll,
        'opex_pay':  opex_pay,
        'comm_pay':  comm_pay,
        'promo_pay': promo_pay,
        'verba_pay': verba_pay,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def generate(opening_balance: float = _DEFAULT_OPENING_BALANCE):
    print(f'📅  Reference date   : {TODAY}')
    print(f'📆  Horizon          : {FORECAST_DAYS} days  → {TODAY + timedelta(days=FORECAST_DAYS - 1)}')
    print(f'🏦  Opening balance  : R$ {opening_balance/1e6:.1f}M')

    actuals, budget = _load_data()
    if not actuals and not budget:
        print('❌  No data loaded. Aborting.', file=sys.stderr)
        sys.exit(1)

    # Coverage: 90 days history (for lag carry-over) + 90 days forecast + 90 day buffer for outflow lags
    start = TODAY - timedelta(days=90)
    end   = TODAY + timedelta(days=FORECAST_DAYS + 90)

    # Collect unique (year, month) pairs in range
    months_needed = set()
    d = start.replace(day=1)
    while d <= end:
        months_needed.add((d.year, d.month))
        # Advance to first day of next month (avoids 28-day drift)
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

    # Build daily accrual values for all needed months
    daily = {acc: {} for acc in ACCOUNTS}
    for (y, m) in sorted(months_needed):
        for acc in ACCOUNTS:
            mv = _monthly_value(actuals, budget, acc, y, m, TODAY)
            daily[acc].update(_distribute(mv, y, m))

    print(f'🔢  Built daily accruals for {len(months_needed)} months')

    # ── Data quality: apply floor estimates for missing accounts ─────────────
    data_quality = {}

    # Monthly revenue by (year, month) for ratio checks
    monthly_rev = defaultdict(float)
    for d, v in daily['Total Venda'].items():
        monthly_rev[(d.year, d.month)] += v

    for (y, m) in sorted(months_needed):
        rev_m = monthly_rev.get((y, m), 0)
        if rev_m == 0:
            continue
        n = _days_in_month(y, m)
        start_d = date(y, m, 1)
        days_in = [start_d + timedelta(days=i) for i in range(n)]

        # Despesa floor: payroll, logistics, other opex (~13% of revenue — no rent, company owns stores)
        despesa_m = sum(daily['Despesa'].get(d2, 0) for d2 in days_in)
        if despesa_m < rev_m * DESPESA_FLOOR_THRESHOLD:
            estimated = rev_m * DESPESA_FLOOR_PCT
            # Distribute evenly across days (no seasonality — OpEx is fixed-cost-like)
            daily_est = estimated / n
            for d2 in days_in:
                daily['Despesa'][d2] = daily_est
            label = f'{_i2m(m)}/{y}'
            data_quality[label] = data_quality.get(label, {})
            data_quality[label]['Despesa'] = f'estimated @ {DESPESA_FLOOR_PCT*100:.0f}% rev (actual was {despesa_m/rev_m*100:.1f}%)'

        # Comissao floor: sales commissions (~0.8% of revenue)
        comissao_m = sum(daily['Comissao'].get(d2, 0) for d2 in days_in)
        if comissao_m < rev_m * COMISSAO_FLOOR_THRESHOLD:
            estimated = rev_m * COMISSAO_FLOOR_PCT
            dow_sum = sum(DOW_FACTORS[d2.weekday()] for d2 in days_in)
            for d2 in days_in:
                daily['Comissao'][d2] = estimated * DOW_FACTORS[d2.weekday()] / dow_sum
            data_quality.setdefault(f'{_i2m(m)}/{y}', {})['Comissao'] = \
                f'estimated @ {COMISSAO_FLOOR_PCT*100:.1f}% rev'

    if data_quality:
        print(f'⚠️   Applied floor estimates for {len(data_quality)} month(s):')
        for label, fields in sorted(data_quality.items()):
            for acc, note in fields.items():
                print(f'      {label} {acc}: {note}')
    else:
        print('✅  All accounts have actual EPBCS data')

    # Compute cash-timed flows
    cf = _compute_cash_flows(daily)
    print(f'💸  Cash flow buckets computed')

    # Build 90-day output records
    records = []
    cumulative_net = 0.0   # incremental change from D0
    cash_balance   = opening_balance  # absolute position = opening + cumulative_net

    for i in range(FORECAST_DAYS):
        d = TODAY + timedelta(days=i)

        inflow_day    = cf['inflow'].get(d, 0)
        outflow_sup   = cf['sup_pay'].get(d, 0)
        outflow_tax   = cf['tax_pay'].get(d, 0)
        outflow_pay   = cf['payroll'].get(d, 0)
        outflow_opex  = cf['opex_pay'].get(d, 0)
        outflow_comm  = cf['comm_pay'].get(d, 0)
        outflow_promo = cf['promo_pay'].get(d, 0)
        outflow_verba = cf['verba_pay'].get(d, 0)

        total_outflow  = outflow_sup + outflow_tax + outflow_pay + outflow_opex + outflow_comm + outflow_promo + outflow_verba
        net            = inflow_day - total_outflow
        cumulative_net += net
        cash_balance   += net

        # Confidence interval widens with forecast horizon (5% → 20%)
        conf = 0.05 + (i / FORECAST_DAYS) * 0.15

        # Determine record type
        fy, mn   = _fy(d.year), _i2m(d.month)
        has_actual = actuals.get((fy, mn, 'Total Venda'), 0) > 0
        rec_type = 'actual' if (d < TODAY and has_actual) else ('plan' if has_actual else 'forecast')

        records.append({
            'date':          d.isoformat(),
            'day_num':       i + 1,
            'day_of_week':   ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'][d.weekday()],
            'is_weekend':    d.weekday() >= 5,
            'week_of_month': _week_of_month(d),
            'month':         mn,
            'month_num':     d.month,
            'year':          fy,
            'type':          rec_type,

            # Cash timing (operational flows)
            'inflow_total':     round(inflow_day, 0),
            'outflow_suppliers':round(outflow_sup, 0),
            'outflow_taxes':    round(outflow_tax, 0),
            'outflow_payroll':  round(outflow_pay, 0),
            'outflow_opex':     round(outflow_opex, 0),
            'outflow_commissions': round(outflow_comm, 0),
            'outflow_promotions':  round(outflow_promo, 0),
            'outflow_verba_pdv':   round(outflow_verba, 0),
            'outflow_total':    round(total_outflow, 0),

            'net_cash_flow':   round(net, 0),
            'cumulative_net':  round(cumulative_net, 0),    # net change since D0 (no opening balance)
            'cash_balance':    round(cash_balance, 0),      # absolute position = opening + cumulative_net

            'confidence_low':  round(cash_balance * (1 - conf), 0),
            'confidence_high': round(cash_balance * (1 + conf), 0),

            # Underlying accrual values from planning accounts
            'accrual_total_venda':   round(daily['Total Venda'].get(d, 0), 0),
            'accrual_custo_bruto':   round(daily['Custo Bruto Produto'].get(d, 0), 0),
            'accrual_impostos':      round(daily['Impostos Venda'].get(d, 0), 0),
            'accrual_comissao':      round(daily['Comissao'].get(d, 0), 0),
            'accrual_promocao':      round(daily['Promocao de Venda'].get(d, 0), 0),
            'accrual_despesa':       round(daily['Despesa'].get(d, 0), 0),
            'accrual_verba_pdv':     round(daily['Verba PDV'].get(d, 0), 0),
        })

    # Balance stats across the 90-day window
    balances       = [r['cash_balance'] for r in records]
    min_balance    = min(balances)
    min_bal_day    = records[balances.index(min_balance)]
    closing_balance = balances[-1]

    # Weekly summary
    weekly = []
    for w in range(0, FORECAST_DAYS, 7):
        chunk = records[w:w + 7]
        if not chunk: break
        weekly.append({
            'week':              w // 7 + 1,
            'start_date':        chunk[0]['date'],
            'end_date':          chunk[-1]['date'],
            'inflow':            round(sum(r['inflow_total']  for r in chunk), 0),
            'outflow':           round(sum(r['outflow_total'] for r in chunk), 0),
            'net':               round(sum(r['net_cash_flow'] for r in chunk), 0),
            'closing_balance':   chunk[-1]['cash_balance'],
            'avg_daily_revenue': round(sum(r['accrual_total_venda'] for r in chunk) / len(chunk), 0),
        })

    # Monthly summary
    monthly_map = defaultdict(lambda: defaultdict(float))
    for r in records:
        k = (r['year'], r['month'])
        for field in ('inflow_total','outflow_total','net_cash_flow',
                      'accrual_total_venda','accrual_custo_bruto','accrual_impostos'):
            monthly_map[k][field] += r[field]
    monthly = []
    for (fy2, mn2), vals in sorted(monthly_map.items()):
        monthly.append({'year': fy2, 'month': mn2, **{k: round(v, 0) for k, v in vals.items()}})

    # Model parameters (for transparency / documentation)
    model_params = {
        'collection_profile': {f'D+{k}': round(v * 100, 2) for k, v in sorted(COLLECTION_PROFILE.items())},
        'payment_profile':    {f'D+{k}': round(v * 100, 2) for k, v in sorted(PAYMENT_PROFILE.items())},
        'dow_factors':        DOW_FACTORS,
        'month_factors':      MONTH_FACTORS,
        'week_factors':       WEEK_FACTORS,
        'growth_rates':       GROWTH_RATES,
        'payroll_fraction_of_despesa': PAYROLL_FRACTION,
        'collection_summary': {
            'immediate_D0_pct': 60,
            'card_D1_30_pct':   30,
            'b2b_D31_60_pct':   10,
        },
        'payment_summary': {
            'pereciveis_D1_3_pct':  30,
            'combustivel_D7_14_pct': 20,
            'mercearia_D30_45_pct': 50,
        },
    }

    # Totals for header KPIs
    total_inflow  = sum(r['inflow_total']  for r in records)
    total_outflow = sum(r['outflow_total'] for r in records)

    output = {
        'generated_at':     TODAY.isoformat(),
        'reference_date':   TODAY.isoformat(),
        'horizon_days':     FORECAST_DAYS,
        'end_date':         (TODAY + timedelta(days=FORECAST_DAYS - 1)).isoformat(),
        'opening_balance':  round(opening_balance, 0),
        'kpis': {
            'opening_balance':     round(opening_balance, 0),
            'closing_balance':     round(closing_balance, 0),
            'min_balance':         round(min_balance, 0),
            'min_balance_date':    min_bal_day['date'],
            'total_inflow_90d':    round(total_inflow, 0),
            'total_outflow_90d':   round(total_outflow, 0),
            'net_cash_flow_90d':   round(total_inflow - total_outflow, 0),
            'avg_daily_net':       round((total_inflow - total_outflow) / FORECAST_DAYS, 0),
            'cash_conversion_days': round(
                sum(d2 * f for d2, f in COLLECTION_PROFILE.items()), 1
            ),
            'avg_supplier_payment_days': round(
                sum(d2 * f for d2, f in PAYMENT_PROFILE.items()), 1
            ),
        },
        'model_params': model_params,
        'data_quality': data_quality,
        'daily':   records,
        'weekly':  weekly,
        'monthly': monthly,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'✅  Wrote {len(records)} daily records → {OUTPUT_FILE}')
    print(f'📊  Total Inflow 90d   : R$ {total_inflow/1e6:.1f}M')
    print(f'📊  Total Outflow 90d  : R$ {total_outflow/1e6:.1f}M')
    print(f'📊  Net Cash Flow 90d  : R$ {(total_inflow - total_outflow)/1e6:.1f}M')
    print(f'🏦  Opening Balance    : R$ {opening_balance/1e6:.1f}M')
    print(f'🏦  Closing Balance    : R$ {closing_balance/1e6:.1f}M')
    print(f'⚠️   Minimum Balance   : R$ {min_balance/1e6:.1f}M  ({min_bal_day["date"]})')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate 90-day rolling cash flow forecast.')
    parser.add_argument(
        '--opening-balance', type=float,
        default=_DEFAULT_OPENING_BALANCE,
        metavar='VALUE',
        help='Saldo inicial de caixa em R$ (ex: 150000000 para R$150M). '
             'Também pode ser definido via env var OPENING_BALANCE.',
    )
    args = parser.parse_args()
    generate(opening_balance=args.opening_balance)
