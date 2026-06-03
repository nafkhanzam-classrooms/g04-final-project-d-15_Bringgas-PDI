# [cite_start]PRODUCT REQUIREMENTS DOCUMENT [cite: 1]
## [cite_start]Sistem Kelas Interaktif [cite: 2]
[cite_start]**Jaringan Komputer — Institut Teknologi Sepuluh Nopember** [cite: 3]

| Dokumen | [cite_start]Product Requirements Document (PRD) | [cite: 4]
| :--- | [cite_start]:--- | [cite: 4]
| **Proyek** | [cite_start]Sistem Kelas Interaktif — ClassPoint/Kahoot/Quizizz Clone | [cite: 4]
| **Versi** | [cite_start]1.0.0 | [cite: 4]
| **Tanggal** | [cite_start]Mei 2025 | [cite: 4]
| **Mata Kuliah** | [cite_start]Jaringan Komputer — ITS Surabaya | [cite: 4]

### [cite_start]1. Ringkasan Proyek [cite: 5]
[cite_start]Proyek ini bertujuan membangun server aplikasi kelas interaktif berbasis jaringan, serupa dengan ClassPoint, Kahoot, atau Quizizz, dengan fokus pada implementasi server jaringan menggunakan protokol komunikasi custom. [cite: 6] [cite_start]Sistem mencakup minimal 1 server dan 5 client (mobile, desktop, atau web). [cite: 7]

[cite_start]**1.1 Tujuan Proyek** [cite: 8]
* [cite_start]Membangun sistem kelas interaktif real-time berbasis client-server [cite: 9]
* [cite_start]Mengimplementasikan threading atau select/poll/asyncio untuk penanganan multi-client [cite: 10]
* [cite_start]Merancang dan mendokumentasikan protokol packet/message format sendiri [cite: 11]
* [cite_start]Menangani edge case jaringan: reconnect, duplicate login, timeout, malformed packet [cite: 12]
* [cite_start]Memberikan pengalaman belajar interaktif dengan fitur quiz, slide, dan gamifikasi [cite: 13]

[cite_start]**1.2 Ruang Lingkup** [cite: 14]
* [cite_start]**Server:** 1 server utama menangani semua client secara bersamaan [cite: 15]
* [cite_start]**Client:** minimal 5 client (bisa mobile, desktop, atau web-based) [cite: 16]
* [cite_start]**Protokol:** custom packet/message format yang terdokumentasi [cite: 17]
* [cite_start]**Fitur wajib:** Classroom Session, Real-time Quiz, Slide Control, Gamifikasi [cite: 18]
* [cite_start]**Fitur bonus:** Screen sharing, Voice room, WebSocket, TLS/HTTPS, Docker, Load balancing [cite: 19]

---

### [cite_start]2. Fitur Wajib (Mandatory Features) [cite: 20]

[cite_start]**2.1 Classroom Session** [cite: 21]
[cite_start]Fitur inti yang memungkinkan pengajar membuat dan mengelola sesi kelas, serta peserta bergabung menggunakan kode unik. [cite: 22]

[cite_start]**2.1.1 Create Class** [cite: 23]
* [cite_start]Host dapat membuat sesi kelas baru dengan nama dan konfigurasi tertentu [cite: 24]
* [cite_start]Server menghasilkan kode kelas unik (misalnya 6 karakter alfanumerik) [cite: 25]
* [cite_start]Host mendapatkan token autentikasi khusus sebagai pengelola sesi [cite: 26]
* [cite_start]Server menyimpan metadata sesi: nama kelas, waktu mulai, daftar peserta 

[cite_start]**2.1.2 Join Class Menggunakan Code** [cite: 28]
* [cite_start]Peserta memasukkan kode kelas untuk bergabung [cite: 29]
* [cite_start]Server memvalidasi kode dan mendaftarkan peserta ke sesi [cite: 30]
* [cite_start]Server mengirimkan konfirmasi bergabung beserta daftar peserta yang sudah ada [cite: 31]
* [cite_start]Server broadcast ke semua peserta saat ada anggota baru bergabung [cite: 32]
* [cite_start]Penanganan kode tidak valid: server mengembalikan pesan error terstruktur [cite: 33]

