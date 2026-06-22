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

"""Camada de segurança da aplicação: login por sessão, CSRF e cabeçalhos.

Ativada quando a variável de ambiente APP_PASSWORD está definida. Sem ela, a
aplicação roda em "modo aberto" (compatível com instalações existentes) e o
front-end exibe um aviso de insegurança.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time

from flask import jsonify, request, session

# Caminhos liberados sem autenticação (o Nginx remove o prefixo /api).
_PUBLIC_PATHS = {"/health", "/version", "/update", "/auth/login", "/auth/status", "/auth/logout"}
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# Rate-limit simples de login, por IP (janela deslizante grosseira).
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_LOCK = threading.Lock()
_MAX_ATTEMPTS = 8
_WINDOW_SECONDS = 300


def app_password() -> str:
    return (os.environ.get("APP_PASSWORD") or "").strip()


def auth_enabled() -> bool:
    return bool(app_password())


def session_secret() -> str:
    """Segredo de sessão estável: APP_SECRET_KEY, senão derivado de APP_PASSWORD,
    senão aleatório (sessões não sobrevivem a restart — só relevante sem auth)."""
    env = (os.environ.get("APP_SECRET_KEY") or "").strip()
    if env:
        return env
    pw = app_password()
    if pw:
        return hashlib.sha256(("ncf-secret:" + pw).encode("utf-8")).hexdigest()
    return secrets.token_hex(32)


def _check_password(candidate: str) -> bool:
    expected = app_password()
    if not expected:
        return False
    return hmac.compare_digest(candidate or "", expected)


def _rate_limited(ip: str) -> bool:
    now = time.time()
    with _LOGIN_LOCK:
        attempts = [t for t in _LOGIN_ATTEMPTS.get(ip, []) if now - t < _WINDOW_SECONDS]
        _LOGIN_ATTEMPTS[ip] = attempts
        return len(attempts) >= _MAX_ATTEMPTS


def _record_attempt(ip: str) -> None:
    with _LOGIN_LOCK:
        _LOGIN_ATTEMPTS.setdefault(ip, []).append(time.time())


def _ensure_csrf() -> str:
    token = session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf"] = token
    return token


def _is_authed() -> bool:
    return bool(session.get("authed"))


def register_security(app) -> None:
    """Instala login/logout/status, o guard before_request e os headers."""
    app.secret_key = session_secret()
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # Secure só quando atrás de HTTPS; configurável por env.
        SESSION_COOKIE_SECURE=(os.environ.get("APP_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}),
    )

    @app.route("/auth/status", methods=["GET"])
    def auth_status():
        enabled = auth_enabled()
        authed = (not enabled) or _is_authed()
        body = {"enabled": enabled, "authed": authed, "insecure": not enabled}
        if authed:
            body["csrf"] = _ensure_csrf()
        return jsonify(body), 200

    @app.route("/auth/login", methods=["POST"])
    def auth_login():
        if not auth_enabled():
            return jsonify(success=True, enabled=False, csrf=_ensure_csrf()), 200
        ip = request.headers.get("X-Real-IP") or request.remote_addr or "?"
        if _rate_limited(ip):
            return jsonify(success=False, message="too_many_attempts"), 429
        password = (request.form.get("password") or "").strip()
        if not _check_password(password):
            _record_attempt(ip)
            return jsonify(success=False, message="invalid_password"), 401
        session.clear()
        session["authed"] = True
        token = _ensure_csrf()
        return jsonify(success=True, csrf=token), 200

    @app.route("/auth/logout", methods=["POST"])
    def auth_logout():
        session.clear()
        return jsonify(success=True), 200

    @app.before_request
    def _guard():
        path = request.path or "/"
        if path in _PUBLIC_PATHS or path.startswith("/static"):
            return None
        if not auth_enabled():
            return None  # modo aberto
        if not _is_authed():
            return jsonify(success=False, message="unauthorized"), 401
        # CSRF para métodos que alteram estado.
        if request.method not in _SAFE_METHODS:
            sent = request.headers.get("X-CSRF-Token") or ""
            expected = session.get("csrf") or ""
            if not expected or not hmac.compare_digest(sent, expected):
                return jsonify(success=False, message="csrf_failed"), 403
        return None

    @app.after_request
    def _headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'",
        )
        return response
