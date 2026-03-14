import { useState, useEffect, useMemo } from 'react'
import { Bar } from 'react-chartjs-2'

// ── Helpers ───────────────────────────────────────────────────────────────────
const isReal = (s) => s === 'Real/Trabalho'
const isOrc  = (s) => ['Orc/Oficial','Orc Original/Oficial','Orc/Trabalho'].includes(s)

function title(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase()).toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}
function city(alias) {
  // alias like "SVG0001 - SERTAOZINHO" → "Sertãozinho" (approx title-case)
  const part = alias.split(' - ').slice(1).join(' - ')
  return part ? title(part
    .replace('RIBEIRAO PRETO', 'Ribeirão Preto')
    .replace('SAO CARLOS',    'São Carlos')
    .replace('SERTAOZINHO',   'Sertãozinho')
    .replace('ARARAQUARA',    'Araraquara')
    .replace('PIRACICABA',    'Piracicaba')
    .replace('JABOTICABAL',   'Jaboticabal')
    .replace('HORTOLANDIA',   'Hortolândia')
    .replace('INDAIATUBA',    'Indaiatuba')
    .replace('CAMPINAS',      'Campinas')
    .replace('SUMARE',        'Sumaré')
    .replace('ARARAS',        'Araras')
    .replace('AMERICANA',     'Americana')
    .replace('LIMEIRA',       'Limeira')
    .replace('FRANCA',        'Franca')
    .replace('BEBEDOURO',     'Bebedouro')
    .replace('BARRETOS',      'Barretos')
    .replace('RIO CLARO',     'Rio Claro')
    .replace('MONTE ALTO',    'Monte Alto')
    .replace('MATAO',         'Matão')
    .replace("SANTA BARBARA D'OESTE", "Santa Bárbara d'Oeste")
    .replace('MOGI GUACU',    'Mogi Guaçu')
    .replace('LEME',          'Leme')
    .replace('JARDINOPOLIS',  'Jardinópolis')
    .replace('CORDEIROPOLIS', 'Cordeirópolis')
  ) : alias
}

// ── Hierarquia de Filiais ─────────────────────────────────────────────────────
const node = (id, label, children = []) => ({ id, label, children })

const SVG_STORES = [
  [1,'SERTAOZINHO'],[2,'SERTAOZINHO'],[3,'SERTAOZINHO'],[4,'SERTAOZINHO'],[5,'SERTAOZINHO'],
  [6,'RIBEIRAO PRETO'],[7,'JARDINOPOLIS'],[8,'RIBEIRAO PRETO'],[9,'RIBEIRAO PRETO'],[10,'RIBEIRAO PRETO'],
  [11,'FRANCA'],[12,'FRANCA'],[13,'RIBEIRAO PRETO'],[14,'FRANCA'],[15,'BARRETOS'],
  [16,'RIBEIRAO PRETO'],[17,'RIBEIRAO PRETO'],[18,'BEBEDOURO'],[19,'BARRETOS'],[20,'RIBEIRAO PRETO'],
  [21,'BEBEDOURO'],[22,'ARARAQUARA'],[23,'MONTE ALTO'],[24,'MATAO'],[25,'RIBEIRAO PRETO'],
  [26,'RIBEIRAO PRETO'],[27,'JABOTICABAL'],[28,'RIBEIRAO PRETO'],[29,'SAO CARLOS'],[30,'ARARAQUARA'],
  [31,'JABOTICABAL'],[32,'FRANCA'],[33,'SAO CARLOS'],[34,'BARRETOS'],[35,'SAO CARLOS'],
  [36,'RIO CLARO'],[37,'RIBEIRAO PRETO'],[38,'PIRACICABA'],[39,'SUMARE'],[40,'LIMEIRA'],
  [41,'ARARAS'],[42,'ARARAQUARA'],[43,'CAMPINAS'],[44,'CAMPINAS'],[45,'RIO CLARO'],
  [46,'RIO CLARO'],[47,'RIBEIRAO PRETO'],[48,'LIMEIRA'],[49,'ARARAQUARA'],[50,'FRANCA'],
  [51,'PIRACICABA'],[52,'LEME'],[53,'CAMPINAS'],[54,'CAMPINAS'],[55,'HORTOLANDIA'],
  [56,'SUMARE'],[57,'AMERICANA'],[58,'SUMARE'],[59,'CAMPINAS'],[60,'SERTAOZINHO'],
  [61,'CAMPINAS'],[62,'RIBEIRAO PRETO'],[63,'INDAIATUBA'],[65,'CAMPINAS'],
].map(([n, c]) => node(`SVG${String(n).padStart(4,'0')}`, `SVG${String(n).padStart(4,'0')} · ${city(c)}`))

