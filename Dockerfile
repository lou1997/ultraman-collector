FROM node:20-alpine

WORKDIR /app

# 复制文件
COPY hf-package.json package.json
COPY hf-collector.js .

# 安装依赖（这个项目没有外部依赖，只是确保 package.json 有效）
RUN npm install

# 启动服务
CMD ["npm", "start"]