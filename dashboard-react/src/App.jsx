import { useState, useEffect, useMemo } from 'react'
import CashFlowDashboard from './CashFlowDashboard'
import TradeMktDashboard from './TradeMktDashboard'
import AssumptionsConfig from './AssumptionsConfig'
import HelpPage from './HelpPage'
import VendasDiaDashboard from './VendasDiaDashboard'
import AcompanhamentoDiario from './AcompanhamentoDiario'
import ProdutosDashboard from './ProdutosDashboard'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar, Radar } from 'react-chartjs-2'
import './App.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend,
)

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const KPI_ORDER = ['Total Venda', 'Qtd Venda', 'Lucratividade Total', 'Custo Bruto Produto', 'Custo Liquido Produto', 'Promocao de Venda', 'Impostos Venda', 'Comissao', 'Verba PDV', 'Despesa']
const KPI_COLORS = ['#c41e3a', '#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#10b981', '#64748b']
const CATEGORIA_LABELS = { 'Total Categoria': 'Total Categoria', 'All Categoria': 'All Categoria', 'N01_7384': 'Perecíveis', 'N01_7756': 'Mercearia', 'N01_4315': 'Posto Combustível' }
const SCENARIO_LABELS = {
  'Real/Trabalho': 'Real',
  'Orc/Oficial': 'Orçamento',
  'Orc/Trabalho': 'Orçamento (Trabalho)',
  'Orc Original/Oficial': 'Orçamento Original',
  'Orc Original/Trabalho': 'Orçamento Original (Trabalho)',
  'Orcamento/Oficial': 'Orçamento',
}
const ORC_SCENARIOS = ['Orc/Oficial', 'Orc/Trabalho', 'Orc Original/Oficial', 'Orc Original/Trabalho', 'Orcamento/Oficial']
const isOrcScenario = (s) => s && ORC_SCENARIOS.includes(s)

function formatCurrencyMillions(v) {
  if (v >= 1e9) return 'R$ ' + (v / 1e9).toFixed(1).replace('.', ',') + ' B'
  if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' M'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function formatNumber(v) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v)
}
const isCurrencyKpi = (kpi) => kpi !== 'Qtd Venda'

function sumAccount(records, account) {
  let recs = records.filter(r => r.account === account)
  if (recs.some(r => r.filial === 'All BU')) recs = recs.filter(r => r.filial === 'All BU')
  if (recs.some(r => r.categoria === 'Total Categoria')) recs = recs.filter(r => r.categoria === 'Total Categoria')
  return recs.reduce((s, r) => s + r.value, 0)
}

