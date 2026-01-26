![Logo-NetConfig-Lab-Image-Manager](web/static/img/netconfig-lab-logo.png)

# NetConfig Lab Image Manager
Esse é um projeto OpenSource desenvolvido pela equipe do [NetConfig](https://netconfig.com.br/), software de automação de redes.
Quer saber mais sobre o NetConfig? Entre já e conheça!

O NetConfig - Lab Image Manager é um projeto que vem com a intenção de auxiliar aqueles que estudam redes, tirando a complexidade para subir imagens em laboratórios (EVE-NG / PNETLAB / ContainerLab) de forma que o usuário possa focar no seu estudo.

Não tente instalar direto no EVE/PNETLAB!  A instalação é para ser em uma VM separada!

Suporta EVE-NG, PNETLAB e ContainerLab (em desenvolvimento) :)

![ScreenShot](images/screenshot-lab-image-manager.png)


## Features:

- Upload de imagens;
- Upload de templates .yaml;
- Upload de icones;
- Auto instalação de imagens no EVE-NG (iShare2 embarcado).
- Suporte a ContainerLab: aba VRNETLAB (build/clone), aba Container Images (docker/podman) e aba Laboratórios para listar/editar labs em `/opt/containerlab/labs`.

### iShare2

Este projeto utiliza o [iShare2](https://ishare2.sh/), projeto open source para automatizar downloads e instalações de imagens no EVE-NG/PNETLab. O NetConfig Lab Image Manager embarca a versão CLI do iShare2 dentro da plataforma para o download das imagens.

## Instalação do NetConfig Lab Image Manager

### 1. Instalar dependências

No Debian 12 ou 13:

```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh

git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
```

## Testes unitários

Os testes unitários ficam em `tests/` e usam `unittest` (stdlib do Python).

Para rodar localmente:
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

---

## Español

### Funciones
- Carga de imágenes (qcow2, img, iso, vmdk) con barra de progreso
- Carga/listado/carga en vivo de plantillas YAML
- Carga/listado de íconos
- Instalación automática de imágenes con el CLI de iShare2 integrado
- Soporte a ContainerLab: VRNETLAB, imágenes de contenedor (docker/podman) y pestaña de laboratorios en `/opt/containerlab/labs`.

### Versión

Este proyecto usa **SemVer** (`x.y.z`).

- Versión actual: `1.0.7` (archivo `VERSION`)
- Ver en el repo: `cat VERSION`
- Ver por la aplicación (vía Nginx): `curl -s http://localhost:8080/api/version`

### Sobre iShare2
El proyecto integra el CLI de [iShare2](https://ishare2.sh/) para automatizar descargas e instalaciones de imágenes en EVE-NG/PNETLab.

### Instalación
Probado en Debian 12/13.
```bash
apt-get update
apt-get install curl -y
curl -fsSL https://get.docker.com | sh

git clone https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git /opt/netconfig-lab-image-manager
cd /opt/netconfig-lab-image-manager
docker compose up -d --build
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
