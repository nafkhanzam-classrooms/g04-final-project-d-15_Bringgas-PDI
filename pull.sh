#!/bin/bash
# pull.sh - Script untuk memperbarui aplikasi Lopyta Classroom dari Git, melakukan kompilasi ulang, dan merestart service.

echo "=== Memulai Pembaruan Aplikasi Lopyta ==="

# 1. Menarik pembaruan dari Git
echo "1. Menarik pembaruan kode dari GitHub..."
git pull origin main

# 2. Build ulang biner Golang
echo "2. Merapikan modul & melakukan kompilasi ulang Golang..."
go mod tidy
go build -o lopyta-server main.go

if [ $? -eq 0 ]; then
    echo "Kompilasi Golang berhasil!"
else
    echo "❌ Gagal melakukan kompilasi Golang! Menghentikan proses pembaruan."
    exit 1
fi

# 3. Copy & Reload Nginx
echo "3. Memvalidasi & memuat ulang konfigurasi Nginx..."
sudo cp /var/www/classroom-bringgas/nginx/lopyta.conf /etc/nginx/sites-available/lopyta.conf
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "Nginx reload berhasil!"
else
    echo "⚠️ Konfigurasi Nginx salah! Silakan periksa kembali."
fi

# 4. Merestart service di Supervisor
echo "4. Memuat ulang (restart) service Golang di Supervisor..."
sudo supervisorctl restart lopyta-node-1 lopyta-node-2 || sudo supervisorctl restart all

echo "=== Pembaruan Aplikasi Selesai dengan Sukses! ==="