[cite_start]**2.1.3 Host dan Participant Role** [cite: 34]
* [cite_start]Role HOST: dapat memulai/mengakhiri sesi, mengelola quiz, mengontrol slide [cite: 35]
* [cite_start]Role PARTICIPANT: hanya dapat menjawab quiz, melihat slide, dan melihat leaderboard [cite: 36]
* [cite_start]Server memvalidasi setiap perintah berdasarkan role pengirim [cite: 37]
* [cite_start]Satu sesi hanya boleh memiliki satu host aktif [cite: 38]

[cite_start]**2.2 Real-time Quiz** [cite: 39]
[cite_start]Sistem quiz interaktif yang berjalan secara real-time antara host dan semua peserta. [cite: 40]

[cite_start]**2.2.1 Multiple Choice Question** [cite: 41]
* [cite_start]Host dapat membuat pertanyaan pilihan ganda (minimal 2, maksimal 4 pilihan) [cite: 42]
* [cite_start]Server mendistribusikan pertanyaan ke semua peserta secara bersamaan [cite: 43]
* [cite_start]Setiap pertanyaan memiliki batas waktu yang dikonfigurasi host [cite: 44]
* [cite_start]Format pertanyaan termasuk teks, nomor soal, dan opsi jawaban [cite: 45]

[cite_start]**2.2.2 Live Answer Collection** [cite: 46]
* [cite_start]Server menerima jawaban dari setiap peserta secara real-time [cite: 47]
* [cite_start]Server mencatat timestamp penerimaan jawaban untuk perhitungan skor [cite: 48]
* [cite_start]Host dapat melihat statistik jawaban secara live (berapa % memilih tiap opsi) [cite: 49]
* [cite_start]Server menolak jawaban yang dikirim setelah batas waktu habis [cite: 50]

[cite_start]**2.2.3 Score Calculation** [cite: 51]
* [cite_start]Skor dihitung berdasarkan kebenaran jawaban dan kecepatan menjawab [cite: 52]
* [cite_start]Formula skor: base_score + time_bonus (semakin cepat = bonus lebih besar) [cite: 53]
* [cite_start]Server menghitung skor di sisi server (anti-cheat) [cite: 54]
* [cite_start]Skor dikumpulkan per peserta per pertanyaan dan diakumulasi 

[cite_start]**2.2.4 Leaderboard** [cite: 56]
* [cite_start]Leaderboard diperbarui otomatis setelah setiap pertanyaan selesai [cite: 57]
* [cite_start]Server mengirimkan update leaderboard ke semua peserta secara broadcast [cite: 58]
* [cite_start]Menampilkan peringkat, nama peserta, dan total skor [cite: 59]
* [cite_start]Leaderboard final dikirimkan saat host mengakhiri sesi quiz [cite: 60]

[cite_start]**2.3 Slide Control** [cite: 61]
[cite_start]Fitur sinkronisasi slide presentasi antara host dan semua peserta secara real-time. [cite: 62]

[cite_start]**2.3.1 Next/Previous Slide Synchronization** [cite: 63]
* [cite_start]Host dapat berpindah ke slide berikutnya atau sebelumnya [cite: 64]
* [cite_start]Perubahan slide host langsung disinkronkan ke semua peserta [cite: 65]
* [cite_start]Server membroadcast nomor slide aktif ke semua client yang terhubung [cite: 66]
* [cite_start]Peserta tidak dapat mengontrol perpindahan slide secara mandiri [cite: 67]

[cite_start]**2.3.2 Broadcast Slide Position** [cite: 68]
* [cite_start]Server menyimpan posisi slide saat ini sebagai state sesi [cite: 69]
* [cite_start]Peserta yang baru bergabung langsung menerima posisi slide terkini [cite: 70]
* [cite_start]Server mengirimkan nomor slide, total slide, dan metadata halaman [cite: 71]
* [cite_start]Update slide dikirim dengan latency minimal untuk pengalaman real-time [cite: 72]

