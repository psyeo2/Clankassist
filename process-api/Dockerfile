FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM deps AS production-deps

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=build /app/dist ./dist

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/api/v' + process.env.API_VERSION + '/ping') \
    .then(r => process.exit(r.ok ? 0 : 1)) \
    .catch(() => process.exit(1))"