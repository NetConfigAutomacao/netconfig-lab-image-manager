![Logo-NetConfig-Lab-Image-Manager](web/static/img/netconfig-lab-logo.png)

# NetConfig Lab Image Manager

Mini-índice: [Português](#pt) | [English](#en) | [Español](#es)

<a id="pt"></a>
## Português

### Sobre o projeto
Esse é um projeto OpenSource desenvolvido pela equipe do [NetConfig](https://netconfig.com.br/), software de automação de redes.
Quer saber mais sobre o NetConfig? Entre já e conheça!

O NetConfig - Lab Image Manager é um projeto que vem com a intenção de auxiliar aqueles que estudam redes, tirando a complexidade para subir imagens em laboratórios (EVE-NG / PNETLAB / ContainerLab) de forma que o usuário possa focar no seu estudo.

Não tente instalar direto no EVE/PNETLAB! A instalação é para ser em uma VM separada!

Suporta EVE-NG, PNETLAB e ContainerLab (em desenvolvimento) :)

![ScreenShot](images/screenshot-lab-image-manager.png)

### Funcionalidades

- Upload de imagens;
- Upload de templates .yaml;
- Upload de ícones;
- Auto instalação de imagens no EVE-NG (iShare2 embarcado).
- Suporte a ContainerLab: aba VRNETLAB (build/clone), aba Container Images (docker/podman) e aba Laboratórios para listar/editar labs em `/opt/containerlab/labs`.

### iShare2

Este projeto utiliza o [iShare2](https://ishare2.sh/), projeto open source para automatizar downloads e instalações de imagens no EVE-NG/PNETLab. O NetConfig Lab Image Manager embarca a versão CLI do iShare2 dentro da plataforma para o download das imagens.

### Instalação do NetConfig Lab Image Manager

#### 1. Instalar dependências

No Debian 12 ou 13:

```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh

git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
```

### Tutorial em vídeo

Assista ao passo a passo completo no YouTube:
https://www.youtube.com/watch?v=BlYUhqPxWuI

[![NetConfig Lab Image Manager - Tutorial de instalação](https://img.youtube.com/vi/BlYUhqPxWuI/hqdefault.jpg)](https://www.youtube.com/watch?v=BlYUhqPxWuI)

### Testes unitários

Os testes unitários ficam em `tests/` e usam `unittest` (stdlib do Python).

Para rodar localmente:
```bash
python3 -m unittest discover -s tests -v
```

### Habilitar IPv6
O compose cria a rede `eveng-net` com IPv6 (`fd00:dead:beef::/64`). O Docker precisa ter IPv6 habilitado antes de subir o stack:
1. Edite `/etc/docker/daemon.json`:
```json
{
  "experimental": true,
  "ip6tables": true
}
```
2. Reinicie o Docker:
```bash
systemctl restart docker
```
3. Recrie o stack (remova a rede antiga se necessário):
```bash
docker compose down
docker network rm netconfig-lab-image-manager_eveng-net 2>/dev/null || true
docker compose up -d --build
```
> O nome padrão da rede é `<dir>_eveng-net` (ex.: `eve-image-manager_eveng-net`). Ajuste os comandos e o prefixo IPv6 se houver conflito com a sua rede.

### Alterar a porta (opcional)
Edite `docker-compose.yml` e ajuste o mapeamento de portas, por exemplo:
```yaml
ports:
  - "80:8080"
```

### Versão

Este projeto usa **SemVer** (`x.y.z`).

- Versão atual: `1.0.7` (arquivo `VERSION`)
- Ver no repo: `cat VERSION`
- Ver pela aplicação (via Nginx): `curl -s http://localhost:8080/api/version`

---

<a id="en"></a>
## English

### About
This is an open-source project developed by the [NetConfig](https://netconfig.com.br/) team, a network automation software.
Want to know more about NetConfig? Visit the website and learn more!

NetConfig Lab Image Manager is intended to help people studying networks by removing the complexity of uploading images to lab environments (EVE-NG / PNETLAB / ContainerLab) so users can focus on their studies.

Do not install directly on EVE/PNETLAB! Installation must be done on a separate VM.

Supports EVE-NG, PNETLAB, and ContainerLab (in development).

![ScreenShot](images/screenshot-lab-image-manager.png)

### Features

- Image uploads;
- YAML template uploads;
- Icon uploads;
- Auto installation of images on EVE-NG (embedded iShare2).
- ContainerLab support: VRNETLAB tab (build/clone), Container Images tab (docker/podman), and Labs tab to list/edit labs in `/opt/containerlab/labs`.

### iShare2

This project uses [iShare2](https://ishare2.sh/), an open-source project to automate downloads and installations of images on EVE-NG/PNETLab. NetConfig Lab Image Manager embeds the iShare2 CLI inside the platform for image downloads.

### Installation

#### 1. Install dependencies

Tested on Debian 12/13:

```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh

git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
```

### Video tutorial

Watch the full step-by-step on YouTube:
https://www.youtube.com/watch?v=BlYUhqPxWuI

[![NetConfig Lab Image Manager - Installation tutorial](https://img.youtube.com/vi/BlYUhqPxWuI/hqdefault.jpg)](https://www.youtube.com/watch?v=BlYUhqPxWuI)

### Unit tests

Unit tests live in `tests/` and use `unittest` (Python stdlib).

To run locally:
```bash
python3 -m unittest discover -s tests -v
```

### Enable IPv6
The compose file creates the `eveng-net` network with IPv6 (`fd00:dead:beef::/64`). Docker must have IPv6 enabled before starting the stack:
1. Edit `/etc/docker/daemon.json`:
```json
{
  "experimental": true,
  "ip6tables": true
}
```
2. Restart Docker:
```bash
systemctl restart docker
```
3. Recreate the stack (remove old network if needed):
```bash
docker compose down
docker network rm netconfig-lab-image-manager_eveng-net 2>/dev/null || true
docker compose up -d --build
```
> The default network name is `<dir>_eveng-net` (e.g., `eve-image-manager_eveng-net`). Adjust commands and IPv6 prefix if it conflicts with your network.

### Change the port (optional)
Edit `docker-compose.yml` and adjust the port mapping, e.g.:
```yaml
ports:
  - "80:8080"
```

### Version

This project uses **SemVer** (`x.y.z`).

- Current version: `1.0.7` (file `VERSION`)
- See in repo: `cat VERSION`
- See via the app (Nginx): `curl -s http://localhost:8080/api/version`

---

<a id="es"></a>
## Español

### Sobre el proyecto
Este es un proyecto open source desarrollado por el equipo de [NetConfig](https://netconfig.com.br/), software de automatización de redes.
¿Quieres saber más sobre NetConfig? ¡Entra al sitio y conoce más!

NetConfig Lab Image Manager tiene como objetivo ayudar a quienes estudian redes, eliminando la complejidad de subir imágenes a laboratorios (EVE-NG / PNETLAB / ContainerLab) para que el usuario pueda enfocarse en su estudio.

¡No intentes instalar directamente en EVE/PNETLAB! La instalación debe realizarse en una VM separada.

Soporta EVE-NG, PNETLAB y ContainerLab (en desarrollo).

![ScreenShot](images/screenshot-lab-image-manager.png)

### Funciones
- Carga de imágenes;
- Carga de plantillas YAML;
- Carga de íconos;
- Instalación automática de imágenes con el CLI de iShare2 integrado.
- Soporte a ContainerLab: VRNETLAB, imágenes de contenedor (docker/podman) y pestaña de laboratorios en `/opt/containerlab/labs`.

### iShare2
El proyecto integra el CLI de [iShare2](https://ishare2.sh/) para automatizar descargas e instalaciones de imágenes en EVE-NG/PNETLab.

### Instalación

#### 1. Instalar dependencias

Probado en Debian 12/13.
```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh

git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
```

### Tutorial en video

Mira el paso a paso completo en YouTube:
https://www.youtube.com/watch?v=BlYUhqPxWuI

[![NetConfig Lab Image Manager - Tutorial de instalación](https://img.youtube.com/vi/BlYUhqPxWuI/hqdefault.jpg)](https://www.youtube.com/watch?v=BlYUhqPxWuI)

### Pruebas unitarias

Las pruebas unitarias están en `tests/` y usan `unittest` (stdlib de Python).

Para ejecutar localmente:
```bash
python3 -m unittest discover -s tests -v
```

### Habilitar IPv6
El compose crea la red `eveng-net` con IPv6 (`fd00:dead:beef::/64`). Activa IPv6 en Docker antes de subir los contenedores:
1. Edita `/etc/docker/daemon.json`:
```json
{
  "experimental": true,
  "ip6tables": true
}
```
2. Reinicia Docker:
```bash
systemctl restart docker
```
3. Recrea el stack (elimina la red vieja si existe):
```bash
docker compose down
docker network rm netconfig-lab-image-manager_eveng-net 2>/dev/null || true
docker compose up -d --build
```
> El nombre por defecto de la red es `<directorio>_eveng-net` (ej.: `eve-image-manager_eveng-net`). Ajusta los comandos y el prefijo IPv6 si hay conflicto con tu red.

### Cambiar el puerto (opcional)
Edita `docker-compose.yml` y ajusta el mapeo de puertos, por ejemplo:
```yaml
ports:
  - "80:8080"
```

### Versión

Este proyecto usa **SemVer** (`x.y.z`).

- Versión actual: `1.0.7` (archivo `VERSION`)
- Ver en el repo: `cat VERSION`
- Ver por la aplicación (vía Nginx): `curl -s http://localhost:8080/api/version`
