#!/usr/bin/env python3
"""
EPBCS Vendas MCP Server
=======================
Servidor MCP para Oracle EPBCS (Savegnago/Vendas).

Corrige o bug do epbcs-vendas SDK:
- exportFileName NUNCA é incluído no body (campo não reconhecido neste ambiente)
- Dados retornam inline, sem exportação para arquivo
- Todas as 17 dimensões obrigatórias do plano VendaDia são validadas
- Plan type correto: VendaDia (não Vendadia)

Configuração (variáveis de ambiente):
    EPBCS_VENDAS_URL   URL base, ex: https://savegnago-test-gruposavegnago.epm.sa-vinhedo-1.ocs.oraclecloud.com
    EPBCS_VENDAS_USER  Usuário, ex: demoadmin
    EPBCS_VENDAS_PASS  Senha

Instalação no Claude Desktop (claude_desktop_config.json):
    {
      "mcpServers": {
        "epbcs-vendas-fixed": {
          "command": "python",
          "args": ["C:/caminho/para/epbcs_vendas_mcp.py"],
          "env": {
            "EPBCS_VENDAS_URL": "https://savegnago-test-gruposavegnago.epm.sa-vinhedo-1.ocs.oraclecloud.com",
            "EPBCS_VENDAS_USER": "seu_usuario",
            "EPBCS_VENDAS_PASS": "sua_senha"
          }
        }
      }
    }
"""

import os
import sys
import json
import base64
import sqlite3 as _sqlite3
from typing import Optional, Dict, List, Any

import httpx
from mcp.server.fastmcp import FastMCP

# ──────────────────────────────────────────────
# Configuração
# ──────────────────────────────────────────────

BASE_URL  = os.environ.get("EPBCS_VENDAS_URL",  "https://savegnago-test-gruposavegnago.epm.sa-vinhedo-1.ocs.oraclecloud.com")
APP_NAME  = "Vendas"
API_V3    = f"{BASE_URL}/HyperionPlanning/rest/v3/applications/{APP_NAME}"
API_AIF   = f"{BASE_URL}/aif/rest/V1"
USER      = os.environ.get("EPBCS_VENDAS_USER", "")
PASSWD    = os.environ.get("EPBCS_VENDAS_PASS", "")

# Local metadata DB (data/epbcs_vendas_metadata.db, relative to this script)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH     = os.path.join(_SCRIPT_DIR, "data", "epbcs_vendas_metadata.db")

# Plan types disponíveis nesta aplicação
PLAN_TYPES = ["VendaDia", "Diario"]

# Dimensões obrigatórias para VendaDia (excluindo Att Parte — inválida neste ambiente)
REQUIRED_DIMS_VENDADIA = [
    "Conta", "Cenario", "Versao", "Ano", "Periodo",
    "Filial", "Tipo de Valor", "Setor", "Canal",
    "Comprador", "Fornecedor", "Negocio", "Produto",
    "CGO", "Centro de Resultado", "Dia", "Modalidade",
]

mcp = FastMCP("epbcs_vendas_mcp")


# ──────────────────────────────────────────────
# Cliente HTTP
# ──────────────────────────────────────────────

def _auth_header() -> Dict[str, str]:
    token = base64.b64encode(f"{USER}:{PASSWD}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _handle_response(resp: httpx.Response) -> Dict:
    if resp.status_code == 200:
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}
    else:
        raise ValueError(
            f"HTTP {resp.status_code}: {resp.text[:400]}"
        )


# ──────────────────────────────────────────────
# Formatação de resultados
# ──────────────────────────────────────────────

def _format_data_slice(result: Dict, plan_type: str, members_filter: Dict) -> str:
    """Formata o resultado do exportdataslice como tabela markdown.

    A resposta da API tem o formato:
    {
      "pov": ["Real", "Oficial", ...],
      "columns": [["Jan", "Feb", "Mar"]],
      "rows": [
        {"headers": ["Total Venda"], "data": ["1000", "2000", "3000"]},
        {"headers": ["Qtd Venda"],   "data": ["10",   "20",   "30"]}
      ]
    }
    """
    pov_members   = result.get("pov", [])
    col_headers   = result.get("columns", [])
    row_data      = result.get("rows", [])

    lines = []
    lines.append(f"## Export Data Slice — {plan_type}")
    lines.append(f"**POV:** {', '.join(str(m) for m in pov_members)}")
    lines.append("")

    # Colunas: vêm como [["Jan", "Feb", "Mar"]] → achatar
    if col_headers and isinstance(col_headers[0], list):
        flat_cols = [str(c) for c in col_headers[0]]
    elif col_headers:
        flat_cols = [str(c) for c in col_headers]
    else:
        flat_cols = []

    if not row_data:
        lines.append("> ⚠️  Nenhum dado retornado (cells MISSING ou período sem carga).")
        lines.append("")
        lines.append(f"**Colunas esperadas:** {', '.join(flat_cols) if flat_cols else 'N/A'}")
        return "\n".join(lines)

    # Tabela
    header = "| KPI | " + " | ".join(flat_cols) + " |"
    sep    = "|-----|" + "|".join(["------"] * len(flat_cols)) + "|"
    lines.append(header)
    lines.append(sep)

    for row in row_data:
        if isinstance(row, dict):
            # Formato novo: {"headers": ["KPI"], "data": ["v1", "v2"]}
            kpi_label = row.get("headers", ["?"])[0]
            values    = [str(v) if v not in (None, "") else "#MISSING" for v in row.get("data", [])]
        elif isinstance(row, list):
            # Formato legado: lista plana
            kpi_label = "?"
            values    = [str(v) if v is not None else "#MISSING" for v in row]
        else:
            kpi_label = str(row)
            values    = []
        lines.append(f"| {kpi_label} | " + " | ".join(values) + " |")

    return "\n".join(lines)


# ──────────────────────────────────────────────
# Regras conhecidas — conveniência
# ──────────────────────────────────────────────

# Runtime prompts mapeados de regras conhecidas neste ambiente
KNOWN_RULES: Dict[str, Dict] = {
    "00.020 - Copia Cenario e Versao": {
        "jobType": "RULES",
        "prompts": ["Ano", "Cenario_Origem", "Versao_Origem", "Cenario_Destino", "Versao_Destino"],
        "description": "Copia dados de um Cenário/Versão para outro. Ano: FY26. Cenarios: Real, Orc. Versoes: Oficial, Trabalho, Simulacao 1, Simulacao 2.",
    },
    "01.010 - Consolida Realizado": {
        "jobType": "RULES",
        "prompts": [],
        "description": "Consolida dados do realizado no cubo VendaDia.",
    },
    "02.999 - Consolida Integração Vendas": {
        "jobType": "RULES",
        "prompts": [],
        "description": "Consolida integração de vendas.",
    },
    "02.006 - Configurar Base Historica": {
        "jobType": "RULESET",
        "prompts": [],
        "description": "Configura base histórica (rule set).",
    },
    "02.095 - Prepara valores para calculos de Provisao": {
        "jobType": "RULES",
        "prompts": [],
        "description": "Prepara valores para cálculos de provisão.",
    },
    "02.096 - Calcula Provisao Perda - JDR": {
        "jobType": "RULES",
        "prompts": [],
        "description": "Calcula provisão de perda JDR.",
    },
    "02.097 - Difusao Provisao Perda - JDR": {
        "jobType": "RULES",
        "prompts": [],
        "description": "Difusão provisão de perda JDR.",
    },
}


