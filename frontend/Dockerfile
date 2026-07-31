# Build stage: compile the Vite app to static files
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-bin-links
COPY . .
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
