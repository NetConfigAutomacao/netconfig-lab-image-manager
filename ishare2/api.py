"""
Pequeno wrapper HTTP para expor o comando
`ishare2 search all` via API REST dentro do
container ishare2.
"""

import re
import subprocess

from flask import Flask, jsonify, request

app = Flask(__name__)


_ANSI_ESCAPE_RE = re.compile(r"\x1B[@-_][0-?]*[ -/]*[@-~]")


def _strip_ansi(text: str) -> str:
  if not text:
    return ""
  return _ANSI_ESCAPE_RE.sub("", text)


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

  if rc != 0:
    return (
      jsonify(
        success=False,
        message="Falha ao executar ishare2 search all.",
        output=clean_out,
        stderr=clean_err,
      ),
      500,
    )

  return (
    jsonify(
      success=True,
      message="Resultados obtidos com sucesso do ishare2.",
      output=clean_out,
      stderr=clean_err,
    ),
    200,
  )


if __name__ == "__main__":
  app.run(host="0.0.0.0", port=8080)
