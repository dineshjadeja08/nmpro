# One image per website for Google Cloud Run. Build from the repository root:
#   docker build -f infrastructure/docker/site.Dockerfile --build-arg APP=web \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example -t nammapros-web .
# APP is the folder under apps/: web | admin | operations | technician.
# NEXT_PUBLIC_* values are baked into the browser code at build time, so they are build arguments.

FROM node:22-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --no-audit --no-fund

ARG APP
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_PARTNER_APP_URL=""
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=""
ENV NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_PARTNER_APP_URL=$NEXT_PUBLIC_PARTNER_APP_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
RUN test -n "$APP" && test -n "$NEXT_PUBLIC_API_BASE_URL" \
    && npm run build -w "@nammapros/$APP" \
    && mkdir -p /out \
    && cp -r "apps/$APP/.next/standalone/." /out/ \
    && mkdir -p "/out/apps/$APP/.next" \
    && cp -r "apps/$APP/.next/static" "/out/apps/$APP/.next/static" \
    && if [ -d "apps/$APP/public" ]; then cp -r "apps/$APP/public" "/out/apps/$APP/public"; fi

FROM node:22-slim
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 APP=$APP
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
