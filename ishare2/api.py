"""
Pequeno wrapper HTTP para expor o comando
`ishare2` via API REST dentro do
container ishare2.
"""

import re
import subprocess
import threading
import uuid
from typing import Any, Dict, List

from flask import Flask, jsonify, request

app = Flask(__name__)


_ANSI_ESCAPE_RE = re.compile(r"\x1B[@-_][0-?]*[ -/]*[@-~]")


def _strip_ansi(text: str) -> str:
  if not text:
    return ""
  return _ANSI_ESCAPE_RE.sub("", text)


# Estrutura simples em memória para acompanhar progresso de installs
JOBS: Dict[str, Dict[str, Any]] = {}


def _create_job() -> str:
  job_id = uuid.uuid4().hex
  JOBS[job_id] = {
    "id": job_id,
    "status": "pending",  # pending | running | success | error
    "phase": "pending",  # pull | copy | fix | done
    "progress": 0,
    "message": "Aguardando início da instalação.",
    "error": "",
    "stdout": "",
    "stderr": "",
  }
  return job_id


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
  cmd_str = f"/opt/ishare2-cli/ishare2 pull {type_arg} {image_id}"
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
        message=f"Erro inesperado ao executar ishare2 pull: {exc}",
        output="",
        stderr="",
      ),
      500,
    )

  clean_out = _strip_ansi(stdout or "")
  clean_err = _strip_ansi(stderr or "")

  # Tenta extrair o caminho de instalação da saída (linha "Path: ...")
  install_path = None
  for line in clean_out.splitlines():
    m = re.search(r"^\s*Path\s*:\s*(.+)$", line)
    if m:
      install_path = m.group(1).strip()
      break

  if rc != 0:
    return (
      jsonify(
        success=False,
        message="Falha ao executar ishare2 pull.",
        output=clean_out,
        stderr=clean_err,
        install_path=install_path or "",
      ),
      500,
    )

  # Se credenciais do EVE forem fornecidas e tivermos o caminho,
  # copiamos os arquivos baixados para o host EVE.
  copy_ok = True
  copy_err = ""
  if eve_ip and eve_user and eve_pass and install_path:
    base_ssh = [
      "sshpass",
      "-p",
      eve_pass,
      "ssh",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
    ]

    base_scp = [
      "sshpass",
      "-p",
      eve_pass,
      "scp",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
    ]

    try:
      # Garante diretório remoto
      mkdir_cmd = base_ssh + [
        f"{eve_user}@{eve_ip}",
        f"mkdir -p '{install_path}'",
      ]
      subprocess.run(mkdir_cmd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

      # Copia conteúdo do diretório local para o mesmo caminho no EVE
      scp_cmd = base_scp + [
        "-r",
        f"{install_path}/.",
        f"{eve_user}@{eve_ip}:{install_path}",
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
          f"{eve_user}@{eve_ip}",
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
      + (" Copia para o EVE realizada com sucesso." if copy_ok and eve_ip and eve_user and eve_pass and install_path else ""),
      output=clean_out,
      stderr=(clean_err + ("\n" + copy_err if copy_err else "")) if (clean_err or copy_err) else "",
      install_path=install_path or "",
    ),
    200,
  )


def _run_install_job(job_id: str, image_type: str, image_id: str, eve_ip: str, eve_user: str, eve_pass: str) -> None:
  """
  Executa o fluxo de instalação em background, atualizando o JOBS[job_id].
  """
  type_arg = image_type.lower()
  cmd_str = f"/opt/ishare2-cli/ishare2 pull {type_arg} {image_id}"
  cmd = ["bash", "-lc", cmd_str]

  _update_job(
    job_id,
    status="running",
    phase="pull",
    progress=0,
    message="Baixando imagem via ishare2 pull...",
  )

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

  clean_out = _strip_ansi(stdout or "")
  clean_err = _strip_ansi(stderr or "")
  _append_job_logs(job_id, stdout=clean_out, stderr=clean_err)

  # Tenta extrair o caminho de instalação da saída (linha "Path: ...")
  install_path = None
  for line in clean_out.splitlines():
    m = re.search(r"^\s*Path\s*:\s*(.+)$", line)
    if m:
      install_path = m.group(1).strip()
      break

  if rc != 0:
    _update_job(
      job_id,
      status="error",
      phase="done",
      progress=0,
      message="Falha ao executar ishare2 pull.",
      error=clean_err or "Falha ao executar ishare2 pull.",
    )
    return

  # Se não houver credenciais ou caminho, consideramos concluído após o pull.
  if not (eve_ip and eve_user and eve_pass and install_path):
    _update_job(
      job_id,
      status="success",
      phase="done",
      progress=100,
      message="Imagem baixada via ishare2 pull (sem cópia para o EVE).",
    )
    return

  base_ssh = [
    "sshpass",
    "-p",
    eve_pass,
    "ssh",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "PreferredAuthentications=password",
    "-o",
    "PubkeyAuthentication=no",
  ]

  base_scp = [
    "sshpass",
    "-p",
    eve_pass,
    "scp",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "PreferredAuthentications=password",
    "-o",
    "PubkeyAuthentication=no",
  ]

  try:
    # Garante diretório remoto
    _update_job(
      job_id,
      phase="copy",
      progress=0,
      message="Criando diretório de destino no EVE...",
    )
    mkdir_cmd = base_ssh + [
      f"{eve_user}@{eve_ip}",
      f"mkdir -p '{install_path}'",
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
      f"{eve_user}@{eve_ip}:{install_path}",
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
      f"{eve_user}@{eve_ip}",
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


@app.route("/install_async", methods=["POST"])
def install_async():
  """
  Inicia a instalação de forma assíncrona e retorna um job_id
  para que o cliente possa acompanhar o progresso.
  """
  data = request.get_json(silent=True) or {}
  image_type = (data.get("type") or "").strip()
  image_id = str(data.get("id") or "").strip()

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
    args=(job_id, image_type, image_id, eve_ip, eve_user, eve_pass),
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
    ),
    200,
  )


if __name__ == "__main__":
  app.run(host="0.0.0.0", port=8080)
