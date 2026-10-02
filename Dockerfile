# The stdio server, built from this repository. Directories such as Glama run it this way;
# for your own use, `npx -y @nodegrove/vram-mcp` or the remote endpoint is simpler.
#   docker build -t vram-mcp . && docker run -i --rm vram-mcp

FROM node:22-alpine AS build
WORKDIR /src
COPY llm-math ./llm-math
COPY mcp ./mcp
WORKDIR /src/mcp
RUN npm install --omit=dev --no-audit --no-fund \
 && npm install --no-save --no-audit --no-fund esbuild@0.27 \
 && node build.mjs

FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/mcp/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts
COPY --from=build /src/mcp/dist ./dist
USER node
ENTRYPOINT ["node", "dist/stdio.js"]
