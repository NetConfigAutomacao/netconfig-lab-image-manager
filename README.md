# NetConfig Lab Image Manager
Esse é um projeto OpenSource desenvolvido pela equipe do [NetConfig](https://netconfig.com.br/), software de automação de redes.
Quer saber mais sobre o NetConfig? Entre já e conheça!

O NetConfig - Lab Image Manager é um projeto que vem com a intenção de auxiliar aqueles que estudam redes, tirando a complexidade para subir imagens em laboratorios (EVE-NG / PNETLAB) de forma que o usuario possa focar no seu estudo.

Ah, suporta tanto EVE-NG, quanto PNETLAB :)

![ScreenShot](images/screenshot-lab-image-manager.png)



## Features:

- Upload de imagens;
- Upload de templates .yaml;
- Upload de icones;
- Auto instalação de imagens no EVE-NG (iShare2 embarcado).

### iShare2

Este projeto utiliza o [iShare2](https://ishare2.sh/), projeto open source para automatizar downloads e instalações de imagens no EVE-NG/PNETLab. O NetConfig Lab Image Manager embarca a versão CLI do iShare2 dentro da plataforma para o download das imagens.

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

### 4. Habilitar IPv6 na aplicação:

O compose cria a rede `eveng-net` com IPv6 (`fd00:dead:beef::/64`), mas o daemon do Docker precisa estar com IPv6 ligado antes de subir os containers:

1. Crie/edite `/etc/docker/daemon.json` habilitando IPv6:

```json
{
  "experimental": true,
  "ip6tables": true
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