@mcp.tool(
    name="vendas_list_known_rules",
    description=(
        "Lista todas as regras de negócio conhecidas neste ambiente EPBCS Vendas, "
        "com seus runtime prompts obrigatórios e descrições. "
        "Use antes de vendas_run_business_rule para obter o nome exato e os parâmetros necessários."
    ),
)
async def vendas_list_known_rules() -> str:
    lines = ["| Regra | Tipo | Prompts obrigatórios | Descrição |", "|---|---|---|---|"]
    for name, info in KNOWN_RULES.items():
        prompts = ", ".join(f"`{p}`" for p in info["prompts"]) or "—"
        lines.append(f"| `{name}` | {info['jobType']} | {prompts} | {info['description']} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_copy_scenario_version",
    description=(
        "Executa a regra '00.020 - Copia Cenario e Versao' no EPBCS Vendas. "
        "Copia todos os dados de um Cenário/Versão de origem para um Cenário/Versão de destino. "
        "Cenários válidos: Real, Orc. "
        "Versões válidas: Oficial, Trabalho, Simulacao 1, Simulacao 2. "
        "Ano vigente: FY26. "
        "Retorna o job ID para acompanhamento via vendas_get_job_status."
    ),
)
async def vendas_copy_scenario_version(
    ano: str,
    cenario_origem: str,
    versao_origem: str,
    cenario_destino: str,
    versao_destino: str,
) -> str:
    """
    Args:
        ano: Ano fiscal (ex: 'FY26').
        cenario_origem: Cenário de origem (ex: 'Real', 'Orc').
        versao_origem: Versão de origem (ex: 'Oficial', 'Trabalho').
        cenario_destino: Cenário de destino (ex: 'Real', 'Orc').
        versao_destino: Versão de destino (ex: 'Trabalho', 'Simulacao 1').
    """
    params = {
        "Ano": ano,
        "Cenario_Origem": cenario_origem,
        "Versao_Origem": versao_origem,
        "Cenario_Destino": cenario_destino,
        "Versao_Destino": versao_destino,
    }
    body = {
        "jobName": "00.020 - Copia Cenario e Versao",
        "jobType": "RULES",
        "parameters": params,
    }
    with httpx.Client(verify=True, timeout=120) as client:
        resp = client.post(f"{API_V3}/jobs", headers=_auth_header(), json=body)
    data = resp.json() or {}
    job_id  = data.get("jobId", -1)
    status  = data.get("descriptiveStatus") or ""
    details = (data.get("details") or "")[:200]

    if job_id != -1 and "missing" not in details.lower() and "not found" not in details.lower():
        return (
            f"✅ Cópia iniciada — Job ID: **{job_id}** | Status: {status}\n"
            f"**{cenario_origem}/{versao_origem}** → **{cenario_destino}/{versao_destino}** ({ano})\n"
            f"Use `vendas_get_job_status({job_id})` para acompanhar."
        )
    return f"❌ Erro: {details}"


# ──────────────────────────────────────────────
# Tools
# ──────────────────────────────────────────────

@mcp.tool(
    name="vendas_get_application",
    description="Retorna informações da aplicação EPBCS Vendas (nome, tipo, storage, URL).",
)
async def vendas_get_application() -> str:
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(API_V3, headers=_auth_header())
        data = _handle_response(resp)
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(
    name="vendas_list_substitution_variables",
    description="Lista variáveis de substituição da aplicação Vendas (ex: Mes_Realizado, Ano_Orc).",
)
async def vendas_list_substitution_variables(
    var_name: Optional[str] = None,
) -> str:
    """
    Args:
        var_name: Nome exato de uma variável específica (opcional).
    """
    url = f"{API_V3}/substitutionvariables"
    if var_name:
        url += f"/{var_name}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)

    # Formatar como tabela
    items = data if isinstance(data, list) else data.get("items", [data])
    lines = ["| Variável | Valor | Plano |", "|---|---|---|"]
    for v in items:
        lines.append(f"| `{v.get('name','')}` | `{v.get('value','')}` | {v.get('planType','ALL')} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_export_data_slice",
    description=(
        "Exporta dados do cubo VendaDia ou Diario via exportdataslice. "
        "IMPORTANTE: todas as 17 dimensões obrigatórias devem ser informadas "
        "(Conta, Cenario, Versao, Ano, Periodo, Filial, Tipo de Valor, Setor, "
        "Canal, Comprador, Fornecedor, Negocio, Produto, CGO, Centro de Resultado, "
        "Dia, Modalidade). NÃO incluir Att Parte. "
        "Ano vigente com dados: FY26. Retorna dados inline (sem exportação para arquivo)."
    ),
)
async def vendas_export_data_slice(
    plan_type: str,
    members_filter: Dict[str, List[str]],
) -> str:
    """
    Args:
        plan_type: 'VendaDia' ou 'Diario'.
        members_filter: Dicionário dimensão → lista de membros.
            Exemplo:
            {
              "Conta": ["Total Venda", "Qtd Venda"],
              "Cenario": ["Real"],
              "Versao": ["Oficial"],
              "Ano": ["FY26"],
              "Periodo": ["Jan", "Feb", "Mar"],
              "Filial": ["All BU"],
              "Tipo de Valor": ["Valor Original"],
              "Setor": ["Total Categoria"],
              "Canal": ["Total Canal"],
              "Comprador": ["Total Comprador"],
              "Fornecedor": ["Total Fornecedor"],
              "Negocio": ["Total Negocio"],
              "Produto": ["Total Produto"],
              "CGO": ["Total CGO"],
              "Centro de Resultado": ["Total Centro de Resultado"],
              "Dia": ["All Dia"],
              "Modalidade": ["Total Modalidade"]
            }
    """
    if plan_type not in PLAN_TYPES:
        return f"❌ Plan type inválido: '{plan_type}'. Use: {', '.join(PLAN_TYPES)}"

    # Validar dimensões obrigatórias
    if plan_type == "VendaDia":
        missing = [d for d in REQUIRED_DIMS_VENDADIA if d not in members_filter]
        if missing:
            return (
                f"❌ Dimensões obrigatórias ausentes: {missing}\n\n"
                f"Todas as 17 dimensões são obrigatórias para VendaDia:\n"
                f"{', '.join(REQUIRED_DIMS_VENDADIA)}"
            )

    # Construir pov, rows e columns a partir do members_filter
    # - "Conta" → rows (pode ter múltiplos membros = múltiplas linhas)
    # - "Periodo" → columns (pode ter múltiplos membros = múltiplas colunas)
    # - Demais → pov (dimensões fixas)
    conta_members   = members_filter.get("Conta", [])
    periodo_members = members_filter.get("Periodo", [])

    # ── FORMATO CORRETO: validado via testes diretos contra a API ──────
    #
    # gridDefinition.pov.members  → Object[][]   → lista de listas de 1 string cada
    # gridDefinition.rows         → List<GridSegment>  → lista de objetos {members: [[m]]}
    # gridDefinition.columns      → List<GridSegment>  → lista de objetos {members: [[m]]}
    #
    # NÃO incluir exportFileName — campo não reconhecido neste EPBCS.
    # NÃO usar array plano no pov (causa "Cannot deserialize GridSegment from Array value").
    # NÃO usar array de objetos {dimension, member} (causa "Cannot deserialize String from Object").

    pov_members_list = []
    for dim, members in members_filter.items():
        if dim in ("Conta", "Periodo"):
            continue
        pov_members_list.append([members[0] if members else ""])

    rows = [{"members": [[m]]} for m in conta_members]
    cols = [{"members": [[m]]} for m in periodo_members]

    body = {
        "gridDefinition": {
            "suppressMissingBlocks": False,
            "suppressMissingRows": False,
            "suppressMissingColumns": False,
            "pov": {
                "members": pov_members_list
            },
            "rows": rows,
            "columns": cols,
        }
    }
    # ───────────────────────────────────────────────────────────────────

    url = f"{API_V3}/plantypes/{plan_type}/exportdataslice"

    with httpx.Client(verify=True, timeout=120) as client:
        resp = client.post(url, headers=_auth_header(), json=body)
        data = _handle_response(resp)

    return _format_data_slice(data, plan_type, members_filter)


