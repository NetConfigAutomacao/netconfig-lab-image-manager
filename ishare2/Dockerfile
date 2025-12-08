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

FROM debian:12

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
  apt-get install -y \
  git \
  curl \
  wget \
  jq \
  sshpass \
  openssh-client \
  python3 \
  python3-pip \
  tree \
  unzip \
  unrar-free \
  ca-certificates \
  bsdextrautils \
  bsdmainutils \
  && rm -rf /var/lib/apt/lists/*

# Alias unrar -> unrar-free
RUN ln -s /usr/bin/unrar-free /usr/local/bin/unrar || true

WORKDIR /opt/

# entrypoint customizado
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

#Clona o repositorio
RUN git clone https://github.com/andrediashexa/ishare2-cli.git
RUN chmod +x /opt/ishare2-cli/ishare2
RUN /opt/ishare2-cli/ishare2

RUN pip3 install --no-cache-dir flask --break-system-packages

COPY api.py /opt/ishare2-api.py

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python3", "/opt/ishare2-api.py"]
