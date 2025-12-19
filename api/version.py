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

import time
import requests


DEFAULT_VERSION = "1.0.2"
DEFAULT_GITHUB_REPO = "NetConfigAutomacao/netconfig-lab-image-manager"
UPDATE_CACHE_TTL_SECONDS = 300
_update_cache = {"checked_at": 0.0, "data": None}


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


def _normalize_tag_to_semver(tag: str):
    if not tag:
        return None
    raw = str(tag).strip()
    if raw.startswith("v") or raw.startswith("V"):
        raw = raw[1:]
    raw = raw.split("+", 1)[0]
    raw = raw.split("-", 1)[0]
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    try:
        return tuple(int(p) for p in parts)
    except Exception:
        return None


def _is_newer(latest: str, current: str):
    latest_v = _normalize_tag_to_semver(latest)
    current_v = _normalize_tag_to_semver(current)
    if not latest_v or not current_v:
        return False
    return latest_v > current_v


def get_latest_github_release(repo: str = None):
    repo = (repo or os.getenv("GITHUB_REPO") or DEFAULT_GITHUB_REPO).strip()

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "netconfig-lab-image-manager",
    }
    token = (os.getenv("GITHUB_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    def _get_default_branch():
        meta_url = f"https://api.github.com/repos/{repo}"
        meta_resp = requests.get(meta_url, headers=headers, timeout=6)
        meta_resp.raise_for_status()
        meta = meta_resp.json() or {}
        return (meta.get("default_branch") or "main").strip()

    def _get_version_file(branch: str):
        raw_url = f"https://raw.githubusercontent.com/{repo}/{branch}/VERSION"
        raw_resp = requests.get(raw_url, headers={"User-Agent": headers["User-Agent"]}, timeout=6)
        raw_resp.raise_for_status()
        return (raw_resp.text or "").strip()

    # 1) Prefer "latest release" (GitHub Releases). If the repo has no releases, GitHub returns 404.
    release_url = f"https://api.github.com/repos/{repo}/releases/latest"
    resp = requests.get(release_url, headers=headers, timeout=6)
    if resp.status_code == 404:
        # 2) Fallback to tags when there is no release.
        tags_url = f"https://api.github.com/repos/{repo}/tags?per_page=100"
        tags_resp = requests.get(tags_url, headers=headers, timeout=6)
        tags_resp.raise_for_status()
        tags = tags_resp.json() or []
        best_tag = ""
        best_semver = None
        for entry in tags:
            tag = (entry.get("name") or "").strip()
            semver = _normalize_tag_to_semver(tag)
            if not semver:
                continue
            if best_semver is None or semver > best_semver:
                best_semver = semver
                best_tag = tag

        if not best_tag and tags:
            best_tag = (tags[0].get("name") or "").strip()

        if not best_tag:
            # 3) Last resort: compare against VERSION file on default branch.
            branch = _get_default_branch()
            remote_version = _get_version_file(branch)
            if not _normalize_tag_to_semver(remote_version):
                raise RuntimeError("Nenhuma release/tag encontrada e o arquivo VERSION remoto não é válido.")
            return {
                "repo": repo,
                "tag_name": remote_version,
                "html_url": f"https://github.com/{repo}/blob/{branch}/VERSION",
                "source": "version_file",
            }

        return {
            "repo": repo,
            "tag_name": best_tag,
            "html_url": f"https://github.com/{repo}/tree/{best_tag}",
            "source": "tag",
        }

    resp.raise_for_status()
    data = resp.json() or {}

    tag_name = (data.get("tag_name") or "").strip()
    html_url = (data.get("html_url") or "").strip()
    return {
        "repo": repo,
        "tag_name": tag_name,
        "html_url": html_url,
        "source": "release",
    }


def check_for_update(force: bool = False):
    now = time.time()
    if not force:
        cached = _update_cache.get("data")
        checked_at = float(_update_cache.get("checked_at") or 0.0)
        if cached and (now - checked_at) < UPDATE_CACHE_TTL_SECONDS:
            return {**cached, "cached": True}

    current = get_app_version()
    try:
        latest = get_latest_github_release()
        latest_tag = latest.get("tag_name") or ""
        latest_version = latest_tag.lstrip("vV")
        update_available = _is_newer(latest_tag, current)
        result = {
            "success": True,
            "current_version": current,
            "latest_version": latest_version or latest_tag,
            "update_available": bool(update_available),
            "release_url": latest.get("html_url") or "",
            "repo": latest.get("repo") or "",
            "source": latest.get("source") or "",
            "checked_at": int(now),
            "cached": False,
        }
    except requests.HTTPError as e:
        msg = str(e)
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status == 404:
            msg = (
                "Não encontrei releases/tags e o arquivo VERSION não existe no GitHub ainda. "
                "Crie uma tag (ex: v1.0.0) ou faça push do arquivo VERSION no branch padrão."
            )
        result = {
            "success": False,
            "current_version": current,
            "latest_version": "",
            "update_available": False,
            "release_url": "",
            "repo": (os.getenv("GITHUB_REPO") or DEFAULT_GITHUB_REPO).strip(),
            "error": msg,
            "checked_at": int(now),
            "cached": False,
        }
    except Exception as e:
        result = {
            "success": False,
            "current_version": current,
            "latest_version": "",
            "update_available": False,
            "release_url": "",
            "repo": (os.getenv("GITHUB_REPO") or DEFAULT_GITHUB_REPO).strip(),
            "error": str(e),
            "checked_at": int(now),
            "cached": False,
        }

    _update_cache["checked_at"] = now
    _update_cache["data"] = result
    return result
