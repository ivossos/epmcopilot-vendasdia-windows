# Dashboard Vendas — Supermercados Savegnago

Dashboard de vendas com dados do EPBCS VendaDia.

## Como usar

1. **Atualizar dados** (opcional):
   ```bash
   python scripts/fetch_dashboard_data.py
   ```

2. **Abrir o dashboard**:
   ```bash
   cd dashboard && python -m http.server 8080
   ```
   Depois acesse: http://localhost:8080

   Ou abra `index.html` diretamente no navegador (pode usar dados de exemplo se o fetch falhar).
