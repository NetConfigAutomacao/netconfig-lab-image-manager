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

from flask import Flask, jsonify

from upload_routes import upload_bp
from image_routes import images_bp
from templates_routes import templates_bp
from icons_routes import icons_bp
from fix_routes import fix_bp
from ishare2_routes import ishare2_bp


def create_app() -> Flask:
    app = Flask(__name__)

    # IMPORTANTE: sem prefixo "/api" aqui.
    # O Nginx recebe "/api/..." e repassa para o Flask SEM o "/api".
    #
    # /api/upload          -> Flask vê /upload
    # /api/images          -> Flask vê /images
    # /api/templates/*     -> Flask vê /templates/*
    # /api/icons/*         -> Flask vê /icons/*
    # /api/fixpermissions  -> Flask vê /fixpermissions
    app.register_blueprint(upload_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(icons_bp)
    app.register_blueprint(fix_bp)
    app.register_blueprint(ishare2_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify(status="ok"), 200

    return app


app = create_app()

if __name__ == "__main__":
    print("[API] Iniciando servidor Flask na porta 8080...", flush=True)
    app.run(host="0.0.0.0", port=8080)