[cite_start]**2.4 Gamifikasi** [cite: 73]
[cite_start]Sistem gamifikasi untuk meningkatkan keterlibatan dan motivasi peserta. [cite: 74]

[cite_start]**2.4.1 Point System** [cite: 75]
* [cite_start]Setiap jawaban benar memberikan poin kepada peserta [cite: 76]
* [cite_start]Besaran poin dipengaruhi kecepatan jawab dan tingkat kesulitan soal [cite: 77]
* [cite_start]Server mengelola dan memvalidasi semua penghitungan poin [cite: 78]
* [cite_start]Total poin tercatat per peserta selama satu sesi berlangsung [cite: 79]

[cite_start]**2.4.2 Ranking** [cite: 80]
* [cite_start]Peserta diurutkan berdasarkan total poin yang dikumpulkan [cite: 81]
* [cite_start]Ranking diperbarui dan dibroadcast setelah setiap ronde quiz selesai [cite: 82]
* [cite_start]Ranking menampilkan posisi, nama, poin, dan perubahan posisi (naik/turun) [cite: 83]

[cite_start]**2.4.3 Streak Bonus** [cite: 84]
* [cite_start]Peserta yang menjawab benar secara berturut-turut mendapat bonus poin [cite: 85]
* [cite_start]Server melacak streak jawaban benar per peserta [cite: 86]
* [cite_start]Bonus streak bertambah seiring jumlah jawaban benar berturut-turut [cite: 87]
* [cite_start]Streak reset ke 0 jika peserta menjawab salah atau tidak menjawab [cite: 88]

---

### 3. Ketentuan Teknis

**3.1 Arsitektur Server & Stack Teknologi**
* **Concurrency Model:** Menggunakan **Golang Goroutines & Channels (CSP Model)**. Runtime Scheduler Go (M:N scheduler) mengelola ribuan koneksi konkuren secara efisien tanpa beban thread OS standar, memenuhi ketentuan penanganan concurrency tingkat tinggi.
* **Backend Framework:** **Golang Fiber** (berbasis Fasthttp) untuk performa router HTTP/WebSocket yang sangat cepat, minim alokasi memori, dan latency rendah.
* **Database & Persistence Layer (MariaDB):**
  * Menggunakan **MariaDB** sebagai database relasional untuk menyimpan data terstruktur yang membutuhkan persistensi jangka panjang.
  * Menyimpan akun guru (Teacher Accounts) dengan enkripsi password (bcrypt), riwayat kelas yang pernah dibuat, daftar kuis dan tugas (tasks), serta peringkat leaderboard/nilai siswa (submissions).
  * Mendukung arsitektur **Hybrid Data Store**: state real-time (aktif) dikelola di RAM (In-Memory) dan direplikasi antar server via TCP, sedangkan state historis dan administratif disimpan di MariaDB.
* **Reverse Proxy & Load Balancer:** **Nginx** digunakan di depan server Fiber untuk:
  * TLS/HTTPS Termination (mengamankan seluruh komunikasi).
  * Load Balancing (mendistribusikan trafik secara merata ke multiple instance server).
  * Efisiensi penyajian file statis dan ketahanan (high availability).
* **Distributed 2-Server Setup via VPN:**
  * Menggunakan **2 server node** terpisah yang dihubungkan secara aman menggunakan **VPN (WireGuard)**.
  * Sinkronisasi state kelas (Classroom Session, Active Quiz, Slide Position, Leaderboard) dilakukan secara real-time antar-server melalui protokol sinkronisasi khusus di atas jaringan VPN.
  * Memenuhi bonus "Distributed Server" dan "Load Balancing" secara penuh.
