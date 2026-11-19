# InterviewOS backend image (API and worker share it). Build from the repository root:
#   docker build -f infrastructure/deployment/backend.Dockerfile -t interviewos-backend .
FROM node:22-bookworm-slim AS build
WORKDIR /workspace/backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY database/prisma /workspace/database/prisma
COPY backend/ ./
RUN npx prisma generate --schema=../database/prisma/schema.prisma && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /workspace/database/prisma /app/database/prisma
COPY --from=build --chown=node:node /workspace/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/backend/dist ./dist
COPY --from=build --chown=node:node /workspace/backend/prisma ./prisma
COPY --from=build --chown=node:node /workspace/backend/package.json ./package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