const PLT_STORES = [
  [1,'RIO CLARO'],[2,'ARARAQUARA'],[3,'BARRETOS'],[4,'FRANCA'],[5,'RIBEIRAO PRETO'],
  [6,'CAMPINAS'],[7,'RIBEIRAO PRETO'],[8,'MOGI GUACU'],[9,'SERTAOZINHO'],[10,"SANTA BARBARA D'OESTE"],
  [11,'MOGI GUACU'],[12,'LIMEIRA'],[13,'SAO CARLOS'],[14,'INDAIATUBA'],[15,'ARARAS'],
].map(([n, c]) => node(`PLT${String(n).padStart(4,'0')}`, `PLT${String(n).padStart(4,'0')} · ${city(c)}`))

const PRT_STORES = [
  [1,'SERTAOZINHO'],[2,'SERTAOZINHO'],[3,'RIBEIRAO PRETO'],
].map(([n, c]) => node(`PRT${String(n).padStart(4,'0')}`, `PRT${String(n).padStart(4,'0')} · ${city(c)}`))

const CDS_STORES = [
  node('CDM0001', 'CDM0001 · Sertãozinho'),
  node('CDS0001', 'CDS0001 · Araras (SVG)'),
  node('CDS0002', 'CDS0002 · Ribeirão Preto (SVG)'),
  node('CDS0003', 'CDS0003 · Ribeirão Preto (SVG/FLV)'),
  node('CDS0004', 'CDS0004 · Ribeirão Preto (ATC)'),
  node('CDS0005', 'CDS0005 · Araras (ATC)'),
  node('CDS0006', 'CDS0006 · Ribeirão Preto (Suprimentos)'),
  node('CDS0007', 'CDS0007 · Cordeirópolis (SVG)'),
  node('CDS0008', 'CDS0008 · Cordeirópolis (PLT)'),
]

const ADM_STORES = [
  node('ADM0001', 'ADM0001 · Sertãozinho'),
  node('ADM0002', 'ADM0002 · Sertãozinho'),
]

const APS_STORES = [
  [0,'SERTAOZINHO'],[1,'SERTAOZINHO'],[2,'RIBEIRAO PRETO'],[3,'RIBEIRAO PRETO'],
  [4,'RIBEIRAO PRETO'],[5,'FRANCA'],[6,'RIBEIRAO PRETO'],[7,'BARRETOS'],
].map(([n, c]) => node(`APS${String(n).padStart(4,'0')}`, `APS${String(n).padStart(4,'0')} · ${city(c)}`))

const FILIAL_TREE = node('All BU', 'All BU', [
  node('01 - SVG', '01 - SVG', [
    node('TOTAL SVG', 'TOTAL SVG', SVG_STORES),
    node('TOTAL PLT', 'TOTAL PLT', PLT_STORES),
    node('TOTAL PRT', 'TOTAL PRT', PRT_STORES),
    node('TOTAL CDS', 'TOTAL CDS', CDS_STORES),
    node('TOTAL ADM', 'TOTAL ADM', ADM_STORES),
  ]),
  node('02 - APS', '02 - APS', [
    node('TOTAL APS', 'TOTAL APS', APS_STORES),
  ]),
  node('TOTAL CDM', 'TOTAL CDM', []),
  node('TOTAL PEP', 'TOTAL PEP', []),
  node('TOTAL SEP', 'TOTAL SEP', []),
  node('Total ACS', 'Total ACS', [
    node('ACS0001', 'ACS0001'),
  ]),
  node('000', '000', [
    node('0000000', '0000000'),
  ]),
])