@mcp.tool(
    name="vendas_get_data_grid",
    description=(
        "Consulta dados via data grid ad-hoc (endpoint /form). "
        "Use pov para dimensões fixas, rows para linhas e columns para colunas. "
        "Plan types: VendaDia, Diario."
    ),
)
async def vendas_get_data_grid(
    plan_type: str,
    pov: List[Dict[str, str]],
    rows: List[List[Dict[str, str]]],
    columns: List[List[Dict[str, str]]],
) -> str:
    """
    Args:
        plan_type: 'VendaDia' ou 'Diario'.
        pov: Lista de {dimension, member} fixos.
        rows: Lista de listas de {dimension, member} para as linhas.
        columns: Lista de listas de {dimension, member} para as colunas.
    """
    if plan_type not in PLAN_TYPES:
        return f"❌ Plan type inválido: '{plan_type}'. Use: {', '.join(PLAN_TYPES)}"

    body = {
        "gridDefinition": {
            "pov": pov,
            "rows": rows,
            "columns": columns,
        }
    }

    url = f"{API_V3}/plantypes/{plan_type}/form"

    with httpx.Client(verify=True, timeout=120) as client:
        resp = client.post(url, headers=_auth_header(), json=body)
        data = _handle_response(resp)

    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(
    name="vendas_run_business_rule",
    description=(
        "Executa uma regra de negócio (business rule) na aplicação Vendas. "
        "Use jobType='RULES' para regra individual ou 'RULESET' para rule set."
    ),
)
async def vendas_run_business_rule(
    rule_name: str,
    job_type: str = "RULES",
    runtime_prompts: Optional[Dict[str, str]] = None,
) -> str:
    """
    Args:
        rule_name: Nome exato da regra (ex: '01.010 - Consolida Realizado').
        job_type: 'RULES' para regra individual, 'RULESET' para rule set (padrão: RULES).
        runtime_prompts: Parâmetros de runtime (ex: {"Scenario": "Real", "Year": "FY26"}).
    """
    if job_type not in ("RULES", "RULESET"):
        return "❌ job_type deve ser 'RULES' ou 'RULESET'."

    body: Dict[str, Any] = {"jobName": rule_name, "jobType": job_type}
    if runtime_prompts:
        body["parameters"] = runtime_prompts

    url = f"{API_V3}/jobs"
    with httpx.Client(verify=True, timeout=120) as client:
        resp = client.post(url, headers=_auth_header(), json=body)
        data = resp.json()

    job_id = data.get("jobId", "N/A")
    status = data.get("descriptiveStatus", data.get("status", "Submitted"))
    details = data.get("details", "")
    if resp.status_code in (200, 201) and job_id != -1:
        return f"✅ '{rule_name}' ({job_type}) iniciada. Job ID: {job_id} | Status: {status}"
    else:
        return f"❌ Erro ao executar '{rule_name}': {details}"


@mcp.tool(
    name="vendas_get_job_status",
    description="Verifica o status de um job (business rule, export, etc.) no EPBCS Vendas.",
)
async def vendas_get_job_status(job_id: int) -> str:
    """
    Args:
        job_id: ID numérico do job retornado por outras operações.
    """
    url = f"{API_V3}/jobs/{job_id}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
    if resp.status_code == 200:
        data = resp.json()
        job_name   = data.get("jobName", "")
        status     = data.get("descriptiveStatus", "")
        details    = data.get("details", "")
        return f"**Job {job_id}:** `{job_name}`\n**Status:** {status}\n**Detalhes:** {details}"
    return f"❌ HTTP {resp.status_code}: {resp.text[:300]}"


