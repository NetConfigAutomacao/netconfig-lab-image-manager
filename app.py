import os
import re
import subprocess
from flask import Flask, request, render_template, jsonify

# Pasta para armazenar uploads temporários dentro do container
UPLOAD_FOLDER = "/tmp/eve_uploads"
ALLOWED_EXTENSIONS = {"qcow2", "img", "iso", "vmdk"}
DEFAULT_EVE_BASE_DIR = "/opt/unetlab/addons/qemu"

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
)
app.secret_key = "troque-essa-chave"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def run_ssh_command(eve_ip: str, eve_user: str, eve_pass: str, command: str):
    """
    Executa um comando no EVE-NG via sshpass + ssh.
    Retorna (rc, stdout, stderr).
    """
    ssh_cmd = [
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
        f"{eve_user}@{eve_ip}",
        command,
    ]

    proc = subprocess.Popen(
        ssh_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = proc.communicate()
    return proc.returncode, stdout, stderr


def scp_upload(
    eve_ip: str,
    eve_user: str,
    eve_pass: str,
    local_path: str,
    remote_path: str,
):
    """
    Envia um arquivo local para o EVE-NG via sshpass + scp.
    Retorna (rc, stdout, stderr).
    """
    scp_cmd = [
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
        local_path,
        f"{eve_user}@{eve_ip}:{remote_path}",
    ]

    proc = subprocess.Popen(
        scp_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = proc.communicate()
    return proc.returncode, stdout, stderr


@app.route("/", methods=["GET", "POST"])
def upload():
    if request.method == "GET":
        return render_template("index.html")

    eve_ip = request.form.get("eve_ip", "").strip()
    eve_user = request.form.get("eve_user", "").strip()
    eve_pass = request.form.get("eve_pass", "").strip()
    eve_base_dir = request.form.get("eve_base_dir", "").strip()
    template_name = request.form.get("template_name", "").strip()
    files = request.files.getlist("image")

    # Validações básicas
    if not (eve_ip and eve_user and eve_pass and template_name):
        return (
            jsonify(success=False, message="Preencha IP, usuário, senha e nome do template."),
            400,
        )

    if not eve_base_dir:
        eve_base_dir = DEFAULT_EVE_BASE_DIR

    if not eve_base_dir.startswith("/"):
        return jsonify(success=False, message="Diretório base inválido."), 400

    if not re.match(r"^[A-Za-z0-9._-]+$", template_name):
        return (
            jsonify(
                success=False,
                message="Nome de template inválido. Use apenas letras, números, ponto, hífen e underline.",
            ),
            400,
        )

    if not files or files[0].filename == "":
        return jsonify(success=False, message="Nenhum arquivo enviado."), 400

    # Salva arquivos localmente no container
    saved_files = []
    for f in files:
        if not f or f.filename == "":
            continue
        if not allowed_file(f.filename):
            return (
                jsonify(
                    success=False,
                    message=f"Extensão inválida em {f.filename}. Use qcow2, img, iso ou vmdk.",
                ),
                400,
            )
        filename = os.path.basename(f.filename)
        local_path = os.path.join(UPLOAD_FOLDER, filename)
        f.save(local_path)
        saved_files.append((local_path, filename))

    if not saved_files:
        return jsonify(success=False, message="Nenhum arquivo válido para upload."), 400

    # Caminho remoto do template no EVE
    remote_template_dir = f"{eve_base_dir.rstrip('/')}/{template_name}"

    errors = []

    # 1) Cria diretório remoto para o template
    rc, out, err = run_ssh_command(
        eve_ip,
        eve_user,
        eve_pass,
        f"mkdir -p '{remote_template_dir}'",
    )
    if rc != 0:
        errors.append(
            {
                "filename": "(criação de diretório)",
                "stdout": out,
                "stderr": err,
            }
        )
    else:
        # 2) Envia cada arquivo via scp
        for local_path, filename in saved_files:
            remote_path = f"{remote_template_dir}/{filename}"
            rc_file, out_file, err_file = scp_upload(
                eve_ip,
                eve_user,
                eve_pass,
                local_path,
                remote_path,
            )
            if rc_file != 0:
                errors.append(
                    {
                        "filename": filename,
                        "stdout": out_file,
                        "stderr": err_file,
                    }
                )

    # 3) Executa fixpermissions se não houve erro de upload
    if not errors:
        rc_fix, out_fix, err_fix = run_ssh_command(
            eve_ip,
            eve_user,
            eve_pass,
            "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions",
        )
        if rc_fix != 0:
            errors.append(
                {
                    "filename": "fixpermissions",
                    "stdout": out_fix,
                    "stderr": err_fix,
                }
            )

    # Limpa arquivos locais temporários
    for local_path, _ in saved_files:
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
        except Exception:
            pass

    if errors:
        return (
            jsonify(
                success=False,
                message="Alguns arquivos falharam ao enviar ou ao executar fixpermissions.",
                errors=errors,
            ),
            500,
        )

    return jsonify(
        success=True,
        message=f"Upload concluído com sucesso de {len(saved_files)} arquivo(s) para o template '{template_name}' em '{remote_template_dir}'.",
        errors=[],
    )


if __name__ == "__main__":
    # Dentro do Docker, expõe na porta 8080
    app.run(host="0.0.0.0", port=8080)
