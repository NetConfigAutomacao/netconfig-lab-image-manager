# Instalação do EVE-NG Image Manager

## 1. Instalar dependências

No Debian 12 ou 13:

```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh
```

## 2. Clonar o repositório

```bash
git clone https://github.com/andrediashexa/eveng-image-manager.git /opt/eveng-image-manager
```

## 3. Iniciar o sistema

```bash
cd /opt/eveng-image-manager
docker compose up -d --build
```

## 4. Alterar porta (opcional)

Caso precise modificar a porta de acesso, edite o arquivo docker-compose.yml e ajuste o mapeamento de porta, por exemplo:

```bash
ports:
  - "80:8080"
```
