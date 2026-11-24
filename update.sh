#!/usr/bin/env bash
# Обновление до новой версии из GitHub. Данные в базе сохраняются.
set -euo pipefail
cd /opt/dental-base
git pull --ff-only
# освобождаем место до сборки: старые образы и кэш сборки (данные, фото и резервные копии не трогаются)
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker compose up -d --build
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
df -h / | tail -1 | awk '{print "Свободно на диске: " $4 " (занято " $5 ")"}'
echo "Обновлено"
