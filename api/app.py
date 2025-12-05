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
from images_routes import images_bp


def create_app() -> Flask:
    app = Flask(__name__)

    # Blueprints
    app.register_blueprint(upload_bp)
    app.register_blueprint(images_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify(status="ok"), 200

    return app


app = create_app()

if __name__ == "__main__":
    print("[API] Iniciando servidor Flask na porta 8080...", flush=True)
    app.run(host="0.0.0.0", port=8080)
