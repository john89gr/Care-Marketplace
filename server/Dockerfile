# syntax=docker/dockerfile:1

# The API is TypeScript executed by tsx (see the `start` script), and tsx is a
# devDependency — so dev dependencies must be installed. There is no compile
# step: `tsconfig.json` sets noEmit and tsx transpiles on the fly.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# src/ carries schema.sql, which bootstrapDb() applies on boot relative to
# __dirname; the demo seed then runs (idempotent) before the server listens.
COPY tsconfig.json ./
COPY src ./src

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=12 \
  CMD wget -q -O /dev/null http://localhost:3000/api/health || exit 1

# Exec form so tsx receives SIGTERM directly and index.ts can drain + close
# the connection pool on shutdown.
CMD ["npm", "start"]