@mcp.tool(
    name="vendas_list_dimensions",
    description="Lista as dimensões e plan types disponíveis (retorna do banco de metadados local).",
)
async def vendas_list_dimensions() -> str:
    return (
        "## Dimensões — Aplicação Vendas\n\n"
        "**Plan types:** VendaDia, Diario\n\n"
        "| Dimensão | Membros-chave |\n"
        "|---|---|\n"
        "| Conta | Total Venda, Qtd Venda, Lucratividade Total, Custo Bruto Produto… |\n"
        "| Cenario | Real, Orcamento |\n"
        "| Versao | Oficial, Trabalho, Simulacao 1, Simulacao 2 |\n"
        "| Ano | FY24, FY25, FY26 |\n"
        "| Periodo | Jan…Dec, Q1…Q4, Y-T-D |\n"
        "| Filial | All BU + filiais individuais (1197 membros) |\n"
        "| Tipo de Valor | Valor Original, Valor Final, Total Loja… |\n"
        "| Setor | Total Categoria + setores |\n"
        "| Canal | Total Canal + canais |\n"
        "| Comprador | Total Comprador + compradores |\n"
        "| Fornecedor | Total Fornecedor + fornecedores |\n"
        "| Negocio | Total Negocio + negócios |\n"
        "| Produto | Total Produto + produtos |\n"
        "| CGO | Total CGO + CGOs |\n"
        "| Centro de Resultado | Total Centro de Resultado + centros |\n"
        "| Dia | All Dia (agrega todos os dias), dias individuais: 1…31 |\n"
        "| Modalidade | Total Modalidade + modalidades |\n"
        "\n"
        "> ⚠️ **Att Parte** retorna 'Invalid dimension name' neste ambiente — não usar.\n"
        "> 📅 Ano com dados carregados: **FY26** (Mes_Realizado = Jan)"
    )


# ──────────────────────────────────────────────
# Calculation Manager
# ──────────────────────────────────────────────

@mcp.tool(
    name="vendas_cm_list_rules",
    description=(
        "Descobre regras e rule sets disponíveis escaneando o histórico de jobs da aplicação Vendas. "
        "Retorna nomes únicos de jobs executados recentemente (regras, rule sets, exports, etc.). "
        "Use name_filter para filtrar pelo nome. "
        "scan_depth controla quantos IDs de job verificar (padrão 200)."
    ),
)
async def vendas_cm_list_rules(
    name_filter: Optional[str] = None,
    scan_depth: int = 200,
) -> str:
    """
    Args:
        name_filter: Texto para filtrar nomes de jobs (case-insensitive).
        scan_depth: Quantidade de IDs de job a verificar retroativamente (padrão: 200).
    """
    # Primeiro, descobrir o job ID mais recente via PLAN_TYPE_MAP (retorna 201 com jobId)
    with httpx.Client(verify=True, timeout=30) as client:
        r = client.post(f"{API_V3}/jobs", headers=_auth_header(), json={"jobType": "PLAN_TYPE_MAP"})
        latest_id = r.json().get("jobId", 15845) if r.status_code == 201 else 15845

    seen: Dict[str, str] = {}  # jobName → descriptiveStatus
    with httpx.Client(verify=True, timeout=60) as client:
        for jid in range(latest_id, max(latest_id - scan_depth, 0), -1):
            r = client.get(f"{API_V3}/jobs/{jid}", headers=_auth_header())
            if r.status_code == 200:
                data = r.json()
                jname  = data.get("jobName") or ""
                jstatus = data.get("descriptiveStatus") or ""
                if jname and jname not in seen:
                    seen[jname] = jstatus

    if name_filter:
        nf = name_filter.lower()
        seen = {k: v for k, v in seen.items() if nf in k.lower()}

    if not seen:
        return "Nenhum job encontrado no histórico."

    lines = ["| Nome do Job | Último Status |", "|---|---|"]
    for name, status in sorted(seen.items()):
        lines.append(f"| `{name}` | {status} |")
    return f"**{len(seen)} jobs únicos encontrados:**\n\n" + "\n".join(lines)


@mcp.tool(
    name="vendas_cm_get_rule",
    description=(
        "Verifica se uma regra existe pesquisando no histórico de jobs recentes. "
        "Não executa nada — apenas busca no histórico. "
        "Para executar uma regra, use vendas_run_business_rule."
    ),
)
async def vendas_cm_get_rule(rule_name: str) -> str:
    """
    Args:
        rule_name: Nome (ou parte do nome) da regra a buscar.
    """
    result = await vendas_cm_list_rules(name_filter=rule_name, scan_depth=300)
    return result


@mcp.tool(
    name="vendas_cm_list_rulesets",
    description=(
        "Lista rule sets conhecidos do histórico de jobs. "
        "Alias de vendas_cm_list_rules com filtro automático por padrão de nomenclatura. "
        "Usa scan do histórico de jobs (mesma estratégia de vendas_cm_list_rules)."
    ),
)
async def vendas_cm_list_rulesets(name_filter: Optional[str] = None) -> str:
    # Delegate to the history scanner — rule sets appear in job history like rules
    return await vendas_cm_list_rules(name_filter=name_filter, scan_depth=300)


@mcp.tool(
    name="vendas_cm_launch_ruleset",
    description=(
        "Executa um rule set do Calculation Manager na aplicação Vendas via POST /jobs. "
        "Retorna o job ID para acompanhamento via vendas_get_job_status."
    ),
)
async def vendas_cm_launch_ruleset(
    ruleset_name: str,
    runtime_prompts: Optional[Dict[str, str]] = None,
) -> str:
    """
    Args:
        ruleset_name: Nome exato do rule set.
        runtime_prompts: Parâmetros de runtime (ex: {"Scenario": "Real", "Year": "FY26"}).
    """
    return await vendas_run_business_rule(
        rule_name=ruleset_name,
        job_type="RULESET",
        runtime_prompts=runtime_prompts,
    )


@mcp.tool(
    name="vendas_cm_list_jobs",
    description=(
        "Lista jobs recentes da aplicação Vendas escaneando IDs consecutivos. "
        "Retorna nome, status e job ID de cada job encontrado. "
        "Filtre por status: 'Completed', 'Error', 'Running'. "
        "scan_depth controla quantos IDs verificar (padrão: 50)."
    ),
)
async def vendas_cm_list_jobs(
    status_filter: Optional[str] = None,
    scan_depth: int = 50,
) -> str:
    """
    Args:
        status_filter: Filtro de status — 'Completed', 'Error', 'Running' (case-insensitive).
        scan_depth: Quantidade de IDs de job a verificar retroativamente (padrão: 50).
    """
    # Obter o job ID mais recente
    with httpx.Client(verify=True, timeout=30) as client:
        r = client.post(f"{API_V3}/jobs", headers=_auth_header(), json={"jobType": "PLAN_TYPE_MAP"})
        latest_id = r.json().get("jobId", 15845) if r.status_code == 201 else 15845

    jobs = []
    sf = status_filter.lower() if status_filter else None
    with httpx.Client(verify=True, timeout=60) as client:
        for jid in range(latest_id, max(latest_id - scan_depth, 0), -1):
            r = client.get(f"{API_V3}/jobs/{jid}", headers=_auth_header())
            if r.status_code == 200:
                data   = r.json()
                jname  = data.get("jobName") or ""
                jstatus = data.get("descriptiveStatus") or ""
                jdetail = (data.get("details") or "")[:60]
                if not sf or sf in jstatus.lower():
                    jobs.append((jid, jname, jstatus, jdetail))

    if not jobs:
        return "Nenhum job encontrado."

    lines = ["| Job ID | Nome | Status | Detalhes |", "|---|---|---|---|"]
    for jid, jname, jstat, jdetail in jobs:
        lines.append(f"| {jid} | `{jname}` | {jstat} | {jdetail} |")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# Data Exchange (Data Integration / AIF)
