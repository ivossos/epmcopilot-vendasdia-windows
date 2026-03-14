import { useState, useEffect, useMemo } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtM  = v => v == null ? '—' : Math.abs(v) >= 1e6
  ? `R$\u00a0${(v/1e6).toFixed(1).replace('.',',')}M`
  : Math.abs(v) >= 1e3
  ? `R$\u00a0${(v/1e3).toFixed(0)}k`
  : `R$\u00a0${v.toFixed(0)}`

const fmtPct = v => v == null ? '—' : `${(v*100).toFixed(2).replace('.',',')}%`
const fmtN   = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(v)
const fmtD   = v => v == null ? '—' : v.toFixed(1).replace('.',',')
const fmtT   = v => v == null ? '—' : `R$\u00a0${v.toFixed(2).replace('.',',')}`

function AtingBadge({ v, inverse = false }) {
  if (v == null) return <span style={B.dash}>—</span>
  const pct = v * 100
  let ok, arrow
  if (!inverse) {
    ok = pct >= 100 ? 'green' : pct >= 95 ? 'amber' : 'red'
    arrow = pct >= 100 ? '▲' : '▼'
  } else {
    // lower is better (perdas, cobertura excess)
    ok = pct <= 100 ? 'green' : pct <= 105 ? 'amber' : 'red'
    arrow = pct <= 100 ? '▲' : '▼'
  }
  return (
    <span style={{ ...B.badge, ...B[ok] }}>
      {arrow}{pct.toFixed(2).replace('.',',')}%
    </span>
  )
}

function VarBadge({ v }) {
  if (v == null) return <span style={B.dash}>—</span>
  const pct = v * 100
  const color = pct >= 0 ? '#22c55e' : '#ef4444'
  const arrow = pct >= 0 ? '▲' : '▼'
  return <span style={{ color, fontWeight: 600 }}>{arrow}{Math.abs(pct).toFixed(1).replace('.',',')}%</span>
}

// ── Classificações de Filial ──────────────────────────────────────────────────

// Store type from code prefix
function storeType(filial) {
  if (filial.startsWith('SVG')) return 'SVG'
  if (filial.startsWith('PLT')) return 'PLT'
  if (filial.startsWith('PRT')) return 'PRT'
  if (filial.startsWith('CDS') || filial.startsWith('CDM')) return 'CDS'
  if (filial.startsWith('ADM')) return 'ADM'
  if (filial.startsWith('APS')) return 'APS'
  return null   // TOTALIZADOR e agregados — filtrados na base
}

// City from filial code (raw uppercase key)
function rawCity(filial) {
  const parts = filial.split(' - ')
  return parts.length > 1 ? parts.slice(1).join(' - ') : null
}

// Region grouping (city → região)
const CITY_REGION = {
  'SERTAOZINHO':    'Ribeirão Preto e Região',
  'RIBEIRAO PRETO': 'Ribeirão Preto e Região',
  'JARDINOPOLIS':   'Ribeirão Preto e Região',
  'BEBEDOURO':      'Ribeirão Preto e Região',
  'MONTE ALTO':     'Ribeirão Preto e Região',
  'MATAO':          'Ribeirão Preto e Região',
  'JABOTICABAL':    'Ribeirão Preto e Região',
  'BARRETOS':       'Franca e Região',
  'FRANCA':         'Franca e Região',
  'ARARAQUARA':     'São Carlos / Araraquara',
  'SAO CARLOS':     'São Carlos / Araraquara',
  'CAMPINAS':       'Campinas e Região',
  'SUMARE':         'Campinas e Região',
  'HORTOLANDIA':    'Campinas e Região',
  'AMERICANA':      'Campinas e Região',
  'INDAIATUBA':     'Campinas e Região',
  'PIRACICABA':     'Campinas e Região',
  'LIMEIRA':        'Campinas e Região',
  'ARARAS':         'Campinas e Região',
  'RIO CLARO':      'Campinas e Região',
  'LEME':           'Campinas e Região',
  'MOGI GUACU':     'Campinas e Região',
  'CORDEIROPOLIS':  'Campinas e Região',
}

function storeRegion(filial) {
  const c = rawCity(filial)
  if (!c) return 'Outras'
  return CITY_REGION[c] ?? 'Outras'
}

// Mesmas / Novas  (stores opened before vs from 2022 expansion into Campinas region)
// SVG0001–SVG0054 = Total Mesmas  |  SVG0055+ = Total Novas
function mesmasNovas(filial) {
  const m = filial.match(/^SVG(\d{4})/)
  if (!m) return null
  return parseInt(m[1], 10) <= 54 ? 'Total Mesmas' : 'Total Novas'
}

