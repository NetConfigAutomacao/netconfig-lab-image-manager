# Changelog

Este projeto segue **SemVer** (x.y.z).

## 1.0.2

- Suporte inicial ao VRNETLAB em hosts ContainerLab, com detecção do diretório /opt/vrnetlab e instalação automática via git clone quando ausente.

## 1.0.3

- Nova aba "Container Images" para hosts ContainerLab, listando automaticamente imagens Docker/Podman.
- VRNETLAB e Container Images auto-carregam ao detectar ContainerLab; iShare2, Images, Templates e Icons são ocultadas nesse cenário.
- Caminho padrão do VRNETLAB ajustado para /opt/containerlab/vrnetlab sem fallback.

## 1.0.4

- Aba "Laboratórios" exclusiva para ContainerLab, listando automaticamente os diretórios em /opt/containerlab/labs.
- Carregamento automático de Container Images, VRNETLAB e Laboratórios ao identificar ContainerLab.

## 1.0.0

- Release inicial do NetConfig Lab Image Manager.

## 1.0.1

- Adiciona testes unitários iniciais (unittest) e melhora compatibilidade do módulo i18n para uso fora do Flask.
