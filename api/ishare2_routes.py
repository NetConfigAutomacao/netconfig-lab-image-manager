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

from __future__ import annotations

import requests
from flask import Blueprint, jsonify, request

from i18n import translate, get_request_lang

ishare2_bp = Blueprint("ishare2_bp", __name__, url_prefix="/ishare2")


@ishare2_bp.route("/search_all", methods=["POST"])
def ishare2_search_all():
    """
    Executa `ishare2 search all` via CLI e retorna a saída como texto.

    Via Nginx: /api/ishare2/search_all
    """
    lang = get_request_lang()
    query = (request.form.get("query") or "").strip()

    payload = {"query": query} if query else {}

    try:
        # O serviço ishare2 roda em um container separado na mesma rede
        # do docker-compose, acessível pelo hostname "ishare2".
        resp = requests.post(
            "http://ishare2:8080/search_all",
            json=payload,
            timeout=300,
        )
    except requests.RequestException as exc:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.contact_error", lang, error=exc),
            ),
            502,
        )

    try:
        data = resp.json()
    except ValueError:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.invalid_json", lang),
                status_code=resp.status_code,
                raw_text=resp.text,
            ),
            502,
        )

    # Propaga o sucesso/erro e payload retornado pelo serviço ishare2,
    # mas sempre respondendo com 200 para o front (que só olha success/message).
    return (
        jsonify(
            success=bool(data.get("success")),
            message=data.get("message", ""),
            output=data.get("output", ""),
            stderr=data.get("stderr", ""),
            sections=data.get("sections", []),
            status_code=resp.status_code,
        ),
        200,
    )


@ishare2_bp.route("/install", methods=["POST"])
def ishare2_install():
    """
    Solicita ao serviço ishare2 que faça o download/instalação
    de uma imagem específica (ishare2 pull <type> <id>).

    Via Nginx: /api/ishare2/install
    """
    lang = get_request_lang()
    image_type = (request.form.get("type") or "").strip()
    image_id = (request.form.get("id") or "").strip()
    image_name = (request.form.get("name") or "").strip()

    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not image_type or not image_id:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.missing_type", lang),
            ),
            400,
        )

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.missing_creds", lang),
            ),
            400,
        )

    payload = {
        "type": image_type,
        "id": image_id,
        "name": image_name,
        "eve_ip": eve_ip,
        "eve_user": eve_user,
        "eve_pass": eve_pass,
    }

    try:
        resp = requests.post(
            "http://ishare2:8080/install",
            json=payload,
            timeout=3600,
        )
    except requests.RequestException as exc:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.install_contact_error", lang, error=exc),
            ),
            502,
        )

    try:
        data = resp.json()
    except ValueError:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.install_invalid_json", lang),
                status_code=resp.status_code,
                raw_text=resp.text,
            ),
            502,
        )

    return (
        jsonify(
            success=bool(data.get("success")),
            message=data.get("message", ""),
            output=data.get("output", ""),
            stderr=data.get("stderr", ""),
            status_code=resp.status_code,
        ),
        200,
    )


@ishare2_bp.route("/install_async", methods=["POST"])
def ishare2_install_async():
    """
    Inicia a instalação via ishare2 em modo assíncrono,
    retornando um job_id para acompanhar o progresso.

    Via Nginx: /api/ishare2/install_async
    """
    lang = get_request_lang()
    image_type = (request.form.get("type") or "").strip()
    image_id = (request.form.get("id") or "").strip()
    image_name = (request.form.get("name") or "").strip()

    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not image_type or not image_id:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.missing_type", lang),
            ),
            400,
        )

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.missing_creds", lang),
            ),
            400,
        )

    payload = {
        "type": image_type,
        "id": image_id,
        "name": image_name,
        "eve_ip": eve_ip,
        "eve_user": eve_user,
        "eve_pass": eve_pass,
    }

    try:
        resp = requests.post(
            "http://ishare2:8080/install_async",
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.install_start_error", lang, error=exc),
            ),
            502,
        )

    try:
        data = resp.json()
    except ValueError:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.install_start_invalid_json", lang),
                status_code=resp.status_code,
                raw_text=resp.text,
            ),
            502,
        )

    return (
        jsonify(
            success=bool(data.get("success")),
            message=data.get("message", ""),
            job_id=data.get("job_id", ""),
            status_code=resp.status_code,
        ),
        200,
    )


@ishare2_bp.route("/install_progress", methods=["GET"])
def ishare2_install_progress():
    """
    Proxy para acompanhar o progresso de um job
    de instalação iniciado via /ishare2/install_async.

    Via Nginx: /api/ishare2/install_progress?job_id=...
    """
    lang = get_request_lang()
    job_id = (request.args.get("job_id") or "").strip()
    if not job_id:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.job_required", lang),
            ),
            400,
        )

    try:
        resp = requests.get(
            "http://ishare2:8080/install_progress",
            params={"job_id": job_id},
            timeout=10,
        )
    except requests.RequestException as exc:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.progress_contact_error", lang, error=exc),
            ),
            502,
        )

    try:
        data = resp.json()
    except ValueError:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.progress_invalid_json", lang),
                status_code=resp.status_code,
                raw_text=resp.text,
            ),
            502,
        )

    # Repassa o conteúdo do job praticamente como veio do serviço ishare2
    return jsonify(data), 200


@ishare2_bp.route("/install_choose", methods=["POST"])
def ishare2_install_choose():
    """
    Envia o nome escolhido pelo usuário para continuar a instalação
    quando o ishare2 precisar de confirmação do diretório.

    Via Nginx: /api/ishare2/install_choose
    """
    lang = get_request_lang()
    job_id = (request.form.get("job_id") or "").strip()
    name = (request.form.get("name") or "").strip()

    if not job_id or not name:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.choose_missing", lang),
            ),
            400,
        )

    payload = {"job_id": job_id, "name": name}

    try:
        resp = requests.post(
            "http://ishare2:8080/install_choose",
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.choose_contact_error", lang, error=exc),
            ),
            502,
        )

    try:
        data = resp.json()
    except ValueError:
        return (
            jsonify(
                success=False,
                message=translate("ishare2.choose_invalid_json", lang),
                status_code=resp.status_code,
                raw_text=resp.text,
            ),
            502,
        )

    return (
        jsonify(
            success=bool(data.get("success")),
            message=data.get("message", ""),
            status_code=resp.status_code,
        ),
        200,
    )