# ──────────────────────────────────────────────

@mcp.tool(
    name="vendas_dx_list_integrations",
    description=(
        "Lista todas as integrações do Data Exchange (Data Integration) "
        "configuradas no ambiente EPBCS Vendas. "
        "Use name_filter para pesquisar pelo nome da integração."
    ),
)
async def vendas_dx_list_integrations(name_filter: Optional[str] = None) -> str:
    """
    Args:
        name_filter: Texto para filtrar integrações pelo nome (case-insensitive, parcial).
    """
    url = f"{API_AIF}/integrations"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)

    items = data if isinstance(data, list) else data.get("items", [data])
    if name_filter:
        nf = name_filter.lower()
        items = [i for i in items if nf in str(i.get("name", "")).lower()]

    if not items:
        return "Nenhuma integração encontrada."

    lines = ["| ID | Nome | Tipo | Localização | Categoria |", "|---|---|---|---|---|"]
    for i in items:
        iid      = i.get("id", i.get("integrationId", ""))
        name     = i.get("name", "")
        itype    = i.get("type", i.get("integrationType", ""))
        location = i.get("location", i.get("locationName", ""))
        category = i.get("category", "")
        lines.append(f"| {iid} | `{name}` | {itype} | {location} | {category} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_dx_get_integration",
    description=(
        "Retorna os detalhes completos de uma integração do Data Exchange: "
        "mapeamentos, localização, source/target, períodos e opções de carga."
    ),
)
async def vendas_dx_get_integration(integration_id: str) -> str:
    """
    Args:
        integration_id: ID ou nome da integração (use vendas_dx_list_integrations para obter).
    """
    url = f"{API_AIF}/integrations/{integration_id}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(
    name="vendas_dx_run_integration",
    description=(
        "Executa uma integração completa do Data Exchange (import → validate → export). "
        "importMode: REPLACE | APPEND | RECALCULATE | NONE. "
        "exportMode: STORE_DATA | ADD_DATA | SUBTRACT_DATA | REPLACE_DATA | NONE. "
        "Retorna job ID para acompanhamento via vendas_dx_get_job_status."
    ),
)
async def vendas_dx_run_integration(
    integration_id: str,
    start_period: str,
    end_period: str,
    import_mode: str = "REPLACE",
    export_mode: str = "STORE_DATA",
) -> str:
    """
    Args:
        integration_id: ID da integração.
        start_period: Período inicial (ex: 'Jan-26').
        end_period: Período final (ex: 'Jan-26').
        import_mode: REPLACE, APPEND, RECALCULATE ou NONE.
        export_mode: STORE_DATA, ADD_DATA, SUBTRACT_DATA, REPLACE_DATA ou NONE.
    """
    valid_import = {"REPLACE", "APPEND", "RECALCULATE", "NONE"}
    valid_export = {"STORE_DATA", "ADD_DATA", "SUBTRACT_DATA", "REPLACE_DATA", "NONE"}
    if import_mode not in valid_import:
        return f"❌ importMode inválido: '{import_mode}'. Use: {', '.join(sorted(valid_import))}"
    if export_mode not in valid_export:
        return f"❌ exportMode inválido: '{export_mode}'. Use: {', '.join(sorted(valid_export))}"

    body = {
        "startPeriod":  start_period,
        "endPeriod":    end_period,
        "importMode":   import_mode,
        "exportMode":   export_mode,
    }
    url = f"{API_AIF}/integrations/{integration_id}/run"
    with httpx.Client(verify=True, timeout=120) as client:
        resp = client.post(url, headers=_auth_header(), json=body)
        data = _handle_response(resp)

    job_id = data.get("jobId") or data.get("id", "N/A")
    status = data.get("status", "Submitted")
    return (
        f"✅ Integração '{integration_id}' iniciada.\n"
        f"Job ID: {job_id} | Status: {status}\n"
        f"Período: {start_period} → {end_period} | Import: {import_mode} | Export: {export_mode}"
    )


@mcp.tool(
    name="vendas_dx_get_job_status",
    description=(
        "Verifica o status de um job do Data Exchange (Data Integration). "
        "Diferente de vendas_get_job_status que monitora jobs do Planning/Calc Manager."
    ),
)
async def vendas_dx_get_job_status(job_id: int) -> str:
    """
    Args:
        job_id: ID numérico do job retornado por vendas_dx_run_integration.
    """
    url = f"{API_AIF}/jobs/{job_id}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(
    name="vendas_dx_list_jobs",
    description=(
        "Lista os jobs recentes do Data Exchange. "
        "Filtre por status: 'RUNNING', 'SUCCESS', 'FAILED', 'WARNING'."
    ),
)
async def vendas_dx_list_jobs(
    status_filter: Optional[str] = None,
    limit: int = 20,
) -> str:
    """
    Args:
        status_filter: 'RUNNING', 'SUCCESS', 'FAILED' ou 'WARNING'.
        limit: Número máximo de jobs (padrão: 20).
    """
    url = f"{API_AIF}/jobs?limit={limit}"
    if status_filter:
        url += f"&status={status_filter}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)

    items = data if isinstance(data, list) else data.get("items", [data])
    if not items:
        return "Nenhum job encontrado."

    lines = ["| Job ID | Integração | Status | Período | Início | Fim |", "|---|---|---|---|---|---|"]
    for j in items:
        jid    = j.get("jobId", j.get("id", ""))
        jname  = j.get("integrationName", j.get("name", ""))
        jstat  = j.get("status", "")
        jper   = j.get("period", j.get("startPeriod", ""))
        jstart = j.get("startTime", j.get("createdTime", ""))
        jend   = j.get("endTime", j.get("completedTime", ""))
        lines.append(f"| {jid} | `{jname}` | {jstat} | {jper} | {jstart} | {jend} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_dx_list_locations",
    description=(
        "Lista as localizações (locations) configuradas no Data Exchange. "
        "Locations definem a fonte de dados e mapeamento de dimensões."
    ),
)
async def vendas_dx_list_locations(name_filter: Optional[str] = None) -> str:
    """
    Args:
        name_filter: Texto para filtrar pelo nome da localização.
    """
    url = f"{API_AIF}/locations"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)

    items = data if isinstance(data, list) else data.get("items", [data])
    if name_filter:
        nf = name_filter.lower()
        items = [i for i in items if nf in str(i.get("name", "")).lower()]

    if not items:
        return "Nenhuma localização encontrada."

    lines = ["| Nome | Aplicação | Plan Type | Categoria |", "|---|---|---|---|"]
    for loc in items:
        name  = loc.get("name", loc.get("locationName", ""))
        app   = loc.get("application", loc.get("targetApp", ""))
        ptype = loc.get("planType", loc.get("targetPlanType", ""))
        cat   = loc.get("category", loc.get("categoryName", ""))
        lines.append(f"| `{name}` | {app} | {ptype} | {cat} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_dx_list_period_mappings",
    description=(
        "Lista os mapeamentos de período do Data Exchange "
        "(ex: como 'Jan-26' mapeia para o período do cubo)."
    ),
)
async def vendas_dx_list_period_mappings(
    period_type: Optional[str] = None,
) -> str:
    """
    Args:
        period_type: Tipo de mapeamento a filtrar (ex: 'Standard', 'Custom').
    """
    url = f"{API_AIF}/periodMappings"
    if period_type:
        url += f"?periodType={period_type}"
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(url, headers=_auth_header())
        data = _handle_response(resp)

    items = data if isinstance(data, list) else data.get("items", [data])
    if not items:
        return "Nenhum mapeamento de período encontrado."

    lines = ["| Período DX | Período Alvo | Ano | Tipo |", "|---|---|---|---|"]
    for p in items:
        src   = p.get("periodName", p.get("name", ""))
        tgt   = p.get("targetPeriodName", p.get("targetPeriod", ""))
        year  = p.get("year", "")
        ptype = p.get("periodType", p.get("type", ""))
        lines.append(f"| `{src}` | {tgt} | {year} | {ptype} |")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# Metadata local (SQLite — sem chamada à API)
