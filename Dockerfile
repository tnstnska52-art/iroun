# 이로운사람들 앱 서버(api-server). Render·Railway·Fly 등 Docker를 지원하는 곳이면 그대로 올라간다.
# 비밀값은 여기 넣지 않는다. 서버 업체의 환경변수(Secrets) 화면에 넣는다. → docs/서버-올리기.md
FROM node:22-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter "@workspace/api-server..." && pnpm --filter @workspace/api-server run build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/artifacts/api-server
# 켜질 때 DB 구조를 자동으로 맞춘 뒤 서버를 연다.
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
