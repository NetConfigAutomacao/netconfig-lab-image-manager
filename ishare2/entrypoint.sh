#!/usr/bin/env bash

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

set -e

CONFIG_FILE="/opt/ishare2/cli/ishare2.conf"

echo "[entrypoint] Arquivo de configuração gerado em: $CONFIG_FILE"

cat > "$CONFIG_FILE" <<EOF
# Config gerada automaticamente pelo entrypoint do container

# Não usar aria2c
USE_ARIA2C=false

# Não validar SSL
SSL_CHECK=false

# Sempre usar branch dev
CHANNEL="dev"

# Habilitar rotação de mirrors
ROTATE=true
EOF

# Só tenta copiar se existir
if [ -f /opt/ishare2/cli/sources.list ]; then
  cp /opt/ishare2/cli/sources.list /etc/apt/sources.list
fi

# Se o primeiro argumento for "ishare2", chama o script diretamente
if [ "$1" = "ishare2" ]; then
  shift
  echo "[entrypoint] Executando: ./ishare2 $*"
  cd /opt/ishare2/cli
  exec ./ishare2 "$@"
fi

# Senão, executa o comando original (CMD do Dockerfile ou o que você passou)
exec "$@"
