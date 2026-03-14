import { useState, useMemo, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtR = (v) => {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toFixed(1).replace('.', ',')}B`
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toFixed(1).replace('.', ',')}M`
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toFixed(0).replace('.', ',')}K`
  return `${s}R$ ${a.toFixed(0)}`
}
const fmtN = (v) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v))
const fmtPct = (n, d) => (!n || !d ? '—' : ((n / d) * 100).toFixed(1).replace('.', ',') + '%')

const SETOR_NAMES = {
  'All Setor': 'Total Geral',
  S01: 'Açougue',
  S02: 'Frios',
  S03: 'FLV',
  S04: 'Padaria',
  S05: 'Lanchonete',
  S06: 'Casa de Massas',
  S07: 'Mercearia',
  S08: 'Cinema',
  S09: 'Serviços',
  S10: 'Material de Apoio',
  S11: 'Almoxarifado',
  S12: 'Posto Combustível',
}

const SETOR_COLORS = {
  S01: '#ef4444', S02: '#3b82f6', S03: '#22c55e', S04: '#f59e0b',
  S05: '#8b5cf6', S06: '#ec4899', S07: '#0ea5e9', S08: '#14b8a6',
  S09: '#84cc16', S10: '#f97316', S11: '#64748b', S12: '#a16207',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#1e40af', icon }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '16px 20px',
      borderLeft: `4px solid ${color}`,
      boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
      minWidth: 150,
      flex: 1,
    }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProdutosDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setorFilter, setSetorFilter] = useState('All Setor')
  const [topN, setTopN] = useState(50)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('venda')
  const [activeView, setActiveView] = useState('ranking') // ranking | setores | charts

  useEffect(() => {
    fetch('/data/produtos_data.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // ── Pivot produto ─────────────────────────────────────────────────────────
  const prodPivot = useMemo(() => {
    if (!data) return {}
    const pivot = {}
    for (const r of data.prod_recs || []) {
      const setor = r.setor || 'All Setor'
      if (!pivot[setor]) pivot[setor] = {}
      if (!pivot[setor][r.col]) pivot[setor][r.col] = {}
      pivot[setor][r.col][r.account] = r.value
    }
    return pivot
  }, [data])

  // ── Pivot setor ───────────────────────────────────────────────────────────
  const setorPivot = useMemo(() => {
    if (!data) return {}
    const pivot = {}
    for (const r of data.por_setor || []) {
      if (!pivot[r.col]) pivot[r.col] = {}
      pivot[r.col][r.account] = r.value
    }
    return pivot
  }, [data])

  // ── Produtos filtrados ────────────────────────────────────────────────────
  const prodRows = useMemo(() => {
    if (!data || !prodPivot['All Setor']) return []
    const srcSetor = prodPivot[setorFilter] || prodPivot['All Setor'] || {}
    return (data.top100_prods || [])
      .map((p) => {
        const meta = data.prod_meta?.[p] || {}
        const kpis = srcSetor[p] || {}
        let alias = meta.alias || p
        if (alias.startsWith(p + ' - ')) alias = alias.slice(p.length + 3)
        return {
          code: p,
          name: alias,
          venda: kpis['Total Venda'] || 0,
          qtd: kpis['Qtd Venda'] || 0,
          lucr: kpis['Lucratividade Total'] || 0,
          custo: kpis['Custo Bruto Produto'] || 0,
          promo: kpis['Promocao de Venda'] || 0,
          imp: kpis['Impostos Venda'] || 0,
        }
      })
      .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => r.venda > 0 || setorFilter !== 'All Setor')
      .sort((a, b) => {
        if (sortBy === 'venda') return b.venda - a.venda
        if (sortBy === 'lucr') return b.lucr - a.lucr
        if (sortBy === 'qtd') return b.qtd - a.qtd
        if (sortBy === 'pctlucr') return (b.lucr / (b.venda || 1)) - (a.lucr / (a.venda || 1))
        return b.venda - a.venda
      })
      .slice(0, topN)
  }, [data, prodPivot, setorFilter, search, sortBy, topN])

  // ── KPIs globais ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = setorPivot['All Setor'] || {}
    return {
      venda: total['Total Venda'] || 0,
      qtd: total['Qtd Venda'] || 0,
      lucr: total['Lucratividade Total'] || 0,
      custo: total['Custo Bruto Produto'] || 0,
      promo: total['Promocao de Venda'] || 0,
      imp: total['Impostos Venda'] || 0,
    }
  }, [setorPivot])

  // ── Chart: Top 20 produtos por Venda ─────────────────────────────────────
  const barChartData = useMemo(() => {
    const rows = prodRows.slice(0, 20)
    return {
      labels: rows.map((r) => r.name.slice(0, 30)),
      datasets: [
        {
          label: 'Venda (R$)',
          data: rows.map((r) => r.venda),
          backgroundColor: '#1e40af',
          borderRadius: 4,
        },
        {
          label: 'Lucr. (R$)',
          data: rows.map((r) => Math.max(r.lucr, 0)),
          backgroundColor: '#22c55e',
          borderRadius: 4,
        },
      ],
    }
  }, [prodRows])

  // ── Chart: Donut setores ──────────────────────────────────────────────────
  const donutData = useMemo(() => {
    const setores = (data?.top_setores || []).filter((s) => s !== 'All Setor')
    const labels = setores.map((s) => SETOR_NAMES[s] || s)
    const values = setores.map((s) => setorPivot[s]?.['Total Venda'] || 0)
    const colors = setores.map((s) => SETOR_COLORS[s] || '#94a3b8')
    return {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    }
  }, [data, setorPivot])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ color: '#64748b', fontSize: 16 }}>⏳ Carregando dados de produto...</div>
    </div>
  )

  if (!data) return (
    <div style={{ padding: 32, color: '#ef4444' }}>
      ⚠️ Erro ao carregar produtos_data.json. Verifique o console.
    </div>
  )

  const totalVenda = kpis.venda || 1

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard label="Venda Total" value={fmtR(kpis.venda)} sub="Mar 2026 · FY26" color="#1e40af" icon="💰" />
        <KpiCard label="Qtde Vendida" value={fmtN(kpis.qtd)} sub="unidades" color="#0ea5e9" icon="📦" />
        <KpiCard label="Lucratividade" value={fmtPct(kpis.lucr, kpis.venda)} sub={fmtR(kpis.lucr)} color={kpis.lucr >= 0 ? '#16a34a' : '#dc2626'} icon="📈" />
        <KpiCard label="Custo Bruto" value={fmtR(kpis.custo)} sub={fmtPct(kpis.custo, kpis.venda)} color="#f59e0b" icon="🏭" />
        <KpiCard label="Promoção" value={fmtR(kpis.promo)} sub={fmtPct(kpis.promo, kpis.venda)} color="#8b5cf6" icon="🏷️" />
        <KpiCard label="Impostos" value={fmtR(kpis.imp)} sub={fmtPct(kpis.imp, kpis.venda)} color="#64748b" icon="🧾" />
      </div>

      {/* ── Sub-nav ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 12 }}>
        {[
          { id: 'ranking', label: '🏆 Ranking Produtos' },
          { id: 'setores', label: '🏪 Por Setor' },
          { id: 'charts',  label: '📊 Gráficos' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13,
              background: activeView === id ? '#1e40af' : '#f1f5f9',
              color: activeView === id ? '#fff' : '#475569',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
          Real/Trabalho · Valor Original · {data.meta?.total_p_codes?.toLocaleString('pt-BR')} P-codes · amostra {data.meta?.sample_size?.toLocaleString('pt-BR')}
        </div>
      </div>

      {/* ── View: Ranking ────────────────────────────────────────────────── */}
      {activeView === 'ranking' && (
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            >
              {['All Setor', ...(data.top_setores || [])].map((s) => (
                <option key={s} value={s}>{SETOR_NAMES[s] || s}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            >
              <option value="venda">Ordenar: Venda ↓</option>
              <option value="lucr">Ordenar: Lucratividade ↓</option>
              <option value="qtd">Ordenar: Qtde ↓</option>
              <option value="pctlucr">Ordenar: % Lucr ↓</option>
            </select>
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
            <input
              placeholder="🔍 Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                fontSize: 13, minWidth: 200,
              }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{prodRows.length} produtos</span>
          </div>

          {/* Tabela */}
          <div style={{ overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e40af', color: '#fff' }}>
                  {['#', 'Código', 'Produto', 'Venda (R$)', '% Part.', 'Qtde', 'Custo Bruto', '% Lucr.', 'Lucr. (R$)', 'Promoção', 'Impostos'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === '#' || h === 'Código' || h === 'Produto' ? 'left' : 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prodRows.map((r, i) => {
                  const pctLucr = r.venda ? (r.lucr / r.venda) * 100 : 0
                  const lucrColor = pctLucr < 0 ? '#dc2626' : pctLucr > 15 ? '#15803d' : '#374151'
                  const bg = i % 2 === 0 ? '#fff' : '#f8fafc'
                  return (
                    <tr key={r.code} style={{ background: bg }}>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{r.code}</td>
                      <td style={{ padding: '8px 12px', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtR(r.venda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{fmtPct(r.venda, totalVenda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtN(r.qtd)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#92400e' }}>{fmtR(r.custo)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: lucrColor }}>{fmtPct(r.lucr, r.venda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: lucrColor }}>{fmtR(r.lucr)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#7c3aed' }}>{fmtR(r.promo)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>{fmtR(r.imp)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totais */}
              {prodRows.length > 0 && (() => {
                const tot = prodRows.reduce((acc, r) => ({
                  venda: acc.venda + r.venda, qtd: acc.qtd + r.qtd, lucr: acc.lucr + r.lucr,
                  custo: acc.custo + r.custo, promo: acc.promo + r.promo, imp: acc.imp + r.imp,
                }), { venda: 0, qtd: 0, lucr: 0, custo: 0, promo: 0, imp: 0 })
                return (
                  <tfoot>
                    <tr style={{ background: '#fef9c3', fontWeight: 700, borderTop: '2px solid #ca8a04' }}>
                      <td colSpan={3} style={{ padding: '8px 12px' }}>Total ({prodRows.length} produtos)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtR(tot.venda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtPct(tot.venda, totalVenda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtN(tot.qtd)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtR(tot.custo)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: tot.lucr < 0 ? '#dc2626' : '#15803d' }}>{fmtPct(tot.lucr, tot.venda)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: tot.lucr < 0 ? '#dc2626' : '#15803d' }}>{fmtR(tot.lucr)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtR(tot.promo)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtR(tot.imp)}</td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </div>
      )}

      {/* ── View: Setores ────────────────────────────────────────────────── */}
      {activeView === 'setores' && (
        <div>
          <div style={{ overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e40af', color: '#fff' }}>
                  {['Setor', 'Venda (R$)', '% Part.', 'Qtde', 'Custo Bruto', '% Lucr.', 'Lucr. (R$)', 'Promoção', 'Impostos'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Setor' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['All Setor', ...(data.top_setores || [])].map((s, i) => {
                  const sd = setorPivot[s] || {}
                  const venda = sd['Total Venda'] || 0
                  const qtd   = sd['Qtd Venda'] || 0
                  const lucr  = sd['Lucratividade Total'] || 0
                  const custo = sd['Custo Bruto Produto'] || 0
                  const promo = sd['Promocao de Venda'] || 0
                  const imp   = sd['Impostos Venda'] || 0
                  const pct   = venda ? (lucr / venda) * 100 : 0
                  const isTotal = s === 'All Setor'
                  const dotColor = SETOR_COLORS[s] || '#94a3b8'
                  return (
                    <tr key={s} style={{
                      background: isTotal ? '#fef9c3' : (i % 2 === 0 ? '#fff' : '#f8fafc'),
                      fontWeight: isTotal ? 700 : 400,
                      borderBottom: isTotal ? '2px solid #ca8a04' : '1px solid #f1f5f9',
                    }}>
                      <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!isTotal && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
                        {SETOR_NAMES[s] || s}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtR(venda)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>{fmtPct(venda, totalVenda)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmtN(qtd)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#92400e' }}>{fmtR(custo)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: pct < 0 ? '#dc2626' : pct > 15 ? '#15803d' : '#374151' }}>{fmtPct(lucr, venda)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: pct < 0 ? '#dc2626' : '#374151' }}>{fmtR(lucr)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#7c3aed' }}>{fmtR(promo)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>{fmtR(imp)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── View: Charts ─────────────────────────────────────────────────── */}
      {activeView === 'charts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
          {/* Bar chart */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f', marginBottom: 16 }}>
              🏆 Top 20 Produtos — Venda vs Lucratividade
            </div>
            <div style={{ height: 400 }}>
              <Bar
                data={barChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  plugins: {
                    legend: { position: 'top', labels: { color: '#64748b', font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${fmtR(ctx.raw)}`,
                      },
                    },
                  },
                  scales: {
                    x: { ticks: { color: '#64748b', callback: (v) => fmtR(v) }, grid: { color: '#f1f5f9' } },
                    y: { ticks: { color: '#374151', font: { size: 10 } }, grid: { display: false } },
                  },
                }}
              />
            </div>
          </div>

          {/* Donut chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f', marginBottom: 16 }}>
                🏪 Distribuição por Setor
              </div>
              <div style={{ height: 260 }}>
                <Doughnut
                  data={donutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'right', labels: { font: { size: 11 }, color: '#374151' } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => ` ${ctx.label}: ${fmtR(ctx.raw)} (${fmtPct(ctx.raw, totalVenda)})`,
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Stats box */}
            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 16, border: '1px solid #bae6fd' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0369a1', marginBottom: 10 }}>📌 Resumo</div>
              {[
                ['Setor líder', `${SETOR_NAMES[data.top_setores?.[0]]} — ${fmtR(setorPivot[data.top_setores?.[0]]?.['Total Venda'])}`],
                ['Top produto', `${data.top100_prods?.[0]} — ${fmtR(data.venda_por_prod?.[data.top100_prods?.[0]])}`],
                ['P-codes totais', data.meta?.total_p_codes?.toLocaleString('pt-BR') + ' itens'],
                ['Amostra', data.meta?.sample_size?.toLocaleString('pt-BR') + ' P-codes'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{k}:</span>
                  <span style={{ fontWeight: 600, color: '#1e3a5f', textAlign: 'right', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, fontSize: 11, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
        Fonte: Oracle EPBCS VendaDia · Cenário Real/Trabalho · Valor Original · Março 2026 (FY26) ·
        Último nível habilitado: P-codes (All Produto) · "never share" = propriedade interna Essbase, não impede consultas
      </div>
    </div>
  )
}
