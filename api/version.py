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
from pathlib import Path


DEFAULT_VERSION = "1.0.0"


def get_app_version():
    """
    Retorna a versão atual do projeto no formato SemVer (x.y.z).

    Ordem de prioridade:
    1) env var APP_VERSION
    2) arquivo VERSION no container (/app/VERSION) ou repo (../VERSION)
    3) DEFAULT_VERSION
    """
    env_version = (os.getenv("APP_VERSION") or "").strip()
    if env_version:
        return env_version

    candidates = [
        Path(__file__).resolve().parent / "VERSION",
        Path(__file__).resolve().parent.parent / "VERSION",
        Path("/app/VERSION"),
        Path.cwd() / "VERSION",
    ]

    for path in candidates:
        try:
            if path.exists():
                return path.read_text(encoding="utf-8").strip() or DEFAULT_VERSION
        except Exception:
            continue

    return DEFAULT_VERSION

