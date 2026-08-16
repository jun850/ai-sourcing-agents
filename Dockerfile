# Multi-stage build for Node.js marketplace app
# Stage 1: Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run bundle:all

# Stage 3: Runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8090

# Copy production dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built app and essential files from stage 2
COPY --from=build /app/package.json ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/js ./js
COPY --from=build /app/index.html ./
COPY --from=build /app/pages ./pages
COPY --from=build /app/css ./css
COPY --from=build /app/intools ./intools
COPY --from=build /app/categories ./categories
COPY --from=build /app/assets ./assets

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8090', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 8090

CMD ["node", "scripts/local-server.js"]
