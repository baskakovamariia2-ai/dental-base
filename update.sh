#!/usr/bin/env bash
# Обновление до новой версии из GitHub. Данные в базе сохраняются.
set -euo pipefail
cd /opt/dental-base
git pull --ff-only
# не даём запустить два обновления сразу (на 1 ГБ памяти сервер от этого встаёт)
exec 9>/tmp/dental-update.lock
flock -n 9 || { echo "Обновление уже идёт — дождитесь его окончания"; exit 0; }
# освобождаем место до сборки: старые образы; кэш сборки оставляем до 1,5 ГБ,
# чтобы не скачивать все программы заново, если они не менялись (данные, фото и копии не трогаются)
docker builder prune -f --keep-storage 1500mb >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker compose up -d --build
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -f --keep-storage 1500mb >/dev/null 2>&1 || true
df -h / | tail -1 | awk '{print "Свободно на диске: " $4 " (занято " $5 ")"}'
echo "Обновлено"
