#!/bin/bash
# pull.sh - Script untuk memperbarui aplikasi Lopyta Classroom dari Git, melakukan kompilasi ulang (backend & frontend), dan merestart service.

echo "=== Memulai Pembaruan Aplikasi BRINGGAS PDI ==="

# 1. Menarik pembaruan dari Git
echo "1. Menarik pembaruan kode dari GitHub..."
git pull origin main

# 2. Build ulang Frontend React
echo "2. Melakukan build ulang Frontend React..."
cd frontend || exit
npm install
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build Frontend React berhasil!"
else
    echo "❌ Gagal melakukan build Frontend React! Menghentikan proses pembaruan."
    exit 1
fi
cd ..

# 3. Build ulang biner Golang
echo "3. Merapikan modul & melakukan kompilasi ulang Golang..."
go mod tidy
go build -o lopyta-server .

if [ $? -eq 0 ]; then
    echo "✅ Kompilasi Golang berhasil!"
else
    echo "❌ Gagal melakukan kompilasi Golang! Menghentikan proses pembaruan."
    exit 1
fi

# 4. Copy & Reload Nginx
echo "4. Memvalidasi & memuat ulang konfigurasi Nginx..."
sudo cp /var/www/classroom-bringgas/nginx/lopyta.conf /etc/nginx/sites-available/lopyta.conf
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "✅ Nginx reload berhasil!"
else
    echo "⚠️ Konfigurasi Nginx salah! Silakan periksa kembali."
fi

# 5. Merestart service di Supervisor
echo "5. Memuat ulang (restart) service Golang di Supervisor..."
sudo supervisorctl restart lopyta-node-1 lopyta-node-2 || sudo supervisorctl restart all

echo "=== Pembaruan Aplikasi Selesai dengan Sukses! ==="
