# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY src/db/init.sql ./dist/db/init.sql
RUN npm run build
# Ensure SQL is in dist
RUN cp -r src/db/init.sql dist/db/init.sql 2>/dev/null || true

# Stage 2: Production Slim Runtime
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