function App() {
  const [activeTab, setActiveTab] = useState('trademkt')
  const [data, setData] = useState({ records: [] })
  const [scenario, setScenario] = useState('all')
  const [year, setYear] = useState('all')
  const [filial, setFilial] = useState('all')
  const [month, setMonth] = useState('all')
  const [categoria, setCategoria] = useState('all')
  const [kpi, setKpi] = useState('Total Venda')

  useEffect(() => {
    fetch('/data/dashboard_data.json')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(Array.isArray(d.records) ? d : { records: [] }))
      .catch(() => setData({ records: [] }))
  }, [])

  const records = useMemo(() => {
    return (data.records || []).filter(r => {
      if (scenario !== 'all' && (r.scenario || 'Real/Trabalho') !== scenario) return false
      if (year !== 'all' && r.year !== year) return false
      if (filial !== 'all' && r.filial !== filial) return false
      if (month !== 'all' && r.month !== month) return false
      if (categoria !== 'all' && r.categoria !== categoria) return false
      return true
    })
  }, [data, scenario, year, filial, month, categoria])

  const scenarios = useMemo(() => [...new Set((data.records || []).map(r => r.scenario || 'Real/Trabalho'))].sort((a,b) => a === 'Real/Trabalho' ? -1 : a.localeCompare(b)), [data])
  const years = useMemo(() => [...new Set((data.records || []).map(r => r.year))].sort(), [data])
  const filiais = useMemo(() => [...new Set((data.records || []).map(r => r.filial))].sort((a,b) => a === 'All BU' ? -1 : a.localeCompare(b)), [data])
  const categorias = useMemo(() => [...new Set((data.records || []).map(r => r.categoria).filter(Boolean))].sort((a,b) => (a === 'Total Categoria' ? -1 : a === 'All Categoria' ? 0 : 1) - (b === 'Total Categoria' ? -1 : b === 'All Categoria' ? 0 : 1)), [data])
  const accounts = useMemo(() => [...new Set([...KPI_ORDER, ...(data.records || []).map(r => r.account)])].filter(Boolean).sort((a,b) => KPI_ORDER.indexOf(a) - KPI_ORDER.indexOf(b)), [data])

  let useRecs = records
  if (useRecs.some(r => r.filial === 'All BU')) useRecs = useRecs.filter(r => r.filial === 'All BU')
  if (useRecs.some(r => r.categoria === 'Total Categoria')) useRecs = useRecs.filter(r => r.categoria === 'Total Categoria')

  const hasBoth = useRecs.some(r => (r.scenario || 'Real/Trabalho') === 'Real/Trabalho') && useRecs.some(r => isOrcScenario(r.scenario))
  const baseRecs = hasBoth ? useRecs.filter(r => (r.scenario || 'Real/Trabalho') === 'Real/Trabalho') : useRecs

  const byMonthScn = useMemo(() => {
    const out = {}
    useRecs.filter(r => r.account === kpi).forEach(r => {
      const scn = r.scenario || 'Real/Trabalho'
      const k = `${r.year}-${r.month}`
      if (!out[scn]) out[scn] = {}
      out[scn][k] = (out[scn][k] || 0) + r.value
    })
    return out
  }, [useRecs, kpi])

  const allKeys = useMemo(() => [...new Set(Object.values(byMonthScn).flatMap(o => Object.keys(o)))].sort((a, b) => {
    const [ya, ma] = a.split('-')
    const [yb, mb] = b.split('-')
    if (ya !== yb) return ya.localeCompare(yb)
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb)
  }), [byMonthScn])

  const chartLabels = allKeys.map(k => {
    const [y, m] = k.split('-')
    return `${MONTH_ORDER.indexOf(m)+1}/${y.replace('FY','')}`
  })
  const divisor = 1e6

  const chartDatasets = useMemo(() => {
    if (hasBoth) {
      return [
        { label: 'Real', data: allKeys.map(k => (byMonthScn['Real/Trabalho']?.[k] || 0) / divisor), borderColor: '#c41e3a', backgroundColor: 'rgba(196, 30, 58, 0.15)', fill: true, tension: 0.3 },
        { label: 'Orçado', data: allKeys.map(k => {
        const orcVal = (byMonthScn['Orc/Oficial'] ?? byMonthScn['Orc/Trabalho'] ?? byMonthScn['Orc Original/Oficial'] ?? byMonthScn['Orc Original/Trabalho'] ?? byMonthScn['Orcamento/Oficial'] ?? {})[k] || 0
        return orcVal / divisor
      }), borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.15)', fill: true, tension: 0.3 },
      ]
    }
    const byMonth = byMonthScn[Object.keys(byMonthScn)[0]] || {}
    return [{ label: isCurrencyKpi(kpi) ? `${kpi} (R$ milhões)` : `${kpi} (milhões)`, data: allKeys.map(k => (byMonth[k] || 0) / divisor), borderColor: '#c41e3a', backgroundColor: 'rgba(196, 30, 58, 0.2)', fill: true, tension: 0.3 }]
  }, [hasBoth, byMonthScn, allKeys, kpi])

  const byMonthAll = useMemo(() => {
    const out = {}
    useRecs.forEach(r => {
      const k = `${r.year}-${r.month}`
      if (!out[k]) out[k] = {}
      out[k][r.account] = (out[k][r.account] || 0) + r.value
    })
    return out
  }, [useRecs])

  const sortedMonths = useMemo(() => Object.entries(byMonthAll).sort((a, b) => {
    const [ya, ma] = a[0].split('-')
    const [yb, mb] = b[0].split('-')
    if (ya !== yb) return ya.localeCompare(yb)
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb)
  }), [byMonthAll])

  const lastMonthKey = sortedMonths[sortedMonths.length - 1]?.[0]
  const byFilialLast = useMemo(() => {
    const [y, m] = lastMonthKey ? lastMonthKey.split('-') : ['', '']
    const out = {}
    records.filter(r => r.account === kpi && r.year === y && r.month === m).forEach(r => {
      out[r.filial] = (out[r.filial] || 0) + r.value
    })
    return out
  }, [records, kpi, lastMonthKey])

  const totalVendaRecs = records.filter(r => r.account === 'Total Venda')
  let useForLastMonth = totalVendaRecs
  if (useForLastMonth.some(r => r.filial === 'All BU')) useForLastMonth = useForLastMonth.filter(r => r.filial === 'All BU')
  if (useForLastMonth.some(r => r.categoria === 'Total Categoria')) useForLastMonth = useForLastMonth.filter(r => r.categoria === 'Total Categoria')
  const byMonthVenda = {}
  useForLastMonth.forEach(r => {
    const k = `${r.year}-${r.month}`
    byMonthVenda[k] = (byMonthVenda[k] || 0) + r.value
  })
  const monthsVenda = Object.keys(byMonthVenda).sort((a, b) => {
    const [ya, ma] = a.split('-')
    const [yb, mb] = b.split('-')
    if (ya !== yb) return ya.localeCompare(yb)
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb)
  })
  const lastMonthVal = monthsVenda.length ? byMonthVenda[monthsVenda[monthsVenda.length-1]] : 0
  const prevMonthVal = monthsVenda.length > 1 ? byMonthVenda[monthsVenda[monthsVenda.length-2]] : 0
  const pctVar = prevMonthVal ? ((lastMonthVal - prevMonthVal) / prevMonthVal * 100).toFixed(1) : 0

  const realRecs = records.filter(r => (r.scenario || 'Real/Trabalho') === 'Real/Trabalho')
  const orcRecs = records.filter(r => isOrcScenario(r.scenario))
  let useReal = realRecs, useOrc = orcRecs
  if (useReal.some(r => r.filial === 'All BU')) useReal = useReal.filter(r => r.filial === 'All BU')
  if (useOrc.some(r => r.filial === 'All BU')) useOrc = useOrc.filter(r => r.filial === 'All BU')
  if (useReal.some(r => r.categoria === 'Total Categoria')) useReal = useReal.filter(r => r.categoria === 'Total Categoria')
  if (useOrc.some(r => r.categoria === 'Total Categoria')) useOrc = useOrc.filter(r => r.categoria === 'Total Categoria')
  const realVsOrcRows = [...new Set([...useReal, ...useOrc].map(r => r.account))].sort((a,b) => KPI_ORDER.indexOf(a) - KPI_ORDER.indexOf(b)).map(acc => {
    const vReal = useReal.filter(r => r.account === acc).reduce((s, r) => s + r.value, 0)
    const vOrc = useOrc.filter(r => r.account === acc).reduce((s, r) => s + r.value, 0)
    const varPct = vOrc ? ((vReal - vOrc) / vOrc * 100).toFixed(1) : '—'
    return { acc, vReal, vOrc, varPct }
  })

  const totalVenda = baseRecs.filter(r => r.account === 'Total Venda').reduce((s, r) => s + r.value, 0)
  const totalQtd = baseRecs.filter(r => r.account === 'Qtd Venda').reduce((s, r) => s + r.value, 0)
  const lucratividade = baseRecs.filter(r => r.account === 'Lucratividade Total').reduce((s, r) => s + r.value, 0)
  const custoBruto = baseRecs.filter(r => r.account === 'Custo Bruto Produto').reduce((s, r) => s + r.value, 0)
  const byMonthNarr = {}
  baseRecs.filter(r => r.account === 'Total Venda').forEach(r => {
    const k = `${r.year}-${r.month}`
    byMonthNarr[k] = (byMonthNarr[k] || 0) + r.value
  })
  const monthsNarr = Object.keys(byMonthNarr).sort((a, b) => {
    const [ya, ma] = a.split('-')
    const [yb, mb] = b.split('-')
    if (ya !== yb) return ya.localeCompare(yb)
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb)
  })
  const lastVal = monthsNarr.length ? byMonthNarr[monthsNarr[monthsNarr.length-1]] : 0
  const prevVal = monthsNarr.length > 1 ? byMonthNarr[monthsNarr[monthsNarr.length-2]] : 0
  const pctVarNarr = prevVal ? ((lastVal - prevVal) / prevVal * 100) : 0
  const byFilialNarr = {}
  baseRecs.filter(r => r.account === 'Total Venda').forEach(r => {
    byFilialNarr[r.filial] = (byFilialNarr[r.filial] || 0) + r.value
  })
  const filiaisNarr = Object.entries(byFilialNarr).sort((a,b) => b[1] - a[1])
  const topFilial = filiaisNarr.length > 1 ? filiaisNarr[0] : null
  const margem = totalVenda > 0 ? (lucratividade / totalVenda * 100).toFixed(1) : 0
  const promocao = baseRecs.filter(r => r.account === 'Promocao de Venda').reduce((s, r) => s + r.value, 0)

  const insights = []
  if (useRecs.some(r => (r.scenario || 'Real/Trabalho') === 'Real/Trabalho') && useRecs.some(r => isOrcScenario(r.scenario))) {
    const realVenda = useRecs.filter(r => (r.scenario || 'Real/Trabalho') === 'Real/Trabalho' && r.account === 'Total Venda').reduce((s,r) => s + r.value, 0)
    const orcVenda = useRecs.filter(r => isOrcScenario(r.scenario) && r.account === 'Total Venda').reduce((s,r) => s + r.value, 0)
    const varPct = orcVenda ? ((realVenda - orcVenda) / orcVenda * 100).toFixed(1) : null
    if (varPct !== null) {
      const pctStr = (parseFloat(varPct) >= 0 ? '+' : '') + varPct + '%'
      insights.push({ key: 'real-orc', html: '<strong>Real x Orçado:</strong> Total Venda Real ' + formatCurrencyMillions(realVenda) + ' vs Orçado ' + formatCurrencyMillions(orcVenda) + ' - variação ' + pctStr + '.' })
    }
  }
  insights.push({ key: 'total', html: '<strong>Total Venda</strong> alcançou ' + formatCurrencyMillions(totalVenda) + ', com <strong>' + formatNumber(totalQtd) + '</strong> unidades vendidas.' })
  if (monthsNarr.length >= 2 && prevVal > 0) insights.push({ key: 'var', html: 'Em relação ao mês anterior, houve ' + (pctVarNarr >= 0 ? 'alta' : 'queda') + ' de <strong>' + Math.abs(pctVarNarr).toFixed(1) + '%</strong> em Total Venda.' })
  if (topFilial && filiaisNarr.length > 1) {
    const pctFilial = totalVenda > 0 ? (topFilial[1] / totalVenda * 100).toFixed(0) : 0
    insights.push({ key: 'filial', html: 'A filial <strong>' + topFilial[0] + '</strong> representa ' + pctFilial + '% do total.' })
  }
  if (lucratividade > 0 && totalVenda > 0) insights.push({ key: 'lucro', html: 'Lucratividade Total ' + formatCurrencyMillions(lucratividade) + ', margem <strong>' + margem + '%</strong>.' })
  if (custoBruto > 0 && totalVenda > 0) insights.push({ key: 'custo', html: 'Custo Bruto corresponde a ' + (custoBruto / totalVenda * 100).toFixed(1) + '% da receita.' })
  if (promocao > 0 && totalVenda > 0) insights.push({ key: 'promo', html: 'Vendas em promoção: <strong>' + (promocao / totalVenda * 100).toFixed(1) + '%</strong> do total.' })

  const tableRows = useRecs.filter(r => r.account === kpi).sort((a,b) => {
    if (a.year !== b.year) return a.year.localeCompare(b.year)
    return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month)
  }).slice(-24)

  const allKpiDatasets = useMemo(() => {
    const accs = [...new Set(useRecs.map(r => r.account))].sort((a,b) => KPI_ORDER.indexOf(a) - KPI_ORDER.indexOf(b))
    return accs.map((acc, i) => {
      const raw = sortedMonths.map(([,v]) => v[acc] || 0)
      const max = Math.max(...raw, 1)
      const normalized = raw.map(v => Math.round(v / max * 1000) / 10)
      return { label: acc, data: normalized, borderColor: KPI_COLORS[i % KPI_COLORS.length], backgroundColor: KPI_COLORS[i % KPI_COLORS.length] + '20', fill: false, tension: 0.3 }
    })
  }, [useRecs, sortedMonths])

  const radarLabels = [...new Set(useRecs.map(r => r.account))].sort((a,b) => KPI_ORDER.indexOf(a) - KPI_ORDER.indexOf(b))
  const lastData = sortedMonths[sortedMonths.length - 1]?.[1] || {}
  const maxByAcc = {}
  useRecs.forEach(r => { maxByAcc[r.account] = Math.max(maxByAcc[r.account] || 0, r.value) })
  const radarValues = radarLabels.map(acc => {
    const val = lastData[acc] || 0
    const max = maxByAcc[acc] || 1
    return Math.round(val / max * 1000) / 10
  })

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: hasBoth, position: 'top', labels: { color: '#64748b' } } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: v => (v >= 1000 ? (v/1000).toFixed(1) + 'B' : v + 'M') } },
      x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45 } },
    },
  }

  const AppHeader = () => (
    <header className="header">
      <div className="brand">
        <h1>Supermercados Savegnago</h1>
        <div className="tagline">Rede forte do interior — EPM Copilot</div>
      </div>
      <nav className="header-tabs">
        <button
          className={`header-tab-btn ${activeTab === 'vendasdia' ? 'active' : ''}`}
          onClick={() => setActiveTab('vendasdia')}
        >
          📅 Vendas Dia
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'produtos' ? 'active' : ''}`}
          onClick={() => setActiveTab('produtos')}
        >
          🛒 Produtos
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'vendas' ? 'active' : ''}`}
          onClick={() => setActiveTab('vendas')}
        >
          📊 Vendas &amp; KPIs
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'cashflow' ? 'active' : ''}`}
          onClick={() => setActiveTab('cashflow')}
        >
          Fluxo de Caixa 90d
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'trademkt' ? 'active' : ''}`}
          onClick={() => setActiveTab('trademkt')}
        >
          Trade Mkt
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Premissas
        </button>
        <button
          className={`header-tab-btn ${activeTab === 'help' ? 'active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          ? Ajuda
        </button>
      </nav>
      <span className="header-badge">
        {activeTab === 'cashflow' ? 'Rolling 90 dias' : activeTab === 'trademkt' ? 'Por filial / setor / fornecedor' : activeTab === 'config' ? 'Configuração' : activeTab === 'help' ? 'Documentação' : activeTab === 'vendasdia' ? 'Acompanhamento Diário · VendaDia' : activeTab === 'produtos' ? 'Por Produto · Mar 2026' : (scenario === 'all' ? 'Real + Orçamento' : (SCENARIO_LABELS[scenario] || scenario))}
      </span>
    </header>
  )

  if (activeTab === 'vendasdia') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <VendasDiaDashboard />
        </main>
      </div>
    )
  }

  if (activeTab === 'produtos') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <ProdutosDashboard />
        </main>
      </div>
    )
  }

  if (activeTab === 'vendas') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <AcompanhamentoDiario />
        </main>
      </div>
    )
  }

  if (activeTab === 'help') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <HelpPage />
        </main>
      </div>
    )
  }

  if (activeTab === 'cashflow') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <CashFlowDashboard />
        </main>
      </div>
    )
  }

  if (activeTab === 'trademkt') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <TradeMktDashboard />
        </main>
      </div>
    )
  }

  if (activeTab === 'config') {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <AssumptionsConfig onGenerated={() => setActiveTab('cashflow')} />
        </main>
      </div>
    )
  }

  if (!records.length) {
    return (
      <div>
        <AppHeader />
        <main className="container">
          <div className="loading">Execute <code>python3 scripts/fetch_dashboard_data.py</code> para carregar dados.</div>
        </main>
      </div>
    )
  }

  return (
    <div>
      <AppHeader />

      <main className="container">
        <div className="filters">
          <div className="filter-group">
            <label>Cenário</label>
            <select value={scenario} onChange={e => setScenario(e.target.value)}>
              <option value="all">Todos</option>
              {scenarios.map(s => <option key={s} value={s}>{SCENARIO_LABELS[s] || s}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Ano</label>
            <select value={year} onChange={e => setYear(e.target.value)}>
              <option value="all">Todos</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Filial</label>
            <select value={filial} onChange={e => setFilial(e.target.value)}>
              <option value="all">Todas</option>
              {filiais.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Mês</label>
            <select value={month} onChange={e => setMonth(e.target.value)}>
              <option value="all">Todos</option>
              {MONTH_ORDER.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Categoria</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="all">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c] || c}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Indicador</label>
            <select value={kpi} onChange={e => setKpi(e.target.value)}>
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="narrative-card">
          <h3>Indicadores principais</h3>
          <p className="narrative-desc">Resumo dos KPIs conforme filtros selecionados. Clique em um indicador para detalhar no gráfico e na tabela abaixo.</p>
        </div>
        <div className="kpi-grid">
          {accounts.map(acc => (
            <div key={acc} className="kpi-card clickable" onClick={() => { setKpi(acc); setMonth('all') }} title="Clique para detalhar">
              <div className="label">{acc}</div>
              <div className={`value ${isCurrencyKpi(acc) ? 'currency' : 'qty'}`}>
                {isCurrencyKpi(acc) ? formatCurrencyMillions(sumAccount(records, acc)) : formatNumber(sumAccount(records, acc))}
              </div>
            </div>
          ))}
          <div className="kpi-card">
            <div className="label">Último mês (Total Venda)</div>
            <div className="value currency">{formatCurrencyMillions(lastMonthVal)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Var. vs mês anterior</div>
            <div className="value" style={{ color: pctVar >= 0 ? 'var(--success)' : 'var(--error)' }}>{pctVar >= 0 ? '+' : ''}{pctVar}%</div>
          </div>
        </div>

        <div className="narrative-card">
          <h3>📊 Análise narrativa</h3>
          <p className="narrative-desc">Insights automáticos com base nos dados filtrados: total de vendas, variações, participação por filial, margem e custos.</p>
          {insights.map((insight) => <div key={insight.key} className="insight" dangerouslySetInnerHTML={{ __html: '• ' + insight.html }} />)}
        </div>

        {realVsOrcRows.length > 0 && (
          <div className="narrative-card">
            <h3>📈 Real x Orçado</h3>
            <p className="narrative-desc">Comparação entre dados realizados e orçados. A variação percentual indica se o real superou ou ficou abaixo do planejado.</p>
            <table>
              <thead><tr><th>Indicador</th><th className="value">Real</th><th className="value">Orçado</th><th className="value">Var. %</th></tr></thead>
              <tbody>
                {realVsOrcRows.map(r => (
                  <tr key={r.acc}>
                    <td>{r.acc}</td>
                    <td className="value">{isCurrencyKpi(r.acc) ? formatCurrencyMillions(r.vReal) : formatNumber(r.vReal)}</td>
                    <td className="value">{isCurrencyKpi(r.acc) ? formatCurrencyMillions(r.vOrc) : formatNumber(r.vOrc)}</td>
                    <td className="value" style={{ color: r.varPct !== '—' && parseFloat(r.varPct) >= 0 ? 'var(--success)' : r.varPct !== '—' ? 'var(--error)' : 'inherit' }}>
                      {r.varPct !== '—' ? (parseFloat(r.varPct) >= 0 ? '+' : '') + r.varPct + '%' : r.varPct}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="narrative-card">
          <h3>📈 Evolução e distribuição</h3>
          <p className="narrative-desc">Gráfico de linha: evolução do indicador selecionado ao longo dos meses (Real vs Orçado quando disponível). Gráfico de barras: distribuição de vendas por filial no último mês.</p>
        </div>
        <div className="charts-row">
          <div className="chart-card">
            <h3>{hasBoth ? `${kpi} — Real x Orçado` : `${kpi} por mês`}</h3>
            <div className="chart-wrap">
              <Line data={{ labels: chartLabels, datasets: chartDatasets }} options={chartOptions} />
            </div>
          </div>
          <div className="chart-card">
            <h3>Vendas por filial (último mês)</h3>
            <div className="chart-wrap">
              <Bar
                data={{
                  labels: Object.keys(byFilialLast),
                  datasets: [{ label: 'R$ milhões', data: Object.values(byFilialLast).map(v => v / 1e6), backgroundColor: ['#c41e3a', '#0ea5e9', '#f59e0b'] }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: v => (v >= 1000 ? (v/1000).toFixed(1) + 'B' : v + 'M') } },
                    x: { grid: { display: false }, ticks: { color: '#64748b' } },
                  },
                }}
              />
            </div>
          </div>
        </div>

        <div className="narrative-card">
          <h3>📊 Comparativo e radar</h3>
          <p className="narrative-desc">Todos os KPIs normalizados (índice 100 = máximo do período) para comparar tendências. O radar mostra o desempenho relativo de cada indicador no último mês.</p>
        </div>
        <div className="charts-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="chart-card">
            <h3>Todos os KPIs por mês (índice 100 = máximo)</h3>
            <div className="chart-wrap" style={{ height: 320 }}>
              <Line
                data={{ labels: sortedMonths.map(([k]) => { const [y,m] = k.split('-'); return `${MONTH_ORDER.indexOf(m)+1}/${y.replace('FY','')}` }), datasets: allKpiDatasets }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: true, position: 'bottom', labels: { color: '#64748b', boxWidth: 12, padding: 16 } } },
                  scales: {
                    y: { min: 0, max: 110, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: v => v + '%' } },
                    x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45 } },
                  },
                }}
              />
            </div>
          </div>
          <div className="chart-card">
            <h3>Radar KPIs — último mês</h3>
            <div className="chart-wrap" style={{ height: 320 }}>
              <Radar
                data={{
                  labels: radarLabels.map(l => l.length > 14 ? l.slice(0, 11) + '…' : l),
                  datasets: [{ label: 'Período', data: radarValues, backgroundColor: 'rgba(196, 30, 58, 0.2)', borderColor: '#c41e3a', borderWidth: 2, pointBackgroundColor: '#c41e3a' }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    r: { min: 0, max: 100, ticks: { color: '#64748b', backdropColor: 'transparent' }, pointLabels: { color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' }, angleLines: { color: '#e2e8f0' } },
                  },
                }}
              />
            </div>
          </div>
        </div>

        <div className="narrative-card">
          <h3>📋 Detalhamento</h3>
          <p className="narrative-desc">Tabela com os valores do indicador selecionado por ano e mês. Útil para análises pontuais e conferência de dados.</p>
        </div>
        <div className="table-card">
          <h3>Detalhamento — {kpi}</h3>
          <table>
            <thead><tr><th>Ano</th><th>Mês</th><th>{kpi}</th></tr></thead>
            <tbody>
              {tableRows.map(r => (
                <tr key={`${r.year}-${r.month}`}>
                  <td>{r.year}</td>
                  <td>{r.month}</td>
                  <td className="value">{isCurrencyKpi(kpi) ? formatCurrencyMillions(r.value) : formatNumber(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

export default App
