# EPM Copilot VendasDia — Windows Setup

This is the Windows-adapted version of the epmcopilot-vendasdia app. All scripts use cross-platform paths and Python invocation.

## Prerequisites

- **Python 3.10+** — Install from [python.org](https://www.python.org/downloads/) or Microsoft Store. Ensure "Add Python to PATH" is checked.
- **Node.js 18+** (optional) — For the React dashboard (`dashboard-react/`).

## Quick Start

### 1. Create virtual environment

```cmd
cd epmcopilot-vendasdia-windows
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run scripts

All scripts use `python` (not `python3`). Run from the project root:

```cmd
python scripts\build_dashboard.py
python scripts\generate_cash_flow_forecast.py
python scripts\fetch_dashboard_data.py
```

### 3. MCP Server (Claude Desktop / Cursor)

In `claude_desktop_config.json` or Cursor MCP settings, use `python` on Windows:

```json
{
  "mcpServers": {
    "epbcs-vendas": {
      "command": "python",
      "args": ["C:\\path\\to\\epmcopilot-vendasdia-windows\\epbcs_vendas_mcp.py"],
      "env": {
        "EPBCS_VENDAS_URL": "https://your-instance.epm.sa-vinhedo-1.ocs.oraclecloud.com",
        "EPBCS_VENDAS_USER": "your_user",
        "EPBCS_VENDAS_PASS": "your_password"
      }
    }
  }
}
```

Use forward slashes or escaped backslashes in the path. Example: `C:/Users/YourName/epmcopilot-vendasdia-windows/epbcs_vendas_mcp.py`

## Windows-Specific Adaptations

| Change | Reason |
|-------|--------|
| `sys.executable` instead of `python3` | Windows often uses `python`; `sys.executable` uses the active interpreter |
| Project root via `os.getcwd()` fallback | No `/sessions/*/mnt/` mount on Windows |
| `python` in config | Windows installer typically registers `python`, not `python3` |

## React Dashboard

```cmd
cd dashboard-react
npm install
npm run dev
```

## Troubleshooting

- **"python is not recognized"** — Reinstall Python with "Add to PATH" or use the full path, e.g. `C:\Python311\python.exe`
- **Path errors** — Use `os.path.join()` (already used throughout) or forward slashes in config
- **MCP fails to start** — Ensure the `args` path points to the correct `epbcs_vendas_mcp.py` and that the venv is activated if using a project venv
