# 1. Start from an official Node image (your server needs Node >= 20.12)
FROM node:22-alpine

# 2. Folder inside the container where the app lives
WORKDIR /app

# 3. Copy only the package files first, then install dependencies.
#    Docker caches this step, so rebuilds are fast unless dependencies change.
COPY package*.json ./
RUN npm ci --omit=dev

# 4. Copy the rest of the app (server.js, public/, ...)
COPY . .

# 5. Run in production mode, as the non-root "node" user (safer)
ENV NODE_ENV=production
USER node

# 6. The port the app listens on (documentation only; -p does the real mapping)
EXPOSE 3000

# 7. Start command, the same as "npm start"
CMD ["node", "server.js"]
