# Use Node 22 (Matches your project specs)
FROM node:22-alpine

# Add netcat so the entrypoint script can 'ping' postgres
RUN apk add --no-cache netcat-openbsd

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Generate Prisma client inside the container
RUN npx prisma generate

# Expose the port your Fastify/Express app will run on
EXPOSE 3000

COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]

# Start the app in development mode
CMD ["npm", "run", "dev"]