// Flatten tree → array of {id, label, level, hasChildren, parentId}
function flattenTree(n, level = 0, parentId = null) {
  const self = { id: n.id, label: n.label, level, hasChildren: n.children.length > 0, parentId }
  return [self, ...n.children.flatMap(c => flattenTree(c, level + 1, n.id))]
}
const FLAT_TREE = flattenTree(FILIAL_TREE)

// Default expanded: L0, L1, L2 (not L3 stores)
const DEFAULT_EXPANDED = new Set(
  FLAT_TREE.filter(n => n.level < 2 && n.hasChildren).map(n => n.id)
)

// ── Canal / Categoria labels ──────────────────────────────────────────────────
const CANAL_LABELS = {
  C01:'C01 · Lojas', C02:'C02 · E-Commerce', C03:'C03 · Televendas',
  C04:'C04 · Vendas Externas', C06:'C06 · Logístico',
  C08:'C08 · Rappi', C09:'C09 · iFood', C10:'C10 · Mercado Livre',
}
const CAT_LABELS = {
  'Total Categoria':'Total','All Categoria':'Total',
  'N01_7384':'Perecíveis','N01_7756':'Mercearia','N01_4315':'Posto Combustível',
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtM(v) {
  if (v == null) return '—'
  if (v === 0) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return `R$\u00a0${(v/1e9).toFixed(1).replace('.',',')}B`
  if (a >= 1e6) return `R$\u00a0${(v/1e6).toFixed(1).replace('.',',')}M`
  if (a >= 1e3) return `R$\u00a0${(v/1e3).toFixed(0)}k`
  return `R$\u00a0${v.toFixed(0)}`
}
const fmtQ = (v) => v ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(v) : '—'
const fmtP = (v, sign=false) => v == null ? '—' : `${sign&&v>=0?'+':''}${v.toFixed(1)}%`

// ── Main component ────────────────────────────────────────────────────────────
export default function VendasDiaDashboard() {
  const [raw,  setRaw]  = useState(null)
  const [err,  setErr]  = useState(null)
  const [view, setView] = useState('filial')

  useEffect(() => {
    fetch('/data/vendasdia_data.json')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRaw)
      .catch(e => setErr(String(e)))
  }, [])

  const meta = raw?.meta ?? {}
  const diaR = meta.dia_realizado ?? 0
  const mesR = meta.mes_realizado ?? '—'
  const anoR = meta.ano_realizado ?? '—'
  const anoO = meta.ano_orc       ?? '—'

  const diaMax = useMemo(() => {
    if (!raw) return diaR
    const dias = (raw.por_dia ?? [])
      .filter(r => isReal(r.scenario) && r.value > 0)
      .map(r => parseInt(r.col, 10))
    return dias.length ? Math.max(...dias) : diaR
  }, [raw, diaR])

  const hasOrc = useMemo(() =>
    (raw?.por_dia ?? []).some(r => isOrc(r.scenario) && r.value > 0),
  [raw])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!raw) return null
    const recs = raw.por_dia ?? []
    const real = recs.filter(r => isReal(r.scenario))
    const sum  = (acc) => real.filter(r => r.account === acc).reduce((s,r) => s+r.value, 0)

    const vendaAcum = sum('Total Venda')
    const qtdAcum   = sum('Qtd Venda')
    const lucAcum   = sum('Lucratividade Total')
    const custoB    = sum('Custo Bruto Produto')
    const impostos  = sum('Impostos Venda')
    const promo     = sum('Promocao de Venda')

    const byDay = (acc, d) => real.filter(r => r.account===acc && parseInt(r.col,10)===d).reduce((s,r) => s+r.value,0)
    const vendaDia    = byDay('Total Venda', diaMax)
    const vendaDiaAnt = byDay('Total Venda', diaMax-1)
    const deltaDia    = diaMax > 1 && vendaDiaAnt > 0 ? (vendaDia-vendaDiaAnt)/vendaDiaAnt*100 : null

    return {
      vendaDia, deltaDia, vendaAcum, qtdAcum, lucAcum,
      margemPct: vendaAcum>0 ? lucAcum/vendaAcum*100 : null,
      pctCusto:  vendaAcum>0 ? custoB/vendaAcum*100  : null,
      pctPromo:  vendaAcum>0 ? promo/vendaAcum*100   : null,
      pctImp:    vendaAcum>0 ? impostos/vendaAcum*100 : null,
      projMes:   diaMax>0 && diaMax<31 ? (vendaAcum/diaMax)*31 : null,
    }
  }, [raw, diaMax])

  // ── Daily chart ────────────────────────────────────────────────────────────
  const dailyChart = useMemo(() => {
    if (!raw) return null
    const recs = (raw.por_dia ?? []).filter(r => r.account==='Total Venda')
    const realByDay = {}, orcByDay = {}
    recs.forEach(r => {
      if (isReal(r.scenario)) realByDay[r.col] = (realByDay[r.col]||0) + r.value
      if (isOrc(r.scenario))  orcByDay[r.col]  = (orcByDay[r.col] ||0) + r.value
    })
    const DAYS = Array.from({length:31},(_,i)=>String(i+1))
    const datasets = [{
      label: 'Realizado',
      data: DAYS.map(d => realByDay[d]??null),
      backgroundColor: DAYS.map(d => parseInt(d,10)===diaMax ? '#9e1830' : '#c41e3a'),
      borderRadius: 4, borderWidth: 0, order: 1,
    }]
    if (hasOrc) datasets.push({
      label: 'Cota (Orc)',
      data: DAYS.map(d => orcByDay[d]??null),
      backgroundColor: 'rgba(14,165,233,0.25)',
      borderColor: '#0ea5e9', borderWidth: 1, borderRadius: 4, order: 2,
    })
    return { labels: DAYS, datasets }
  }, [raw, diaMax, hasOrc])

  // ── Lookup de dados por filial ─────────────────────────────────────────────
  const filialData = useMemo(() => {
    const out = {}  // { filialId: { venda, qtd, luc } }
    ;(raw?.por_filial ?? []).forEach(r => {
      if (!isReal(r.scenario)) return
      if (!out[r.col]) out[r.col] = { venda:0, qtd:0, luc:0 }
      if (r.account==='Total Venda')         out[r.col].venda += r.value
      if (r.account==='Qtd Venda')           out[r.col].qtd   += r.value
      if (r.account==='Lucratividade Total') out[r.col].luc   += r.value
    })
    return out
  }, [raw])

  // ── Breakdown simples (canal / categoria) ──────────────────────────────────
  const breakdownRows = useMemo(() => {
    if (!raw || view==='filial') return []
    const recs = view==='canal' ? (raw.por_canal??[]) : (raw.por_categoria??[])
    const skip = new Set(['All BU','Total Categoria','All Categoria'])
    const cols = [...new Set(recs.map(r=>r.col))].filter(c=>!skip.has(c))
    const lblMap = view==='canal' ? CANAL_LABELS : CAT_LABELS
    return cols.map(col => {
      const venda = recs.filter(r=>r.col===col&&r.account==='Total Venda'&&isReal(r.scenario)).reduce((s,r)=>s+r.value,0)
      const luc   = recs.filter(r=>r.col===col&&r.account==='Lucratividade Total'&&isReal(r.scenario)).reduce((s,r)=>s+r.value,0)
      const qtd   = recs.filter(r=>r.col===col&&r.account==='Qtd Venda'&&isReal(r.scenario)).reduce((s,r)=>s+r.value,0)
      return { col, label: lblMap[col]||col, venda, qtd, luc,
               margem: venda>0?luc/venda*100:null }
    }).filter(r=>r.venda>0).sort((a,b)=>b.venda-a.venda)
  }, [raw, view])

  // ── States ─────────────────────────────────────────────────────────────────
  if (err) return (
    <div style={S.empty}>
      <div style={{fontSize:'2rem',marginBottom:'0.5rem'}}>⚠️</div>
      <p style={{fontWeight:600,marginBottom:'0.5rem'}}>Dados não encontrados</p>
      <p style={{color:'#64748b',fontSize:'0.9rem',marginBottom:'1rem'}}>
        Execute o script para buscar os dados do cubo <strong>VendaDia</strong>:
      </p>
      <code style={S.code}>python scripts/fetch_vendasdia_data.py</code>
    </div>
  )
  if (!raw) return (
    <div style={S.empty}>
      <div style={S.spinner}/>Carregando VendaDia…
    </div>
  )

  const totalRede = filialData['All BU']?.venda ?? 0

  return (
    <div style={{fontFamily:'inherit'}}>

      {/* Variáveis EPM */}
      <div style={S.varStrip}>
        <span style={S.varLabel}>Variáveis EPM</span>
        <VarBadge name="Dia_Realizado" value={diaR}  color="#c41e3a"/>
        <VarBadge name="Mes_Realizado" value={mesR}  color="#0ea5e9"/>
        <VarBadge name="Ano_Realizado" value={anoR}  color="#8b5cf6"/>
        <VarBadge name="Ano_Orc"       value={anoO}  color="#f59e0b"/>
        {diaMax > diaR &&
          <span style={{...S.varBadge,borderColor:'#22c55e'}}>
            <span style={{color:'#94a3b8',fontSize:'0.75rem'}}>Dados até dia</span>
            <span style={{color:'#22c55e',fontWeight:700,marginLeft:4}}>{diaMax}</span>
          </span>
        }
        <span style={S.varMeta}>
          {meta.generated_at?.replace('T',' ').slice(0,16)} UTC
          {!hasOrc && ' · sem dados Orc'}
        </span>
      </div>

      {/* KPI Cards */}
      <div style={S.kpiGrid}>
        <KpiCard label={`Venda Dia ${diaMax} (${mesR})`}  value={fmtM(kpis?.vendaDia)}
          sub={kpis?.deltaDia!=null?`Δ vs dia ${diaMax-1}: ${fmtP(kpis.deltaDia,true)}`:'Último dia com dados'}
          badge={kpis?.deltaDia!=null?fmtP(kpis.deltaDia,true):null}
          badgeOk={kpis?.deltaDia!=null&&kpis.deltaDia>=0} color="#c41e3a"/>
        <KpiCard label={`Acumulado dias 1–${diaMax}`}      value={fmtM(kpis?.vendaAcum)}
          sub="Total Venda · Real/Trabalho" color="#0ea5e9"/>
        <KpiCard label="Qtd Vendida Acumulada"              value={fmtQ(kpis?.qtdAcum)}
          sub={`${diaMax} dias`} color="#8b5cf6"/>
        <KpiCard label="Lucratividade Acumulada"            value={fmtM(kpis?.lucAcum)}
          sub={kpis?.margemPct!=null?`Margem ${fmtP(kpis.margemPct)}`:''}
          color="#ec4899"/>
        {kpis?.projMes!=null
          ? <KpiCard label="Projeção Mês (pace)"   value={fmtM(kpis.projMes)}
              sub={`Extrapolação ${diaMax}/31 dias`} color="#22c55e"/>
          : <KpiCard label="Custo Bruto / Venda"   value={fmtP(kpis?.pctCusto)}
              sub="% do Total Venda" color="#22c55e"/>
        }
        <KpiCard label="% Impostos / Venda" value={fmtP(kpis?.pctImp)}
          sub="Impostos Venda" color="#f59e0b"/>
      </div>

      {/* Gráfico diário */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <div>
            <h3 style={S.cardTitle}>Total Venda por Dia — {mesR} {anoR}</h3>
            <p style={S.cardSub}>Dia {diaMax} em destaque escuro · dias sem realizado = sem barra</p>
          </div>
        </div>
        {dailyChart && (
          <div style={{height:280}}>
            <Bar data={dailyChart} options={{
              responsive:true, maintainAspectRatio:false,
              plugins:{
                legend:{display:hasOrc,position:'top',labels:{color:'#64748b',boxWidth:12}},
                tooltip:{callbacks:{
                  label:(ctx)=>`${ctx.dataset.label}: ${fmtM(ctx.raw)}`,
                  title:(items)=>`Dia ${items[0].label} · ${mesR} ${anoR}`,
                }},
              },
              scales:{
                x:{grid:{display:false}, ticks:{color:'#94a3b8',font:{size:10}},
                   title:{display:true,text:`Dia — ${mesR} ${anoR}`,color:'#94a3b8',font:{size:11}}},
                y:{beginAtZero:true, grid:{color:'#e2e8f0'},
                   ticks:{color:'#64748b', callback:v=>v>=1e6?`${(v/1e6).toFixed(0)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:v}},
              },
            }}/>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <div>
            <h3 style={S.cardTitle}>Breakdown de Vendas</h3>
            <p style={S.cardSub}>Acumulado dias 1–{diaMax} · Real/Trabalho</p>
          </div>
          <div style={S.tabRow}>
            {[{key:'filial',label:'Árvore de Filiais'},{key:'canal',label:'Por Canal'},{key:'categoria',label:'Por Setor'}]
              .map(t=>(
                <button key={t.key}
                  style={{...S.tabBtn,...(view===t.key?S.tabBtnActive:{})}}
                  onClick={()=>setView(t.key)}>
                  {t.label}
                </button>
              ))}
          </div>
        </div>

        {view==='filial'
          ? <FilialTree flat={FLAT_TREE} data={filialData} total={totalRede}/>
          : <FlatTable rows={breakdownRows} total={breakdownRows.reduce((s,r)=>s+r.venda,0)}/>
        }
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <strong>Cube:</strong> VendaDia ·{' '}
        <strong>Cenário:</strong> Real/Trabalho{hasOrc?' + Orc/Oficial':''} ·{' '}
        <strong>Período:</strong> {mesR} {anoR} · dias 1–{diaMax} ·{' '}
        <strong>Var EPM:</strong> Dia_Realizado={diaR}, Mes={mesR}, Ano_Orc={anoO}
      </div>
    </div>
  )
}

// ── Filial Tree ───────────────────────────────────────────────────────────────
function FilialTree({ flat, data, total }) {
  const [expanded, setExpanded] = useState(DEFAULT_EXPANDED)

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function expandAll()   { setExpanded(new Set(flat.filter(n=>n.hasChildren).map(n=>n.id))) }
  function collapseAll() { setExpanded(new Set()) }

  // Visible nodes: a node is visible if all ancestors are expanded
  const visible = useMemo(() => {
    const expandedSet = expanded
    return flat.filter(n => {
      if (n.level === 0) return true
      // Walk up the tree checking ancestors
      let cur = n
      while (cur.parentId) {
        if (!expandedSet.has(cur.parentId)) return false
        cur = flat.find(f => f.id === cur.parentId)
        if (!cur) return false
      }
      return true
    })
  }, [flat, expanded])

  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem',alignItems:'center'}}>
        <button onClick={expandAll}   style={S.ctrlBtn}>Expandir tudo</button>
        <button onClick={collapseAll} style={S.ctrlBtn}>Recolher tudo</button>
        <span style={{fontSize:'0.75rem',color:'#94a3b8',marginLeft:'auto'}}>
          {flat.filter(n=>!n.hasChildren&&(data[n.id]?.venda>0)).length} lojas com dados
        </span>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={S.table}>
          <thead>
            <tr>
              <Th>Filial</Th>
              <Th right>Total Venda</Th>
              <Th right>Qtd Vendida</Th>
              <Th right>Lucratividade</Th>
              <Th right>Margem %</Th>
              <Th right>% da Rede</Th>
              <Th>Participação</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(n => {
              const d = data[n.id]
              const venda   = d?.venda ?? 0
              const qtd     = d?.qtd   ?? 0
              const luc     = d?.luc   ?? 0
              const margem  = venda>0 ? luc/venda*100 : null
              const pctRede = total>0  ? venda/total*100 : 0
              const isGroup = n.hasChildren
              const indent  = n.level * 20

              return (
                <tr key={n.id} style={{
                  borderBottom:'1px solid #f1f5f9',
                  background: n.level===0 ? '#fafafa' : n.level===1 ? '#fdfcfc' : 'white',
                }}>
                  {/* Label com indent */}
                  <td style={{padding:'0.45rem 0.75rem', paddingLeft: indent+12}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {isGroup
                        ? <button onClick={()=>toggle(n.id)} style={S.toggleBtn}>
                            {expanded.has(n.id) ? '▾' : '▸'}
                          </button>
                        : <span style={{width:18,display:'inline-block',color:'#cbd5e1',fontSize:'0.75rem'}}>—</span>
                      }
                      <span style={{
                        fontWeight: n.level===0 ? 700 : n.level===1 ? 600 : n.level===2 ? 500 : 400,
                        fontSize: n.level>=3 ? '0.82rem' : '0.875rem',
                        color: venda===0 ? '#cbd5e1' : '#1e293b',
                      }}>
                        {n.label}
                      </span>
                    </div>
                  </td>
                  <Td right bold={isGroup} muted={venda===0}>{fmtM(venda||null)}</Td>
                  <Td right muted>{qtd>0?fmtQ(qtd):null}</Td>
                  <Td right muted>{luc>0?fmtM(luc):null}</Td>
                  <Td right color={margem==null?'#94a3b8':margem>=20?'#22c55e':margem>=15?'#f59e0b':'#ef4444'}>
                    {margem!=null?fmtP(margem):'—'}
                  </Td>
                  <Td right muted>{pctRede>0?`${pctRede.toFixed(1)}%`:'—'}</Td>
                  <td style={{padding:'0.45rem 0.75rem',minWidth:100}}>
                    {pctRede>0&&<BarFill pct={Math.min(pctRede*2,100)} color={n.level===0?'#c41e3a':n.level===1?'#0ea5e9':'#8b5cf6'}/>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Flat table (canal / categoria) ────────────────────────────────────────────
function FlatTable({ rows, total }) {
  if (!rows.length) return (
    <p style={{color:'#94a3b8',fontSize:'0.875rem',padding:'0.5rem 0'}}>Sem dados.</p>
  )
  return (
    <div style={{overflowX:'auto'}}>
      <table style={S.table}>
        <thead><tr>
          <Th>Dimensão</Th><Th right>Total Venda</Th>
          <Th right>Qtd Vendida</Th><Th right>Lucratividade</Th>
          <Th right>Margem %</Th><Th right>% do Total</Th><Th>Participação</Th>
        </tr></thead>
        <tbody>
          {rows.map(r=>{
            const pct = total>0?r.venda/total*100:0
            return (
              <tr key={r.col} style={{borderBottom:'1px solid #f1f5f9'}}>
                <td style={S.tdLabel}>{r.label}</td>
                <Td right bold>{fmtM(r.venda)}</Td>
                <Td right muted>{fmtQ(r.qtd)}</Td>
                <Td right muted>{fmtM(r.luc)}</Td>
                <Td right color={r.margem==null?'#94a3b8':r.margem>=20?'#22c55e':r.margem>=15?'#f59e0b':'#ef4444'}>
                  {fmtP(r.margem)}
                </Td>
                <Td right muted>{pct.toFixed(1)}%</Td>
                <td style={{padding:'0.45rem 0.75rem',minWidth:100}}>
                  <BarFill pct={Math.min(pct*2,100)} color="#c41e3a"/>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Micro components ──────────────────────────────────────────────────────────
function VarBadge({ name, value, color }) {
  return (
    <span style={{...S.varBadge,borderColor:color}}>
      <span style={{color:'#94a3b8',fontSize:'0.75rem'}}>{name}</span>
      <span style={{color,fontWeight:700,marginLeft:4}}>{value}</span>
    </span>
  )
}

function KpiCard({ label, value, sub, badge, badgeOk, color }) {
  return (
    <div style={{...S.kpiCard,borderTopColor:color}}>
      <div style={{fontSize:'0.8rem',color:'#64748b',marginBottom:'0.4rem'}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:700,color:'#1e293b',lineHeight:1.1}}>
        {value}
        {badge&&<span style={{fontSize:'0.8rem',fontWeight:600,marginLeft:8,verticalAlign:'middle',color:badgeOk?'#22c55e':'#ef4444'}}>{badge}</span>}
      </div>
      {sub&&<div style={{fontSize:'0.75rem',color:'#94a3b8',marginTop:'0.3rem'}}>{sub}</div>}
    </div>
  )
}

function BarFill({ pct, color }) {
  return (
    <div style={{background:'#f1f5f9',borderRadius:4,height:7,overflow:'hidden'}}>
      <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:4,transition:'width 0.3s'}}/>
    </div>
  )
}

function Th({ children, right }) {
  return <th style={{padding:'0.5rem 0.75rem',background:'#f8fafc',color:'#475569',fontWeight:600,
    fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:'0.04em',
    textAlign:right?'right':'left',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{children}</th>
}

function Td({ children, right, bold, muted, color }) {
  return <td style={{padding:'0.42rem 0.75rem',textAlign:right?'right':'left',
    fontWeight:bold?600:400, whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums',
    color:color??(muted?'#94a3b8':'#334155'), fontSize:'0.855rem'}}>{children??'—'}</td>
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  varStrip:{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap',
    padding:'0.75rem 0',marginBottom:'1.25rem',borderBottom:'1px solid #e2e8f0'},
  varLabel:{fontSize:'0.72rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
    letterSpacing:'0.06em',marginRight:'0.25rem'},
  varBadge:{display:'inline-flex',alignItems:'center',gap:2,padding:'0.25rem 0.6rem',
    borderRadius:6,border:'1px solid',background:'#f8fafc',fontSize:'0.82rem'},
  varMeta:{marginLeft:'auto',fontSize:'0.73rem',color:'#94a3b8'},
  kpiGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1rem'},
  kpiCard:{background:'#fff',border:'1px solid #e2e8f0',borderTop:'3px solid #c41e3a',
    borderRadius:10,padding:'1rem 1.25rem',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'},
  card:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,
    padding:'1.5rem',marginBottom:'1.5rem',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'},
  cardHeader:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',
    flexWrap:'wrap',gap:'0.75rem',marginBottom:'1.25rem'},
  cardTitle:{fontSize:'1rem',fontWeight:700,color:'#1e293b'},
  cardSub:{fontSize:'0.8rem',color:'#94a3b8',marginTop:'0.2rem'},
  tabRow:{display:'flex',gap:'0.4rem'},
  tabBtn:{padding:'0.35rem 0.85rem',border:'1px solid #e2e8f0',borderRadius:6,background:'#f8fafc',
    color:'#64748b',fontFamily:'inherit',fontSize:'0.83rem',cursor:'pointer',fontWeight:500},
  tabBtnActive:{background:'#c41e3a',borderColor:'#c41e3a',color:'#fff'},
  toggleBtn:{background:'none',border:'none',cursor:'pointer',padding:'0 2px',
    color:'#64748b',fontSize:'0.85rem',lineHeight:1,minWidth:18},
  ctrlBtn:{padding:'0.3rem 0.7rem',border:'1px solid #e2e8f0',borderRadius:6,background:'#f8fafc',
    color:'#64748b',fontFamily:'inherit',fontSize:'0.78rem',cursor:'pointer'},
  table:{width:'100%',borderCollapse:'collapse'},
  tdLabel:{padding:'0.5rem 0.75rem',color:'#1e293b',fontWeight:500,fontSize:'0.875rem'},
  empty:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
    padding:'4rem 2rem',color:'#334155',textAlign:'center'},
  code:{background:'#1e293b',color:'#a5f3fc',padding:'0.6rem 1.2rem',borderRadius:8,
    fontFamily:'monospace',fontSize:'0.9rem',display:'block'},
  spinner:{width:28,height:28,borderRadius:'50%',border:'3px solid #e2e8f0',
    borderTopColor:'#c41e3a',marginBottom:'0.75rem'},
  footer:{fontSize:'0.73rem',color:'#94a3b8',padding:'0.75rem 0',borderTop:'1px solid #e2e8f0'},
}
