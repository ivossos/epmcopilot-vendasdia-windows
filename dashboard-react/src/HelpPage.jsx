export default function HelpPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem', color: '#1e293b', fontFamily: 'inherit' }}>

      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Algoritmo de Projeção — Fluxo de Caixa 90 dias
      </h2>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Explicação completa do modelo preditivo usado para gerar o rolling forecast.
      </p>

      {/* Camada 1 */}
      <Section title="1. Projeção Mensal" icon="📅">
        <p>Para cada conta do EPBCS (<em>Total Venda, Custo Bruto, Impostos, Despesa…</em>), o modelo calcula um valor mensal em três situações:</p>

        <SubSection label="Mês passado">
          Usa o valor real do EPBCS diretamente. Se estiver zerado, aplica o run-rate dos 3 meses anteriores como fallback.
        </SubSection>

        <SubSection label="Mês atual">
          Blend entre o ritmo observado até hoje e a projeção run-rate:
          <Code>valor = pace_atual × 0,60 + projeção_run_rate × 0,40</Code>
          onde <code>pace_atual = accrual_realizado ÷ % do mês decorrido</code>.
          Se menos de 5% do mês passou, usa só o run-rate.
        </SubSection>

        <SubSection label="Mês futuro">
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 2 }}>
            <li><strong>Run-rate:</strong> WMA de 3 meses (pesos 3-2-1, mais recente pesa mais)</li>
            <li><strong>Crescimento:</strong> composto mensal da taxa anual por conta (veja tabela abaixo)</li>
            <li><strong>Sazonalidade:</strong> multiplica pelo fator do mês (Dez = 1,40; Fev = 0,87…)</li>
            <li><strong>Blend orçamento:</strong> mistura o valor do EPBCS conforme o Peso do Orçamento configurado</li>
          </ol>
          <Code>{`run_rate  = WMA(mês-1×3, mês-2×2, mês-3×1) / 6\nprojeção  = run_rate × (1 + taxa)^meses × fator_mensal\nfinal     = projeção × (1 − peso_orc) + orçamento × peso_orc`}</Code>
        </SubSection>

        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Conta</Th><Th>Taxa anual</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Total Venda', '8,5%'],
              ['Custo Bruto / Líquido', '7,5%'],
              ['Impostos Venda', '8,5%'],
              ['Comissão', '6,5%'],
              ['Promoção de Venda', '10,0%'],
              ['Despesa', '5,5%'],
              ['Verba PDV', '8,0%'],
              ['Lucratividade Total', '12,0%'],
            ].map(([c, t]) => (
              <tr key={c}>
                <Td>{c}</Td><Td>{t}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Camada 2 */}
      <Section title="2. Distribuição Diária" icon="📆">
        <p>O total mensal é distribuído entre os dias usando dois fatores multiplicativos:</p>
        <Code>{`peso_dia   = fator_dia_semana × fator_semana_do_mês\nvalor_dia  = valor_mensal × peso_dia / Σ(todos os pesos do mês)`}</Code>
        <p style={{ marginTop: '1rem' }}>A soma sempre preserva o total mensal.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <table style={tableStyle}>
            <thead><tr><Th>Dia da semana</Th><Th>Fator</Th></tr></thead>
            <tbody>
              {[['Segunda', '0,84'],['Terça', '0,87'],['Quarta', '0,91'],['Quinta', '0,95'],['Sexta', '1,07'],['Sábado', '1,30'],['Domingo', '1,06']].map(([d, f]) => (
                <tr key={d}><Td>{d}</Td><Td>{f}</Td></tr>
              ))}
            </tbody>
          </table>
          <table style={tableStyle}>
            <thead><tr><Th>Semana do mês</Th><Th>Fator</Th></tr></thead>
            <tbody>
              {[['1ª semana', '0,93'],['2ª semana', '1,00'],['3ª semana', '1,02'],['4ª semana', '1,05'],['5ª semana', '1,08']].map(([s, f]) => (
                <tr key={s}><Td>{s}</Td><Td>{f}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Camada 3 */}
      <Section title="3. Conversão Accrual → Caixa (timing operacional)" icon="💸">
        <p>Cada conta tem uma defasagem diferente entre o evento contábil e o impacto no caixa:</p>

        <table style={{ ...tableStyle, marginTop: '1rem' }}>
          <thead>
            <tr><Th>Fluxo</Th><Th>Timing</Th><Th>% do total</Th></tr>
          </thead>
          <tbody>
            {[
              ['Recebimento Pix / débito / dinheiro', 'D+0', '60%'],
              ['Recebimento cartão crédito', 'D+1 a D+30 (uniforme)', '30%'],
              ['Recebimento B2B / atacado', 'D+31 a D+60 (uniforme)', '10%'],
              ['Fornecedor perecíveis', 'D+1 a D+3', '30% do COGS'],
              ['Fornecedor combustível', 'D+7 a D+14', '20% do COGS'],
              ['Fornecedor mercearia', 'D+30 a D+45', '50% do COGS'],
              ['Impostos', 'Dia 10 do mês seguinte', '100% do mês'],
              ['Folha de pagamento (40%)', 'Dia 5 do mês', '40% × Despesa × Fração Folha'],
              ['Folha de pagamento (60%)', 'Último dia do mês', '60% × Despesa × Fração Folha'],
              ['Comissões', 'D+0', '100%'],
              ['Verba PDV', 'D+30', '100%'],
            ].map(([f, t, p]) => (
              <tr key={f}><Td>{f}</Td><Td>{t}</Td><Td>{p}</Td></tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
          <strong>Nota:</strong> "Promoção de Venda" é uma sub-conta de <em>receita</em> no EPM brasileiro (mix analysis) — o caixa já está capturado em Total Venda, não gera saída adicional.
        </p>
      </Section>

      {/* Camada 4 */}
      <Section title="4. Qualidade de Dados (Floor Estimates)" icon="🛡️">
        <p>Se uma conta estiver ausente ou muito baixa no EPBCS, o modelo aplica benchmarks do setor FMCG Brasil:</p>
        <table style={{ ...tableStyle, marginTop: '1rem' }}>
          <thead><tr><Th>Conta</Th><Th>Condição de ativação</Th><Th>Estimativa aplicada</Th></tr></thead>
          <tbody>
            <tr><Td>Despesa</Td><Td>Accrual {'<'} 3% da receita</Td><Td>17% da receita (benchmark FMCG)</Td></tr>
            <tr><Td>Comissão</Td><Td>Accrual {'<'} 0,1% da receita</Td><Td>0,8% da receita (benchmark FMCG)</Td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
          O dashboard indica os meses onde estimativas foram aplicadas na seção de qualidade de dados do JSON gerado.
        </p>
      </Section>

      {/* Saída */}
      <Section title="5. Saldo e Intervalo de Confiança" icon="📊">
        <p>Para cada um dos 90 dias:</p>
        <Code>{`net_dia       = inflow_dia − outflow_dia\nsaldo_caixa   = saldo_abertura + Σ(net_dia[D0..Dn])`}</Code>
        <p style={{ marginTop: '0.75rem' }}>O intervalo de confiança cresce linearmente com o horizonte:</p>
        <Code>{`conf = 5% (D+1)  →  20% (D+90)\nband_low  = saldo × (1 − conf)\nband_high = saldo × (1 + conf)`}</Code>
      </Section>

      {/* Parâmetros configuráveis */}
      <Section title="Parâmetros Configuráveis (aba Premissas)" icon="⚙️">
        <ul style={{ paddingLeft: '1.25rem', lineHeight: 2 }}>
          <li><strong>Saldo de Abertura</strong> — posição inicial de caixa em R$</li>
          <li><strong>Peso do Orçamento</strong> — % de influência do orçamento EPBCS na projeção (0% = só run-rate, 100% = só orçamento)</li>
          <li><strong>Folha como % Despesa</strong> — fração da Despesa alocada à folha de pagamento</li>
          <li><strong>Piso Despesa / Comissão</strong> — benchmarks de fallback quando EPBCS não tem dados</li>
          <li><strong>Perfil de Recebimentos</strong> — proporções e prazos Pix / cartão / B2B</li>
          <li><strong>Perfil de Pagamentos</strong> — prazos por categoria de fornecedor</li>
          <li><strong>Fatores de sazonalidade</strong> — dia da semana, semana do mês, mês do ano</li>
          <li><strong>Taxas de crescimento</strong> — por conta do EPBCS</li>
        </ul>
      </Section>

    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: '2rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  )
}

function SubSection({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 600, color: '#c41e3a', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ color: '#334155', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function Code({ children }) {
  return (
    <pre style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
      padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#1e293b',
      overflowX: 'auto', marginTop: '0.5rem', fontFamily: 'monospace',
    }}>
      {children}
    </pre>
  )
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', background: '#f1f5f9', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{children}</th>
}

function Td({ children }) {
  return <td style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>{children}</td>
}
