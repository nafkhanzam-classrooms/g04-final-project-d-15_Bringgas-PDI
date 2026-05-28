# Sistem Kelas Interaktif Terdistribusi — Lopyta

Proyek ini adalah implementasi sistem kelas interaktif real-time (serupa dengan Kahoot, ClassPoint, atau Quizizz) yang dikembangkan untuk mata kuliah **Jaringan Komputer — Institut Teknologi Sepuluh Nopember**.

Sistem ini memiliki arsitektur **Distributed Cluster** dengan **2 Node Server** yang tersinkronisasi secara real-time via TCP melintasi terowongan VPN, ditangani di depan oleh **Nginx Reverse Proxy & Load Balancer**. Seluruh komunikasi real-time menggunakan **Custom Network Protocol** biner yang dikirim melalui WebSocket.

---

## 🚀 Fitur yang Diimplementasikan
1. **Classroom Session**: Pembuatan sesi kelas unik (6 karakter) oleh Guru, dan Join kelas secara instan oleh Siswa.
2. **Real-time Quiz**: Pertanyaan pilihan ganda interaktif dengan batas waktu countdown, live chart jawaban masuk di layar guru, dan sistem penilai otomatis.
3. **Slide Control**: Presentasi slide materi guru yang disinkronkan secara instan (real-time) ke seluruh layar siswa.
4. **Gamifikasi**: Poin dihitung berdasarkan ketepatan dan kecepatan menjawab (*Speed Bonus*), indikator beruntun (*Streak Bonus*), serta pergerakan peringkat leaderboard dinamis (naik/turun).
5. **Distributed Active-Active Cluster**: Sinkronisasi data antar-server (Node 1 & Node 2) via TCP Replication Channel.
6. **Role Separation Subdomain**: Nginx memisahkan akses: `guru.lopyta.org` untuk Guru dan `siswa.lopyta.org` untuk Siswa.

---

## 🛠️ Persyaratan Sistem (Prerequisites)
Sebelum memulai, pastikan Ubuntu Anda telah terpasang:
* **Golang v1.21+**
* **Nginx**

Untuk memasang Nginx jika belum ada:
```bash
sudo apt update && sudo apt install -y nginx
```

---

## ⚙️ Langkah Instalasi & Konfigurasi

### Langkah 1: Konfigurasi DNS Lokal (`/etc/hosts`)
Tambahkan pemetaan domain kustom agar siswa dan guru dapat mengakses server secara lokal tanpa mencari ke internet. Jalankan perintah berikut:
```bash
sudo sh -c 'echo "127.0.0.1 siswa.lopyta.org guru.lopyta.org" >> /etc/hosts'
```

### Langkah 2: Konfigurasi Nginx
Salin konfigurasi virtual host Nginx yang telah disediakan ke direktori konfigurasi sistem Nginx Anda, lalu aktifkan:
```bash
# Salin file konfigurasi
sudo cp nginx/lopyta.conf /etc/nginx/sites-available/lopyta.conf

# Aktifkan konfigurasi dengan membuat symlink
sudo ln -sf /etc/nginx/sites-available/lopyta.conf /etc/nginx/sites-enabled/

# Uji sintaks konfigurasi Nginx
sudo nginx -t

# Muat ulang (restart) layanan Nginx
sudo systemctl restart nginx
```

### Langkah 3: Jalankan Kluster Server Go
Kita akan menjalankan **2 Node Server** secara aktif. Kedua node ini akan berkomunikasi satu sama lain untuk menyinkronkan data secara instan melintasi TCP.

Buka **Terminal 1** dan jalankan **Node 1** (Web port: `8789`, Sync port: `8889`):
```bash
go run main.go -port 8789 -sync-port 8889 -peer-sync 127.0.0.1:8890 -node node-1
```

Buka **Terminal 2** dan jalankan **Node 2** (Web port: `8790`, Sync port: `8890`):
```bash
go run main.go -port 8790 -sync-port 8890 -peer-sync 127.0.0.1:8889 -node node-2
```

*(Catatan: Dalam lingkungan produksi sesungguhnya, parameter `-peer-sync` akan diisi oleh IP VPN Wireguard dari VPS lawan).*

---

## 💻 Cara Pengujian Sesi Kelas (Demo)