* **User Interface (UI) & Client:**
  * Web-based client premium yang disajikan langsung oleh Fiber web server.
  * Desain UI premium menggunakan **HTML5 & Vanilla CSS** dengan estetika modern (vibrant colors, glassmorphism, dark mode, dan mikro-animasi halus).
  * Menggunakan **WebSocket** sebagai transport layer untuk komunikasi real-time, mengemas **Custom Network Protocol** yang dirancang (menggunakan custom binary frame atau structured frame).

[cite_start]**3.2 Protokol Jaringan Custom** [cite: 95]
Kelompok wajib merancang dan mendokumentasikan protokol komunikasi sendiri. [cite_start]Dokumentasi protokol mencakup: [cite: 96]
* [cite_start]Struktur header packet (magic number, version, type, length, checksum) [cite: 97]
* [cite_start]Daftar semua tipe pesan (message type) beserta kode dan deskripsinya [cite: 98]
* [cite_start]Format payload untuk setiap tipe pesan [cite: 99]
* [cite_start]Mekanisme request-response dan mekanisme broadcast [cite: 100]
* [cite_start]Contoh raw packet dalam hexadecimal atau pseudocode [cite: 101]

[cite_start]**3.3 Penanganan Edge Case Jaringan** [cite: 102]

| Edge Case | Deskripsi | [cite_start]Penanganan | [cite: 103]
| :--- | :--- | [cite_start]:--- | [cite: 103]
| Reconnect | Client terputus lalu menyambung kembali ke sesi yang sama | [cite_start]Server menyimpan state sesi dan memulihkan data peserta | [cite: 103]
| Duplicate Login | Peserta yang sama mencoba login ulang saat masih terhubung | [cite_start]Server menolak atau menggantikan sesi lama dengan sesi baru | [cite: 103]
| Timeout | Client tidak merespons dalam batas waktu tertentu | [cite_start]Server mengakhiri koneksi dan mengeluarkan peserta dari sesi | [cite: 103]
| Malformed Packet | Packet yang diterima tidak sesuai format protokol | [cite_start]Server membuang packet dan mengirim pesan error ke client | [cite: 103]

[cite_start]**3.4 Client** [cite: 104]
* [cite_start]Client dapat berupa mobile, desktop, atau web-based [cite: 105]
* [cite_start]Satu implementasi client minimal, dapat dibuat beberapa jenis untuk nilai lebih [cite: 106]
* [cite_start]Client harus mengimplementasikan protokol custom yang sama dengan server [cite: 107]
* [cite_start]Client menangani reconnect otomatis jika koneksi terputus [cite: 108]

---

### [cite_start]4. Fitur Bonus (Opsional) [cite: 109]
Fitur-fitur berikut bersifat opsional namun memberikan nilai tambah pada penilaian. [cite_start]Kelompok dianjurkan mengerjakan setidaknya 2-3 fitur bonus. [cite: 110]

| Fitur Bonus | Deskripsi | [cite_start]Kompleksitas | 
| :--- | :--- | [cite_start]:--- | 
| Screen Sharing Sederhana | Host dapat berbagi layar ke semua peserta dalam kualitas dasar | [cite_start]Tinggi | 
| Live Annotation | Host dapat menggambar atau memberi anotasi di atas slide secara live | [cite_start]Sedang | 
| Voice Room | Ruang suara untuk komunikasi audio antara host dan peserta | [cite_start]Tinggi | 
| WebSocket Implementation | Menggunakan WebSocket sebagai transport layer untuk web client | [cite_start]Sedang | 
| TLS/HTTPS | Enkripsi seluruh komunikasi menggunakan TLS/SSL | [cite_start]Sedang | 
| Docker Deployment | Server dan client dikemas dalam container Docker, siap deploy | [cite_start]Rendah | 
| Load Balancing | Distribusi beban ke beberapa instance server | [cite_start]Tinggi | 
| Distributed Server | Server terdistribusi di beberapa node dengan sinkronisasi state | [cite_start]Sangat Tinggi | 

---

### [cite_start]5. Requirement Fungsional [cite: 112]

