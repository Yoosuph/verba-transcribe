# Build Stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# The built index.html keeps %%AUTH_TOKEN%% — nginx sub_filter injects the
# real token from the AUTH_TOKEN environment variable at serve time.
RUN npm run build

# Production Stage with Nginx (templated config: envsubst on *.template)
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
