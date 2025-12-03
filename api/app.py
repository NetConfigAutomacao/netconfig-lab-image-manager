import os
import re
import subprocess
import traceback
from flask import Flask, request, jsonify

UPLOAD_FOLDER = "/tmp/eve_uploads"
ALLOWED_EXTENSIONS = {"qcow2", "img", "iso", "vmdk"}
DEFAULT_EVE_BASE_DIR = "/opt/unetlab/addons/qemu"

app = Flask(__name__)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def run_ssh_command(eve_ip: str, eve_user: str, eve_pass: str, command: str):
    cmd = [
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
    print(f"[API] Executando SSH: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = proc.communicate()
    print(f"[API] SSH STDOUT:\n{stdout}", flush=True)
    print(f"[API] SSH STDERR:\n{stderr}", flush=True)
    return proc.returncode, stdout, stderr


def scp_upload(eve_ip: str, eve_user: str, eve_pass: str, local_path: str, remote_path: str):
    cmd = [
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
    print(f"[API] Executando SCP: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = proc.communicate()
    print(f"[API] SCP STDOUT:\n{stdout}", flush=True)
    print(f"[API] SCP STDERR:\n{stderr}", flush=True)
    return proc.returncode, stdout, stderr


@app.route("/upload", methods=["POST"])
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


@app.route("/images", methods=["POST"])
def list_images():
    """
    Lista as imagens já existentes no EVE-NG, olhando:
      - /opt/unetlab/addons/qemu
      - /opt/unetlab/addons/iol/bin
      - /opt/unetlab/addons/dynamips

    Mesmo que o comando SSH retorne RC != 0, usamos o stdout para montar
    a lista. Só registramos erro se tiver stderr "de verdade" (não apenas
    o warning de known_hosts).
    """
    try:
        print("[API] Requisição /images recebida", flush=True)

        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()

        print(f"[API] Dados recebidos para /images: eve_ip={eve_ip}, eve_user={eve_user}", flush=True)

        if not (eve_ip and eve_user and eve_pass):
            return jsonify(success=False, message="Preencha IP, usuário e senha para listar imagens."), 400

        base_dirs = {
            "qemu": "/opt/unetlab/addons/qemu",
            "iol": "/opt/unetlab/addons/iol/bin",
            "dynamips": "/opt/unetlab/addons/dynamips",
        }

        images = {}
        errors = []

        for kind, base_dir in base_dirs.items():
            cmd = (
                f"if [ -d '{base_dir}' ]; then "
                f"cd '{base_dir}' && for d in *; do [ -d \"$d\" ] && echo \"$d\"; done; "
                f"fi"
            )
            print(f"[API] Listando {kind} em {base_dir}", flush=True)
            rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

            # Sempre aproveita o stdout como lista
            entries = [line.strip() for line in out.splitlines() if line.strip()]
            images[kind] = entries

            # Limpa stderr e ignora warning de known_hosts
            cleaned_err = (err or "").strip()
            if cleaned_err:
                # Se for APENAS o warning de "Permanently added", ignora
                # (isso é ruído normal de SSH com host novo)
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

        msg_ok = "Imagens listadas com sucesso."
        if errors:
            msg_ok += " Alguns diretórios retornaram erro, veja detalhes."

        print(f"[API] Resultado /images: {images}", flush=True)
        return jsonify(success=(len(errors) == 0), message=msg_ok, images=images, errors=errors), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify(
            success=False,
            message=f"Erro interno na API ao listar imagens: {str(e)}",
        ), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify(status="ok"), 200


if __name__ == "__main__":
    print("[API] Iniciando servidor Flask na porta 8080...", flush=True)
    app.run(host="0.0.0.0", port=8080)