[cite_start]**5.1 Kebutuhan Fungsional Server** [cite: 113]
* [cite_start]Server harus mampu menangani minimal 5 client secara bersamaan [cite: 114]
* [cite_start]Server harus memvalidasi semua input sebelum memproses [cite: 115]
* [cite_start]Server harus menyimpan state sesi selama sesi berlangsung [cite: 116]
* [cite_start]Server harus mengirimkan broadcast ke semua peserta saat ada perubahan state [cite: 117]
* [cite_start]Server harus mencatat log aktivitas penting (join, leave, quiz, error) [cite: 118]
* [cite_start]Server harus memiliki mekanisme heartbeat untuk deteksi client disconnected [cite: 119]

[cite_start]**5.2 Kebutuhan Fungsional Client** [cite: 120]
* [cite_start]Client harus dapat terhubung ke server menggunakan alamat IP dan port [cite: 121]
* [cite_start]Client harus mengimplementasikan protokol custom sesuai spesifikasi [cite: 122]
* [cite_start]Client harus menampilkan informasi sesi, pertanyaan, dan leaderboard [cite: 123]
* [cite_start]Client harus menangani pemutusan koneksi dan reconnect secara otomatis [cite: 124]

[cite_start]**5.3 Kebutuhan Non-Fungsional** [cite: 125]
* [cite_start]Performa: latency broadcast ke semua client < 500ms dalam jaringan LAN [cite: 126]
* [cite_start]Keandalan: server tidak crash saat menerima malformed packet [cite: 127]
* [cite_start]Keamanan: server memvalidasi role sebelum memproses perintah sensitif [cite: 128]
* [cite_start]Dokumentasi: protokol harus terdokumentasi lengkap dan dapat direproduksi [cite: 129]
* [cite_start]Portabilitas: server dapat berjalan di Linux dan/atau Windows [cite: 130]

---

### [cite_start]6. Panduan Desain Protokol Custom [cite: 131]
Kelompok wajib merancang protokol sendiri. [cite_start]Berikut panduan minimum yang harus ada dalam dokumentasi protokol: [cite: 132]

[cite_start]**6.1 Struktur Packet** [cite: 133]
* [cite_start]Magic Number: identifikasi protokol (contoh: 0xCAFE) [cite: 134]
* [cite_start]Version: versi protokol (1 byte) [cite: 135]
* [cite_start]Message Type: kode jenis pesan (2 byte) [cite: 136]
* [cite_start]Sequence Number: nomor urut untuk deteksi duplikat (4 byte) [cite: 137]
* [cite_start]Payload Length: panjang data payload (4 byte) [cite: 138]
* [cite_start]Payload: data utama pesan (JSON, binary, atau custom) [cite: 139]
* [cite_start]Checksum: validasi integritas packet (CRC32 atau checksum sederhana) [cite: 140]

[cite_start]**6.2 Daftar Tipe Pesan Wajib** [cite: 141]

| Kode | Nama | [cite_start]Deskripsi | [cite: 142]
| :--- | :--- | [cite_start]:--- | [cite: 142]
| 0x01 | CREATE_CLASS | [cite_start]Host membuat sesi kelas baru | [cite: 142]
| 0x02 | JOIN_CLASS | [cite_start]Peserta bergabung dengan kode kelas | [cite: 142]
| 0x03 | CLASS_STATE | [cite_start]Server mengirimkan state kelas ke client | [cite: 142]
| 0x10 | SEND_QUESTION | [cite_start]Host mengirimkan pertanyaan quiz | [cite: 142]
| 0x11 | SUBMIT_ANSWER | [cite_start]Peserta mengirimkan jawaban | [cite: 142]
| 0x12 | QUIZ_RESULT | [cite_start]Server mengirim hasil quiz ke semua peserta | [cite: 142]
| 0x20 | SLIDE_CHANGE | [cite_start]Host mengubah posisi slide | [cite: 142]
| 0x21 | SLIDE_BROADCAST | [cite_start]Server broadcast posisi slide ke peserta | [cite: 142]
| 0x30 | LEADERBOARD | [cite_start]Server broadcast leaderboard terbaru | [cite: 142]
| 0xF0 | HEARTBEAT | [cite_start]Ping/pong untuk deteksi koneksi aktif | [cite: 142]
| 0xFF | ERROR | [cite_start]Server mengirimkan pesan error ke client | [cite: 142]