# ──────────────────────────────────────────────

def _db() -> _sqlite3.Connection:
    """Abre conexão read-only com o banco de metadados local."""
    con = _sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = _sqlite3.Row
    return con


def _dim_table(dimension: str) -> Optional[str]:
    """Resolve nome da dimensão → table_name via tabela dimensions."""
    with _db() as con:
        row = con.execute(
            "SELECT table_name FROM dimensions WHERE lower(display_name)=lower(?) OR lower(name)=lower(?)",
            (dimension, dimension),
        ).fetchone()
    return row["table_name"] if row else None


def _first_col(table: str) -> str:
    """Retorna a primeira coluna de dados (após id) de uma dim_* table."""
    with _db() as con:
        cols = con.execute(f"PRAGMA table_info({table})").fetchall()
    # col index 1 is the member name column (id is index 0)
    return cols[1]["name"]


@mcp.tool(
    name="vendas_meta_list_dimensions",
    description=(
        "Lista todas as dimensões disponíveis no banco de metadados local "
        "com contagem de membros. Resposta instantânea — sem chamada à API."
    ),
)
async def vendas_meta_list_dimensions() -> str:
    with _db() as con:
        rows = con.execute(
            "SELECT display_name, type, member_count, fetched_at FROM dimensions ORDER BY display_name"
        ).fetchall()
    lines = ["| Dimensão | Tipo | Membros | Atualizado em |", "|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['display_name']} | {r['type']} | {r['member_count']:,} | {r['fetched_at']} |")
    return "\n".join(lines)


@mcp.tool(
    name="vendas_meta_search_members",
    description=(
        "Pesquisa membros de uma dimensão no banco de metadados local pelo nome ou alias. "
        "Ideal para encontrar códigos de Filial, Produto, Fornecedor, Setor, etc. "
        "Resposta instantânea — sem chamada à API. "
        "Dimensões disponíveis: Ano, Canal, Cenario, Centro de Resultado, CGO, Comprador, "
        "Conta, Dia, Filial, Fornecedor, Modalidade, Negocio, Periodo, Produto, Setor, "
        "Tipo de Valor, Versao."
    ),
)
async def vendas_meta_search_members(
    dimension: str,
    search: str,
    limit: int = 50,
) -> str:
    """
    Args:
        dimension: Nome da dimensão (ex: 'Filial', 'Produto', 'Fornecedor').
        search: Texto a pesquisar no nome ou alias do membro.
        limit: Máximo de resultados (padrão: 50).
    """
    table = _dim_table(dimension)
    if not table:
        return f"❌ Dimensão '{dimension}' não encontrada no banco local."

    col = _first_col(table)
    pattern = f"%{search}%"

    with _db() as con:
        rows = con.execute(
            f"""
            SELECT {col} AS member, parent, alias__default AS alias
            FROM {table}
            WHERE {col} LIKE ? OR alias__default LIKE ?
            LIMIT ?
            """,
            (pattern, pattern, limit),
        ).fetchall()

    if not rows:
        return f"Nenhum membro encontrado em '{dimension}' para '{search}'."

    lines = [f"| Membro | Parent | Alias |", "|---|---|---|"]
    for r in rows:
        lines.append(f"| `{r['member']}` | {r['parent'] or ''} | {r['alias'] or ''} |")
    return f"**{dimension}** — {len(rows)} resultado(s) para `{search}`:\n\n" + "\n".join(lines)


@mcp.tool(
    name="vendas_meta_get_member",
    description=(
        "Retorna todos os atributos de um membro específico de uma dimensão "
        "(parent, alias, data storage, fórmula, plan types, aggregation, UDA, etc.) "
        "a partir do banco de metadados local."
    ),
)
async def vendas_meta_get_member(dimension: str, member_name: str) -> str:
    """
    Args:
        dimension: Nome da dimensão (ex: 'Conta', 'Filial').
        member_name: Nome exato do membro.
    """
    table = _dim_table(dimension)
    if not table:
        return f"❌ Dimensão '{dimension}' não encontrada no banco local."

    col = _first_col(table)
    with _db() as con:
        row = con.execute(
            f"SELECT * FROM {table} WHERE lower({col})=lower(?)",
            (member_name,),
        ).fetchone()

    if not row:
        return f"Membro '{member_name}' não encontrado em '{dimension}'."

    data = dict(row)
    data.pop("id", None)
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(
    name="vendas_meta_get_children",
    description=(
        "Retorna os filhos diretos de um membro na hierarquia de uma dimensão, "
        "a partir do banco de metadados local."
    ),
)
async def vendas_meta_get_children(dimension: str, member_name: str) -> str:
    """
    Args:
        dimension: Nome da dimensão (ex: 'Filial', 'Conta').
        member_name: Nome do membro pai.
    """
    table = _dim_table(dimension)
    if not table:
        return f"❌ Dimensão '{dimension}' não encontrada no banco local."

    col = _first_col(table)
    with _db() as con:
        rows = con.execute(
            f"""
            SELECT {col} AS member, alias__default AS alias, data_storage
            FROM {table}
            WHERE lower(parent)=lower(?)
            ORDER BY {col}
            """,
            (member_name,),
        ).fetchall()

    if not rows:
        return f"Nenhum filho encontrado para '{member_name}' em '{dimension}'."

    lines = ["| Membro | Alias | Data Storage |", "|---|---|---|"]
    for r in rows:
        lines.append(f"| `{r['member']}` | {r['alias'] or ''} | {r['data_storage'] or ''} |")
    return f"**{dimension}** — filhos de `{member_name}` ({len(rows)}):\n\n" + "\n".join(lines)


