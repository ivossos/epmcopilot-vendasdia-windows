import { useState, useMemo, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
)

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtR = (v) => {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toFixed(1).replace('.', ',')}B`
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toFixed(1).replace('.', ',')}M`
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toFixed(0).replace('.', ',')}K`
  return `${s}R$ ${a.toFixed(0)}`
}
const fmtPct = (v) =>
  v == null || isNaN(v) ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%'

const MES_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// ── Pct attainment badge ─────────────────────────────────────────────────────
function PctBadge({ ratio }) {
  if (ratio == null || isNaN(ratio)) return <span className="tm2-badge neutral">—</span>
  const pct = ratio
  const cls = pct >= 1 ? 'green' : pct >= 0.9 ? 'yellow' : 'red'
  return <span className={`tm2-badge ${cls}`}>{(pct * 100).toFixed(1).replace('.', ',')}%</span>
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, trend }) {
  return (
    <div className="tm2-kpi-card">
      <div className="tm2-kpi-icon" style={{ background: color + '18', color }}>{icon}</div>
      <div className="tm2-kpi-body">
        <div className="tm2-kpi-label">{label}</div>
        <div className="tm2-kpi-value" style={{ color }}>{value}</div>
        {sub && <div className="tm2-kpi-sub">{sub}</div>}
      </div>
      {trend != null && (
        <div className="tm2-kpi-trend" style={{ color: trend >= 0 ? '#16a34a' : '#dc2626' }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TradeMktDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('filial')
  const [mesFilter, setMesFilter] = useState('all')
  const [filialFilter, setFilialFilter] = useState('all')
  const [setorFilter, setSetorFilter] = useState('all')
  const [topN, setTopN] = useState(20)
  const [search, setSearch] = useState('')
  const [anoFilter, setAnoFilter] = useState('FY2026')

  useEffect(() => {
    fetch('/data/trade_mkt.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // ── Total BU row ────────────────────────────────────────────────────────────
  const totalBU = useMemo(() => {
    if (!data?.base) return null
    return data.base.find((r) => r.filial?.includes('Total BU') || r.filial?.startsWith('-'))
  }, [data])

  // ── Por Filial rows ─────────────────────────────────────────────────────────
  const filialRows = useMemo(() => {
    if (!data) return []

    // When a month is selected, aggregate from analise_setor_filial by filial
    if (mesFilter !== 'all' && data.analise_setor_filial?.length) {
      let src = data.analise_setor_filial.filter((r) => r.mes === mesFilter)
      if (filialFilter !== 'all') src = src.filter((r) => r.filial === filialFilter)
      const byFilial = {}
      src.forEach((r) => {
        const k = r.filial
        if (!byFilial[k]) byFilial[k] = { filial: k, cota: 0, lo: 0, vaa: 0, laa: 0 }
        byFilial[k].cota += r.venda_orcado_2026 || 0
        byFilial[k].lo   += r.lucratividade_orcado_2026 || 0
        byFilial[k].vaa  += r.venda_realizado_2025 || 0
        byFilial[k].laa  += r.lucratividade_realizado_2025 || 0
      })
      let rows = Object.values(byFilial).filter((r) => r.cota > 0 || r.vaa > 0)
      if (search) rows = rows.filter((r) => r.filial.toLowerCase().includes(search.toLowerCase()))
      rows.sort((a, b) => (b.cota || 0) - (a.cota || 0))
      return rows.slice(0, topN).map((r) => ({
        label: r.filial,
        cota: r.cota,
        venda: r.cota,           // FY26 budget (no FY26 actuals at monthly level)
        pct_ating: null,
        venda_aa: r.vaa,
        delta_aa: r.vaa ? (r.cota - r.vaa) / r.vaa : null,
        lucrat: r.lo,
        margem: r.vaa ? r.laa / r.vaa : null,
        margem_obj: r.cota ? r.lo / r.cota : null,
      }))
    }

    // No month filter — use base sheet (FY26 YTD actuals)
    if (!data.base) return []
    let rows = data.base.filter(
      (r) => r.filial && !r.filial.startsWith('-') && r.venda_realizado != null,
    )
    if (filialFilter !== 'all') rows = rows.filter((r) => r.filial === filialFilter)
    if (search) rows = rows.filter((r) => r.filial.toLowerCase().includes(search.toLowerCase()))
    rows.sort((a, b) => (b.venda_realizado || 0) - (a.venda_realizado || 0))
    return rows.slice(0, topN).map((r) => ({
      label: r.filial,
      cota: r.venda_orcado,
      venda: r.venda_realizado,
      pct_ating: r.pct_ating_venda_orc,
      venda_aa: null,
      delta_aa: null,
      lucrat: r.lucratividade_realizado,
      margem: r.margem_real,
      margem_obj: r.margem_orc,
    }))
  }, [data, mesFilter, filialFilter, search, topN])

  // ── Por Setor rows ──────────────────────────────────────────────────────────
  const setorRows = useMemo(() => {
    if (!data?.analise_setor_filial) return []
    let rows = data.analise_setor_filial
    if (mesFilter !== 'all') rows = rows.filter((r) => r.mes === mesFilter)
    if (setorFilter !== 'all') rows = rows.filter((r) => r.setor === setorFilter)
    const byKey = {}
    rows.forEach((r) => {
      const k = r.setor
      if (!byKey[k]) byKey[k] = { setor: k, cota: 0, lo: 0, vaa: 0, laa: 0 }
      byKey[k].cota += r.venda_orcado_2026 || 0
      byKey[k].lo += r.lucratividade_orcado_2026 || 0
      byKey[k].vaa += r.venda_realizado_2025 || 0
      byKey[k].laa += r.lucratividade_realizado_2025 || 0
    })
    const isAA = anoFilter === 'FY2025'
    return Object.values(byKey)
      .filter((r) => r.cota > 0 || r.vaa > 0)
      .map((r) => {
        const primary = isAA ? r.vaa : r.cota
        const compare = isAA ? r.cota : r.vaa
        return {
          label: r.setor,
          cota: r.cota,
          venda: primary,
          pct_ating: null,
          venda_aa: compare,
          delta_aa: compare ? (primary - compare) / compare : null,
          lucrat: isAA ? r.laa : r.lo,
          margem: isAA ? (r.vaa ? r.laa / r.vaa : null) : (r.cota ? r.lo / r.cota : null),
          margem_obj: isAA ? (r.cota ? r.lo / r.cota : null) : (r.vaa ? r.laa / r.vaa : null),
        }
      })
      .sort((a, b) => (b.venda || 0) - (a.venda || 0))
  }, [data, mesFilter, setorFilter, anoFilter])

  // ── Por Fornecedor rows ─────────────────────────────────────────────────────
  const fornecedorRows = useMemo(() => {
    if (!data?.analise_fornecedor) return []
    let rows = data.analise_fornecedor
    if (mesFilter !== 'all') rows = rows.filter((r) => r.mes === mesFilter)
    const byKey = {}
    rows.forEach((r) => {
      const k = r.fornecedor
      if (!byKey[k]) byKey[k] = { fn: k, co: 0, vaa: 0, moPct: 0, moW: 0, maPct: 0, maW: 0 }
      byKey[k].co += r.venda_orcado_2026 || 0
      byKey[k].vaa += r.venda_realizado_2025 || 0
      if (r.venda_orcado_2026 && r.margem_orcado_2026 != null) {
        byKey[k].moPct += r.margem_orcado_2026 * r.venda_orcado_2026
        byKey[k].moW += r.venda_orcado_2026
      }
      if (r.venda_realizado_2025 && r.margem_realizado_2025 != null) {
        byKey[k].maPct += r.margem_realizado_2025 * r.venda_realizado_2025
        byKey[k].maW += r.venda_realizado_2025
      }
    })
    const isAA = anoFilter === 'FY2025'
    let result = Object.values(byKey)
      .filter((r) => r.co > 0 || r.vaa > 0)
      .map((r) => {
        const primary = isAA ? r.vaa : r.co
        const compare = isAA ? r.co : r.vaa
        return {
          label: r.fn,
          cota: r.co,
          venda: primary,
          pct_ating: null,
          venda_aa: compare,
          delta_aa: compare ? (primary - compare) / compare : null,
          lucrat: null,
          margem: isAA ? (r.maW ? r.maPct / r.maW : null) : (r.moW ? r.moPct / r.moW : null),
          margem_obj: isAA ? (r.moW ? r.moPct / r.moW : null) : (r.maW ? r.maPct / r.maW : null),
        }
      })
      .sort((a, b) => (b.venda || 0) - (a.venda || 0))
    if (search) result = result.filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
    return result.slice(0, topN)
  }, [data, mesFilter, search, topN])

  // ── Current rows ────────────────────────────────────────────────────────────
  const currentRows = view === 'filial' ? filialRows : view === 'setor' ? setorRows : fornecedorRows

  // ── Filter options ──────────────────────────────────────────────────────────
  const meses = useMemo(() => {
    const s = new Set()
    data?.analise_setor_filial?.forEach((r) => r.mes && s.add(r.mes))
    data?.analise_fornecedor?.forEach((r) => r.mes && s.add(r.mes))
    return [...s].sort((a, b) => MES_ORDER.indexOf(a) - MES_ORDER.indexOf(b))
  }, [data])

  const setores = useMemo(() => {
    const s = new Set()
    data?.analise_setor_filial?.forEach((r) => r.setor && s.add(r.setor))
    return [...s].sort()
  }, [data])

  const filiais = useMemo(() => {
    if (!data?.base) return []
    return [...new Set(data.base
      .filter((r) => r.filial && !r.filial.startsWith('-') && r.venda_realizado != null)
      .map((r) => r.filial))]
      .sort()
  }, [data])

  // ── Short label helper ──────────────────────────────────────────────────────
  const shortLabel = (s) => {
    if (!s) return ''
    // Keep the store code (e.g. "SVG0001") + city to ensure uniqueness
    let m = s.match(/([A-Z]+\d+)\s*-\s*(.+)/i)
    if (m) return (m[1] + ' ' + m[2]).slice(0, 18)
    return s.slice(0, 18)
  }

  const displayLabel = (s) => {
    if (!s) return ''
    return s
  }

  // ── Chart ───────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const rows = currentRows.slice(0, 15)
    const colors = rows.map((r) => {
      if (r.pct_ating != null) return r.pct_ating >= 1 ? '#16a34a' : r.pct_ating >= 0.9 ? '#d97706' : '#dc2626'
      if (r.delta_aa != null) return r.delta_aa >= 0 ? '#16a34a' : r.delta_aa >= -0.05 ? '#d97706' : '#dc2626'
      return '#3b82f6'
    })
    const datasets = view === 'filial'
      ? [
          {
            label: 'Venda Realizado FY26',
            data: rows.map((r) => (r.venda || 0) / 1e6),
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: 'Orçado FY26',
            data: rows.map((r) => (r.cota || 0) / 1e6),
            backgroundColor: 'rgba(148,163,184,0.3)',
            borderColor: 'rgba(148,163,184,0.6)',
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
          },
        ]
      : [
          {
            label: 'Orçado FY26',
            data: rows.map((r) => (r.cota || 0) / 1e6),
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: 'Realizado FY25 (AA)',
            data: rows.map((r) => (r.venda_aa || 0) / 1e6),
            backgroundColor: 'rgba(148,163,184,0.3)',
            borderColor: 'rgba(148,163,184,0.6)',
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
          },
        ]
    return { labels: rows.map((r) => shortLabel(r.label)), datasets }
  }, [currentRows, view])

  // ── Donut ───────────────────────────────────────────────────────────────────
  const donutData = useMemo(() => {
    if (view === 'filial') {
      const rows = currentRows.filter((r) => r.pct_ating != null)
      return {
        labels: ['≥ 100%', '90–99%', '< 90%'],
        datasets: [{
          data: [
            rows.filter((r) => r.pct_ating >= 1).length,
            rows.filter((r) => r.pct_ating >= 0.9 && r.pct_ating < 1).length,
            rows.filter((r) => r.pct_ating < 0.9).length,
          ],
          backgroundColor: ['#16a34a', '#d97706', '#dc2626'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      }
    }
    const rows = currentRows.filter((r) => r.delta_aa != null)
    return {
      labels: ['▲ vs AA', '≈ AA', '▼ vs AA'],
      datasets: [{
        data: [
          rows.filter((r) => r.delta_aa > 0.02).length,
          rows.filter((r) => Math.abs(r.delta_aa) <= 0.02).length,
          rows.filter((r) => r.delta_aa < -0.02).length,
        ],
        backgroundColor: ['#16a34a', '#d97706', '#dc2626'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    }
  }, [currentRows, view])

  const viewTitle = {
    filial: 'Acompanhamento Diário de Vendas por Filial',
    setor: 'Acompanhamento Diário de Vendas por Setor',
    fornecedor: 'Acompanhamento Diário de Vendas por Fornecedor',
  }[view]

  // ── Totals footer ───────────────────────────────────────────────────────────
  const totCota = currentRows.reduce((s, r) => s + (r.cota || 0), 0)
  const totVenda = currentRows.reduce((s, r) => s + (r.venda || 0), 0)
  const totPctAting = totCota ? totVenda / totCota : null

  if (loading) {
    return (
      <div className="tm2-loading">
        <div className="tm2-spinner" />
        <p>Carregando análise Trade Marketing…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="tm2-error">
        <h3>Dados não encontrados</h3>
        <p>Arquivo <code>/data/trade_mkt.json</code> não disponível.</p>
      </div>
    )
  }

  return (
    <div className="tm2-root">

      {/* ── Header ── */}
      <div className="tm2-header">
        <div className="tm2-header-left">
          <div className="tm2-breadcrumb">Oracle EPM Planning · Vendas · Reports</div>
          <h1 className="tm2-title">{viewTitle}</h1>
        </div>
        <div className="tm2-header-right">
          <span className="tm2-ds-badge">
          Vendas VendaDia ·{' '}
          {view === 'filial' ? 'FY2026' : anoFilter === 'FY2025' ? 'FY2025' : 'FY2026'}
          {mesFilter !== 'all' ? ` · ${mesFilter}` : ''}
        </span>
        </div>
      </div>

      {/* ── Dimension bar (EPBCS-style) ── */}
      <div className="tm2-dimbar">
        {[
          { label: 'Período', val: 'Bottom Members' },
          { label: 'Negócio', val: 'Desc. of Total' },
          view !== 'filial' ? { label: 'Filial', val: 'Desc. of Total' } : null,
          view === 'filial' ? { label: 'Canal', val: 'Desc. of Total' } : null,
          view !== 'setor' ? { label: 'Setor', val: 'Desc. of Setor' } : null,
          { label: 'Comprador', val: 'Desc. of Total' },
          view !== 'fornecedor' ? { label: 'Fornecedor', val: 'Desc. of Total' } : null,
          { label: 'Produto', val: 'Total Produto' },
          { label: 'Tipo de Valor', val: 'Valor Final' },
        ].filter(Boolean).map((d) => (
          <div key={d.label} className="tm2-dim-item">
            <span className="tm2-dim-label">{d.label}</span>
            <span className="tm2-dim-val">{d.val}</span>
          </div>
        ))}
      </div>

      {/* ── KPI strip ── */}
      {totalBU && (
        <div className="tm2-kpi-strip">
          <KpiCard
            label="Total Venda FY26"
            value={fmtR(totalBU.venda_realizado)}
            sub={`Orçado: ${fmtR(totalBU.venda_orcado)}`}
            color="#c41e3a"
            icon="💰"
            trend={totalBU.pct_ating_venda_orc != null ? (totalBU.pct_ating_venda_orc - 1) * 100 : null}
          />
          <KpiCard
            label="% Atingimento"
            value={fmtPct(totalBU.pct_ating_venda_orc)}
            sub="vs Orçado FY26 (Trabalho)"
            color={totalBU.pct_ating_venda_orc >= 1 ? '#16a34a' : totalBU.pct_ating_venda_orc >= 0.9 ? '#d97706' : '#dc2626'}
            icon="🎯"
          />
          <KpiCard
            label="Lucratividade Total"
            value={fmtR(totalBU.lucratividade_realizado)}
            sub={`Orçado: ${fmtR(totalBU.lucratividade_orcado)}`}
            color="#0ea5e9"
            icon="📈"
          />
          <KpiCard
            label="% Margem Real"
            value={fmtPct(totalBU.margem_real)}
            sub={`Obj: ${fmtPct(totalBU.margem_orc)}`}
            color="#8b5cf6"
            icon="📊"
            trend={totalBU.margem_real != null && totalBU.margem_orc != null
              ? (totalBU.margem_real - totalBU.margem_orc) * 100
              : null}
          />
          <KpiCard
            label="Filiais Ativas"
            value={filiais.length}
            sub="com dados FY26"
            color="#f59e0b"
            icon="🏪"
          />
        </div>
      )}

      {/* ── Controls ── */}
      <div className="tm2-controls">
        <div className="tm2-view-tabs">
          {[
            ['filial', '🏪 Por Filial'],
            ['setor', '🗂️ Por Setor'],
            ['fornecedor', '🚚 Por Fornecedor'],
          ].map(([v, label]) => (
            <button
              key={v}
              className={`tm2-view-tab ${view === v ? 'active' : ''}`}
              onClick={() => { setView(v); setSearch('') }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tm2-filters">
          {view !== 'filial' && (
            <div className="tm2-filter">
              <label>Ano</label>
              <select value={anoFilter} onChange={(e) => setAnoFilter(e.target.value)}>
                <option value="FY2026">2026</option>
                <option value="FY2025">2025</option>
              </select>
            </div>
          )}

          {meses.length > 0 && (
            <div className="tm2-filter">
              <label>Mês</label>
              <select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)}>
                <option value="all">Todos os meses</option>
                {meses.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}
          {view === 'setor' && (
            <div className="tm2-filter">
              <label>Setor</label>
              <select value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)}>
                <option value="all">Todos</option>
                {setores.map((s) => <option key={s} value={s}>{s.slice(0, 40)}</option>)}
              </select>
            </div>
          )}
          {view === 'filial' && (
            <div className="tm2-filter">
              <label>Filial</label>
              <select value={filialFilter} onChange={(e) => setFilialFilter(e.target.value)}>
                <option value="all">Todas</option>
                {filiais.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
          <div className="tm2-filter">
            <label>Top</label>
            <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
              {[10, 15, 20, 25, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="tm2-filter tm2-search">
            <input
              type="text"
              placeholder={`Buscar…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Chart + Table layout ── */}
      <div className="tm2-body">

        {/* ── Chart panel ── */}
        <div className="tm2-chart-panel">
          <div className="tm2-panel-hdr">
            <h3>Desempenho de Vendas</h3>
            <span className="tm2-panel-sub">
              {view === 'filial'
                ? `FY26 Real vs Orçado · ${mesFilter !== 'all' ? mesFilter : 'Acumulado'}`
                : anoFilter === 'FY2025'
                  ? `FY25 Realizado vs FY26 Orçado · ${mesFilter !== 'all' ? mesFilter : 'Acumulado'}`
                  : `FY26 Orçado vs FY25 Realizado · ${mesFilter !== 'all' ? mesFilter : 'Acumulado'}`}
            </span>
          </div>

          <div className="tm2-charts-inner">
            <div className="tm2-bar-wrap">
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  plugins: {
                    legend: {
                      display: true, position: 'top',
                      labels: { color: '#64748b', boxWidth: 11, padding: 10, font: { size: 11 } },
                    },
                    tooltip: {
                      callbacks: {
                        label: (ctx) =>
                          ` ${ctx.dataset.label}: R$ ${(ctx.parsed.x || 0).toFixed(2).replace('.', ',')}M`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      beginAtZero: true,
                      grid: { color: '#f1f5f9' },
                      ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => `R$${v}M` },
                    },
                    y: {
                      grid: { display: false },
                      ticks: { color: '#475569', font: { size: 10 } },
                    },
                  },
                }}
              />
            </div>

            <div className="tm2-donut-wrap">
              <div className="tm2-donut-title">
                {view === 'filial' ? 'Atingimento FY26' : 'Var. vs AA'}
              </div>
              <div className="tm2-donut-chart">
                <Doughnut
                  data={donutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          color: '#64748b', boxWidth: 9, padding: 8, font: { size: 10 },
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Table panel ── */}
        <div className="tm2-table-panel">
          <div className="tm2-panel-hdr">
            <h3>
              {view === 'filial' ? 'Por Filial' : view === 'setor' ? 'Por Setor' : 'Por Fornecedor'}
              {' '}· Tabela Analítica
            </h3>
            <span className="tm2-panel-sub">{currentRows.length} registros</span>
          </div>

          <div className="tm2-table-scroll">
            <table className="tm2-table">
              <thead>
                <tr>
                  <th className="tm2-th-left">
                    {view === 'filial' ? 'Filial' : view === 'setor' ? 'Setor' : 'Fornecedor'}
                  </th>
                  <th className="tm2-th-right">
                    {view === 'filial' ? 'Cota FY26' : anoFilter === 'FY2025' ? 'Cota 2026' : 'Cota 2026'}
                  </th>
                  <th className="tm2-th-right">
                    {view === 'filial'
                      ? (mesFilter !== 'all' ? `Orç. ${mesFilter}` : 'Venda FY26')
                      : anoFilter === 'FY2025' ? 'Realiz. 2025' : 'Orç. 2026'}
                  </th>
                  <th className="tm2-th-right">
                    {view === 'filial'
                      ? (mesFilter !== 'all' ? 'Δ vs 2025' : '% Ating.')
                      : 'Δ vs Comparat.'}
                  </th>
                  {view === 'filial' && <th className="tm2-th-right">Lucrat.</th>}
                  {view !== 'filial' && <th className="tm2-th-right">Orçado FY26</th>}
                  <th className="tm2-th-right">% Margem</th>
                  <th className="tm2-th-right">Obj. Margem</th>
                </tr>
              </thead>

              <tbody>
                {currentRows.map((r, i) => {
                  const highlight = view === 'filial'
                    ? (r.pct_ating == null ? '' : r.pct_ating >= 1 ? 'tm2-row-green' : r.pct_ating >= 0.9 ? 'tm2-row-yellow' : 'tm2-row-red')
                    : (r.delta_aa == null ? '' : r.delta_aa > 0.02 ? 'tm2-row-green' : r.delta_aa > -0.05 ? 'tm2-row-yellow' : 'tm2-row-red')
                  return (
                    <tr key={i} className={`tm2-tr ${i % 2 ? 'tm2-row-band' : ''} ${highlight}`}>
                      <td className="tm2-td-left" title={r.label}>
                        {displayLabel(r.label)}
                      </td>
                      <td className="tm2-td-right">{fmtR(r.cota)}</td>
                      <td className="tm2-td-right tm2-bold">
                        {fmtR(r.venda)}
                      </td>
                      <td className="tm2-td-right">
                        {view === 'filial' && mesFilter === 'all'
                          ? <PctBadge ratio={r.pct_ating} />
                          : r.delta_aa != null
                            ? <span style={{ color: r.delta_aa >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                {r.delta_aa >= 0 ? '▲' : '▼'} {Math.abs(r.delta_aa * 100).toFixed(1).replace('.', ',')}%
                              </span>
                            : '—'}
                      </td>
                      {view === 'filial' && (
                        <td className="tm2-td-right">{fmtR(r.lucrat)}</td>
                      )}
                      {view !== 'filial' && (
                        <td className="tm2-td-right">{fmtR(r.cota)}</td>
                      )}
                      <td className="tm2-td-right">
                        {r.margem != null
                          ? <span style={{
                              color: r.margem_obj && r.margem >= r.margem_obj
                                ? '#16a34a' : '#64748b',
                            }}>
                              {fmtPct(r.margem)}
                            </span>
                          : '—'}
                      </td>
                      <td className="tm2-td-right" style={{ color: '#94a3b8' }}>
                        {fmtPct(r.margem_obj)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                <tr className="tm2-tfoot">
                  <td className="tm2-td-left">Total ({currentRows.length})</td>
                  <td className="tm2-td-right">{fmtR(totCota)}</td>
                  <td className="tm2-td-right tm2-bold">
                    {fmtR(currentRows.reduce((s, r) => s + (r.venda || 0), 0))}
                  </td>
                  <td className="tm2-td-right">
                    {view === 'filial' && mesFilter === 'all'
                      ? <PctBadge ratio={totPctAting} />
                      : (() => {
                          const vaa = currentRows.reduce((s, r) => s + (r.venda_aa || 0), 0)
                          const d = vaa ? (totCota - vaa) / vaa : null
                          return d != null
                            ? <span style={{ color: d >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                {d >= 0 ? '▲' : '▼'} {Math.abs(d * 100).toFixed(1)}%
                              </span>
                            : '—'
                        })()}
                  </td>
                  <td colSpan={view === 'filial' ? 3 : 3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="tm2-footer">
        Fonte: análise_trade_mkt.xlsx · Oracle EPM Planning (EPBCS) · Layout: demo-telas.docx ·
        FY2026 · {new Date().toLocaleDateString('pt-BR')}
      </div>
    </div>
  )
}
