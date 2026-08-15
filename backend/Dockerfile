FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npx prisma generate
RUN npx tsc

# Cloud Run injects PORT itself at runtime — don't hardcode it here.
EXPOSE 5001

CMD ["npm", "start"]