// Derive the group label for a row given the groupBy setting
function groupLabel(row, groupBy) {
  if (groupBy === 'cidade')      return cityName(row.filial)
  if (groupBy === 'regiao')      return storeRegion(row.filial)
  if (groupBy === 'mesmasnovas') return mesmasNovas(row.filial) ?? storeType(row.filial)
  return row.filial
}

function cityName(filial) {
  const parts = filial.split(' - ')
  if (parts.length < 2) return filial
  const c = parts.slice(1).join(' - ')
  return c
    .replace('RIBEIRAO PRETO', 'Ribeirão Preto')
    .replace('SERTAOZINHO',    'Sertãozinho')
    .replace('ARARAQUARA',     'Araraquara')
    .replace('PIRACICABA',     'Piracicaba')
    .replace('JABOTICABAL',    'Jaboticabal')
    .replace('HORTOLANDIA',    'Hortolândia')
    .replace('INDAIATUBA',     'Indaiatuba')
    .replace('CAMPINAS',       'Campinas')
    .replace('SUMARE',         'Sumaré')
    .replace('ARARAS',         'Araras')
    .replace('AMERICANA',      'Americana')
    .replace('LIMEIRA',        'Limeira')
    .replace('FRANCA',         'Franca')
    .replace('BEBEDOURO',      'Bebedouro')
    .replace('BARRETOS',       'Barretos')
    .replace('RIO CLARO',      'Rio Claro')
    .replace('MONTE ALTO',     'Monte Alto')
    .replace('MATAO',          'Matão')
    .replace('MOGI GUACU',     'Mogi Guaçu')
    .replace('SAO CARLOS',     'São Carlos')
    .replace('JARDINOPOLIS',   'Jardinópolis')
    .replace('CORDEIROPOLIS',  'Cordeirópolis')
    .replace("SANTA BARBARA D'OESTE", "Santa Bárbara d'Oeste")
    .replace('LEME', 'Leme')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// Compute subtotals for a group of rows
function sumGroup(rows, fields) {
  const out = { filial: 'TOTAL', _isTotal: true }
  for (const f of fields) {
    const vals = rows.map(r => r[f]).filter(v => v != null)
    if (!vals.length) { out[f] = null; continue }
    // Averages for % fields, sums for absolute values
    if (f.startsWith('pct_') || f.startsWith('margem') || f.startsWith('dif_margem') ||
        f === 'cobertura_obj' || f === 'cobertura_proj' || f === 'ticket_atual' || f === 'ticket_aa') {
      out[f] = vals.reduce((a,b) => a+b, 0) / vals.length
    } else {
      out[f] = vals.reduce((a,b) => a+b, 0)
    }
  }
  // Recompute derived ratios for total row
  if (out.venda > 0 && out.cota_mes > 0)   out.pct_ating_venda   = out.venda / out.cota_mes
  if (out.venda > 0 && out.venda_aa > 0)   out.pct_var_venda_aa  = (out.venda - out.venda_aa) / out.venda_aa
  if (out.margem_real != null && out.margem_obj != null)
    out.pct_ating_margem = out.margem_obj > 0 ? out.margem_real / out.margem_obj : null
  return out
}

const ALL_FIELDS = [
  'cota_mes','cota','venda','pct_ating_venda','venda_aa','pct_var_venda_aa','pct_promocao',
  'margem_obj','margem_real','pct_ating_margem','dif_margem','margem_aa','var_margem_aa',
  'estoque','cobertura_obj','cobertura_proj','pct_ating_cobertura','dif_cobertura',
  'pct_perda_obj','pct_perda_proj','pct_ating_perda','dif_perda',
  'fluxo_atual','fluxo_aa','pct_var_fluxo','dif_fluxo',
  'ticket_atual','ticket_aa','pct_var_ticket','dif_ticket',
]

const SECTION_DEFS = [
  { key: 'vendas',  label: 'Desempenho de Vendas',   color: '#c41e3a' },
  { key: 'margem',  label: 'Desempenho de Margem',   color: '#0ea5e9' },
  { key: 'estoque', label: 'Desempenho de Estoque',  color: '#8b5cf6' },
  { key: 'perdas',  label: '% Perdas',               color: '#dc2626' },
  { key: 'fluxo',   label: 'Fluxo & Ticket',         color: '#22c55e' },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function AcompanhamentoDiario() {
  const [raw,     setRaw]     = useState(null)
  const [err,     setErr]     = useState(null)
  const [typeFilter,  setTypeFilter]  = useState('SVG')
  const [sections,    setSections]    = useState(new Set(['vendas','margem','estoque','perdas','fluxo']))
  const [sortField,   setSortField]   = useState('venda')
  const [sortAsc,     setSortAsc]     = useState(false)
  const [focusedRow,  setFocusedRow]  = useState(null)   // filial string or null
  const [groupBy,     setGroupBy]     = useState('filial') // 'filial'|'cidade'|'regiao'|'mesmasnovas'
  const [drillGroup,  setDrillGroup]  = useState(null)   // group label being drilled into

  useEffect(() => {
    fetch('/data/acompanhamento_diario.json')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRaw)
      .catch(e => setErr(String(e)))
  }, [])

  const storeTypes = useMemo(() => {
    if (!raw) return []
    const types = [...new Set(raw.rows.map(r => storeType(r.filial)))]
    return ['Todos', ...types.sort()]
  }, [raw])

  const filteredRows = useMemo(() => {
    if (!raw) return []
    // Always strip TOTALIZADOR/aggregate rows (have no valid storeType)
    let rows = raw.rows.filter(r => storeType(r.filial) !== null)
    if (typeFilter !== 'Todos') rows = rows.filter(r => storeType(r.filial) === typeFilter)
    // When drilled into a group, show only that group's individual stores
    if (drillGroup && groupBy !== 'filial') {
      rows = rows.filter(r => groupLabel(r, groupBy) === drillGroup)
    }
    return [...rows].sort((a, b) => {
      const av = a[sortField] ?? -Infinity
      const bv = b[sortField] ?? -Infinity
      return sortAsc ? av - bv : bv - av
    })
  }, [raw, typeFilter, sortField, sortAsc, groupBy, drillGroup])

  const totalRow = useMemo(() => {
    if (!filteredRows.length) return null
    return sumGroup(filteredRows, ALL_FIELDS)
  }, [filteredRows])

  // When groupBy !== 'filial' and NOT drilled, compute one aggregate row per group
  const groupedRows = useMemo(() => {
    if (groupBy === 'filial' || drillGroup) return null
    // Use ALL type-filtered rows (no sort applied yet for grouping)
    const base = raw ? raw.rows.filter(r => storeType(r.filial) !== null &&
      (typeFilter === 'Todos' || storeType(r.filial) === typeFilter)) : []
    const groups = {}
    base.forEach(r => {
      const key = groupLabel(r, groupBy)
      if (!key) return
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    })
    return Object.entries(groups)
      .map(([label, rows]) => {
        const agg = sumGroup(rows, ALL_FIELDS)
        agg.filial = label
        agg._groupLabel = label
        agg._count = rows.length
        agg._isGroupRow = true
        return agg
      })
      .sort((a, b) => {
        const av = a[sortField] ?? -Infinity
        const bv = b[sortField] ?? -Infinity
        return sortAsc ? av - bv : bv - av
      })
  }, [raw, groupBy, drillGroup, typeFilter, sortField, sortAsc])

  function toggleSection(key) {
    setSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function handleSort(field) {
    if (sortField === field) setSortAsc(a => !a)
    else { setSortField(field); setSortAsc(false) }
  }

  function SortTh({ field, children, right }) {
    const active = sortField === field
    return (
      <th
        onClick={() => handleSort(field)}
        style={{ ...T.th, textAlign: right ? 'right' : 'left', cursor: 'pointer',
          background: active ? '#dbeafe' : '#f8fafc',
          userSelect: 'none', whiteSpace: 'nowrap' }}
      >
        {children}
        <span style={{ marginLeft: 3, opacity: active ? 1 : 0.3, fontSize: '0.65rem' }}>
          {active ? (sortAsc ? '▲' : '▼') : '⇕'}
        </span>
      </th>
    )
  }

  // Must be before early returns — Rules of Hooks
  const focusedData = useMemo(() =>
    focusedRow ? filteredRows.find(r => r.filial === focusedRow) ?? null : null,
  [focusedRow, filteredRows])

  if (err) return (
    <div style={T.empty}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
      <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Dados não encontrados</p>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Execute o script para gerar os dados:
      </p>
      <code style={T.code}>python3 scripts/parse_acompanhamento_diario.py</code>
    </div>
  )

  if (!raw) return (
    <div style={T.empty}>
      <div style={T.spinner} />Carregando Acompanhamento Diário…
    </div>
  )

  const ref = raw.reference
  const showVendas  = sections.has('vendas')
  const showMargem  = sections.has('margem')
  const showEstoque = sections.has('estoque')
  const showPerdas  = sections.has('perdas')
  const showFluxo   = sections.has('fluxo')

  const renderRow = (row, isTotal = false) => {
    const isFocused = !isTotal && focusedRow === row.filial
    const baseStyle = isTotal
      ? { ...T.tr, background: '#1e293b', borderTop: '2px solid #334155' }
      : isFocused
        ? { ...T.tr, background: '#fef3c7', outline: '2px solid #f59e0b', outlineOffset: -1 }
        : { ...T.tr, background: row.pct_ating_venda != null && row.pct_ating_venda < 0.90 ? 'rgba(239,68,68,0.02)' : 'white',
            cursor: 'pointer' }

    return (
      <tr key={row.filial} style={baseStyle}
        onClick={isTotal ? undefined : () => setFocusedRow(f => f === row.filial ? null : row.filial)}>
        {/* Filial */}
        <td style={{ ...T.tdSticky, fontWeight: isTotal ? 700 : 500,
          color: isTotal ? '#f1f5f9' : '#1e293b',
          background: isTotal ? '#1e293b' : isFocused ? '#fef3c7' : '#ffffff',
          fontSize: isTotal ? '0.8rem' : '0.79rem' }}>
          {isTotal ? '▶ TOTAL' : (
            <>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block', lineHeight: 1 }}>
                {row.filial.split(' - ')[0]}
              </span>
              <span style={{ display: 'block' }}>{cityName(row.filial)}</span>
            </>
          )}
        </td>

        {/* ── Desempenho de Vendas ── */}
        {showVendas && <>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtM(row.cota_mes)}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtM(row.cota)}</td>
          <td style={isTotal ? { ...T.tdTot, fontWeight: 700 } : { ...T.tdNum, fontWeight: 600 }}>{fmtM(row.venda)}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><AtingBadge v={row.pct_ating_venda} /></td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtM(row.venda_aa)}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><VarBadge v={row.pct_var_venda_aa} /></td>
          <td style={isTotal ? T.tdTot : T.tdCtr}>{fmtPct(row.pct_promocao)}</td>
        </>}

        {/* ── Desempenho de Margem ── */}
        {showMargem && <>
          <td style={isTotal ? T.tdTot : T.tdCtr}>{row.margem_obj != null ? `${(row.margem_obj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={isTotal ? { ...T.tdTot, fontWeight: 700 } : { ...T.tdCtr, fontWeight: 600 }}>
            {row.margem_real != null ? `${(row.margem_real*100).toFixed(2).replace('.',',')}%` : '—'}
          </td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><AtingBadge v={row.pct_ating_margem} /></td>
          <td style={isTotal ? T.tdTot : T.tdNum}>
            {row.dif_margem != null ? (
              <span style={{ color: row.dif_margem >= 0 ? '#22c55e' : '#ef4444' }}>
                {row.dif_margem >= 0 ? '+' : ''}{row.dif_margem.toFixed(2).replace('.',',')}
              </span>
            ) : '—'}
          </td>
          <td style={isTotal ? T.tdTot : T.tdCtr}>{row.margem_aa != null ? `${(row.margem_aa*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtD(row.var_margem_aa)}</td>
        </>}

        {/* ── Desempenho de Estoque ── */}
        {showEstoque && <>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtM(row.estoque)}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtD(row.cobertura_obj)}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtD(row.cobertura_proj)}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><AtingBadge v={row.pct_ating_cobertura} inverse /></td>
        </>}

        {/* ── % Perdas ── */}
        {showPerdas && <>
          <td style={isTotal ? T.tdTot : T.tdCtr}>{row.pct_perda_obj  != null ? `${(row.pct_perda_obj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={isTotal ? { ...T.tdTot, fontWeight: 700 } : { ...T.tdCtr, fontWeight: 600 }}>{row.pct_perda_proj != null ? `${(row.pct_perda_proj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><AtingBadge v={row.pct_ating_perda} inverse /></td>
          <td style={isTotal ? T.tdTot : T.tdNum}>
            {row.dif_perda != null ? (
              <span style={{ color: row.dif_perda >= 0 ? '#22c55e' : '#ef4444' }}>
                {row.dif_perda >= 0 ? '+' : ''}{row.dif_perda.toFixed(2).replace('.',',')}
              </span>
            ) : '—'}
          </td>
        </>}

        {/* ── Fluxo & Ticket ── */}
        {showFluxo && <>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtN(row.fluxo_atual)}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtN(row.fluxo_aa)}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><VarBadge v={row.pct_var_fluxo} /></td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtT(row.ticket_atual)}</td>
          <td style={isTotal ? T.tdTot : T.tdNum}>{fmtT(row.ticket_aa)}</td>
          <td style={isTotal ? T.tdTot : T.tdCtr}><VarBadge v={row.pct_var_ticket} /></td>
        </>}
      </tr>
    )
  }

  // Render a grouped-aggregate row (clickable → drill down)
  const renderGroupRow = (row) => {
    return (
      <tr key={row._groupLabel} style={{ ...T.tr, background: '#f0f4ff', cursor: 'pointer' }}
        onClick={() => { setDrillGroup(row._groupLabel); setFocusedRow(null) }}>
        <td style={{ ...T.tdSticky, background: '#f0f4ff', fontWeight: 700, color: '#1e3a8a', fontSize: '0.82rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {row._groupLabel}
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>
              {row._count} loja{row._count !== 1 ? 's' : ''} →
            </span>
          </span>
        </td>
        {showVendas && <>
          <td style={T.tdNum}>{fmtM(row.cota_mes)}</td>
          <td style={T.tdNum}>{fmtM(row.cota)}</td>
          <td style={{ ...T.tdNum, fontWeight: 700 }}>{fmtM(row.venda)}</td>
          <td style={T.tdCtr}><AtingBadge v={row.pct_ating_venda} /></td>
          <td style={T.tdNum}>{fmtM(row.venda_aa)}</td>
          <td style={T.tdCtr}><VarBadge v={row.pct_var_venda_aa} /></td>
          <td style={T.tdCtr}>{fmtPct(row.pct_promocao)}</td>
        </>}
        {showMargem && <>
          <td style={T.tdCtr}>{row.margem_obj != null ? `${(row.margem_obj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={{ ...T.tdCtr, fontWeight: 700 }}>{row.margem_real != null ? `${(row.margem_real*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={T.tdCtr}><AtingBadge v={row.pct_ating_margem} /></td>
          <td style={T.tdNum}>{row.dif_margem != null ? <span style={{ color: row.dif_margem >= 0 ? '#22c55e' : '#ef4444' }}>{row.dif_margem >= 0 ? '+' : ''}{row.dif_margem.toFixed(2).replace('.',',')}</span> : '—'}</td>
          <td style={T.tdCtr}>{row.margem_aa != null ? `${(row.margem_aa*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={T.tdNum}>{fmtD(row.var_margem_aa)}</td>
        </>}
        {showEstoque && <>
          <td style={T.tdNum}>{fmtM(row.estoque)}</td>
          <td style={T.tdNum}>{fmtD(row.cobertura_obj)}</td>
          <td style={T.tdNum}>{fmtD(row.cobertura_proj)}</td>
          <td style={T.tdCtr}><AtingBadge v={row.pct_ating_cobertura} inverse /></td>
        </>}
        {showPerdas && <>
          <td style={T.tdCtr}>{row.pct_perda_obj  != null ? `${(row.pct_perda_obj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={{ ...T.tdCtr, fontWeight: 700 }}>{row.pct_perda_proj != null ? `${(row.pct_perda_proj*100).toFixed(2).replace('.',',')}%` : '—'}</td>
          <td style={T.tdCtr}><AtingBadge v={row.pct_ating_perda} inverse /></td>
          <td style={T.tdNum}>{row.dif_perda != null ? <span style={{ color: row.dif_perda >= 0 ? '#22c55e' : '#ef4444' }}>{row.dif_perda >= 0 ? '+' : ''}{row.dif_perda.toFixed(2).replace('.',',')}</span> : '—'}</td>
        </>}
        {showFluxo && <>
          <td style={T.tdNum}>{fmtN(row.fluxo_atual)}</td>
          <td style={T.tdNum}>{fmtN(row.fluxo_aa)}</td>
          <td style={T.tdCtr}><VarBadge v={row.pct_var_fluxo} /></td>
          <td style={T.tdNum}>{fmtT(row.ticket_atual)}</td>
          <td style={T.tdNum}>{fmtT(row.ticket_aa)}</td>
          <td style={T.tdCtr}><VarBadge v={row.pct_var_ticket} /></td>
        </>}
      </tr>
    )
  }

  // Group span counts
  const vendSpan  = 7
  const margSpan  = 6
  const estSpan   = 4
  const perdSpan  = 4
  const fluxSpan  = 6

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={T.header}>
        <div style={T.headerTitle}>Acompanhamento Diário de Vendas</div>
        <div style={T.headerRight}>
          <span style={T.headerBadge}>{ref.month} {ref.year}</span>
          <span style={T.headerBadge}>{ref.filial}</span>
          <span style={T.headerBadge}>{ref.canal}</span>
          <span style={T.headerBadge}>{ref.categoria}</span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>

        {/* Row 1: Visão (groupBy) */}
        <div style={T.controls}>
          <div style={T.filterGroup}>
            <span style={T.filterLabel}>Visão</span>
            <div style={T.tabRow}>
              {[
                { key: 'filial',      label: '🏪 Por Filial' },
                { key: 'cidade',      label: '🏙️ Por Cidade' },
                { key: 'regiao',      label: '🗺️ Por Região' },
                { key: 'mesmasnovas', label: '🆕 Mesmas / Novas' },
              ].map(v => (
                <button key={v.key}
                  style={{ ...T.tabBtn, ...(groupBy === v.key ? T.tabBtnActive : {}) }}
                  onClick={() => { setGroupBy(v.key); setDrillGroup(null); setFocusedRow(null) }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drill-down breadcrumb */}
          {drillGroup && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button onClick={() => setDrillGroup(null)} style={{ ...T.tabBtn, fontSize: '0.72rem' }}>
                ← Voltar
              </button>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                {drillGroup}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                ({filteredRows.length} lojas)
              </span>
            </div>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>
            {groupedRows
              ? `${groupedRows.length} grupos · ${ref.month} ${ref.year}`
              : `${filteredRows.length} filiais · ${ref.month} ${ref.year}`}
            {' · Clique no cabeçalho para ordenar'}
          </span>
        </div>

        {/* Row 2: Tipo + Colunas */}
        <div style={T.controls}>
          <div style={T.filterGroup}>
            <span style={T.filterLabel}>Tipo</span>
            <div style={T.tabRow}>
              {storeTypes.map(t => (
                <button key={t}
                  style={{ ...T.tabBtn, ...(typeFilter === t ? T.tabBtnActive : {}) }}
                  onClick={() => { setTypeFilter(t); setDrillGroup(null) }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={T.filterGroup}>
            <span style={T.filterLabel}>Colunas</span>
            <div style={T.tabRow}>
              {SECTION_DEFS.map(s => (
                <button key={s.key}
                  style={{ ...T.tabBtn,
                    background: sections.has(s.key) ? s.color : '#f8fafc',
                    borderColor: sections.has(s.key) ? s.color : '#e2e8f0',
                    color: sections.has(s.key) ? '#fff' : '#64748b' }}
                  onClick={() => toggleSection(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Focus Panel ── */}
      {focusedData && (
        <div style={T.focusPanel}>
          <div style={T.focusPanelHeader}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
              📍 {focusedData.filial.split(' - ')[0]}
              <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                {cityName(focusedData.filial)}
              </span>
            </span>
            <button onClick={() => setFocusedRow(null)} style={T.closeBtn}>✕ fechar</button>
          </div>
          <div style={T.focusGrid}>
            <FocusKpi label="Cota Mês"    value={fmtM(focusedData.cota_mes)} color="#64748b" />
            <FocusKpi label="Venda"        value={fmtM(focusedData.venda)}     color="#c41e3a"
              sub={<AtingBadge v={focusedData.pct_ating_venda} />} />
            <FocusKpi label="Venda AA"     value={fmtM(focusedData.venda_aa)}  color="#64748b"
              sub={<VarBadge v={focusedData.pct_var_venda_aa} />} />
            <FocusKpi label="% Promoção"   value={fmtPct(focusedData.pct_promocao)} color="#f59e0b" />
            <FocusKpi label="Margem Real"  value={focusedData.margem_real != null ? `${(focusedData.margem_real*100).toFixed(2).replace('.',',')}%` : '—'} color="#0ea5e9"
              sub={<AtingBadge v={focusedData.pct_ating_margem} />} />
            <FocusKpi label="Margem Obj."  value={focusedData.margem_obj  != null ? `${(focusedData.margem_obj*100).toFixed(2).replace('.',',')}%` : '—'}  color="#64748b" />
            <FocusKpi label="Margem AA"    value={focusedData.margem_aa   != null ? `${(focusedData.margem_aa*100).toFixed(2).replace('.',',')}%` : '—'}   color="#64748b" />
            <FocusKpi label="Estoque"      value={fmtM(focusedData.estoque)}    color="#8b5cf6" />
            <FocusKpi label="Cob. Proj."   value={fmtD(focusedData.cobertura_proj)} color="#8b5cf6"
              sub={`Obj: ${fmtD(focusedData.cobertura_obj)} dias`} />
            <FocusKpi label="Fluxo"        value={fmtN(focusedData.fluxo_atual)} color="#22c55e"
              sub={<VarBadge v={focusedData.pct_var_fluxo} />} />
            <FocusKpi label="Ticket"       value={fmtT(focusedData.ticket_atual)} color="#22c55e"
              sub={<VarBadge v={focusedData.pct_var_ticket} />} />
            {focusedData.pct_perda_obj != null &&
              <FocusKpi label="% Perda Obj." value={fmtPct(focusedData.pct_perda_obj)} color="#ef4444" />}
            {focusedData.pct_perda_proj != null &&
              <FocusKpi label="% Perda Proj." value={fmtPct(focusedData.pct_perda_proj)} color="#dc2626"
                sub={<AtingBadge v={focusedData.pct_ating_perda} inverse />} />}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <table style={T.table}>
          <thead>
            {/* Row 1 – group headers */}
            <tr>
              <th rowSpan={2} style={{ ...T.th, ...T.thSticky, verticalAlign: 'bottom',
                borderRight: '2px solid #e2e8f0', minWidth: 160 }}>
                {groupBy === 'filial' ? 'Por Filial'
                  : groupBy === 'cidade' ? 'Por Cidade'
                  : groupBy === 'regiao' ? 'Por Região'
                  : 'Mesmas / Novas'}
              </th>
              {showVendas  && <th colSpan={vendSpan}  style={{ ...T.thGroup, background: '#1e40af', color: '#fff' }}>Desempenho de Vendas</th>}
              {showMargem  && <th colSpan={margSpan}  style={{ ...T.thGroup, background: '#0369a1', color: '#fff' }}>Desempenho de Margem</th>}
              {showEstoque && <th colSpan={estSpan}   style={{ ...T.thGroup, background: '#6d28d9', color: '#fff' }}>Desempenho de Estoque</th>}
              {showPerdas  && <th colSpan={perdSpan}  style={{ ...T.thGroup, background: '#991b1b', color: '#fff' }}>% Perdas</th>}
              {showFluxo   && <th colSpan={fluxSpan}  style={{ ...T.thGroup, background: '#065f46', color: '#fff' }}>Fluxo & Ticket</th>}
            </tr>
            {/* Row 2 – column headers */}
            <tr>
              {showVendas && <>
                <SortTh field="cota_mes"         right>Cota Mês</SortTh>
                <SortTh field="cota"             right>Cota</SortTh>
                <SortTh field="venda"            right>Venda</SortTh>
                <SortTh field="pct_ating_venda"  right>% Ating.</SortTh>
                <SortTh field="venda_aa"         right>Venda AA</SortTh>
                <SortTh field="pct_var_venda_aa" right>Δ vs AA</SortTh>
                <SortTh field="pct_promocao"     right>% Promo</SortTh>
              </>}
              {showMargem && <>
                <SortTh field="margem_obj"       right>Objetivo</SortTh>
                <SortTh field="margem_real"      right>Real</SortTh>
                <SortTh field="pct_ating_margem" right>% Ating.</SortTh>
                <SortTh field="dif_margem"       right>Δ Dif.</SortTh>
                <SortTh field="margem_aa"        right>Margem AA</SortTh>
                <SortTh field="var_margem_aa"    right>Δ vs AA</SortTh>
              </>}
              {showEstoque && <>
                <SortTh field="estoque"               right>Estoque</SortTh>
                <SortTh field="cobertura_obj"         right>Cob. Obj.</SortTh>
                <SortTh field="cobertura_proj"        right>Cob. Proj.</SortTh>
                <SortTh field="pct_ating_cobertura"   right>% Ating.</SortTh>
              </>}
              {showPerdas && <>
                <SortTh field="pct_perda_obj"    right>% Perda Obj.</SortTh>
                <SortTh field="pct_perda_proj"   right>% Perda Proj.</SortTh>
                <SortTh field="pct_ating_perda"  right>% Ating.</SortTh>
                <SortTh field="dif_perda"        right>Δ Dif.</SortTh>
              </>}
              {showFluxo && <>
                <SortTh field="fluxo_atual"    right>Fluxo</SortTh>
                <SortTh field="fluxo_aa"       right>Fluxo AA</SortTh>
                <SortTh field="pct_var_fluxo"  right>Δ Fluxo</SortTh>
                <SortTh field="ticket_atual"   right>Ticket</SortTh>
                <SortTh field="ticket_aa"      right>Ticket AA</SortTh>
                <SortTh field="pct_var_ticket" right>Δ Ticket</SortTh>
              </>}
            </tr>
          </thead>
          <tbody>
            {groupedRows
              ? <>
                  {groupedRows.map(row => renderGroupRow(row))}
                  {totalRow && renderRow(totalRow, true)}
                </>
              : <>
                  {filteredRows.map(row => renderRow(row))}
                  {totalRow && renderRow(totalRow, true)}
                </>
            }
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={T.footer}>
        Fonte: EPBCS VendaDia · {ref.month} {ref.year} · Cenário: {ref.scenario} · Gerado em {raw.generated_at}
      </div>
    </div>
  )
}

// ── Focus KPI card ────────────────────────────────────────────────────────────
function FocusKpi({ label, value, color, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0',
      borderTop: `3px solid ${color}`, borderRadius: 8,
      padding: '0.65rem 0.85rem', minWidth: 110 }}>
      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.04em', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>{sub}</div>}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const B = {
  badge: { display:'inline-block', padding:'0.15rem 0.4rem', borderRadius:4,
    fontWeight:700, fontSize:'0.75rem', whiteSpace:'nowrap' },
  green: { background:'rgba(34,197,94,0.15)', color:'#15803d' },
  amber: { background:'rgba(245,158,11,0.15)', color:'#92400e' },
  red:   { background:'rgba(239,68,68,0.15)',  color:'#991b1b' },
  dash:  { color:'#94a3b8' },
}

const T = {
  header: {
    background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
    borderRadius: 10, padding: '0.9rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem',
    boxShadow: '0 2px 8px rgba(30,58,138,0.3)',
  },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' },
  headerRight: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  headerBadge: { background: 'rgba(255,255,255,0.18)', color: '#fff',
    padding: '0.25rem 0.65rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 500 },
  controls: { display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    gap: '1rem', marginBottom: '0.75rem' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  filterLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  tabRow: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' },
  tabBtn: { padding: '0.3rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: 6,
    background: '#f8fafc', color: '#64748b', fontFamily: 'inherit',
    fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' },
  tabBtnActive: { background: '#c41e3a', borderColor: '#c41e3a', color: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th: { padding: '0.45rem 0.65rem', background: '#f8fafc',
    color: '#475569', fontWeight: 600, fontSize: '0.7rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: 'right' },
  thGroup: { padding: '0.4rem 0.75rem', fontWeight: 700, fontSize: '0.75rem',
    textAlign: 'center', letterSpacing: '0.03em',
    borderBottom: '2px solid rgba(255,255,255,0.3)',
    borderRight: '1px solid rgba(255,255,255,0.2)' },
  thSticky: { position: 'sticky', left: 0, zIndex: 2, textAlign: 'left',
    background: '#f8fafc', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' },
  tr: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' },
  tdSticky: { position: 'sticky', left: 0, zIndex: 1, padding: '0.4rem 0.75rem',
    borderRight: '2px solid #f1f5f9', minWidth: 160,
    boxShadow: '2px 0 4px rgba(0,0,0,0.04)' },
  tdNum: { padding: '0.4rem 0.65rem', textAlign: 'right', whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums', color: '#334155' },
  tdCtr: { padding: '0.4rem 0.65rem', textAlign: 'center', whiteSpace: 'nowrap' },
  tdTot: { padding: '0.4rem 0.65rem', textAlign: 'right', whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums', color: '#e2e8f0', fontWeight: 600 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '4rem 2rem', color: '#334155', textAlign: 'center' },
  code: { background: '#1e293b', color: '#a5f3fc', padding: '0.6rem 1.2rem',
    borderRadius: 8, fontFamily: 'monospace', fontSize: '0.9rem', display: 'block' },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e2e8f0',
    borderTopColor: '#c41e3a', marginBottom: '0.75rem' },
  footer: { fontSize: '0.72rem', color: '#94a3b8',
    padding: '0.75rem 0', borderTop: '1px solid #e2e8f0', marginTop: '1rem' },
  focusPanel: {
    background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10,
    padding: '0.85rem 1rem', marginBottom: '0.75rem',
    boxShadow: '0 2px 8px rgba(245,158,11,0.15)',
  },
  focusPanelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '0.65rem',
  },
  focusGrid: {
    display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
  },
  closeBtn: {
    background: 'none', border: '1px solid #d97706', borderRadius: 6,
    color: '#92400e', fontSize: '0.75rem', cursor: 'pointer',
    padding: '0.2rem 0.6rem', fontFamily: 'inherit', fontWeight: 500,
  },
}
