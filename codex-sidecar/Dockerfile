FROM node:22-alpine

ENV NODE_ENV=production \
    NO_COLOR=1

RUN apk add --no-cache git bash \
  && npm install -g @openai/codex@0.118.0

WORKDIR /app
COPY codex-sidecar/server.mjs /app/server.mjs

USER node
ENV HOME=/home/node

EXPOSE 3210
CMD ["node", "/app/server.mjs"]
