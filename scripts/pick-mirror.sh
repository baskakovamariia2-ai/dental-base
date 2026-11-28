#!/bin/sh
# Выбор, откуда качать программы для сборки.
# Основной сайт npm работает через Cloudflare, а из России крупные файлы оттуда иногда «зависают».
# Пробуем скачать с него файл ~6 МБ; не успел за 25 секунд — берём зеркало registry.npmmirror.com.
T=https://registry.npmjs.org/typescript/-/typescript-5.6.3.tgz
if curl -fsS -o /dev/null --max-time 25 "$T"; then
  echo "npm: основной сайт работает"
  : > /etc/mirror.env
else
  echo "npm: основной сайт тормозит — качаю с зеркала registry.npmmirror.com"
  npm config set registry https://registry.npmmirror.com/
  echo "export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma" > /etc/mirror.env
fi
