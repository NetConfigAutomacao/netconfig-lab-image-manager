# NetConfig Lab Image Manager

![ScreenShot](images/screenshot-lab-image-manager.png)

Suporta tanto EVE-NG, quanto PNETLAB :)

## Features:

- Upload de imagens;
- Upload de templates .yaml;
- Upload de icones;
- Auto instalação de imagens no EVE-NG (iShare2 embarcado).

## Instalação do NetConfig Lab Image Manager

### 1. Instalar dependências

No Debian 12 ou 13:

```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh
```

### 2. Clonar o repositório

```bash
git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
```

### 3. Iniciar o sistema

```bash
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
```

### 4. Habilitar IPv6 (containers com endereços v6)

O compose cria a rede `eveng-net` com IPv6 (`fd00:dead:beef::/64`), mas o daemon do Docker precisa estar com IPv6 ligado antes de subir os containers:

1. Crie/edite `/etc/docker/daemon.json` habilitando IPv6:

```json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00:dead:beef::/48"
}
```

2. Reinicie o serviço Docker:

```bash
systemctl restart docker
```

3. Recrie a stack para que a rede receba IPv6 (remova a rede antiga se existir):

```bash
docker compose down
docker network rm netconfig-lab-image-manager_eveng-net 2>/dev/null || true
docker compose up -d --build
```

> O nome padrão da rede é `<diretorio>_eveng-net` (ex.: `eve-image-manager_eveng-net`). Ajuste o comando acima conforme seu diretório. Também altere o prefixo IPv6 em `docker-compose.yml` se `fd00:dead:beef::/64` conflitar com sua rede.

### 5. Alterar porta (opcional)

Caso precise modificar a porta de acesso, edite o arquivo docker-compose.yml e ajuste o mapeamento de porta, por exemplo:

```bash
ports:
  - "80:8080"
```
