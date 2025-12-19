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

import subprocess


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


def detect_platform(eve_ip: str, eve_user: str, eve_pass: str):
    """
    Detecta se o host é EVE-NG, PNETLab ou ContainerLab lendo /etc/issue
    (ou arquivos/comandos relacionados).
    Retorna (name, raw_output, source_file).
    name: "eve-ng" | "pnetlab" | "containerlab" | "unknown"
    """
    detect_cmd = (
        "if [ -f /etc/issue ]; then "
        "echo '---FILE:/etc/issue---'; cat /etc/issue; "
        "fi; "
        "if [ -f /etc/pnetlab-release ]; then "
        "echo '---FILE:/etc/pnetlab-release---'; cat /etc/pnetlab-release; "
        "fi"
        "; "
        # ContainerLab (https://containerlab.dev/) costuma instalar um binário `containerlab`
        # em /usr/bin ou /usr/local/bin, e pode ter service unit em systemd.
        "if command -v containerlab >/dev/null 2>&1; then "
        "echo '---BIN:containerlab---'; command -v containerlab; "
        "echo '---CMD:containerlab version---'; containerlab version 2>/dev/null || true; "
        "fi; "
        "if [ -f /etc/containerlab/version ]; then "
        "echo '---FILE:/etc/containerlab/version---'; cat /etc/containerlab/version; "
        "fi; "
        "if [ -f /etc/systemd/system/containerlab.service ] || [ -f /lib/systemd/system/containerlab.service ]; then "
        "echo '---UNIT:containerlab.service---'; "
        "fi"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, detect_cmd)
    raw = (out or "").strip()
    content_lower = raw.lower()

    if "eve-ng" in content_lower or "eve ng" in content_lower:
        return "eve-ng", raw, "/etc/issue"
    if "pnetlab" in content_lower or "pnet lab" in content_lower:
        return "pnetlab", raw, "/etc/pnetlab-release or /etc/issue"
    if "containerlab" in content_lower:
        return (
            "containerlab",
            raw,
            "containerlab binary (/usr/bin|/usr/local/bin), /etc/containerlab, or systemd unit",
        )

    return "unknown", raw, "/etc/issue"


def get_resource_usage(eve_ip: str, eve_user: str, eve_pass: str):
    """
    Captura uso de CPU, RAM e disco no host remoto.
    Retorna dict com keys: cpu_percent, mem_total, mem_used, mem_free, mem_percent, disk_total, disk_used, disk_free, disk_percent.
    """
    cmd = (
        # CPU com média de 1s usando /proc/stat
        "read _ u1 n1 s1 i1 w1 q1 sq1 st1 _ < /proc/stat;"
        "sleep 1;"
        "read _ u2 n2 s2 i2 w2 q2 sq2 st2 _ < /proc/stat;"
        "idle=$(( (i2 + w2) - (i1 + w1) ));"
        "nonidle=$(( (u2 - u1) + (n2 - n1) + (s2 - s1) + (q2 - q1) + (sq2 - sq1) + (st2 - st1) ));"
        "total=$(( idle + nonidle ));"
        "cpu=0;"
        "if [ $total -gt 0 ]; then cpu=$(( 100 * nonidle / total )); fi;"
        # Memória
        "read mt mu ma bs <<<$(free -m | awk '/Mem:/ {print $2, $3, $4, $7}') || true;"
        # Disco raiz
        "disk_line=$(df -k / | tail -1) || disk_line='';"
        "dt=$(echo \"$disk_line\" | awk '{print $2}')"
        " du=$(echo \"$disk_line\" | awk '{print $3}')"
        " df=$(echo \"$disk_line\" | awk '{print $4}')"
        " dp=$(echo \"$disk_line\" | awk '{print $5}' | tr -d '%')"
        "; echo \"CPU=$cpu\";"
        " echo \"MEM_TOTAL_MB=$mt\";"
        " echo \"MEM_USED_MB=$mu\";"
        " echo \"MEM_FREE_MB=$ma\";"
        " echo \"DISK_TOTAL_KB=$dt\";"
        " echo \"DISK_USED_KB=$du\";"
        " echo \"DISK_FREE_KB=$df\";"
        " echo \"DISK_PCT=$dp\";"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    result = {
        "cpu_percent": None,
        "mem_total_mb": None,
        "mem_used_mb": None,
        "mem_free_mb": None,
        "mem_percent": None,
        "disk_total_kb": None,
        "disk_used_kb": None,
        "disk_free_kb": None,
        "disk_percent": None,
        "raw": out.strip(),
        "err": err.strip(),
    }
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("CPU="):
            try:
                result["cpu_percent"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("MEM_TOTAL_MB="):
            try:
                result["mem_total_mb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("MEM_USED_MB="):
            try:
                result["mem_used_mb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("MEM_FREE_MB="):
            try:
                result["mem_free_mb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("DISK_TOTAL_KB="):
            try:
                result["disk_total_kb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("DISK_USED_KB="):
            try:
                result["disk_used_kb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("DISK_FREE_KB="):
            try:
                result["disk_free_kb"] = float(line.split("=", 1)[1])
            except Exception:
                pass
        if line.startswith("DISK_PCT="):
            try:
                result["disk_percent"] = float(line.split("=", 1)[1])
            except Exception:
                pass

    # Calcula mem_percent se possível
    try:
        if result["mem_total_mb"] and result["mem_used_mb"] is not None:
            result["mem_percent"] = (result["mem_used_mb"] / result["mem_total_mb"]) * 100
    except Exception:
        pass

    result["ssh_rc"] = rc
    return result


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
