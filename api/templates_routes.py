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

from utils import run_ssh_command, scp_upload

TEMPLATES_BASE_DIR_AMD = "/opt/unetlab/html/templates/amd"
TEMPLATES_BASE_DIR_INTEL = "/opt/unetlab/html/templates/intel"

# prefixo /templates aqui
templates_bp = Blueprint("templates_bp", __name__, url_prefix="/templates")


def _sanitize_template_name(name: str) -> str:
    name = (name or "").strip()
    if not name:
        raise ValueError("Nome de template vazio.")

    if not name.lower().endswith(".yml"):
        name = name + ".yml"

    if not re.match(r"^[A-Za-z0-9._-]+\.yml$", name):
        raise ValueError(
            "Nome de template inválido. Use apenas letras, números, ponto, hífen, underline e extensão .yml."
        )

    return name


@templates_bp.route("/get", methods=["POST"])
def get_template():
    try:
        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()
        raw_name = request.form.get("template_name", "").strip()

        if not (eve_ip and eve_user and eve_pass and raw_name):
            return (
                jsonify(
                    success=False,
                    message="Informe IP, usuário, senha e nome do template.",
                ),
                400,
            )

        try:
            template_name = _sanitize_template_name(raw_name)
        except ValueError as exc:
            return jsonify(success=False, message=str(exc)), 400

        search_paths = [
            f"{TEMPLATES_BASE_DIR_AMD}/{template_name}",
            f"{TEMPLATES_BASE_DIR_INTEL}/{template_name}",
        ]

        last_err = ""
        for path in search_paths:
            cmd = f"if [ -f '{path}' ]; then cat '{path}'; fi"
            rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
            if out.strip():
                return (
                    jsonify(
                        success=True,
                        message=f"Template '{template_name}' carregado de {path}.",
                        content=out,
                    ),
                    200,
                )
            last_err = err or last_err

        msg = (
            f"Template '{template_name}' não encontrado em "
            f"{TEMPLATES_BASE_DIR_AMD} ou {TEMPLATES_BASE_DIR_INTEL}."
        )
        return jsonify(success=False, message=msg, stderr=last_err), 404

    except Exception as e:
        traceback.print_exc()
        return (
            jsonify(
                success=False,
                message=f"Erro interno ao buscar template: {str(e)}",
            ),
            500,
        )


@templates_bp.route("/upload", methods=["POST"])
def upload_template():
    try:
        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()
        raw_name = request.form.get("template_name", "").strip()
        content = request.form.get("template_content", "")

        if not (eve_ip and eve_user and eve_pass and raw_name):
            return (
                jsonify(
                    success=False,
                    message="Informe IP, usuário, senha e nome do template.",
                ),
                400,
            )

        if not content.strip():
            return (
                jsonify(
                    success=False,
                    message="Conteúdo do template não pode estar vazio.",
                ),
                400,
            )

        try:
            template_name = _sanitize_template_name(raw_name)
        except ValueError as exc:
            return jsonify(success=False, message=str(exc)), 400

        tmp_dir = "/tmp/eve_templates"
        os.makedirs(tmp_dir, exist_ok=True)
        local_path = os.path.join(tmp_dir, template_name)

        with open(local_path, "w", encoding="utf-8") as f:
            f.write(content)

        targets = [
            f"{TEMPLATES_BASE_DIR_AMD}/{template_name}",
            f"{TEMPLATES_BASE_DIR_INTEL}/{template_name}",
        ]

        errors = []

        for target in targets:
            rc, out, err = scp_upload(
                eve_ip, eve_user, eve_pass, local_path, target
            )
            if rc != 0:
                errors.append(
                    {
                        "target": target,
                        "step": "scp",
                        "stdout": out,
                        "stderr": err,
                    }
                )

        try:
            if os.path.exists(local_path):
                os.remove(local_path)
        except Exception as cleanup_err:
            print(f"[TEMPLATES] Erro ao remover {local_path}: {cleanup_err}", flush=True)

        if errors:
            return (
                jsonify(
                    success=False,
                    message="Falha ao enviar template para um ou mais destinos.",
                    errors=errors,
                ),
                500,
            )

        return (
            jsonify(
                success=True,
                message=(
                    f"Template '{template_name}' enviado com sucesso para "
                    f"{TEMPLATES_BASE_DIR_AMD} e {TEMPLATES_BASE_DIR_INTEL}."
                ),
                errors=[],
            ),
            200,
        )

    except Exception as e:
        traceback.print_exc()
        return (
            jsonify(
                success=False,
                message=f"Erro interno ao enviar template: {str(e)}",
            ),
            500,
        )


@templates_bp.route("/list", methods=["POST"])
def list_templates():
    try:
        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()

        if not (eve_ip and eve_user and eve_pass):
            return (
                jsonify(
                    success=False,
                    message="Informe IP, usuário e senha para listar templates.",
                ),
                400,
            )

        dirs = {
            "amd": TEMPLATES_BASE_DIR_AMD,
            "intel": TEMPLATES_BASE_DIR_INTEL,
        }

        templates = {"amd": [], "intel": [], "all": []}
        errors = []
        all_names = set()

        for kind, base_dir in dirs.items():
            cmd = (
                f"if [ -d '{base_dir}' ]; then "
                f"cd '{base_dir}' && "
                f"for f in *.yml; do [ -f \"$f\" ] && echo \"$f\"; done; "
                f"fi"
            )
            rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

            entries = [line.strip() for line in out.splitlines() if line.strip()]
            templates[kind] = sorted(set(entries))
            for name in entries:
                all_names.add(name)

            cleaned_err = (err or "").strip()
            if cleaned_err:
                warning_phrase = "Permanently added"
                only_warning = (
                    warning_phrase in cleaned_err
                    and all(
                        (not line.strip()) or (warning_phrase in line)
                        for line in cleaned_err.splitlines()
                    )
                )
                if not only_warning:
                    errors.append(
                        {
                            "context": kind,
                            "stderr": cleaned_err,
                        }
                    )

        templates["all"] = sorted(all_names)

        msg = "Templates listados com sucesso."
        if errors:
            msg += " Alguns diretórios retornaram erro, veja detalhes."

        return (
            jsonify(
                success=(len(errors) == 0),
                message=msg,
                templates=templates,
                errors=errors,
            ),
            200,
        )

    except Exception as e:
        traceback.print_exc()
        return (
            jsonify(
                success=False,
                message=f"Erro interno ao listar templates: {str(e)}",
            ),
            500,
        )
