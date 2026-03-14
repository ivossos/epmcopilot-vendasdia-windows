import { useState, useEffect, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement, Filler,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement, Filler,
  Title, Tooltip, Legend,
)

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtR = (v) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}R$ ${(abs / 1e6).toFixed(1).replace('.', ',')}M`
  if (abs >= 1e3) return `${sign}R$ ${(abs / 1e3).toFixed(0).replace('.', ',')}K`
  return `${sign}R$ ${abs.toFixed(0)}`
}

const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

const fmtDateFull = (iso) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Narrative Builder ───────────────────────────────────────────────────────

function buildNarratives(allDays, monthly, kpis, opening, closing, minBal, minBalDay) {
  if (!allDays.length || !kpis) return []
  const avgDailyOutflow = (kpis.total_outflow_90d || 0) / 90

  const narratives = []

  // 1 — Posição Geral
  const variation = opening !== 0 ? (closing - opening) / opening * 100 : 0
  const net = kpis.net_cash_flow_90d || 0
  narratives.push({
    id: 'posicao-geral',
    icon: closing >= opening ? '📈' : '📉',
    title: 'Posição Geral — 90 dias',
    severity: closing >= opening ? 'ok' : 'warn',
    body: variation >= 0
      ? `Projeção aponta saldo de ${fmtR(closing)} ao final do horizonte, ${variation.toFixed(1)}% acima do saldo de abertura. A operação gera ${fmtR(net)} líquidos nos próximos 90 dias.`
      : `Saldo de fechamento projetado em ${fmtR(closing)}, ${Math.abs(variation).toFixed(1)}% abaixo da abertura. Revise premissas de receita ou antecipe linhas de crédito.`,
  })

  // 2 — Alerta de Saldo Mínimo
  let minIcon, minSeverity, minBody
  if (minBal < 0) {
    minIcon = '🚨'; minSeverity = 'alert'
    minBody = `ATENÇÃO: saldo negativo de ${fmtR(minBal)} projetado para ${fmtDateFull(minBalDay?.date || '')}. Acione linha de crédito ou antecipe recebíveis antes dessa data.`
  } else if (minBal < opening * 0.15) {
    minIcon = '⚠️'; minSeverity = 'warn'
    const pct = opening !== 0 ? (minBal / opening * 100).toFixed(0) : '0'
    minBody = `Saldo mínimo de ${fmtR(minBal)} em ${fmtDateFull(minBalDay?.date || '')} representa apenas ${pct}% do saldo inicial — margem de segurança reduzida. Monitore de perto.`
  } else {
    minIcon = '✅'; minSeverity = 'ok'
    const coverDays = avgDailyOutflow > 0 ? (minBal / avgDailyOutflow).toFixed(0) : '—'
    minBody = `Saldo nunca abaixo de ${fmtR(minBal)} (em ${fmtDateFull(minBalDay?.date || '')}), equivalente a ${coverDays} dias de saídas médias. Posição de liquidez confortável.`
  }
  narratives.push({ id: 'saldo-minimo', icon: minIcon, title: 'Saldo Mínimo Projetado', severity: minSeverity, body: minBody })

  // 3 — Próximas Pressões
  const nextTax     = allDays.find(r => r.outflow_taxes > 100_000)
  const nextPayroll = allDays.find(r => r.outflow_payroll > 100_000)
  const totalTaxes  = allDays.reduce((s, r) => s + (r.outflow_taxes || 0), 0)
  const taxPct = (kpis.total_outflow_90d || 0) > 0 ? (totalTaxes / kpis.total_outflow_90d * 100).toFixed(1) : '0.0'
  const lines = []
  if (nextTax)     lines.push(`Impostos: ${fmtR(nextTax.outflow_taxes)} em ${fmtDateFull(nextTax.date)}`)
  if (nextPayroll) lines.push(`Folha: ${fmtR(nextPayroll.outflow_payroll)} em ${fmtDateFull(nextPayroll.date)}`)
  lines.push(`Total fiscal 90d: ${fmtR(totalTaxes)} (${taxPct}% das saídas)`)
  narratives.push({ id: 'pressoes', icon: '📅', title: 'Próximas Obrigações Relevantes', severity: 'info', body: lines.join(' · ') })

  // 4 — Ciclo Financeiro
  const pmr = kpis.cash_conversion_days || 0
  const pmp = kpis.avg_supplier_payment_days || 0
  const gap = pmp - pmr
  narratives.push({
    id: 'ciclo',
    icon: '⚙️',
    title: 'Ciclo Financeiro',
    severity: gap < 0 ? 'warn' : 'ok',
    body: gap >= 0
      ? `PMR ${pmr.toFixed(0)}d vs PMP ${pmp.toFixed(0)}d — empresa recebe ${gap.toFixed(0)} dias antes de pagar fornecedores. Ciclo financeiro favorável.`
      : `PMR ${pmr.toFixed(0)}d vs PMP ${pmp.toFixed(0)}d — empresa paga fornecedores ${Math.abs(gap).toFixed(0)} dias antes de receber dos clientes. Aumenta necessidade de capital de giro.`,
  })

  // 5 — Tendência Mensal
  if (monthly.length > 0) {
    const bestMonth  = monthly.reduce((a, b) => b.net_cash_flow > a.net_cash_flow ? b : a)
    const worstMonth = monthly.reduce((a, b) => b.net_cash_flow < a.net_cash_flow ? b : a)
    const worstSuffix = worstMonth.net_cash_flow < 0 ? ' — consumo líquido de caixa.' : '.'
    narratives.push({
      id: 'tendencia',
      icon: '📆',
      title: 'Melhor e Pior Mês',
      severity: 'info',
      body: `${bestMonth.month}/${bestMonth.year} é o mês com maior geração de caixa (${fmtR(bestMonth.net_cash_flow)}), impulsionado por sazonalidade FMCG. ${worstMonth.month}/${worstMonth.year} é o mais pressionado (${fmtR(worstMonth.net_cash_flow)})${worstSuffix}`,
    })
  }

  // 6 — Cobertura de Liquidez
  const coverageDays = avgDailyOutflow > 0 ? closing / avgDailyOutflow : 0
  const reservaLabel = coverageDays > 30 ? 'Reserva robusta.' : 'Reserva enxuta — monitore sazonalidades.'
  narratives.push({
    id: 'cobertura',
    icon: '🛡️',
    title: 'Cobertura de Liquidez',
    severity: 'info',
    body: `Com o saldo de fechamento de ${fmtR(closing)}, a empresa cobre ${coverageDays.toFixed(0)} dias de saídas operacionais ao ritmo atual (${fmtR(avgDailyOutflow)}/dia). ${reservaLabel}`,
  })

  return narratives
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CashFlowDashboard() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [view, setView]           = useState('daily')
  const [chartMode, setChartMode] = useState('flows')
  const [showDays, setShowDays]   = useState(30)
  const [openingBalanceInput, setOpeningBalanceInput] = useState('')  // user override (R$ M)

  useEffect(() => {
    fetch('/data/cash_flow_forecast.json')
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(d => {
        setData(d)
        // Pre-fill input with the balance used when generating (convert to R$M)
        const ob = d.opening_balance || 0
        setOpeningBalanceInput(ob > 0 ? (ob / 1e6).toFixed(0) : '')
        setLoading(false)
      })
      .catch(() => {
        setError('Execute: python3 scripts/generate_cash_flow_forecast.py')
        setLoading(false)
      })
  }, [])

  // Effective opening balance: user override (in R$M) takes precedence over stored value
  const effectiveOpening = useMemo(() => {
    const parsed = parseFloat(openingBalanceInput)
    if (!isNaN(parsed) && openingBalanceInput !== '') return parsed * 1e6
    return data?.opening_balance || 0
  }, [openingBalanceInput, data])

  // Recompute cash_balance from effectiveOpening so the chart updates live
  const allDaysAdjusted = useMemo(() => {
    if (!data?.daily) return []
    let bal = effectiveOpening
    return data.daily.map(r => {
      bal += r.net_cash_flow
      const conf = 0.05 + ((r.day_num - 1) / data.horizon_days) * 0.15
      return {
        ...r,
        cash_balance:     Math.round(bal),
        confidence_low:   Math.round(bal * (1 - conf)),
        confidence_high:  Math.round(bal * (1 + conf)),
      }
    })
  }, [data, effectiveOpening])

  const visibleDays = useMemo(() => allDaysAdjusted.slice(0, showDays), [allDaysAdjusted, showDays])

  // ── Daily chart labels & datasets ──────────────────────────────────────────
  const dailyLabels = useMemo(() =>
    visibleDays.map(r => fmtDate(r.date)), [visibleDays])

  const flowsDatasets = useMemo(() => [
    {
      label: 'Entradas (caixa)',
      data: visibleDays.map(r => r.inflow_total / 1e6),
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.15)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    },
    {
      label: 'Saídas (caixa)',
      data: visibleDays.map(r => -r.outflow_total / 1e6),
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.12)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    },
    {
      label: 'Geração de Caixa',
      data: visibleDays.map(r => r.net_cash_flow / 1e6),
      borderColor: '#0ea5e9',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      borderDash: [4, 3],
    },
  ], [visibleDays])

  const cumulativeDataset = useMemo(() => [{
    label: 'Saldo de Caixa',
    data: visibleDays.map(r => r.cash_balance / 1e6),
    borderColor: '#c41e3a',
    backgroundColor: (ctx) => {
      // Fill green above zero, red below
      const chart = ctx.chart
      const { ctx: c, chartArea } = chart
      if (!chartArea) return 'rgba(196,30,58,0.1)'
      const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
      grad.addColorStop(0, 'rgba(34,197,94,0.15)')
      grad.addColorStop(1, 'rgba(239,68,68,0.15)')
      return grad
    },
    fill: true,
    tension: 0.4,
    pointRadius: 0,
  }, {
    label: 'Limite inferior (IC)',
    data: visibleDays.map(r => r.confidence_low / 1e6),
    borderColor: 'rgba(196,30,58,0.3)',
    backgroundColor: 'transparent',
    fill: false,
    tension: 0.4,
    pointRadius: 0,
    borderDash: [2, 4],
  }, {
    label: 'Limite superior (IC)',
    data: visibleDays.map(r => r.confidence_high / 1e6),
    borderColor: 'rgba(196,30,58,0.3)',
    backgroundColor: 'transparent',
    fill: false,
    tension: 0.4,
    pointRadius: 0,
    borderDash: [2, 4],
  }, {
    label: 'Saldo Zero',
    data: visibleDays.map(() => 0),
    borderColor: 'rgba(239,68,68,0.6)',
    backgroundColor: 'transparent',
    fill: false,
    pointRadius: 0,
    borderWidth: 1.5,
    borderDash: [6, 4],
  }], [visibleDays])

  const accrualDatasets = useMemo(() => [
    {
      label: 'Receita (Total Venda)',
      data: visibleDays.map(r => r.accrual_total_venda / 1e6),
      borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)',
      fill: true, tension: 0.3, pointRadius: 0,
    },
    {
      label: 'Custo Bruto',
      data: visibleDays.map(r => -r.accrual_custo_bruto / 1e6),
      borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',
      fill: true, tension: 0.3, pointRadius: 0,
    },
    {
      label: 'Impostos',
      data: visibleDays.map(r => -r.accrual_impostos / 1e6),
      borderColor: '#8b5cf6', backgroundColor: 'transparent',
      fill: false, tension: 0.3, pointRadius: 0, borderDash: [4,3],
    },
    {
      label: 'Comissão + Promoção',
      data: visibleDays.map(r => -(r.accrual_comissao + r.accrual_promocao) / 1e6),
      borderColor: '#ec4899', backgroundColor: 'transparent',
      fill: false, tension: 0.3, pointRadius: 0, borderDash: [4,3],
    },
  ], [visibleDays])

  // ── Weekly bar chart ────────────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    if (!data?.weekly) return { labels: [], inflows: [], outflows: [], nets: [] }
    // Recompute weekly closing balances from adjusted days
    const wks = data.weekly.slice(0, Math.ceil(showDays / 7)).map((w, wi) => {
      const lastDayIdx = Math.min((wi + 1) * 7, allDaysAdjusted.length) - 1
      return { ...w, closing_balance: allDaysAdjusted[lastDayIdx]?.cash_balance ?? w.closing_balance }
    })
    return {
      labels:   wks.map(w => `Sem ${w.week} (${fmtDate(w.start_date)})`),
      inflows:  wks.map(w => w.inflow   / 1e6),
      outflows: wks.map(w => -w.outflow / 1e6),
      nets:     wks.map(w => w.net      / 1e6),
      balances: wks.map(w => w.closing_balance / 1e6),
    }
  }, [data, showDays, allDaysAdjusted])

  const weeklyDatasets = [
    {
      label: 'Entradas',
      data: weeklyData.inflows,
      backgroundColor: 'rgba(34,197,94,0.7)',
      borderColor: '#22c55e',
      borderWidth: 1,
      type: 'bar',
    },
    {
      label: 'Saídas',
      data: weeklyData.outflows,
      backgroundColor: 'rgba(239,68,68,0.7)',
      borderColor: '#ef4444',
      borderWidth: 1,
      type: 'bar',
    },
    {
      label: 'Geração de Caixa',
      data: weeklyData.nets,
      backgroundColor: 'rgba(14,165,233,0.7)',
      borderColor: '#0ea5e9',
      borderWidth: 1,
      type: 'bar',
    },
    {
      label: 'Saldo de Caixa',
      data: weeklyData.balances,
      borderColor: '#c41e3a',
      backgroundColor: 'transparent',
      type: 'line',
      tension: 0.3,
      pointRadius: 4,
      borderWidth: 2,
      yAxisID: 'y',
    },
  ]

  // ── Upcoming obligations ────────────────────────────────────────────────────
  const obligations = useMemo(() => {
    if (!allDaysAdjusted.length) return []
    return allDaysAdjusted
      .filter(r => r.outflow_taxes > 50000 || r.outflow_payroll > 50000)
      .slice(0, 8)
      .map(r => ({
        date: r.date,
        label: r.outflow_taxes > r.outflow_payroll ? 'Impostos (ICMS/PIS/COFINS)' : 'Folha de Pagamento',
        amount: Math.max(r.outflow_taxes, r.outflow_payroll),
      }))
  }, [allDaysAdjusted])

  // ── Chart options ───────────────────────────────────────────────────────────
  const lineOpts = (yLabel, showLegend = true) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: { color: '#64748b', boxWidth: 12, padding: 14, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(2)}M`,
        },
      },
    },
    scales: {
      y: {
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b', callback: v => `${v.toFixed(1)}M` },
        title: { display: true, text: yLabel, color: '#64748b', font: { size: 11 } },
      },
      x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45, font: { size: 10 } } },
    },
  })

  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#64748b', boxWidth: 12, padding: 14 } },
      tooltip: {
        callbacks: { label: ctx => `${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(2)}M` },
      },
    },
    scales: {
      y: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: v => `${v.toFixed(1)}M` } },
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
    },
  }

  // Narrative panel — must be computed before any early returns (Rules of Hooks)
  const narratives = useMemo(() => {
    if (!allDaysAdjusted.length || !data) return []
    const _kpis      = data.kpis || {}
    const _closing   = allDaysAdjusted[allDaysAdjusted.length - 1].cash_balance
    const _minBal    = Math.min(...allDaysAdjusted.map(r => r.cash_balance))
    const _minBalDay = allDaysAdjusted.find(r => r.cash_balance === _minBal)
    return buildNarratives(allDaysAdjusted, data.monthly ?? [], _kpis,
                           effectiveOpening, _closing, _minBal, _minBalDay)
  }, [allDaysAdjusted, data, effectiveOpening])

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="cf-loading">Carregando previsão de fluxo de caixa…</div>
  }

  if (error || !data) {
    return (
      <div className="cf-error">
        <h3>Dados não encontrados</h3>
        <p>{error || 'Arquivo cash_flow_forecast.json não encontrado.'}</p>
        <code>python3 scripts/generate_cash_flow_forecast.py</code>
      </div>
    )
  }

  const kpis          = data.kpis || {}
  const netPositive   = (kpis.net_cash_flow_90d || 0) >= 0

  // Recompute min/closing from adjusted days
  const closingBalance = allDaysAdjusted.length ? allDaysAdjusted[allDaysAdjusted.length - 1].cash_balance : 0
  const minBalance     = allDaysAdjusted.length ? Math.min(...allDaysAdjusted.map(r => r.cash_balance)) : 0
  const minBalDay      = allDaysAdjusted.find(r => r.cash_balance === minBalance)
  const minIsNegative  = minBalance < 0

  return (
    <div className="cf-root">

      {/* ── Opening Balance Input ────────────────────────────────────────── */}
      <div className="cf-ob-bar">
        <label className="cf-ob-label">Saldo de Abertura (R$ M)</label>
        <input
          type="number"
          className="cf-ob-input"
          placeholder="ex: 150"
          value={openingBalanceInput}
          onChange={e => setOpeningBalanceInput(e.target.value)}
          min="0"
          step="10"
        />
        <span className="cf-ob-hint">
          = {fmtR(effectiveOpening)} · Saldo final: {fmtR(closingBalance)}
          {minIsNegative && (
            <span className="cf-ob-alert"> ⚠ Saldo mínimo negativo! ({fmtR(minBalance)} em {fmtDate(minBalDay?.date || '')})</span>
          )}
        </span>
      </div>

      {/* ── KPI Header Cards ─────────────────────────────────────────────── */}
      <div className="cf-kpi-grid">
        <div className="cf-kpi-card cf-gray">
          <div className="cf-kpi-label">Saldo Abertura</div>
          <div className="cf-kpi-value">{fmtR(effectiveOpening)}</div>
          <div className="cf-kpi-sub">Caixa em {data.reference_date}</div>
        </div>
        <div className={`cf-kpi-card ${closingBalance >= 0 ? 'cf-blue' : 'cf-orange'}`}>
          <div className="cf-kpi-label">Saldo Fechamento</div>
          <div className="cf-kpi-value">{fmtR(closingBalance)}</div>
          <div className="cf-kpi-sub">Caixa em {data.end_date}</div>
        </div>
        <div className={`cf-kpi-card ${minIsNegative ? 'cf-orange' : 'cf-green'}`}>
          <div className="cf-kpi-label">Saldo Mínimo</div>
          <div className="cf-kpi-value">{fmtR(minBalance)}</div>
          <div className="cf-kpi-sub">{minBalDay ? `Pico em ${fmtDate(minBalDay.date)}` : '—'}</div>
        </div>
        <div className="cf-kpi-card cf-green">
          <div className="cf-kpi-label">Entradas 90d</div>
          <div className="cf-kpi-value">{fmtR(kpis.total_inflow_90d || 0)}</div>
          <div className="cf-kpi-sub">Recebimentos projetados</div>
        </div>
        <div className="cf-kpi-card cf-red">
          <div className="cf-kpi-label">Saídas 90d</div>
          <div className="cf-kpi-value">{fmtR(kpis.total_outflow_90d || 0)}</div>
          <div className="cf-kpi-sub">Desembolsos projetados</div>
        </div>
        <div className={`cf-kpi-card ${netPositive ? 'cf-purple' : 'cf-orange'}`}>
          <div className="cf-kpi-label">Geração de Caixa 90d</div>
          <div className="cf-kpi-value">{fmtR(kpis.net_cash_flow_90d || 0)}</div>
          <div className="cf-kpi-sub">{netPositive ? 'Geração positiva' : 'Consome caixa'}</div>
        </div>
        <div className="cf-kpi-card cf-gray">
          <div className="cf-kpi-label">PMR</div>
          <div className="cf-kpi-value">{(kpis.cash_conversion_days || 0).toFixed(0)}d</div>
          <div className="cf-kpi-sub">Prazo médio recebimento</div>
        </div>
        <div className="cf-kpi-card cf-gray">
          <div className="cf-kpi-label">PMP</div>
          <div className="cf-kpi-value">{(kpis.avg_supplier_payment_days || 0).toFixed(0)}d</div>
          <div className="cf-kpi-sub">Prazo médio pagamento</div>
        </div>
      </div>

      {/* ── Narrative Panel ─────────────────────────────────────────────────── */}
      <div className="cf-narrative-panel">
        <h3 className="cf-narrative-heading">
          <span>🤖</span> Análise Automatizada
          <span className="cf-narrative-sub">Baseada nos dados EPBCS · {data.reference_date}</span>
        </h3>
        <div className="cf-narrative-grid">
          {narratives.map(n => (
            <div key={n.id} className={`cf-narrative-card cf-narr-${n.severity}`}>
              <div className="cf-narr-header">
                <span className="cf-narr-icon">{n.icon}</span>
                <span className="cf-narr-title">{n.title}</span>
              </div>
              <p className="cf-narr-body">{n.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── View Controls ───────────────────────────────────────────────────── */}
      <div className="cf-controls">
        <div className="cf-tab-group">
          {['daily', 'weekly', 'monthly'].map(v => (
            <button
              key={v}
              className={`cf-tab-btn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'daily' ? 'Diário' : v === 'weekly' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>
        {view === 'daily' && (
          <div className="cf-tab-group">
            {[30, 60, 90].map(n => (
              <button
                key={n}
                className={`cf-tab-btn ${showDays === n ? 'active' : ''}`}
                onClick={() => setShowDays(n)}
              >
                {n} dias
              </button>
            ))}
          </div>
        )}
        {view === 'daily' && (
          <div className="cf-tab-group">
            {[
              ['flows',      'Geração de Caixa'],
              ['cumulative', 'Posição Acumulada'],
              ['accrual',    'Contas Planejamento'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`cf-tab-btn ${chartMode === k ? 'active' : ''}`}
                onClick={() => setChartMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Daily Chart ─────────────────────────────────────────────────────── */}
      {view === 'daily' && (
        <div className="cf-card">
          <h3>
            {chartMode === 'flows'      && `Fluxo de Caixa Diário — ${showDays} dias (R$ milhões)`}
            {chartMode === 'cumulative' && `Posição Acumulada de Caixa — ${showDays} dias (R$ milhões)`}
            {chartMode === 'accrual'    && `Contas de Planejamento EPBCS — ${showDays} dias (R$ milhões, regime competência)`}
          </h3>
          <div style={{ height: 320 }}>
            <Line
              data={{
                labels: dailyLabels,
                datasets: chartMode === 'flows'      ? flowsDatasets
                        : chartMode === 'cumulative' ? cumulativeDataset
                        : accrualDatasets,
              }}
              options={lineOpts('R$ Milhões')}
            />
          </div>
          {chartMode === 'flows' && (
            <p className="cf-note">
              Entradas ajustadas por prazo de recebimento (Pix D0 60%, cartão D1–30 30%, B2B D31–60 10%).
              Saídas consideram prazos de fornecedores por categoria e obrigações fiscais/folha mensais.
            </p>
          )}
          {chartMode === 'accrual' && (
            <p className="cf-note">
              Valores em regime de competência direto das contas EPBCS VendaDia.
              O fluxo de caixa real é defasado conforme os perfis de recebimento e pagamento.
            </p>
          )}
        </div>
      )}

      {/* ── Weekly Bar Chart ────────────────────────────────────────────────── */}
      {view === 'weekly' && (
        <div className="cf-card">
          <h3>Fluxo de Caixa Semanal — {Math.ceil(showDays / 7)} semanas (R$ milhões)</h3>
          <div style={{ height: 320 }}>
            <Bar
              data={{ labels: weeklyData.labels, datasets: weeklyDatasets }}
              options={barOpts}
            />
          </div>
        </div>
      )}

      {/* ── Monthly Summary ─────────────────────────────────────────────────── */}
      {view === 'monthly' && (
        <div className="cf-card">
          <h3>Resumo Mensal — Fluxo de Caixa Operacional</h3>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Entradas</th>
                  <th>Saídas</th>
                  <th>Geração de Caixa</th>
                  <th>Receita (competência)</th>
                  <th>Custo Bruto</th>
                  <th>Impostos</th>
                </tr>
              </thead>
              <tbody>
                {(data.monthly || []).map((r, i) => (
                  <tr key={i} className={r.net_cash_flow >= 0 ? 'cf-row-pos' : 'cf-row-neg'}>
                    <td><strong>{r.month}/{r.year}</strong></td>
                    <td className="cf-num-green">{fmtR(r.inflow_total)}</td>
                    <td className="cf-num-red">{fmtR(r.outflow_total)}</td>
                    <td className={r.net_cash_flow >= 0 ? 'cf-num-blue' : 'cf-num-orange'}>
                      <strong>{fmtR(r.net_cash_flow)}</strong>
                    </td>
                    <td>{fmtR(r.accrual_total_venda)}</td>
                    <td>{fmtR(r.accrual_custo_bruto)}</td>
                    <td>{fmtR(r.accrual_impostos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Two-column: Detail table + Obligations ───────────────────────────── */}
      <div className="cf-two-col">

        {/* Next 14 days detail */}
        <div className="cf-card">
          <h3>Próximos 14 dias — Detalhe Diário</h3>
          <div className="cf-table-wrap">
            <table className="cf-table cf-table-sm">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Dia</th>
                  <th>Entradas</th>
                  <th>Fornecedores</th>
                  <th>Impostos</th>
                  <th>Folha</th>
                  <th>Geração de Caixa</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {allDaysAdjusted.slice(0, 14).map((r, i) => (
                  <tr key={i} className={r.cash_balance < 0 ? 'cf-row-neg' : r.is_weekend ? 'cf-row-weekend' : ''}>
                    <td>{fmtDateFull(r.date)}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{r.day_of_week.slice(0, 3)}</td>
                    <td className="cf-num-green">{fmtR(r.inflow_total)}</td>
                    <td className="cf-num-red">{r.outflow_suppliers ? fmtR(-r.outflow_suppliers) : '—'}</td>
                    <td className="cf-num-red">{r.outflow_taxes > 1000 ? fmtR(-r.outflow_taxes) : '—'}</td>
                    <td className="cf-num-red">{r.outflow_payroll > 1000 ? fmtR(-r.outflow_payroll) : '—'}</td>
                    <td className={r.net_cash_flow >= 0 ? 'cf-num-blue' : 'cf-num-orange'}>
                      <strong>{fmtR(r.net_cash_flow)}</strong>
                    </td>
                    <td className={r.cash_balance >= 0 ? 'cf-num-green' : 'cf-num-red'}>
                      <strong>{fmtR(r.cash_balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming obligations */}
        <div className="cf-card">
          <h3>Obrigações Relevantes</h3>
          {obligations.length === 0
            ? <p className="cf-note">Nenhuma obrigação expressiva nos próximos 90 dias.</p>
            : (
              <div className="cf-obligations">
                {obligations.map((o, i) => (
                  <div key={i} className="cf-obligation-row">
                    <div className="cf-obl-date">{fmtDateFull(o.date)}</div>
                    <div className="cf-obl-label">{o.label}</div>
                    <div className="cf-obl-amount">{fmtR(o.amount)}</div>
                  </div>
                ))}
              </div>
            )}

          {/* Model Params Summary */}
          <h3 style={{ marginTop: '1.5rem' }}>Perfis Operacionais</h3>
          <div className="cf-profile-grid">
            <div className="cf-profile-block">
              <div className="cf-profile-title">Recebimento (Inflow)</div>
              <div className="cf-profile-row"><span>Pix/Débito/Cash</span><span className="cf-num-green">60% D0</span></div>
              <div className="cf-profile-row"><span>Cartão crédito</span><span className="cf-num-blue">30% D1–D30</span></div>
              <div className="cf-profile-row"><span>B2B / Crédito</span><span className="cf-num-orange">10% D31–D60</span></div>
            </div>
            <div className="cf-profile-block">
              <div className="cf-profile-title">Pagamento Fornecedores (Outflow)</div>
              <div className="cf-profile-row"><span>Perecíveis</span><span className="cf-num-red">30% D1–D3</span></div>
              <div className="cf-profile-row"><span>Combustível</span><span className="cf-num-red">20% D7–D14</span></div>
              <div className="cf-profile-row"><span>Mercearia</span><span className="cf-num-red">50% D30–D45</span></div>
            </div>
          </div>

          {/* Planning accounts bridge */}
          <h3 style={{ marginTop: '1.5rem' }}>Contas EPBCS → Caixa</h3>
          <div className="cf-bridge">
            {[
              ['Total Venda',       'Entradas (caixa)',        'green'],
              ['Custo Bruto Produto','Pagamento Fornecedores', 'red'],
              ['Impostos Venda',    'ICMS/PIS/COFINS (D+10)',  'red'],
              ['Comissao',          'Comissões (D0)',          'red'],
              ['Promocao de Venda', 'Promoções (D+30 avg)',    'red'],
              ['Despesa',           'Folha + OpEx',            'red'],
              ['Verba PDV',         'Verba PDV (D+30)',        'red'],
            ].map(([acc, cf, color]) => (
              <div key={acc} className="cf-bridge-row">
                <span className="cf-bridge-acc">{acc}</span>
                <span className="cf-bridge-arrow">→</span>
                <span className={`cf-bridge-cf cf-num-${color}`}>{cf}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Data Quality Notes ──────────────────────────────────────────── */}
      {data.data_quality && Object.keys(data.data_quality).length > 0 && (
        <div className="cf-dq-banner">
          <span className="cf-dq-icon">⚠</span>
          <span>
            <strong>Estimativas aplicadas:</strong>{' '}
            Despesa (OpEx) e Comissão sem dados no EPBCS VendaDia — estimados em 13% e 0,8% da receita
            respectivamente (benchmark FMCG Brasil, sem aluguel — Savegnago é proprietária dos imóveis).
            Promoção de Venda excluída dos desembolsos pois é conta de receita (sub-análise de vendas promocionais), não custo de caixa.
          </span>
        </div>
      )}

      <div className="cf-footer">
        Gerado em {data.generated_at} · Horizonte: {data.reference_date} → {data.end_date} ·
        Algoritmo: WMA 3m + Sazonalidade FMCG + Perfis Operacionais · Fonte: EPBCS VendaDia
      </div>

    </div>
  )
}
