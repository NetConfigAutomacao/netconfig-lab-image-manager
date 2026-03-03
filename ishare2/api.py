"""
Pequeno wrapper HTTP para expor o comando
`ishare2` via API REST dentro do
container ishare2.
"""

import os
import re
import subprocess
import tempfile
import threading
import uuid
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List

from flask import Flask, jsonify, request

app = Flask(__name__)


_ANSI_ESCAPE_RE = re.compile(r"\x1B[@-_][0-?]*[ -/]*[@-~]")
_SAFE_DIR_RE = re.compile(r"^[A-Za-z0-9._+-]+$")
_QEMU_BASE_DIR = "/opt/unetlab/addons/qemu"
_ISHARE2_SCRIPT = "/opt/ishare2-cli/ishare2"
_PULL_PREFIX_TOKEN = "prefix=$(jq -r --arg mirror \"$mirror\" '.url_properties.prefixes[$mirror]' \"$TEMP_JSON\")"
_LABHUB_INDEX_URL = "https://labhub.eu.org/"
_QUOTA_HINT_MESSAGE = (
  "Possível limite de quota dos mirrors LabHub detectado. "
  "Tente novamente em alguns minutos ou use outro repositório."
)
_QUOTA_PATTERNS = [
  ("quota_exceeded", re.compile(r"\bquota(?:\s+has\s+been)?\s+exceeded\b", re.IGNORECASE)),
  ("download_quota", re.compile(r"download\s+quota", re.IGNORECASE)),
  ("rate_limit", re.compile(r"\brate\s+limit\b", re.IGNORECASE)),
  ("bandwidth_limit", re.compile(r"bandwidth\s+limit\s+exceeded", re.IGNORECASE)),
  ("too_many_users", re.compile(r"too\s+many\s+users\s+have\s+viewed\s+or\s+downloaded", re.IGNORECASE)),
  ("too_many_requests", re.compile(r"\b429\b|\btoo\s+many\s+requests\b", re.IGNORECASE)),
]
_CUSTOM_DIR_RULES = [
  (re.compile(r"(?:^|-)ne9000(?:-|$)"), "huaweine9k-ne9000"),
]


def _strip_ansi(text: str) -> str:
  if not text:
    return ""
  return _ANSI_ESCAPE_RE.sub("", text)


def _append_text(base: str, extra: str) -> str:
  if not extra:
    return base or ""
  if not base:
    return extra
  if base.endswith("\n"):
    return f"{base}{extra}"
  return f"{base}\n{extra}"


def _extract_install_path(text: str) -> str | None:
  for line in (text or "").splitlines():
    m = re.search(r"^\s*Path\s*:\s*(.+)$", line)
    if m:
      return m.group(1).strip()
  return None


def _detect_labhub_quota_issue(*texts: str) -> Dict[str, Any]:
  merged = "\n".join([part for part in texts if part]).strip()
  if not merged:
    return {"detected": False, "matches": []}

  matches: List[str] = []
  for label, pattern in _QUOTA_PATTERNS:
    if pattern.search(merged):
      matches.append(label)

  return {"detected": bool(matches), "matches": matches}


def _build_patched_ishare2_script(forced_prefix: str) -> str:
  with open(_ISHARE2_SCRIPT, "r", encoding="utf-8") as src:
    script_content = src.read()

  if _PULL_PREFIX_TOKEN not in script_content:
    raise RuntimeError("Trecho de prefixo do ishare2 não encontrado para aplicar fallback.")

  patched_content = script_content.replace(
    _PULL_PREFIX_TOKEN,
    f'prefix="{forced_prefix}"',
    1,
  )

  fd, path = tempfile.mkstemp(prefix="ishare2-prefix-", suffix=".sh")
  os.close(fd)
  try:
    with open(path, "w", encoding="utf-8") as tmp:
      tmp.write(patched_content)
    os.chmod(path, 0o755)
  except Exception:
    try:
      os.remove(path)
    except OSError:
      pass
    raise

  return path


