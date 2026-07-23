FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY hf-collector.js .

CMD ["node", "hf-collector.js"]
