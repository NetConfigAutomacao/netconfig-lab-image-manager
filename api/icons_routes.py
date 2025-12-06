# This file is part of NetConfig Lab Image Manager.
#
# NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# NetConfig Lab Image Manager is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
import io
import paramiko

from config import ICONS_DIR, ICON_ALLOWED_EXT

icons_bp = Blueprint("icons_bp", __name__)


def _get_ssh_client(eve_ip: str, eve_user: str, eve_pass: str) -> paramiko.SSHClient:
  client = paramiko.SSHClient()
  client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
  client.connect(eve_ip, username=eve_user, password=eve_pass, look_for_keys=False)
  return client


@icons_bp.route("/icons/upload", methods=["POST"])
def upload_icons():
  eve_ip = request.form.get("eve_ip", "").strip()
  eve_user = request.form.get("eve_user", "").strip()
  eve_pass = request.form.get("eve_pass", "").strip()

  if not eve_ip or not eve_user or not eve_pass:
    return jsonify(success=False, message="IP, usuário e senha do EVE são obrigatórios."), 400

  files = request.files.getlist("icons")
  if not files:
    return jsonify(success=False, message="Nenhum arquivo de ícone enviado."), 400

  errors = []
  uploaded = []

  try:
    client = _get_ssh_client(eve_ip, eve_user, eve_pass)
    sftp = client.open_sftp()

    for f in files:
      if not f.filename:
        continue

      filename = secure_filename(f.filename)
      ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
      if ext not in ICON_ALLOWED_EXT:
        errors.append(
          {
            "filename": filename,
            "context": "Extensão inválida. Somente PNG é permitido.",
          }
        )
        continue

      remote_path = f"{ICONS_DIR}/{filename}"
      try:
        # faz upload direto do arquivo em memória
        file_data = f.read()
        file_obj = io.BytesIO(file_data)
        sftp.putfo(file_obj, remote_path)
        uploaded.append(filename)
      except Exception as e:
        errors.append(
          {
            "filename": filename,
            "context": "Falha ao enviar para o EVE.",
            "stderr": str(e),
          }
        )

    sftp.close()
    client.close()
  except Exception as e:
    return jsonify(
      success=False,
      message="Erro ao conectar no EVE para envio de ícones.",
      errors=[{"context": "SSH/SFTP", "stderr": str(e)}],
    ), 500

  if uploaded:
    msg = f"Ícones enviados com sucesso: {', '.join(uploaded)}"
    return jsonify(success=True, message=msg, uploaded=uploaded, errors=errors), 200
  else:
    return jsonify(
      success=False,
      message="Nenhum ícone foi enviado com sucesso.",
      errors=errors,
    ), 400


@icons_bp.route("/icons/list", methods=["POST"])
def list_icons():
  eve_ip = request.form.get("eve_ip", "").strip()
  eve_user = request.form.get("eve_user", "").strip()
  eve_pass = request.form.get("eve_pass", "").strip()

  if not eve_ip or not eve_user or not eve_pass:
    return jsonify(success=False, message="IP, usuário e senha do EVE são obrigatórios."), 400

  try:
    client = _get_ssh_client(eve_ip, eve_user, eve_pass)
    sftp = client.open_sftp()

    icons = []
    try:
      for entry in sftp.listdir(ICONS_DIR):
        if entry.lower().endswith(".png"):
          icons.append(entry)
    except IOError:
      # diretório pode não existir
      icons = []

    sftp.close()
    client.close()
  except Exception as e:
    return jsonify(
      success=False,
      message="Erro ao conectar no EVE para listar ícones.",
      errors=[{"context": "SSH/SFTP", "stderr": str(e)}],
    ), 500

  return jsonify(success=True, message="Ícones listados com sucesso.", icons=icons), 200


@icons_bp.route("/icons/raw/<path:icon_name>", methods=["POST"])
def get_icon_raw(icon_name: str):
  """
  Retorna o conteúdo do ícone (PNG) vindo do EVE para poder
  exibir no front-end via <img src="/api/icons/raw/...">.
  """
  eve_ip = request.form.get("eve_ip", "").strip()
  eve_user = request.form.get("eve_user", "").strip()
  eve_pass = request.form.get("eve_pass", "").strip()

  if not eve_ip or not eve_user or not eve_pass:
    return jsonify(success=False, message="IP, usuário e senha do EVE são obrigatórios."), 400

  safe_name = secure_filename(icon_name)
  if not safe_name.lower().endswith(".png"):
    return jsonify(success=False, message="Somente arquivos PNG são permitidos."), 400

  remote_path = f"{ICONS_DIR}/{safe_name}"

  try:
    client = _get_ssh_client(eve_ip, eve_user, eve_pass)
    sftp = client.open_sftp()

    buf = io.BytesIO()
    sftp.getfo(remote_path, buf)
    buf.seek(0)

    sftp.close()
    client.close()
  except Exception as e:
    return jsonify(
      success=False,
      message="Erro ao buscar ícone no EVE.",
      errors=[{"filename": safe_name, "stderr": str(e)}],
    ), 500

  return send_file(buf, mimetype="image/png")
