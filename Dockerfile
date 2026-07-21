FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package.json .

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 启动服务
CMD ["npm", "start"]