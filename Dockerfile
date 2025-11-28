FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

# Dependências básicas para SSH e Ansible usar senha
RUN apt-get update && apt-get install -y --no-install-recommends \
    sshpass openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o resto da aplicação para dentro da imagem
COPY . /app

EXPOSE 8080

CMD ["python", "app.py"]
