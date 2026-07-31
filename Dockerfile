FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Set the environment variable and expose port 5001
ENV PORT=5001
EXPOSE 5001

CMD ["npm", "start"]