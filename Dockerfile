FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata curl \
  && rm -rf /var/lib/apt/lists/*

# Сертификаты НУЦ Минцифры — без них сервер не может обращаться к ГигаЧату (ИИ для КТ).
# Если скачать не удалось, приложение всё равно соберётся, просто ИИ покажет ошибку.
RUN mkdir -p /usr/local/share/ru-ca \
  && (curl -fsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt \
      && echo && curl -fsSL https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt) \
     > /usr/local/share/ru-ca/russian.pem \
  || echo "ВНИМАНИЕ: не удалось скачать сертификаты Минцифры"
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ru-ca/russian.pem

ENV TZ=Europe/Moscow
WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# При старте: применить схему БД (без потери данных) и запустить приложение
CMD ["npm", "start"]