def _discover_repo_prefixes_from_labhub() -> List[str]:
  """
  Descobre dinamicamente os repositórios publicados na home do LabHub.
  Ex.: /0:/, /1:/, /2:/ ...
  """
  try:
    req = urllib.request.Request(
      _LABHUB_INDEX_URL,
      headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
      html = resp.read().decode("utf-8", errors="ignore")
  except (urllib.error.URLError, TimeoutError, OSError):
    return []

  matches = re.findall(r"/(\d+):/", html)
  if not matches:
    return []

  prefixes: List[str] = []
  for num in sorted({int(value) for value in matches}):
    prefixes.append(f"/{num}:")
  return prefixes


def _run_pull_command(
  type_arg: str,
  image_id: str,
  *,
  overwrite: bool = False,
  forced_prefix: str | None = None,
) -> tuple[int, str, str]:
  script_path = _ISHARE2_SCRIPT
  temp_script_path = ""

  if forced_prefix:
    temp_script_path = _build_patched_ishare2_script(forced_prefix)
    script_path = temp_script_path

  try:
    cmd = [script_path, "pull", type_arg, image_id]
    if overwrite:
      cmd.append("--overwrite")
    proc = subprocess.Popen(
      cmd,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      text=True,
    )
    stdout, stderr = proc.communicate()
    return proc.returncode, _strip_ansi(stdout or ""), _strip_ansi(stderr or "")
  finally:
    if temp_script_path and os.path.exists(temp_script_path):
      try:
        os.remove(temp_script_path)
      except OSError:
        pass


def _run_pull_with_repo_fallback(
  type_arg: str,
  image_id: str,
  on_attempt: Callable[[str], None] | None = None,
) -> Dict[str, Any]:
  tested_prefixes: List[str] = []

  tested_prefixes.append("/0:")
  if on_attempt:
    on_attempt("/0:")
  rc0, out0, err0 = _run_pull_command(type_arg, image_id)
  if rc0 == 0:
    return {
      "rc": rc0,
      "output": out0,
      "stderr": err0,
      "final_output": out0,
      "fallback_attempted": False,
      "fallback_used": False,
      "tested_prefixes": tested_prefixes,
    }

  discovered_prefixes = _discover_repo_prefixes_from_labhub()
  fallback_prefixes = [prefix for prefix in discovered_prefixes if prefix != "/0:"]
  if not fallback_prefixes:
    fallback_prefixes = ["/1:"]

  out_joined = out0
  err_joined = err0

  last_rc = rc0
  last_out = out0

  for prefix in fallback_prefixes:
    tested_prefixes.append(prefix)
    if on_attempt:
      on_attempt(prefix)
    out_joined = _append_text(
      out_joined,
      f"[image-manager] Pull falhou no repositório /0:. Tentando fallback no {prefix}.",
    )
    try:
      rc, out, err = _run_pull_command(
        type_arg,
        image_id,
        overwrite=True,
        forced_prefix=prefix,
      )
    except Exception as exc:
      rc = 1
      out = ""
      err = f"Erro ao executar fallback no repositório {prefix}: {exc}"

    last_rc = rc
    if out:
      last_out = out

    out_joined = _append_text(out_joined, out)
    err_joined = _append_text(err_joined, err)

    if rc == 0:
      out_joined = _append_text(out_joined, f"[image-manager] Fallback no repositório {prefix} concluído com sucesso.")
      return {
        "rc": 0,
        "output": out_joined,
        "stderr": err_joined,
        "final_output": out,
        "fallback_attempted": True,
        "fallback_used": True,
        "fallback_prefix": prefix,
        "tested_prefixes": tested_prefixes,
      }

  return {
    "rc": last_rc,
    "output": out_joined,
    "stderr": err_joined,
    "final_output": last_out,
    "fallback_attempted": bool(fallback_prefixes),
    "fallback_used": False,
    "fallback_prefixes": fallback_prefixes,
    "tested_prefixes": tested_prefixes,
  }


def _normalize_image_dir_name(raw: str) -> str:
  cleaned = (raw or "").strip()
  if not cleaned:
    return ""
  cleaned = cleaned.lower()
  cleaned = re.sub(r"\s+", "-", cleaned)
  cleaned = re.sub(r"[^A-Za-z0-9._+-]", "-", cleaned)
  cleaned = re.sub(r"-{2,}", "-", cleaned)
  cleaned = cleaned.strip("-")
  if not cleaned:
    return ""
  if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
    return ""
  if not _SAFE_DIR_RE.match(cleaned):
    return ""
  return cleaned


def _validate_dir_name(raw: str) -> str:
  cleaned = (raw or "").strip()
  if not cleaned:
    return ""
  if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
    return ""
  if not _SAFE_DIR_RE.match(cleaned):
    return ""
  return cleaned


def _apply_custom_dir_rules(base_name: str, normalized: str) -> str:
  base_norm = _normalize_image_dir_name(base_name)
  for pattern, suggestion in _CUSTOM_DIR_RULES:
    if normalized and pattern.search(normalized):
      return suggestion
    if base_norm and pattern.search(base_norm):
      return suggestion
  return ""


def _build_name_choices(base_name: str, normalized: str) -> tuple[str, List[str]]:
  raw_candidates: List[str] = []

  rule_suggestion = _apply_custom_dir_rules(base_name, normalized)
  if rule_suggestion:
    raw_candidates.append(rule_suggestion)

  fallback_from = base_name or normalized
  if fallback_from and "-" not in fallback_from:
    raw_candidates.append(f"{fallback_from}-{fallback_from}")

  if normalized and "-" in normalized:
    raw_candidates.append(normalized)
  if base_name and "-" in base_name:
    raw_candidates.append(base_name)

  choices: List[str] = []
  suggested = ""
  for candidate in raw_candidates:
    cleaned = _normalize_image_dir_name(candidate) or _validate_dir_name(candidate)
    if not cleaned or "-" not in cleaned:
      continue
    if cleaned in choices:
      continue
    choices.append(cleaned)
    if not suggested:
      suggested = cleaned

  return suggested, choices


def _get_name_choices(install_path: str, image_name: str) -> tuple[str, str, str, List[str], str]:
  path = (install_path or "").rstrip("/")
  base_dir = os.path.dirname(path)
  base_name = os.path.basename(path)
  normalized = _normalize_image_dir_name(image_name)
  suggested, choices = _build_name_choices(base_name, normalized)
  return base_dir, base_name, normalized, choices, suggested


def _adjust_install_path(install_path: str, image_name: str) -> tuple[str, str]:
  if not install_path:
    return install_path, ""

  normalized = _normalize_image_dir_name(image_name)
  if not normalized:
    return install_path, ""

  path = install_path.rstrip("/")
  base_dir = os.path.dirname(path)
  base_name = os.path.basename(path)

  if not base_dir.startswith(_QEMU_BASE_DIR):
    return install_path, ""

  rule_suggestion = _apply_custom_dir_rules(base_name, normalized)
  if rule_suggestion and rule_suggestion != base_name:
    return f"{base_dir}/{rule_suggestion}", f"Nome de diretório ajustado de '{base_name}' para '{rule_suggestion}'."

  if base_name == normalized:
    return install_path, ""

  candidate = normalized
  if "-" in normalized:
    parts = normalized.split("-")
    if base_name in parts:
      idx = parts.index(base_name)
      candidate = "-".join(parts[idx:])

  if "-" not in base_name and "-" in candidate and candidate.startswith(f"{base_name}-"):
    return f"{base_dir}/{candidate}", f"Nome de diretório ajustado de '{base_name}' para '{candidate}'."

  return install_path, ""


# Estrutura simples em memória para acompanhar progresso de installs
JOBS: Dict[str, Dict[str, Any]] = {}


def _create_job() -> str:
  job_id = uuid.uuid4().hex
  JOBS[job_id] = {
    "id": job_id,
    "status": "pending",  # pending | running | needs_input | success | error
    "phase": "pending",  # pull | choose | copy | fix | done
    "progress": 0,
    "message": "Aguardando início da instalação.",
    "error": "",
    "stdout": "",
    "stderr": "",
    "choices": [],
    "current_name": "",
    "suggested_name": "",
    "base_dir": "",
    "install_path": "",
    "target_install_path": "",
    "eve_ip": "",
    "eve_user": "",
    "eve_pass": "",
  }
  return job_id


def _copy_to_eve(job_id: str, install_path: str, target_install_path: str, eve_ip: str, eve_user: str, eve_pass: str) -> None:
  base_ssh = _base_ssh_cmd(eve_ip, eve_pass)
  base_scp = _base_scp_cmd(eve_ip, eve_pass)

  try:
    target_ssh = _format_target(eve_user, eve_ip, brackets=False)
    target_scp = _format_target(eve_user, eve_ip, brackets=True)

    # Garante diretório remoto
    _update_job(
      job_id,
      status="running",
      phase="copy",
      progress=0,
      message="Criando diretório de destino no EVE...",
      target_install_path=target_install_path,
    )
    mkdir_cmd = base_ssh + [
      target_ssh,
      f"mkdir -p '{target_install_path}'",
    ]
    mkdir_proc = subprocess.run(
      mkdir_cmd,
      check=False,
      text=True,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
    )
    mkdir_out = _strip_ansi(mkdir_proc.stdout or "")
    mkdir_err = _strip_ansi(mkdir_proc.stderr or "")
    _append_job_logs(job_id, stdout=mkdir_out, stderr=mkdir_err)
    if mkdir_proc.returncode != 0:
      _update_job(
        job_id,
        status="error",
        phase="done",
        progress=0,
        message=f"Falha ao criar diretório no EVE: {mkdir_err or 'erro desconhecido.'}",
        error=mkdir_err or "Falha ao criar diretório no EVE.",
      )
      return

    # Copia conteúdo do diretório local para o mesmo caminho no EVE
    _update_job(
      job_id,
      phase="copy",
      progress=0,
      message="Copiando arquivos para o EVE...",
    )
    scp_cmd = base_scp + [
      "-r",
      f"{install_path}/.",
      f"{target_scp}:{target_install_path}",
    ]
    proc = subprocess.Popen(
      scp_cmd,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      text=True,
    )

    # Lê stderr em fluxo para tentar extrair porcentagem real (padrão 'NN%')
    while True:
      line = proc.stderr.readline()
      if not line:
        break
      clean_line = _strip_ansi(line)
      _append_job_logs(job_id, stderr=clean_line)
      m = re.search(r"(\d+)%", clean_line)
      if m:
        try:
          pct = int(m.group(1))
        except ValueError:
          pct = None
        if pct is not None and 0 <= pct <= 100:
          _update_job(
            job_id,
            progress=pct,
          )

    proc.wait()
    if proc.returncode != 0:
      _update_job(
        job_id,
        status="error",
        phase="done",
        progress=0,
        message="Falha ao copiar arquivos para o EVE via SCP.",
        error="Falha ao copiar arquivos para o EVE via SCP.",
      )
      return

    # Executa fixpermissions no EVE
    _update_job(
      job_id,
      phase="fix",
      progress=100,
      message="Aplicando fixpermissions no EVE...",
    )
    fix_cmd = base_ssh + [
      target_ssh,
      "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions",
    ]
    fix_proc = subprocess.run(
      fix_cmd,
      check=False,
      text=True,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
    )
    fix_out = _strip_ansi(fix_proc.stdout or "")
    fix_err = _strip_ansi(fix_proc.stderr or "")
    _append_job_logs(job_id, stdout=fix_out, stderr=fix_err)
    if fix_proc.returncode != 0:
      _update_job(
        job_id,
        status="error",
        phase="done",
        progress=100,
        message="Falha ao executar fixpermissions no EVE.",
        error=fix_err or "Falha ao executar fixpermissions no EVE.",
      )
      return

    _update_job(
      job_id,
      status="success",
      phase="done",
      progress=100,
      message="Imagem instalada e copiada para o EVE com sucesso (incluindo fixpermissions).",
    )

  except Exception as exc:  # pragma: no cover
    _update_job(
      job_id,
      status="error",
      phase="done",
      progress=0,
      message=f"Erro inesperado durante a instalação: {exc}",
      error=str(exc),
    )


def _update_job(job_id: str, **kwargs: Any) -> None:
  job = JOBS.get(job_id)
  if not job:
    return
  job.update(kwargs)


def _append_job_logs(job_id: str, stdout: str = "", stderr: str = "") -> None:
  job = JOBS.get(job_id)
  if not job:
    return
  if stdout:
    job["stdout"] = (job.get("stdout") or "") + stdout
  if stderr:
    job["stderr"] = (job.get("stderr") or "") + stderr


def _is_ipv6(addr: str) -> bool:
  cleaned = (addr or "").strip()
  # Remove colchetes caso o usuário já tenha passado [::1]
  if cleaned.startswith("[") and cleaned.endswith("]"):
    cleaned = cleaned[1:-1]
  return ":" in cleaned


def _normalize_host(addr: str, *, brackets: bool = False) -> str:
  if not addr:
    return ""
  cleaned = addr.strip()
  if cleaned.startswith("[") and cleaned.endswith("]"):
    cleaned = cleaned[1:-1]
  if brackets and _is_ipv6(cleaned):
    return f"[{cleaned}]"
  return cleaned


def _format_target(user: str, addr: str, *, brackets: bool = False) -> str:
  host = _normalize_host(addr, brackets=brackets)
  return f"{user}@{host}" if user and host else host


def _base_ssh_cmd(eve_ip: str, eve_pass: str) -> List[str]:
  cmd = [
    "sshpass",
    "-p",
    eve_pass,
    "ssh",
  ]
  if _is_ipv6(eve_ip):
    cmd.append("-6")
  cmd.extend(
    [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
    ]
  )
  return cmd


def _base_scp_cmd(eve_ip: str, eve_pass: str) -> List[str]:
  cmd = [
    "sshpass",
    "-p",
    eve_pass,
    "scp",
  ]
  if _is_ipv6(eve_ip):
    cmd.append("-6")
  cmd.extend(
    [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
    ]
  )
  return cmd


def _parse_search_output(text: str) -> List[Dict[str, Any]]:
  """
  Converte a saída de `ishare2 search all` em uma
  estrutura de seções com itens (id, nome, tamanho).
  """
  sections: List[Dict[str, Any]] = []
  current: Dict[str, Any] | None = None

  for raw_line in text.splitlines():
    line = raw_line.rstrip("\n")
    stripped = line.strip()

    # Detecta início de seção: "Available QEMU images"
    if stripped.startswith("Available ") and stripped.endswith("images"):
      # Fecha seção anterior, se houver
      if current and current.get("items"):
        sections.append(current)

      label = stripped[len("Available ") : -len(" images")].strip()
      section_type = label.upper()
      current = {"type": section_type, "label": label, "items": []}
      continue

    if not current:
      continue

    # Ignora linhas de decoração e cabeçalho
    if not stripped:
      continue
    if all(ch == "=" for ch in stripped):
      continue
    if stripped.startswith("ID") and "NAME" in stripped and "SIZE" in stripped:
      continue
    if stripped.startswith("--"):
      continue

    # Tenta interpretar como linha de item: "1     nome   2.5 GiB"
    parts = re.split(r"\s{2,}", stripped)
    if len(parts) < 3:
      continue

    id_str = parts[0]
    size = parts[-1]
    name = "  ".join(parts[1:-1])

    try:
      item_id = int(id_str)
    except ValueError:
      continue

    current["items"].append(
      {
        "id": item_id,
        "name": name,
        "size": size,
      }
    )

  if current and current.get("items"):
    sections.append(current)

  return sections


@app.route("/search_all", methods=["POST"])
def search_all():
  """
  Recebe JSON opcional {"query": "..."} e executa:
  ishare2 search all [query]
  """
  data = request.get_json(silent=True) or {}
  query = (data.get("query") or "").strip()

  # Executa o binário diretamente pelo caminho absoluto,
  # pois o comando "ishare2" pode não estar no PATH.
  cmd_str = "/opt/ishare2-cli/ishare2 search all"
  if query:
    cmd_str += f" {query}"

  cmd = ["bash", "-lc", cmd_str]

  try:
    proc = subprocess.Popen(
      cmd,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      text=True,
    )
    stdout, stderr = proc.communicate()
    rc = proc.returncode
  except FileNotFoundError:
    return (
      jsonify(
        success=False,
        message="Comando 'ishare2' não encontrado no container ishare2.",
        output="",
        stderr="",
      ),
      500,
    )
  except Exception as exc:  # pragma: no cover
    return (
      jsonify(
        success=False,
        message=f"Erro inesperado ao executar ishare2: {exc}",
        output="",
        stderr="",
      ),
      500,
    )

  clean_out = _strip_ansi(stdout or "")
  clean_err = _strip_ansi(stderr or "")
  sections = _parse_search_output(clean_out)

  if rc != 0:
    return (
      jsonify(
        success=False,
        message="Falha ao executar ishare2 search all.",
        output=clean_out,
        stderr=clean_err,
        sections=sections,
      ),
      500,
    )

  return (
    jsonify(
      success=True,
      message="Resultados obtidos com sucesso do ishare2.",
      output=clean_out,
      stderr=clean_err,
      sections=sections,
    ),
    200,
  )


@app.route("/install", methods=["POST"])
def install():
  """
  Recebe JSON {"type": "QEMU|IOL|DYNAMIPS", "id": "123"}
  e executa:
    ishare2 pull <type> <id>
  e, se credenciais forem informadas, copia os arquivos
  baixados para o EVE remoto via SSH/SCP.
  """
  data = request.get_json(silent=True) or {}
  image_type = (data.get("type") or "").strip()
  image_id = str(data.get("id") or "").strip()
  image_name = (data.get("name") or "").strip()

  eve_ip = (data.get("eve_ip") or "").strip()
  eve_user = (data.get("eve_user") or "").strip()
  eve_pass = (data.get("eve_pass") or "").strip()

  if not image_type or not image_id:
    return (
      jsonify(
        success=False,
        message="Parâmetros 'type' e 'id' são obrigatórios.",
        output="",
        stderr="",
      ),
      400,
    )

  type_arg = image_type.lower()
  try:
    pull_result = _run_pull_with_repo_fallback(type_arg, image_id)
  except FileNotFoundError:
    return (
      jsonify(
        success=False,
        message="Comando 'ishare2' não encontrado no container ishare2.",
        output="",
        stderr="",
      ),
      500,
    )
  except Exception as exc:  # pragma: no cover
    return (
      jsonify(
        success=False,
        message=f"Erro inesperado ao executar ishare2 pull: {exc}",
        output="",
        stderr="",
      ),
      500,
    )

  clean_out = pull_result.get("output", "")
  clean_err = pull_result.get("stderr", "")
  install_path = _extract_install_path(pull_result.get("final_output") or clean_out)
  fallback_attempted = bool(pull_result.get("fallback_attempted"))
  fallback_used = bool(pull_result.get("fallback_used"))
  fallback_prefix = (pull_result.get("fallback_prefix") or "").strip()
  fallback_prefixes = pull_result.get("fallback_prefixes") or []
  tested_prefixes = pull_result.get("tested_prefixes") or []
  quota_info = _detect_labhub_quota_issue(clean_out, clean_err)
  quota_detected = bool(quota_info.get("detected"))
  quota_matches = quota_info.get("matches") or []

  if pull_result.get("rc", 1) != 0:
    fail_message = "Falha ao executar ishare2 pull."
    if fallback_attempted:
      fail_message = "Falha ao executar ishare2 pull mesmo após tentar fallbacks de repositório."
    if quota_detected:
      fail_message = f"{fail_message} {_QUOTA_HINT_MESSAGE}"
    if tested_prefixes:
      fail_message = f"{fail_message} Repositórios testados: {', '.join(tested_prefixes)}."
    return (
      jsonify(
        success=False,
        message=fail_message,
        output=clean_out,
        stderr=clean_err,
        install_path=install_path or "",
        fallback_attempted=fallback_attempted,
        fallback_prefixes=fallback_prefixes,
        tested_prefixes=tested_prefixes,
        quota_detected=quota_detected,
        quota_matches=quota_matches,
      ),
      500,
    )

  # Se credenciais do EVE forem fornecidas e tivermos o caminho,
  # copiamos os arquivos baixados para o host EVE.
  copy_ok = True
  copy_err = ""
  target_install_path = install_path
  if eve_ip and eve_user and eve_pass and install_path:
    target_install_path, adjust_note = _adjust_install_path(install_path, image_name)
    if adjust_note:
      clean_out = (clean_out + "\n" if clean_out else "") + f"[image-manager] {adjust_note}\n"
    base_ssh = _base_ssh_cmd(eve_ip, eve_pass)
    base_scp = _base_scp_cmd(eve_ip, eve_pass)
    target_ssh = _format_target(eve_user, eve_ip, brackets=False)
    target_scp = _format_target(eve_user, eve_ip, brackets=True)

    try:
      # Garante diretório remoto
      mkdir_cmd = base_ssh + [
        target_ssh,
        f"mkdir -p '{target_install_path}'",
      ]
      subprocess.run(mkdir_cmd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

      # Copia conteúdo do diretório local para o mesmo caminho no EVE
      scp_cmd = base_scp + [
        "-r",
        f"{install_path}/.",
        f"{target_scp}:{target_install_path}",
      ]
      scp_proc = subprocess.run(
        scp_cmd,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
      )
      if scp_proc.returncode != 0:
        copy_ok = False
        copy_err = f"SCP failed: {scp_proc.stderr}"

      # Executa fixpermissions no EVE
      if copy_ok:
        fix_cmd = base_ssh + [
          target_ssh,
          "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions",
        ]
        fix_proc = subprocess.run(
          fix_cmd,
          check=False,
          text=True,
          stdout=subprocess.PIPE,
          stderr=subprocess.PIPE,
        )
        if fix_proc.returncode != 0:
          copy_ok = False
          copy_err = f"fixpermissions failed: {fix_proc.stderr}"

    except Exception as exc:
      copy_ok = False
      copy_err = str(exc)

  return (
    jsonify(
      success=True,
      message="Imagem instalada (download via ishare2 pull concluído)."
      + (" Quota detectada em mirror anterior; fallback automático aplicado." if quota_detected and fallback_used else "")
      + (f" Fallback para o repositório {fallback_prefix} aplicado com sucesso." if fallback_used and fallback_prefix else "")
      + (f" Repositórios testados: {', '.join(tested_prefixes)}." if tested_prefixes else "")
      + (" Copia para o EVE realizada com sucesso." if copy_ok and eve_ip and eve_user and eve_pass and install_path else ""),
      output=clean_out,
      stderr=(clean_err + ("\n" + copy_err if copy_err else "")) if (clean_err or copy_err) else "",
      install_path=target_install_path or "",
      fallback_used=fallback_used,
      fallback_prefix=fallback_prefix,
      fallback_prefixes=fallback_prefixes,
      tested_prefixes=tested_prefixes,
      quota_detected=quota_detected,
      quota_matches=quota_matches,
    ),
    200,
  )


def _run_install_job(job_id: str, image_type: str, image_id: str, eve_ip: str, eve_user: str, eve_pass: str, image_name: str) -> None:
  """
  Executa o fluxo de instalação em background, atualizando o JOBS[job_id].
  """
  type_arg = image_type.lower()

  _update_job(
    job_id,
    status="running",
    phase="pull",
    progress=0,
    message="Baixando imagem via ishare2 pull...",
  )

  def _notify_repo_attempt(prefix: str) -> None:
    _update_job(
      job_id,
      status="running",
      phase="pull",
      progress=0,
      message=f"Testando repositório {prefix}...",
    )

  try:
    pull_result = _run_pull_with_repo_fallback(type_arg, image_id, on_attempt=_notify_repo_attempt)
  except FileNotFoundError:
    _update_job(
      job_id,
      status="error",
      phase="done",
      progress=0,
      message="Comando 'ishare2' não encontrado no container ishare2.",
      error="Comando 'ishare2' não encontrado no container ishare2.",
    )
    return
  except Exception as exc:  # pragma: no cover
    _update_job(
      job_id,
      status="error",
      phase="done",
      progress=0,
      message=f"Erro inesperado ao executar ishare2 pull: {exc}",
      error=str(exc),
    )
    return

  clean_out = pull_result.get("output", "")
  clean_err = pull_result.get("stderr", "")
  _append_job_logs(job_id, stdout=clean_out, stderr=clean_err)

  install_path = _extract_install_path(pull_result.get("final_output") or clean_out)
  fallback_attempted = bool(pull_result.get("fallback_attempted"))
  fallback_used = bool(pull_result.get("fallback_used"))
  fallback_prefix = (pull_result.get("fallback_prefix") or "").strip()
  fallback_prefixes = pull_result.get("fallback_prefixes") or []
  tested_prefixes = pull_result.get("tested_prefixes") or []
  quota_info = _detect_labhub_quota_issue(clean_out, clean_err)
  quota_detected = bool(quota_info.get("detected"))
  quota_matches = quota_info.get("matches") or []
  if fallback_used:
    if fallback_prefix:
      _append_job_logs(job_id, stdout=f"[image-manager] Download concluído via fallback no repositório {fallback_prefix}.\n")
    else:
      _append_job_logs(job_id, stdout="[image-manager] Download concluído via fallback de repositório.\n")
  if quota_detected:
    _append_job_logs(job_id, stdout=f"[image-manager] {_QUOTA_HINT_MESSAGE}\n")

  if pull_result.get("rc", 1) != 0:
    fail_message = "Falha ao executar ishare2 pull."
    if fallback_attempted:
      fail_message = "Falha ao executar ishare2 pull mesmo após tentar fallbacks de repositório."
    if quota_detected:
      fail_message = f"{fail_message} {_QUOTA_HINT_MESSAGE}"
    _update_job(
      job_id,
      status="error",
      phase="done",
      progress=0,
      message=fail_message,
      error=(
        clean_err
        + (f"\nRepos testados: {', '.join(tested_prefixes)}" if tested_prefixes else "")
        + (f"\nFallbacks disponíveis: {', '.join(fallback_prefixes)}" if fallback_prefixes else "")
        + (f"\nQuota matches: {', '.join(quota_matches)}" if quota_matches else "")
      ) or "Falha ao executar ishare2 pull.",
    )
    return

  # Se não houver credenciais ou caminho, consideramos concluído após o pull.
  if not (eve_ip and eve_user and eve_pass and install_path):
    success_message = "Imagem baixada via ishare2 pull (sem cópia para o EVE)."
    if fallback_used:
      if fallback_prefix:
        success_message = f"Imagem baixada via ishare2 pull usando fallback do repositório {fallback_prefix} (sem cópia para o EVE)."
      else:
        success_message = "Imagem baixada via ishare2 pull usando fallback de repositório (sem cópia para o EVE)."
      if quota_detected:
        success_message = f"{success_message} Quota detectada em mirror anterior."
    _update_job(
      job_id,
      status="success",
      phase="done",
      progress=100,
      message=success_message,
    )
    return

  target_install_path = install_path
  adjusted_path, adjust_note = _adjust_install_path(install_path, image_name)
  if adjust_note:
    target_install_path = adjusted_path
    _append_job_logs(job_id, stdout=f"[image-manager] {adjust_note}\n")
  else:
    base_dir, base_name, normalized, choices, suggested = _get_name_choices(install_path, image_name)
    if base_dir.startswith(_QEMU_BASE_DIR) and base_name and "-" not in base_name:
      _update_job(
        job_id,
        status="needs_input",
        phase="choose",
        progress=0,
        message="Nome de diretório precisa conter hífen. Escolha ou informe o nome correto.",
        choices=choices,
        current_name=base_name,
        suggested_name=suggested or normalized,
        base_dir=base_dir,
        install_path=install_path,
        eve_ip=eve_ip,
        eve_user=eve_user,
        eve_pass=eve_pass,
      )
      return

  _copy_to_eve(job_id, install_path, target_install_path, eve_ip, eve_user, eve_pass)


@app.route("/install_async", methods=["POST"])
def install_async():
  """
  Inicia a instalação de forma assíncrona e retorna um job_id
  para que o cliente possa acompanhar o progresso.
  """
  data = request.get_json(silent=True) or {}
  image_type = (data.get("type") or "").strip()
  image_id = str(data.get("id") or "").strip()
  image_name = (data.get("name") or "").strip()

  eve_ip = (data.get("eve_ip") or "").strip()
  eve_user = (data.get("eve_user") or "").strip()
  eve_pass = (data.get("eve_pass") or "").strip()

  if not image_type or not image_id:
    return (
      jsonify(
        success=False,
        message="Parâmetros 'type' e 'id' são obrigatórios.",
      ),
      400,
    )

  job_id = _create_job()

  thread = threading.Thread(
    target=_run_install_job,
    args=(job_id, image_type, image_id, eve_ip, eve_user, eve_pass, image_name),
    daemon=True,
  )
  thread.start()

  return (
    jsonify(
      success=True,
      job_id=job_id,
      message="Instalação iniciada no serviço ishare2.",
    ),
    200,
  )


@app.route("/install_choose", methods=["POST"])
def install_choose():
  """
  Recebe JSON {"job_id": "...", "name": "..."} para continuar
  a instalação quando o nome do diretório precisa de confirmação.
  """
  data = request.get_json(silent=True) or {}
  job_id = (data.get("job_id") or "").strip()
  chosen_name = (data.get("name") or "").strip()

  if not job_id or not chosen_name:
    return (
      jsonify(
        success=False,
        message="Parâmetros 'job_id' e 'name' são obrigatórios.",
      ),
      400,
    )

  job = JOBS.get(job_id)
  if not job:
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Job de instalação não encontrado.",
      ),
      404,
    )

  if job.get("status") != "needs_input":
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Job não está aguardando escolha de nome.",
      ),
      409,
    )

  safe_name = _normalize_image_dir_name(chosen_name) or _validate_dir_name(chosen_name)
  if not safe_name:
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Nome de diretório inválido.",
      ),
      400,
    )

  base_dir = (job.get("base_dir") or "").strip()
  install_path = (job.get("install_path") or "").strip()
  eve_ip = (job.get("eve_ip") or "").strip()
  eve_user = (job.get("eve_user") or "").strip()
  eve_pass = (job.get("eve_pass") or "").strip()

  if not base_dir or not install_path or not (eve_ip and eve_user and eve_pass):
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Dados insuficientes para retomar a instalação.",
      ),
      500,
    )

  if base_dir.startswith(_QEMU_BASE_DIR) and "-" not in safe_name:
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Nome de diretório inválido. Use um hífen como delimitador.",
      ),
      400,
    )

  target_install_path = f"{base_dir.rstrip('/')}/{safe_name}"

  _update_job(
    job_id,
    status="running",
    phase="copy",
    progress=0,
    message="Retomando instalação com nome selecionado.",
    current_name=safe_name,
    target_install_path=target_install_path,
  )

  thread = threading.Thread(
    target=_copy_to_eve,
    args=(job_id, install_path, target_install_path, eve_ip, eve_user, eve_pass),
    daemon=True,
  )
  thread.start()

  return (
    jsonify(
      success=True,
      job_id=job_id,
      message="Nome definido. Retomando instalação.",
    ),
    200,
  )


@app.route("/install_progress", methods=["GET"])
def install_progress():
  """
  Retorna o status e o progresso atual de um job
  iniciado via /install_async.
  """
  job_id = (request.args.get("job_id") or "").strip()
  if not job_id:
    return (
      jsonify(
        success=False,
        message="Parâmetro 'job_id' é obrigatório.",
      ),
      400,
    )

  job = JOBS.get(job_id)
  if not job:
    return (
      jsonify(
        success=False,
        job_id=job_id,
        message="Job de instalação não encontrado.",
      ),
      404,
    )

  return (
    jsonify(
      success=job.get("status") == "success",
      job_id=job_id,
      status=job.get("status"),
      phase=job.get("phase"),
      progress=job.get("progress", 0),
      message=job.get("message", ""),
      error=job.get("error", ""),
      stdout=job.get("stdout", ""),
      stderr=job.get("stderr", ""),
      choices=job.get("choices", []),
      current_name=job.get("current_name", ""),
      suggested_name=job.get("suggested_name", ""),
      base_dir=job.get("base_dir", ""),
    ),
    200,
  )


if __name__ == "__main__":
  app.run(host="::", port=8080)
