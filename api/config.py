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

# Upload temporário local (imagens/ícones, se precisar).
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "/tmp/eve_uploads")
DEFAULT_EVE_BASE_DIR = os.getenv("DEFAULT_EVE_BASE_DIR", "/opt/unetlab/addons/qemu")
ALLOWED_EXTENSIONS = {"qcow2", "img", "iso", "vmdk"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Templates do EVE
TEMPLATES_AMD_DIR = "/opt/unetlab/html/templates/amd"
TEMPLATES_INTEL_DIR = "/opt/unetlab/html/templates/intel"
TEMPLATE_ALLOWED_EXT = {"yml", "yaml"}

# Ícones do EVE
ICONS_DIR = "/opt/unetlab/html/images/icons"
ICON_ALLOWED_EXT = {"png"}
