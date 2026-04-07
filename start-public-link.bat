@echo off
title ImmiCare Cloudflare Remote Tunnel
echo ==========================================
echo    IMMICARE PUBLIC ACCESS LAUNCHER (CLOUDFLARE)
echo ==========================================
echo 1. Membuat jalur data yang sangat aman...
echo 2. Menunggu Link Resmi Cloudflare...
echo ==========================================
echo TIPS: Tunggu hingga muncul tulisan seperti ini:
echo "https://nama-acak.trycloudflare.com"
echo Salin link tersebut dan buka di HP Anda.
echo ==========================================
npx -y cloudflared tunnel --url http://localhost:3000
pause
