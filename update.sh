#!/usr/bin/env bash
# Обновление до новой версии из GitHub. Данные в базе сохраняются.
set -euo pipefail
cd /opt/dental-base
git pull --ff-only
docker compose up -d --build
docker image prune -f
echo "Обновлено"
