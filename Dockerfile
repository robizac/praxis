FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

# Healthcheck via Node (a imagem alpine não garante wget/curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Aplica migrações (idempotente) e sobe o servidor web.
CMD ["sh", "-c", "node scripts/migrate.js && node src/http/server.js"]
