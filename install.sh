#!/usr/bin/env bash
# Dental Base — установка на чистый сервер Ubuntu одной командой.
# Использование: curl -fsSL https://raw.githubusercontent.com/<ЛОГИН>/dental-base/main/install.sh | bash -s <ЛОГИН>
set -euo pipefail

GH_USER="${1:?Укажите логин GitHub}"
APP_DIR=/opt/dental-base
LOG=/var/log/dental-install.log
exec > >(tee -a "$LOG") 2>&1

echo "== Dental Base: установка начата $(date) =="

# 1. Файл подкачки (нужен для сборки на сервере с 1 ГБ памяти)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Docker и git
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y git curl ca-certificates openssl
if ! command -v docker >/dev/null; then
  apt-get install -y docker.io docker-compose-v2 || curl -fsSL https://get.docker.com | sh
fi
# Зеркала Docker Hub (прямой доступ из РФ бывает ограничен)
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"registry-mirrors":["https://dockerhub.timeweb.cloud","https://mirror.gcr.io"]}' > /etc/docker/daemon.json
fi
systemctl enable docker && systemctl restart docker

# 3. Код приложения
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "https://github.com/$GH_USER/dental-base.git" "$APP_DIR"
fi
cd "$APP_DIR"

# 4. Настройки: случайный пароль базы и бесплатный адрес с HTTPS
if [ ! -f .env ]; then
  IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_DOMAIN=${IP//./-}.sslip.io
ENV
  chmod 600 .env
fi
mkdir -p backups

# 5. Запуск
docker compose up -d --build

# 6. Простой файрвол: открыты только SSH и веб
if command -v ufw >/dev/null; then
  ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

DOMAIN=$(grep APP_DOMAIN .env | cut -d= -f2)
echo "== Готово! Откройте https://$DOMAIN (первые 1–2 минуты может открываться не сразу) =="
