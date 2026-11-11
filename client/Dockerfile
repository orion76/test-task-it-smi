# Dev image of the manual check client: the Angular dev server with HMR, nothing is built ahead of
# time. The `client` service of the root docker-compose.yml runs it next to the application.
FROM node:24-alpine

WORKDIR /app

# Dependencies come from the lock file: the image repeats the local install one to one.
COPY package.json package-lock.json ./
RUN npm ci

# Sources are copied over the dependencies: `node_modules`, `dist` and `.angular` are excluded by
# `.dockerignore`, so editing a file does not rebuild the dependency layer.
COPY . .

# 5173 is the port of `npm run dev` as well. Inside compose `npm run dev:docker` starts the same
# server on 0.0.0.0 and swaps `proxy.conf.json` for `proxy.conf.docker.json` (target
# `http://app:3000`), so the browser still talks to its own origin and no CORS setup is needed.
EXPOSE 5173

CMD ["npm", "run", "dev:docker"]
