# Gunakan Node.js 18 dengan Debian Bullseye (stabil untuk Puppeteer/Chromium)
FROM node:18-bullseye-slim

# Install dependensi sistem untuk Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpangocairo-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Gunakan Chromium yang terinstall, bukan download baru
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy package files dulu (untuk caching layer)
COPY package*.json ./

# Install npm dependencies
RUN npm install --production

# Copy semua file aplikasi
COPY . .

# Expose port untuk Dashboard Admin
EXPOSE 3000

# Jalankan bot
CMD ["node", "server.js"]
