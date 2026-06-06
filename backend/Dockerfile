# The API (doc 14.1, 15.0): one container with every module and the background jobs. Built
# from the repository root, because the backend imports shared/:
#   docker build -f backend/Dockerfile -t snackhub-api .
# Settings come from the platform's environment (backend/.env.example lists them); no .env
# file, upload or key is ever copied in (.dockerignore).

FROM node:22-bookworm-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# production packages only; argon2 ships a ready-built binary for this Linux, so no compiler
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
COPY --from=deps /app/backend/node_modules backend/node_modules
COPY backend/package.json backend/
COPY backend/src backend/src
COPY backend/scripts backend/scripts
COPY shared shared
# local storage stays writable for a laptop run; hosted runs use the bucket (STORAGE_DRIVER=s3)
RUN mkdir -p backend/storage && chown node:node backend/storage
# never as root
USER node
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "src/server.js"]
