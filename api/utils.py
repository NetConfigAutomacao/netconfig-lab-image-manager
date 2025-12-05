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
from typing import Tuple

from config import ALLOWED_EXTENSIONS


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def run_ssh_command(eve_ip: str, eve_user: str, eve_pass: str, command: str) -> Tuple[int, str, str]:
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


def scp_upload(
    eve_ip: str,
    eve_user: str,
    eve_pass: str,
    local_path: str,
    remote_path: str,
) -> Tuple[int, str, str]:
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
