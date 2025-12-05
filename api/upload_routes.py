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

import os
import re
import traceback
from flask import Blueprint, request, jsonify

from config import UPLOAD_FOLDER, DEFAULT_EVE_BASE_DIR
from utils import allowed_file, run_ssh_command, scp_upload

upload_bp = Blueprint("upload", __name__)


@upload_bp.route("/upload", methods=["POST"])
def upload():
    try:
        print("[API] Requisição /upload recebida", flush=True)

        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()
        eve_base_dir = request.form.get("eve_base_dir", "").strip()
        template_name = request.form.get("template_name", "").strip()
        files = request.files.getlist("image")

        print(
            f"[API] Dados recebidos: eve_ip={eve_ip}, eve_user={eve_user}, "
            f"base_dir={eve_base_dir}, template_name={template_name}",
            flush=True,
        )
        print(f"[API] Total de arquivos enviados: {len(files)}", flush=True)

        if not (eve_ip and eve_user and eve_pass and template_name):
            return jsonify(success=False, message="Preencha IP, usuário, senha e template."), 400

        if not eve_base_dir:
            eve_base_dir = DEFAULT_EVE_BASE_DIR

        if not eve_base_dir.startswith("/"):
            return jsonify(success=False, message="Diretório base inválido."), 400

        if not re.match(r"^[A-Za-z0-9._-]+$", template_name):
            return jsonify(
                success=False,
                message="Nome de template inválido. Use apenas letras, números, ponto, hífen e underline.",
            ), 400

        if not files or files[0].filename == "":
            return jsonify(success=False, message="Nenhum arquivo enviado."), 400

        saved_files = []
        for f in files:
            if not f or f.filename == "":
                continue
            if not allowed_file(f.filename):
                return jsonify(
                    success=False,
                    message=f"Extensão inválida em {f.filename}. Use qcow2, img, iso, vmdk.",
                ), 400
            filename = os.path.basename(f.filename)
            local_path = os.path.join(UPLOAD_FOLDER, filename)
            print(f"[API] Salvando arquivo local: {local_path}", flush=True)
            f.save(local_path)
            saved_files.append((local_path, filename))

        if not saved_files:
            return jsonify(success=False, message="Nenhum arquivo válido para upload."), 400

        remote_template_dir = f"{eve_base_dir.rstrip('/')}/{template_name}"
        print(f"[API] Diretório remoto do template: {remote_template_dir}", flush=True)
        errors = []

        # 1) Criar diretório remoto
        rc, out, err = run_ssh_command(
            eve_ip, eve_user, eve_pass, f"mkdir -p '{remote_template_dir}'"
        )
        if rc != 0:
            errors.append({"filename": "(mkdir)", "stdout": out, "stderr": err})
        else:
            # 2) Enviar arquivos via SCP
            for local_path, filename in saved_files:
                remote_path = f"{remote_template_dir}/{filename}"
                print(f"[API] Enviando {local_path} -> {remote_path}", flush=True)
                rc_file, out_file, err_file = scp_upload(
                    eve_ip, eve_user, eve_pass, local_path, remote_path
                )
                if rc_file != 0:
                    errors.append(
                        {"filename": filename, "stdout": out_file, "stderr": err_file}
                    )

        # 3) fixpermissions
        if not errors:
            rc_fix, out_fix, err_fix = run_ssh_command(
                eve_ip,
                eve_user,
                eve_pass,
                "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions",
            )
            if rc_fix != 0:
                errors.append(
                    {"filename": "fixpermissions", "stdout": out_fix, "stderr": err_fix}
                )

        # Limpar arquivos locais
        for local_path, _ in saved_files:
            try:
                if os.path.exists(local_path):
                    print(f"[API] Removendo arquivo local: {local_path}", flush=True)
                    os.remove(local_path)
            except Exception as e:
                print(f"[API] Erro ao remover {local_path}: {e}", flush=True)

        if errors:
            print(f"[API] Erros detectados: {errors}", flush=True)
            return jsonify(
                success=False,
                message="Alguns arquivos falharam ao enviar ou ao executar fixpermissions.",
                errors=errors,
            ), 500

        msg = f"Upload concluído com sucesso de {len(saved_files)} arquivo(s) para '{remote_template_dir}'."
        print(f"[API] {msg}", flush=True)
        return jsonify(
            success=True,
            message=msg,
            errors=[],
        ), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify(
            success=False,
            message=f"Erro interno na API: {str(e)}",
        ), 500
