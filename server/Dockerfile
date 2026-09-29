# Built from the repository root (see /railway.json), so paths are prefixed with server/.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/src ./src

EXPOSE 4000
CMD ["node", "--no-warnings", "src/index.js"]
