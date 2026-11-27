FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY bench ./bench
COPY web ./web
ENV HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
CMD ["node","src/server.mjs"]
