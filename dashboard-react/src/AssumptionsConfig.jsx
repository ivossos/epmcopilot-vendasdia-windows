import { useState, useEffect, useCallback } from 'react'

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const DOW_NAMES   = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']
const ACCOUNTS    = [
  'Total Venda','Custo Bruto Produto','Custo Liquido Produto',
  'Impostos Venda','Comissao','Promocao de Venda','Despesa','Verba PDV','Lucratividade Total',
]

const DEFAULTS = {
  opening_balance: 0,
  budget_weight: 0.30,
  collection: { pix_cash_pct:0.60, card_pct:0.30, card_days_min:1, card_days_max:30, b2b_pct:0.10, b2b_days_min:31, b2b_days_max:60 },
  payment: { pereciveis_pct:0.30, pereciveis_days_min:1, pereciveis_days_max:3, combustivel_pct:0.20, combustivel_days_min:7, combustivel_days_max:14, mercearia_pct:0.50, mercearia_days_min:30, mercearia_days_max:45 },
  growth_rates: { 'Total Venda':0.085,'Custo Bruto Produto':0.075,'Custo Liquido Produto':0.075,'Impostos Venda':0.085,'Comissao':0.065,'Promocao de Venda':0.100,'Despesa':0.055,'Verba PDV':0.080,'Lucratividade Total':0.120 },
  month_factors: {'1':0.90,'2':0.87,'3':0.96,'4':1.07,'5':0.98,'6':1.01,'7':1.04,'8':0.97,'9':0.96,'10':1.02,'11':1.13,'12':1.40},
  dow_factors:   {'0':0.84,'1':0.87,'2':0.91,'3':0.95,'4':1.07,'5':1.30,'6':1.06},
  week_factors:  {'1':0.93,'2':1.00,'3':1.02,'4':1.05,'5':1.08},
  payroll_fraction: 0.35,
  despesa_floor_pct: 0.17,
  comissao_floor_pct: 0.008,
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)) }

// ── Small reusable inputs ────────────────────────────────────────────────────

function NumInput({ value, onChange, min, max, step = 0.001, pct = false, label, hint }) {
  const display = pct ? +(value * 100).toFixed(3) : value
  const factor  = pct ? 0.01 : 1
  return (
    <label className="ac-field">
      {label && <span className="ac-label">{label}</span>}
      <div className="ac-input-row">
        <input
          type="number"
          value={display}
          min={min != null ? (pct ? min * 100 : min) : undefined}
          max={max != null ? (pct ? max * 100 : max) : undefined}
          step={pct ? (step * 100) : step}
          onChange={e => onChange(parseFloat(e.target.value) * factor || 0)}
          className="ac-num"
        />
        {pct && <span className="ac-unit">%</span>}
      </div>
      {hint && <span className="ac-hint">{hint}</span>}
    </label>
  )
}