---

### [cite_start]7. Deliverables yang Harus Dikumpulkan [cite: 143]

[cite_start]**7.1 Kode Program** [cite: 144]
* [cite_start]Source code server lengkap beserta dependency/requirements [cite: 145]
* [cite_start]Source code minimal 1 implementasi client [cite: 146]
* [cite_start]README.md berisi cara instalasi, konfigurasi, dan menjalankan program [cite: 147]
* [cite_start]Instruksi untuk menjalankan minimal 1 server dan 5 client secara bersamaan [cite: 148]

[cite_start]**7.2 Dokumentasi Protokol** [cite: 149]
* [cite_start]Spesifikasi lengkap packet format (header, tipe pesan, payload) [cite: 150]
* [cite_start]Diagram alur komunikasi (sequence diagram) untuk setiap skenario utama [cite: 151]
* [cite_start]Contoh raw packet/hexdump untuk setiap tipe pesan [cite: 152]
* [cite_start]Penjelasan mekanisme penanganan error dan edge case [cite: 153]

[cite_start]**7.3 Laporan** [cite: 154]
* [cite_start]Deskripsi arsitektur sistem (server, client, protokol) [cite: 155]
* [cite_start]Pilihan teknologi: bahasa pemrograman, library, dan alasan pemilihan [cite: 156]
* [cite_start]Penjelasan implementasi threading/select/poll/asyncio [cite: 157]
* [cite_start]Tantangan yang dihadapi dan solusinya [cite: 158]
* [cite_start]Hasil pengujian dengan minimal 5 client bersamaan [cite: 159]
* [cite_start]Dokumentasi fitur bonus yang diimplementasikan (jika ada) [cite: 160]

[cite_start]**7.4 Demo** [cite: 161]
* [cite_start]Demo live atau rekaman video sistem berjalan dengan minimal 5 client [cite: 162]
* [cite_start]Demo menunjukkan semua fitur wajib berjalan: session, quiz, slide, gamifikasi [cite: 163]
* [cite_start]Demo skenario edge case: reconnect, duplicate login, timeout [cite: 164]
* [cite_start]Demo fitur bonus (jika diimplementasikan) [cite: 165]

---

### [cite_start]8. Kriteria Penilaian [cite: 166]

| Komponen | Aspek yang Dinilai | [cite_start]Bobot | 
| :--- | :--- | [cite_start]:--- | 
| Implementasi Server | Concurrency, stabilitas, correctness | [cite_start]25% | 
| Protokol Custom | Desain, dokumentasi, implementasi | [cite_start]20% | 
| Fitur Wajib | Kelengkapan dan fungsionalitas | [cite_start]30% | 
| Penanganan Edge Case | Reconnect, timeout, malformed packet | [cite_start]15% | 
| Fitur Bonus | Implementasi dan kualitas | [cite_start]10% | 

[cite_start]**8.1 Checklist Minimum Kelulusan** [cite: 168]
* [cite_start]Server berjalan stabil dengan minimal 5 client bersamaan [cite: 169]
* [cite_start]Semua 4 fitur wajib diimplementasikan (Classroom Session, Quiz, Slide, Gamifikasi) [cite: 170]
* [cite_start]Protokol custom didokumentasikan dengan lengkap [cite: 171]
* [cite_start]Minimal 3 dari 4 edge case ditangani (reconnect, duplicate login, timeout, malformed packet) [cite: 172]
* [cite_start]Kode dapat dijalankan mengikuti instruksi README [cite: 173]

[cite_start]*Institut Teknologi Sepuluh Nopember — Jaringan Komputer* [cite: 174]
[cite_start]*PRD ini merupakan panduan project dan dapat diperbarui sesuai arahan dosen.* [cite: 175]