1. **Akses Dashboard Guru:**
   Buka browser Anda dan akses **`http://guru.lopyta.org`**. Masukkan nama kelas ("Jaringan Komputer A") dan nama Anda ("Pak Dosen"), lalu klik **Buat Kelas**. Anda akan mendapatkan Kode Kelas unik (misal: `CAFE12`).
2. **Akses Dashboard Siswa (Minimal 5 Tab):**
   Buka **`http://siswa.lopyta.org`** di minimal 5 tab browser terpisah (merepresentasikan 5 siswa). Masukkan Kode Kelas unik tersebut dan nama yang berbeda (Siswa A, Siswa B, dst) untuk masuk ke kelas.
3. **Uji Slide Sync:**
   Ubah slide presentasi di panel guru (klik *Selanjutnya* / *Sebelumnya*). Layar seluruh siswa di subdomain `siswa.lopyta.org` akan berganti halaman secara real-time!
4. **Uji Kuis Real-time:**
   Klik **Luncurkan Pertanyaan** di panel guru. Layar seluruh siswa akan menampilkan tombol kuis (A, B, C, D) dengan timer countdown. Siswa yang menjawab benar akan mendapat skor berdasarkan kebenaran dan waktu respon.
5. **Uji Leaderboard:**
   Setelah kuis selesai, papan peringkat (leaderboard) akan diperbarui secara otomatis dan dibroadcast ke semua layar guru dan siswa dengan animasi peningkatan/penurunan peringkat!

---

## 📡 Spesifikasi Protokol Biner Kustom

Seluruh pertukaran data real-time menggunakan frame biner yang dibungkus di dalam WebSocket dengan layout header sebagai berikut:

```
Struktur Frame Paket Custom (Biner):
+--------------------+------------------+------------------+-----------------------+----------------------+--------------------------+-----------------------+
| Magic (2B: 0xCAFE) | Version (1B: 01) | MsgType (2B: 00) | Sequence Number (4B)  | Payload Length (4B)  | Payload (JSON/String Var)| Checksum (4B: CRC32)  |
+--------------------+------------------+------------------+-----------------------+----------------------+--------------------------+-----------------------+
```

### Tipe Pesan (Message Type Codes)
* `0x0001` (`CREATE_CLASS`): Host membuat sesi baru.
* `0x0002` (`JOIN_CLASS`): Peserta bergabung dengan kode kelas.
* `0x0003` (`CLASS_STATE`): Broadcast state lengkap dari server ke client.
* `0x0010` (`SEND_QUESTION`): Guru meluncurkan kuis pilihan ganda.
* `0x0011` (`SUBMIT_ANSWER`): Siswa mengirimkan jawaban.
* `0x0012` (`QUIZ_RESULT`): Hasil jawaban instan bagi siswa.
* `0x0020` (`SLIDE_CHANGE`): Guru berpindah halaman slide.
* `0x00F0` (`HEARTBEAT`): Heartbeat ping/pong.
* `0x00FF` (`ERROR`): Mengirim error terstruktur.
* `0x0100` (`REPLICATE_STATE`): Sinkronisasi data kluster antar-server.

---

## 🛡️ Penanganan Kasus Khusus (Edge Cases)

* **Duplicate Login (Login Ganda):** Jika siswa masuk dengan nama yang sudah aktif di sesi tersebut, server secara otomatis akan memutuskan koneksi siswa lama (*kick existing session*) dan mengizinkan koneksi baru masuk, menyelesaikan masalah tab tertinggal.
* **Reconnect Otomatis:** Jika client kehilangan koneksi WebSocket secara tidak sengaja, script JS di sisi client akan terus mencoba menghubungkan kembali secara background setiap 3 detik. Begitu terhubung, ia akan melakukan re-join otomatis untuk memulihkan skor dan status kuis tanpa merusak sesi.
* **Heartbeat Timeout:** Server memantau keaktifan koneksi client setiap 15 detik melalui ping/pong. Jika client tidak merespons dalam durasi tersebut, server secara aman memutus koneksi dan menandai siswa sebagai *inactive* di leaderboard tanpa merusak program.
* **Malformed Packet (Paket Rusak):** Server memvalidasi Magic Number (`0xCAFE`), Version (`0x01`), Payload Length, dan mencocokkan CRC32 checksum. Jika paket rusak/tidak dikenal, server membuangnya dan mengirim pesan error kembali tanpa mengalami *crash*.