function SliderRow({ label, value, onChange, min = 0.5, max = 2.0, step = 0.01 }) {
  const pct = Math.round((value - 1) * 100)
  return (
    <div className="ac-slider-row">
      <span className="ac-slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="ac-slider"
      />
      <span className={`ac-slider-val ${value > 1 ? 'pos' : value < 1 ? 'neg' : ''}`}>
        {value.toFixed(2)}
        <small> ({pct >= 0 ? '+' : ''}{pct}%)</small>
      </span>
    </div>
  )
}

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="ac-section">
      <button className="ac-section-hdr" onClick={() => setOpen(o => !o)}>
        <span>{icon} {title}</span>
        <span className="ac-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="ac-section-body">{children}</div>}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AssumptionsConfig({ onGenerated }) {
  const [cfg, setCfg]       = useState(deepClone(DEFAULTS))
  const [status, setStatus] = useState('idle')  // idle | running | ok | error
  const [log, setLog]       = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/assumptions')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && Object.keys(d).length) {
          setCfg(prev => deepMerge(prev, d))
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  function deepMerge(base, override) {
    const out = deepClone(base)
    for (const k of Object.keys(override)) {
      if (override[k] !== null && typeof override[k] === 'object' && !Array.isArray(override[k])) {
        out[k] = deepMerge(out[k] || {}, override[k])
      } else {
        out[k] = override[k]
      }
    }
    return out
  }

  const set = useCallback((path, value) => {
    setCfg(prev => {
      const next = deepClone(prev)
      const keys = path.split('.')
      let cur = next
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
      cur[keys[keys.length - 1]] = value
      return next
    })
  }, [])

  async function handleGenerate() {
    setStatus('running')
    setLog('')
    try {
      const res  = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const data = await res.json()
      setLog((data.stdout || '') + (data.stderr || ''))
      if (data.ok) {
        setStatus('ok')
        onGenerated?.()
      } else {
        setStatus('error')
      }
    } catch (e) {
      setLog(e.message)
      setStatus('error')
    }
  }

  function handleReset() {
    setCfg(deepClone(DEFAULTS))
  }

  if (!loaded) return <div className="ac-loading">Carregando premissas…</div>

  // Validate collection/payment pct sums
  const colSum = cfg.collection.pix_cash_pct + cfg.collection.card_pct + cfg.collection.b2b_pct
  const paySum = cfg.payment.pereciveis_pct + cfg.payment.combustivel_pct + cfg.payment.mercearia_pct
  const colWarn = Math.abs(colSum - 1) > 0.001
  const payWarn = Math.abs(paySum - 1) > 0.001

  return (
    <div className="ac-root">
      <div className="ac-toolbar">
        <div>
          <h2 className="ac-title">Configuração de Premissas</h2>
          <p className="ac-subtitle">Ajuste os parâmetros do modelo e regenere a previsão de 90 dias</p>
        </div>
        <div className="ac-toolbar-btns">
          <button className="ac-btn-reset" onClick={handleReset}>Restaurar Padrões</button>
          <button
            className={`ac-btn-generate ${status === 'running' ? 'running' : ''}`}
            onClick={handleGenerate}
            disabled={status === 'running' || colWarn || payWarn}
          >
            {status === 'running' ? '⏳ Gerando…' : '▶ Regenerar Previsão'}
          </button>
        </div>
      </div>

      {(colWarn || payWarn) && (
        <div className="ac-warn-banner">
          ⚠️ {colWarn && `Perfil de recebimentos soma ${(colSum*100).toFixed(1)}% (deve ser 100%).`}
          {colWarn && payWarn && ' '}
          {payWarn && `Perfil de pagamentos soma ${(paySum*100).toFixed(1)}% (deve ser 100%).`}
        </div>
      )}

      <div className="ac-grid">

        {/* ── Parâmetros Gerais ── */}
        <Section title="Parâmetros Gerais" icon="⚙️">
          <div className="ac-row-3">
            <NumInput label="Saldo de Abertura (R$)" value={cfg.opening_balance} step={1000000}
              onChange={v => set('opening_balance', v)}
              hint="Saldo inicial em reais" />
            <NumInput label="Peso do Orçamento" value={cfg.budget_weight} pct step={0.01}
              min={0} max={1} onChange={v => set('budget_weight', v)}
              hint="% mistura Orc vs projeção" />
            <NumInput label="Folha como % Despesa" value={cfg.payroll_fraction} pct step={0.01}
              min={0} max={1} onChange={v => set('payroll_fraction', v)}
              hint="Fração da Despesa alocada à folha" />
          </div>
          <div className="ac-row-3" style={{marginTop:'0.75rem'}}>
            <NumInput label="Piso Despesa (% receita)" value={cfg.despesa_floor_pct} pct step={0.01}
              min={0} max={0.5} onChange={v => set('despesa_floor_pct', v)}
              hint="Benchmark ~17% para FMCG Brasil" />
            <NumInput label="Piso Comissão (% receita)" value={cfg.comissao_floor_pct} pct step={0.001}
              min={0} max={0.1} onChange={v => set('comissao_floor_pct', v)}
              hint="Benchmark ~0.8% para FMCG Brasil" />
          </div>
        </Section>

        {/* ── Perfil de Recebimentos ── */}
        <Section title="Perfil de Recebimentos" icon="📥">
          <p className="ac-desc">Como a receita accrual vira caixa recebido ao longo do tempo</p>
          <div className="ac-profile-grid">
            <div className="ac-profile-card">
              <div className="ac-profile-title">💳 Pix / Débito / Dinheiro (D0)</div>
              <NumInput label="% da receita" value={cfg.collection.pix_cash_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('collection.pix_cash_pct', v)} />
            </div>
            <div className="ac-profile-card">
              <div className="ac-profile-title">🏦 Cartão de Crédito</div>
              <NumInput label="% da receita" value={cfg.collection.card_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('collection.card_pct', v)} />
              <div className="ac-day-range">
                <NumInput label="Dia mín" value={cfg.collection.card_days_min} step={1} min={1}
                  onChange={v => set('collection.card_days_min', v)} />
                <NumInput label="Dia máx" value={cfg.collection.card_days_max} step={1} min={1}
                  onChange={v => set('collection.card_days_max', v)} />
              </div>
            </div>
            <div className="ac-profile-card">
              <div className="ac-profile-title">🏢 B2B / Atacado (prazo)</div>
              <NumInput label="% da receita" value={cfg.collection.b2b_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('collection.b2b_pct', v)} />
              <div className="ac-day-range">
                <NumInput label="Dia mín" value={cfg.collection.b2b_days_min} step={1} min={1}
                  onChange={v => set('collection.b2b_days_min', v)} />
                <NumInput label="Dia máx" value={cfg.collection.b2b_days_max} step={1} min={1}
                  onChange={v => set('collection.b2b_days_max', v)} />
              </div>
            </div>
          </div>
          <div className={`ac-sum-bar ${colWarn ? 'warn' : 'ok'}`}>
            Total: {(colSum * 100).toFixed(1)}% {colWarn ? '⚠️ deve ser 100%' : '✅'}
          </div>
        </Section>

        {/* ── Perfil de Pagamentos ── */}
        <Section title="Perfil de Pagamentos a Fornecedores" icon="📤">
          <p className="ac-desc">Como o CMV accrual vira desembolso para fornecedores</p>
          <div className="ac-profile-grid">
            <div className="ac-profile-card">
              <div className="ac-profile-title">🥩 Perecíveis (D+1 a D+3)</div>
              <NumInput label="% do CMV" value={cfg.payment.pereciveis_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('payment.pereciveis_pct', v)} />
              <div className="ac-day-range">
                <NumInput label="Dia mín" value={cfg.payment.pereciveis_days_min} step={1} min={1}
                  onChange={v => set('payment.pereciveis_days_min', v)} />
                <NumInput label="Dia máx" value={cfg.payment.pereciveis_days_max} step={1} min={1}
                  onChange={v => set('payment.pereciveis_days_max', v)} />
              </div>
            </div>
            <div className="ac-profile-card">
              <div className="ac-profile-title">⛽ Combustível (D+7 a D+14)</div>
              <NumInput label="% do CMV" value={cfg.payment.combustivel_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('payment.combustivel_pct', v)} />
              <div className="ac-day-range">
                <NumInput label="Dia mín" value={cfg.payment.combustivel_days_min} step={1} min={1}
                  onChange={v => set('payment.combustivel_days_min', v)} />
                <NumInput label="Dia máx" value={cfg.payment.combustivel_days_max} step={1} min={1}
                  onChange={v => set('payment.combustivel_days_max', v)} />
              </div>
            </div>
            <div className="ac-profile-card">
              <div className="ac-profile-title">🛒 Mercearia / Seco (D+30 a D+45)</div>
              <NumInput label="% do CMV" value={cfg.payment.mercearia_pct} pct step={0.01}
                min={0} max={1} onChange={v => set('payment.mercearia_pct', v)} />
              <div className="ac-day-range">
                <NumInput label="Dia mín" value={cfg.payment.mercearia_days_min} step={1} min={1}
                  onChange={v => set('payment.mercearia_days_min', v)} />
                <NumInput label="Dia máx" value={cfg.payment.mercearia_days_max} step={1} min={1}
                  onChange={v => set('payment.mercearia_days_max', v)} />
              </div>
            </div>
          </div>
          <div className={`ac-sum-bar ${payWarn ? 'warn' : 'ok'}`}>
            Total: {(paySum * 100).toFixed(1)}% {payWarn ? '⚠️ deve ser 100%' : '✅'}
          </div>
        </Section>

        {/* ── Taxas de Crescimento ── */}
        <Section title="Taxas de Crescimento Anual" icon="📈" defaultOpen={false}>
          <p className="ac-desc">Crescimento nominal anual por conta (inclui inflação ~4% IPCA)</p>
          <div className="ac-row-3">
            {ACCOUNTS.map(acc => (
              <NumInput key={acc} label={acc} value={cfg.growth_rates[acc] ?? 0.08} pct
                step={0.005} min={-0.2} max={0.5}
                onChange={v => set(`growth_rates.${acc}`, v)} />
            ))}
          </div>
        </Section>

        {/* ── Sazonalidade Mensal ── */}
        <Section title="Sazonalidade Mensal" icon="📅" defaultOpen={false}>
          <p className="ac-desc">Fator relativo à média anual (1.0 = mês médio)</p>
          <div className="ac-sliders">
            {MONTH_NAMES.map((name, i) => (
              <SliderRow key={i} label={name}
                value={parseFloat(cfg.month_factors[String(i + 1)] ?? 1)}
                onChange={v => set(`month_factors.${i + 1}`, v)}
                min={0.5} max={1.8} />
            ))}
          </div>
        </Section>

        {/* ── Distribuição Semanal ── */}
        <Section title="Distribuição por Dia da Semana" icon="📆" defaultOpen={false}>
          <p className="ac-desc">Peso relativo de vendas por dia (1.0 = dia médio)</p>
          <div className="ac-sliders">
            {DOW_NAMES.map((name, i) => (
              <SliderRow key={i} label={name}
                value={parseFloat(cfg.dow_factors[String(i)] ?? 1)}
                onChange={v => set(`dow_factors.${i}`, v)}
                min={0.4} max={2.0} />
            ))}
          </div>
          <p className="ac-desc" style={{marginTop:'1.25rem'}}>Peso por semana do mês</p>
          <div className="ac-sliders">
            {[1,2,3,4,5].map(w => (
              <SliderRow key={w} label={`Semana ${w}`}
                value={parseFloat(cfg.week_factors[String(w)] ?? 1)}
                onChange={v => set(`week_factors.${w}`, v)}
                min={0.6} max={1.4} />
            ))}
          </div>
        </Section>

      </div>

      {/* ── Log / output ── */}
      {log && (
        <div className={`ac-log ${status === 'error' ? 'error' : status === 'ok' ? 'ok' : ''}`}>
          <div className="ac-log-hdr">
            {status === 'ok' && '✅ Previsão gerada com sucesso'}
            {status === 'error' && '❌ Erro na geração'}
          </div>
          <pre className="ac-log-body">{log}</pre>
          {status === 'ok' && (
            <button className="ac-btn-view" onClick={() => onGenerated?.()}>
              Ver Fluxo de Caixa →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
