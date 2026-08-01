# Build stage: compile the Vite app to static files
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Vite bakes import.meta.env.VITE_* into the compiled JS at build time — there's
# no server process left at runtime to read Cloud Run env vars from, it's just
# static files served by nginx. So these have to come in as build args, not
# runtime env vars. Neither is sensitive: a Google OAuth *client* ID and a
# public API URL are both meant to be visible in shipped client-side code.
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# Serve stage: nginx serving the static output
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Cloud Run injects PORT at runtime; nginx's official entrypoint auto-substitutes
# ${PORT} in *.template files under /etc/nginx/templates/ into /etc/nginx/conf.d/
# before starting, so no extra scripting is needed here.
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