@mcp.tool(
    name="vendas_meta_get_ancestors",
    description=(
        "Retorna o caminho hierárquico completo (ancestrais) de um membro, "
        "do membro até a raiz, usando o banco de metadados local."
    ),
)
async def vendas_meta_get_ancestors(dimension: str, member_name: str) -> str:
    """
    Args:
        dimension: Nome da dimensão (ex: 'Filial', 'Setor').
        member_name: Nome do membro.
    """
    table = _dim_table(dimension)
    if not table:
        return f"❌ Dimensão '{dimension}' não encontrada no banco local."

    col = _first_col(table)
    path = []
    current = member_name

    with _db() as con:
        for _ in range(20):  # max depth guard
            row = con.execute(
                f"SELECT {col} AS member, parent FROM {table} WHERE lower({col})=lower(?)",
                (current,),
            ).fetchone()
            if not row:
                break
            path.append(row["member"])
            if not row["parent"]:
                break
            current = row["parent"]

    if not path:
        return f"Membro '{member_name}' não encontrado em '{dimension}'."

    breadcrumb = " → ".join(reversed(path))
    lines = [f"**Caminho:** `{breadcrumb}`\n", "| Nível | Membro |", "|---|---|"]
    for i, m in enumerate(reversed(path)):
        lines.append(f"| {i} | `{m}` |")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# Fluxo de Caixa — 90 dias rolling
# ──────────────────────────────────────────────

def _fmtR(v: float) -> str:
    """Format a BRL value as R$ xM / R$ xK / R$ x."""
    if abs(v) >= 1e6: return f"R$ {v/1e6:.1f}M"
    if abs(v) >= 1e3: return f"R$ {v/1e3:.0f}K"
    return f"R$ {v:.0f}"


def _cf_load_forecast() -> Optional[Dict]:
    """Load cached cash flow forecast from disk."""
    cf_path = os.path.join(_SCRIPT_DIR, "data", "cash_flow_forecast.json")
    if not os.path.exists(cf_path):
        return None
    with open(cf_path) as f:
        return json.load(f)


@mcp.tool(
    name="vendas_cash_flow_forecast",
    description=(
        "Retorna a previsão de fluxo de caixa rolling de 90 dias para varejo FMCG, "
        "construída sobre as contas de planejamento VendaDia do EPBCS. "
        "Inclui entradas (recebimentos com lag por canal: Pix D0, cartão D1-30, B2B D31-60), "
        "saídas (fornecedores por categoria: perecíveis D1-3, combustível D7-14, mercearia D30-45; "
        "impostos no D10 do mês seguinte; folha no 5º e último dia do mês; comissões D0; "
        "promoções D+30; verba PDV D+30). "
        "Algoritmos: WMA 3 meses + sazonalidade FMCG Brazil + projeção de crescimento + blend orçamento. "
        "Lê data/cash_flow_forecast.json — execute vendas_cash_flow_generate para atualizar."
    ),
)
async def vendas_cash_flow_forecast(
    summary_only: bool = False,
    days: int = 14,
) -> str:
    """
    Args:
        summary_only: Se True, retorna apenas KPIs resumidos (sem registros diários).
        days: Quantos dias de detalhe diário retornar (1–90, padrão 14).
    """
    data = _cf_load_forecast()
    if not data:
        return (
            "❌ Previsão de fluxo de caixa não encontrada.\n"
            "Execute: `python scripts/generate_cash_flow_forecast.py`\n"
            "ou use a ferramenta `vendas_cash_flow_generate`."
        )

    kpis = data.get("kpis", {})
    ref  = data.get("reference_date", "N/A")
    end  = data.get("end_date", "N/A")

    lines = [
        f"## Fluxo de Caixa Operacional — 90 dias rolling",
        f"**Referência:** {ref}  **Horizonte:** {ref} → {end}",
        "",
        "### KPIs Principais",
        f"| Indicador | Valor |",
        f"|---|---|",
        f"| Saldo de abertura | **{_fmtR(kpis.get('opening_balance', 0))}** |",
        f"| Saldo de fechamento (D+90) | **{_fmtR(kpis.get('closing_balance', 0))}** |",
        f"| Saldo mínimo do período | **{_fmtR(kpis.get('min_balance', 0))}** ({'⚠️ NEGATIVO' if kpis.get('min_balance',0) < 0 else '✅ positivo'}) |",
        f"| Data do saldo mínimo | {kpis.get('min_balance_date', '—')} |",
        f"| Entradas 90d (recebimentos) | {_fmtR(kpis.get('total_inflow_90d', 0))} |",
        f"| Saídas 90d (desembolsos) | {_fmtR(kpis.get('total_outflow_90d', 0))} |",
        f"| Geração de Caixa 90d | {_fmtR(kpis.get('net_cash_flow_90d', 0))} |",
        f"| Média diária Geração de Caixa | {_fmtR(kpis.get('avg_daily_net', 0))} |",
        f"| PMR (prazo médio recebimento) | {kpis.get('cash_conversion_days', 0):.1f} dias |",
        f"| PMP (prazo médio pagamento) | {kpis.get('avg_supplier_payment_days', 0):.1f} dias |",
        "",
    ]

    # Monthly summary
    monthly = data.get("monthly", [])
    if monthly:
        lines += [
            "### Resumo Mensal",
            "| Mês | Entradas | Saídas | Geração de Caixa | Receita (competência) |",
            "|---|---|---|---|---|",
        ]
        for m in monthly:
            net_sign = "✅" if m.get("net_cash_flow", 0) >= 0 else "⚠️"
            lines.append(
                f"| {m['month']}/{m['year']} "
                f"| {_fmtR(m.get('inflow_total', 0))} "
                f"| {_fmtR(m.get('outflow_total', 0))} "
                f"| {net_sign} {_fmtR(m.get('net_cash_flow', 0))} "
                f"| {_fmtR(m.get('accrual_total_venda', 0))} |"
            )
        lines.append("")

    if summary_only:
        return "\n".join(lines)

    # Daily detail
    daily = data.get("daily", [])[:min(days, 90)]
    if daily:
        lines += [
            f"### Detalhe Diário — próximos {len(daily)} dias",
            "| Data | Dia | Tipo | Entradas | Saídas | Geração de Caixa | Saldo de Caixa |",
            "|---|---|---|---|---|---|---|",
        ]
        for r in daily:
            net_icon = "🟢" if r["net_cash_flow"] >= 0 else "🔴"
            bal_icon = "✅" if r["cash_balance"] >= 0 else "🔴"
            lines.append(
                f"| {r['date']} | {r['day_of_week'][:3]} "
                f"| {r['type']} "
                f"| {_fmtR(r['inflow_total'])} "
                f"| {_fmtR(r['outflow_total'])} "
                f"| {net_icon} {_fmtR(r['net_cash_flow'])} "
                f"| {bal_icon} {_fmtR(r['cash_balance'])} |"
            )

    return "\n".join(lines)


