FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

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
