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

TRANSLATIONS = {
    "pt": {
        "errors.missing_credentials": "Informe IP, usuário e senha do EVE-NG.",
        "errors.missing_template_dir": "Informe o nome do template (diretório).",
        "errors.no_images": "Nenhuma imagem foi enviada.",
        "errors.disallowed_extension": "Extensão não permitida",
        "errors.sftp_failed": "Falha ao enviar via SFTP para o EVE",
        "errors.none_sent": "Nenhuma imagem foi efetivamente enviada para o EVE.",
        "upload.success": "Upload concluído e fixpermissions executado com sucesso.",
        "upload.fix_failed": "Imagens enviadas, mas o comando fixpermissions retornou erro. Verifique os detalhes.",
        "upload.failed": "Falha ao enviar as imagens para o EVE. Veja os detalhes.",
        "upload.unexpected_error": "Erro inesperado ao enviar as imagens para o EVE.",
        "images.missing_creds": "Preencha IP, usuário e senha para listar imagens.",
        "images.success": "Imagens listadas com sucesso.",
        "images.partial_warning": " Alguns diretórios retornaram erro, veja detalhes.",
        "images.internal_error": "Erro interno na API ao listar imagens: {error}",
        "images.invalid_type": "Tipo de imagem inválido.",
        "images.invalid_template": "Nome do template inválido.",
        "images.delete_not_found": "Template '{name}' não encontrado em {path}.",
        "images.delete_fail": "Falha ao remover a imagem. Veja os detalhes.",
        "images.delete_success": "Imagem '{name}' removida com sucesso.",
        "images.delete_fix_warning": " Removido, mas o fixpermissions retornou aviso/erro.",
        "images.delete_internal_error": "Erro interno na API ao remover imagem: {error}",
        "templates.missing_creds": "Informe IP, usuário e senha do EVE-NG.",
        "templates.list_success": "Templates listados com sucesso.",
        "templates.list_error": "Erro ao listar templates: {error}",
        "templates.missing_name": "Informe o nome do arquivo de template.",
        "templates.not_found": "Template '{name}' não encontrado. Erro: {error}",
        "templates.load_success": "Template '{name}' carregado com sucesso.",
        "templates.load_error": "Erro ao buscar template: {error}",
        "templates.empty_content": "Conteúdo do template está vazio.",
        "templates.upload_success": "Template '{name}' enviado e fixpermissions executado com sucesso.",
        "templates.upload_warn": "Template '{name}' enviado, mas ocorreram alguns avisos. Veja os detalhes.",
        "templates.upload_fix_error": "Template '{name}' enviado, porém o fixpermissions retornou erro. Veja os detalhes.",
        "templates.upload_error": "Erro ao enviar template: {error}",
        "icons.missing_creds": "IP, usuário e senha do EVE são obrigatórios.",
        "icons.no_files": "Nenhum arquivo de ícone enviado.",
        "icons.invalid_ext": "Extensão inválida. Somente PNG é permitido.",
        "icons.upload_failed": "Falha ao enviar para o EVE.",
        "icons.connect_upload_error": "Erro ao conectar no EVE para envio de ícones.",
        "icons.upload_success": "Ícones enviados com sucesso: {names}",
        "icons.upload_none": "Nenhum ícone foi enviado com sucesso.",
        "icons.connect_list_error": "Erro ao conectar no EVE para listar ícones.",
        "icons.list_success": "Ícones listados com sucesso.",
        "icons.only_png": "Somente arquivos PNG são permitidos.",
        "icons.fetch_error": "Erro ao buscar ícone no EVE.",
        "fix.success": "fixpermissions executado com sucesso no EVE-NG.",
        "fix.fail": "O comando fixpermissions retornou erro. Verifique os detalhes.",
        "fix.unexpected": "Erro inesperado ao executar fixpermissions.",
        "ishare2.missing_type": "Parâmetros 'type' e 'id' são obrigatórios para instalar uma imagem.",
        "ishare2.missing_creds": "Informe IP, usuário e senha do EVE-NG para instalar a imagem.",
        "ishare2.contact_error": "Falha ao contatar o serviço ishare2: {error}",
        "ishare2.invalid_json": "Resposta inválida do serviço ishare2 (não é JSON).",
        "ishare2.install_contact_error": "Falha ao contatar o serviço ishare2 para instalação: {error}",
        "ishare2.install_invalid_json": "Resposta inválida do serviço ishare2 (não é JSON) ao instalar.",
        "ishare2.install_start_error": "Falha ao contatar o serviço ishare2 para iniciar a instalação: {error}",
        "ishare2.install_start_invalid_json": "Resposta inválida do serviço ishare2 (não é JSON) ao iniciar instalação.",
        "ishare2.job_required": "Parâmetro 'job_id' é obrigatório.",
        "ishare2.progress_contact_error": "Falha ao consultar progresso no serviço ishare2: {error}",
        "ishare2.progress_invalid_json": "Resposta inválida do serviço ishare2 (não é JSON) ao consultar progresso.",
        "vrnetlab.missing_creds": "Informe IP, usuário e senha do host ContainerLab.",
        "vrnetlab.status.ok": "Ambiente VRNETLAB consultado com sucesso.",
        "vrnetlab.status.no_runtime": "Runtime de containers (docker/podman) não encontrado. Instale ou configure para usar VRNETLAB.",
        "vrnetlab.status.no_repo": "Repositório /opt/vrnetlab não encontrado. Você pode instalá-lo pelo botão abaixo.",
        "vrnetlab.status.fail": "Falha ao consultar VRNETLAB (código {rc}).",
        "vrnetlab.install.success": "VRNETLAB instalado em /opt/vrnetlab.",
        "vrnetlab.install.already": "VRNETLAB já está presente em /opt/vrnetlab.",
        "vrnetlab.install.git_missing": "Git não está instalado no host remoto. Instale git para prosseguir com o VRNETLAB.",
        "vrnetlab.install.fail": "Falha ao instalar o VRNETLAB (código {rc}).",
    },
    "en": {
        "errors.missing_credentials": "Provide EVE-NG IP, user and password.",
        "errors.missing_template_dir": "Provide the template name (directory).",
        "errors.no_images": "No image was sent.",
        "errors.disallowed_extension": "Extension not allowed",
        "errors.sftp_failed": "Failed to send via SFTP to EVE",
        "errors.none_sent": "No image was effectively sent to EVE.",
        "upload.success": "Upload completed and fixpermissions executed successfully.",
        "upload.fix_failed": "Images were sent, but the fixpermissions command returned an error. Check the details.",
        "upload.failed": "Failed to send the images to EVE. See the details.",
        "upload.unexpected_error": "Unexpected error while sending images to EVE.",
        "images.missing_creds": "Fill in IP, user and password to list images.",
        "images.success": "Images listed successfully.",
        "images.partial_warning": " Some directories returned errors, see details.",
        "images.internal_error": "Internal API error while listing images: {error}",
        "images.invalid_type": "Invalid image type.",
        "images.invalid_template": "Invalid template name.",
        "images.delete_not_found": "Template '{name}' not found in {path}.",
        "images.delete_fail": "Failed to remove the image. See details.",
        "images.delete_success": "Image '{name}' removed successfully.",
        "images.delete_fix_warning": " Removed, but fixpermissions returned a warning/error.",
        "images.delete_internal_error": "Internal API error while removing image: {error}",
        "templates.missing_creds": "Provide EVE-NG IP, user and password.",
        "templates.list_success": "Templates listed successfully.",
        "templates.list_error": "Error listing templates: {error}",
        "templates.missing_name": "Provide the template filename.",
        "templates.not_found": "Template '{name}' not found. Error: {error}",
        "templates.load_success": "Template '{name}' loaded successfully.",
        "templates.load_error": "Error fetching template: {error}",
        "templates.empty_content": "Template content is empty.",
        "templates.upload_success": "Template '{name}' uploaded and fixpermissions executed successfully.",
        "templates.upload_warn": "Template '{name}' uploaded, but some warnings occurred. See the details.",
        "templates.upload_fix_error": "Template '{name}' uploaded, but fixpermissions returned an error. See the details.",
        "templates.upload_error": "Error uploading template: {error}",
        "icons.missing_creds": "EVE IP, user and password are required.",
        "icons.no_files": "No icon file was sent.",
        "icons.invalid_ext": "Invalid extension. Only PNG is allowed.",
        "icons.upload_failed": "Failed to send to EVE.",
        "icons.connect_upload_error": "Error connecting to EVE to upload icons.",
        "icons.upload_success": "Icons uploaded successfully: {names}",
        "icons.upload_none": "No icon was uploaded successfully.",
        "icons.connect_list_error": "Error connecting to EVE to list icons.",
        "icons.list_success": "Icons listed successfully.",
        "icons.only_png": "Only PNG files are allowed.",
        "icons.fetch_error": "Error fetching icon from EVE.",
        "fix.success": "fixpermissions executed successfully on EVE-NG.",
        "fix.fail": "The fixpermissions command returned an error. Check the details.",
        "fix.unexpected": "Unexpected error while running fixpermissions.",
        "ishare2.missing_type": "Parameters 'type' and 'id' are required to install an image.",
        "ishare2.missing_creds": "Provide EVE-NG IP, user and password to install the image.",
        "ishare2.contact_error": "Failed to contact the ishare2 service: {error}",
        "ishare2.invalid_json": "Invalid response from the ishare2 service (not JSON).",
        "ishare2.install_contact_error": "Failed to contact the ishare2 service for installation: {error}",
        "ishare2.install_invalid_json": "Invalid response from the ishare2 service (not JSON) while installing.",
        "ishare2.install_start_error": "Failed to contact the ishare2 service to start installation: {error}",
        "ishare2.install_start_invalid_json": "Invalid response from the ishare2 service (not JSON) when starting installation.",
        "ishare2.job_required": "Parameter 'job_id' is required.",
        "ishare2.progress_contact_error": "Failed to query progress from the ishare2 service: {error}",
        "ishare2.progress_invalid_json": "Invalid response from the ishare2 service (not JSON) when querying progress.",
        "vrnetlab.missing_creds": "Provide IP, user and password for the ContainerLab host.",
        "vrnetlab.status.ok": "VRNETLAB environment inspected successfully.",
        "vrnetlab.status.no_runtime": "Container runtime (docker/podman) not found. Install or configure one to use VRNETLAB.",
        "vrnetlab.status.no_repo": "Repository /opt/vrnetlab not found. You can install it using the button below.",
        "vrnetlab.status.fail": "Failed to query VRNETLAB (exit code {rc}).",
        "vrnetlab.install.success": "VRNETLAB installed at /opt/vrnetlab.",
        "vrnetlab.install.already": "VRNETLAB is already present at /opt/vrnetlab.",
        "vrnetlab.install.git_missing": "Git is not installed on the remote host. Install git to proceed with VRNETLAB.",
        "vrnetlab.install.fail": "Failed to install VRNETLAB (exit code {rc}).",
    },
    "es": {
        "errors.missing_credentials": "Informa IP, usuario y contraseña del EVE-NG.",
        "errors.missing_template_dir": "Informa el nombre del template (directorio).",
        "errors.no_images": "Ninguna imagen fue enviada.",
        "errors.disallowed_extension": "Extensión no permitida",
        "errors.sftp_failed": "Fallo al enviar vía SFTP al EVE",
        "errors.none_sent": "Ninguna imagen fue enviada efectivamente al EVE.",
        "upload.success": "Carga finalizada y fixpermissions ejecutado con éxito.",
        "upload.fix_failed": "Imágenes enviadas, pero el comando fixpermissions devolvió error. Revisa los detalles.",
        "upload.failed": "Fallo al enviar las imágenes al EVE. Consulta los detalles.",
        "upload.unexpected_error": "Error inesperado al enviar las imágenes al EVE.",
        "images.missing_creds": "Completa IP, usuario y contraseña para listar imágenes.",
        "images.success": "Imágenes listadas con éxito.",
        "images.partial_warning": " Algunos directorios devolvieron error, revisa los detalles.",
        "images.internal_error": "Error interno de la API al listar imágenes: {error}",
        "images.invalid_type": "Tipo de imagen inválido.",
        "images.invalid_template": "Nombre de template inválido.",
        "images.delete_not_found": "Template '{name}' no encontrado en {path}.",
        "images.delete_fail": "No se pudo remover la imagen. Revisa los detalles.",
        "images.delete_success": "Imagen '{name}' removida con éxito.",
        "images.delete_fix_warning": " Removida, pero fixpermissions devolvió advertencia/error.",
        "images.delete_internal_error": "Error interno de la API al remover imagen: {error}",
        "templates.missing_creds": "Informa IP, usuario y contraseña del EVE-NG.",
        "templates.list_success": "Plantillas listadas con éxito.",
        "templates.list_error": "Error al listar plantillas: {error}",
        "templates.missing_name": "Informa el nombre del archivo de plantilla.",
        "templates.not_found": "Plantilla '{name}' no encontrada. Error: {error}",
        "templates.load_success": "Plantilla '{name}' cargada con éxito.",
        "templates.load_error": "Error al buscar plantilla: {error}",
        "templates.empty_content": "El contenido de la plantilla está vacío.",
        "templates.upload_success": "Plantilla '{name}' enviada y fixpermissions ejecutado con éxito.",
        "templates.upload_warn": "Plantilla '{name}' enviada, pero ocurrieron algunos avisos. Revisa los detalles.",
        "templates.upload_fix_error": "Plantilla '{name}' enviada, pero fixpermissions devolvió error. Revisa los detalles.",
        "templates.upload_error": "Error al enviar la plantilla: {error}",
        "icons.missing_creds": "IP, usuario y contraseña del EVE son obligatorios.",
        "icons.no_files": "Ningún archivo de ícono enviado.",
        "icons.invalid_ext": "Extensión inválida. Solo se permite PNG.",
        "icons.upload_failed": "Fallo al enviar al EVE.",
        "icons.connect_upload_error": "Error al conectar al EVE para enviar íconos.",
        "icons.upload_success": "Íconos enviados con éxito: {names}",
        "icons.upload_none": "Ningún ícono fue enviado con éxito.",
        "icons.connect_list_error": "Error al conectar al EVE para listar íconos.",
        "icons.list_success": "Íconos listados con éxito.",
        "icons.only_png": "Solo se permiten archivos PNG.",
        "icons.fetch_error": "Error al buscar ícono en el EVE.",
        "fix.success": "fixpermissions ejecutado con éxito en el EVE-NG.",
        "fix.fail": "El comando fixpermissions devolvió error. Revisa los detalles.",
        "fix.unexpected": "Error inesperado al ejecutar fixpermissions.",
        "ishare2.missing_type": "Los parámetros 'type' e 'id' son obligatorios para instalar una imagen.",
        "ishare2.missing_creds": "Informa IP, usuario y contraseña del EVE-NG para instalar la imagen.",
        "ishare2.contact_error": "Fallo al contactar el servicio ishare2: {error}",
        "ishare2.invalid_json": "Respuesta inválida del servicio ishare2 (no es JSON).",
        "ishare2.install_contact_error": "Fallo al contactar el servicio ishare2 para instalación: {error}",
        "ishare2.install_invalid_json": "Respuesta inválida del servicio ishare2 (no es JSON) al instalar.",
        "ishare2.install_start_error": "Fallo al contactar el servicio ishare2 para iniciar la instalación: {error}",
        "ishare2.install_start_invalid_json": "Respuesta inválida del servicio ishare2 (no es JSON) al iniciar instalación.",
        "ishare2.job_required": "El parámetro 'job_id' es obligatorio.",
        "ishare2.progress_contact_error": "Fallo al consultar progreso en el servicio ishare2: {error}",
        "ishare2.progress_invalid_json": "Respuesta inválida del servicio ishare2 (no es JSON) al consultar progreso.",
        "vrnetlab.missing_creds": "Informa IP, usuario y contraseña del host ContainerLab.",
        "vrnetlab.status.ok": "Entorno VRNETLAB consultado con éxito.",
        "vrnetlab.status.no_runtime": "Runtime de contenedores (docker/podman) no encontrado. Instala o configura uno para usar VRNETLAB.",
        "vrnetlab.status.no_repo": "Repositorio /opt/vrnetlab no encontrado. Puedes instalarlo con el botón abajo.",
        "vrnetlab.status.fail": "Fallo al consultar VRNETLAB (código {rc}).",
        "vrnetlab.install.success": "VRNETLAB instalado en /opt/vrnetlab.",
        "vrnetlab.install.already": "VRNETLAB ya está presente en /opt/vrnetlab.",
        "vrnetlab.install.git_missing": "Git no está instalado en el host remoto. Instala git para continuar con VRNETLAB.",
        "vrnetlab.install.fail": "Fallo al instalar VRNETLAB (código {rc}).",
    },
}


def _normalize_lang(lang: str | None) -> str:
    if not lang:
        return "pt"
    lang = lang.lower()
    if lang.startswith("pt"):
        return "pt"
    if lang.startswith("es"):
        return "es"
    if lang.startswith("en"):
        return "en"
    return "en"


def get_request_lang() -> str:
    # Import local para permitir que este módulo seja importado em contextos
    # fora do Flask (ex.: testes unitários), sem exigir a dependência instalada.
    try:
        from flask import request  # type: ignore
    except Exception:
        return "pt"

    header = request.headers.get("X-Language") or request.headers.get("Accept-Language") or ""
    param = request.values.get("lang") or ""
    candidate = param or header
    return _normalize_lang(candidate)


def translate(key: str, lang: str | None = None, **kwargs) -> str:
    lang_key = _normalize_lang(lang or get_request_lang())
    template = TRANSLATIONS.get(lang_key, {}).get(key) or TRANSLATIONS["en"].get(key) or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template