@mcp.tool(
    name="vendas_cash_flow_operational_analysis",
    description=(
        "Analisa os padrões operacionais do fluxo de caixa: ciclo de caixa, "
        "necessidade de capital de giro, concentração de obrigações, "
        "variação diária por dia da semana e sazonalidade mensal. "
        "Usa a previsão gerada por vendas_cash_flow_generate."
    ),
)
async def vendas_cash_flow_operational_analysis() -> str:
    data = _cf_load_forecast()
    if not data:
        return "❌ Execute `vendas_cash_flow_generate` primeiro."

    daily = data.get("daily", [])
    if not daily:
        return "❌ Sem dados diários na previsão."

    # Average by day of week
    dow_agg: Dict[str, List[float]] = {}
    for r in daily:
        dow = r["day_of_week"]
        dow_agg.setdefault(dow, []).append(r["net_cash_flow"])
    dow_order = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"]

    # Biggest outflow days (tax + payroll spikes)
    big_outflows = sorted(
        [r for r in daily if r["outflow_taxes"] > 50000 or r["outflow_payroll"] > 50000],
        key=lambda r: r["outflow_total"], reverse=True
    )[:5]

    # Working capital requirement: max negative cumulative
    cumsums = [r["cumulative_net"] for r in daily]
    min_cum = min(cumsums)
    min_day = daily[cumsums.index(min_cum)]

    lines = [
        "## Análise Operacional — Fluxo de Caixa 90 dias",
        "",
        "### Necessidade de Capital de Giro",
        f"| Indicador | Valor |",
        f"|---|---|",
        f"| Posição mínima acumulada (90d) | **{_fmtR(min_cum)}** |",
        f"| Data do pico de necessidade | {min_day['date']} ({min_day['day_of_week']}) |",
        f"| Posição final acumulada (D+90) | {_fmtR(daily[-1]['cumulative_net'])} |",
        "",
        "### Padrão por Dia da Semana (FCO Médio)",
        "| Dia | FCO Médio | Receita Accrual Média |",
        "|---|---|---|",
    ]

    for dow in dow_order:
        vals = dow_agg.get(dow, [])
        if vals:
            avg_net = sum(vals) / len(vals)
            avg_rev = sum(
                r["accrual_total_venda"] for r in daily if r["day_of_week"] == dow
            ) / len(vals)
            lines.append(f"| {dow} | {_fmtR(avg_net)} | {_fmtR(avg_rev)} |")

    if big_outflows:
        lines += [
            "",
            "### Picos de Desembolso (Impostos / Folha)",
            "| Data | Impostos | Folha | Total Saída |",
            "|---|---|---|---|",
        ]
        for r in big_outflows:
            lines.append(
                f"| {r['date']} "
                f"| {_fmtR(r['outflow_taxes']) if r['outflow_taxes'] > 1000 else '—'} "
                f"| {_fmtR(r['outflow_payroll']) if r['outflow_payroll'] > 1000 else '—'} "
                f"| {_fmtR(r['outflow_total'])} |"
            )

    lines += [
        "",
        "### Perfil de Recebimento (Revenue → Cash)",
        "- **60%** no D0 (Pix, débito, dinheiro)",
        "- **30%** D1–D30 (cartão de crédito, prazo médio ~18 dias)",
        "- **10%** D31–D60 (crédito B2B/atacado)",
        f"- **PMR efetivo:** {data['kpis']['cash_conversion_days']:.1f} dias",
        "",
        "### Perfil de Pagamento a Fornecedores (COGS → Cash)",
        "- **30%** D1–D3 (perecíveis — entrega diária)",
        "- **20%** D7–D14 (combustível)",
        "- **50%** D30–D45 (mercearia — prazo padrão 30–45 dias)",
        f"- **PMP efetivo:** {data['kpis']['avg_supplier_payment_days']:.1f} dias",
        "",
        "### Obrigações Fixas Mensais",
        "- Impostos (ICMS, PIS, COFINS): **dia 10 do mês seguinte**",
        "- Folha — Adiantamento: **dia 5 do mês** (40% da folha)",
        "- Folha — Fechamento: **último dia do mês** (60% da folha)",
        "- Promoções de venda: **dia 15 do mês seguinte**",
        "- Verba PDV: **D+30 corrido**",
    ]

    return "\n".join(lines)


@mcp.tool(
    name="vendas_cash_flow_generate",
    description=(
        "Executa o script generate_cash_flow_forecast.py para gerar/atualizar a previsão "
        "de fluxo de caixa rolling de 90 dias. Lê dashboard_data.json com os dados EPBCS "
        "e aplica algoritmos preditivos (WMA, sazonalidade, perfis operacionais). "
        "Grava data/cash_flow_forecast.json. Use após atualizar dados do EPBCS."
    ),
)
async def vendas_cash_flow_generate() -> str:
    import subprocess
    script = os.path.join(_SCRIPT_DIR, "scripts", "generate_cash_flow_forecast.py")
    if not os.path.exists(script):
        return f"❌ Script não encontrado: {script}"
    try:
        result = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, timeout=120,
            cwd=_SCRIPT_DIR,
        )
        output = result.stdout.strip()
        err    = result.stderr.strip()
        if result.returncode == 0:
            return f"✅ Previsão gerada com sucesso:\n```\n{output}\n```"
        return f"❌ Erro ao gerar previsão (código {result.returncode}):\n```\n{err}\n```"
    except subprocess.TimeoutExpired:
        return "❌ Timeout ao executar script (>120s)."
    except Exception as e:
        return f"❌ Exceção: {e}"


# ──────────────────────────────────────────────
# Entrypoint
# ──────────────────────────────────────────────

if __name__ == "__main__":
    if not USER or not PASSWD:
        print(
            "⚠️  Configure as variáveis de ambiente:\n"
            "   EPBCS_VENDAS_URL, EPBCS_VENDAS_USER, EPBCS_VENDAS_PASS"
        )
    mcp.run(transport="stdio")

