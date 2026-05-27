# Dokumentasi Teknis dan Panduan Pengguna
## SmartStock Pro - PT Maju Bersama Digital

Selamat datang di dokumentasi resmi **SmartStock Pro**, Sistem Manajemen Inventaris Real-Time untuk PT Maju Bersama Digital. Dokumen ini dirancang untuk memandu pengguna dari berbagai level hak akses dalam mengoperasikan sistem dengan lancar.

---

### 1. Panduan Pengguna (User Guide)

#### A. Halaman Login dan Autentikasi
1. Buka browser dan akses alamat website SmartStock Pro (misalnya `https://smartstock.majubersama.id`).
2. Masukkan **Username** dan **Password** Anda.
3. Klik tombol **Login**.
4. **Keamanan Sesi**: Jika Anda tidak melakukan aktivitas apa pun selama 15 menit, sistem akan menampilkan dialog konfirmasi. Jika tidak ada respons dalam 1 menit, Anda akan di-logout otomatis secara aman untuk melindungi data gudang.

#### B. Dashboard Utama (Sleek Glassmorphism Dashboard)
- **Ringkasan Indikator**: Anda dapat melihat total nilai aset, jumlah produk aktif, jumlah gudang, dan total transaksi hari ini.
- **Alert Banner (Low Stock)**: Banner menyala merah jika ada barang dengan stok di bawah batas minimal (`min_stock`). Segera hubungi supplier untuk restock!
- **Visualisasi Mutasi**: Grafik interaktif menunjukkan pergerakan stok masuk dan keluar secara real-time.

#### C. Manajemen Data Inventaris (Modul CRUD)
*Catatan: Fitur ini hanya tersedia untuk peran Admin dan Manajer Gudang.*
1. **Tambah Produk Baru**:
   - Navigasi ke menu **Produk** lalu klik **Tambah Produk**.
   - Isi form: SKU (unik, contoh: `EL-LAP-001`), Nama Produk, Kategori, Supplier, Batas Minimum Stok, dan Harga.
   - Klik **Simpan**.
2. **Edit/Hapus Data**:
   - Gunakan fitur pencarian instan di kanan atas tabel produk untuk menemukan barang.
   - Klik ikon **Edit** (pensil) atau **Hapus** (tempat sampah) pada baris produk yang sesuai.

#### D. Proses Transfer Antar Gudang (Modul Paralel)
*Catatan: Hanya Admin dan Manajer Gudang yang dapat memulai transfer.*
1. Masuk ke menu **Transfer Gudang**.
2. Klik tombol **Buat Transfer Baru**.
3. Pilih **Gudang Asal**, **Gudang Tujuan**, **Produk**, dan **Jumlah** transfer.
4. Klik **Kirim Transfer**.
5. Sistem akan memproses pengurangan stok di gudang asal dan penambahan stok di gudang tujuan secara paralel dan aman (*real-time simultaneous updates*).

#### E. Batch Import Produk (CSV)
1. Buka menu **Batch Import**.
2. Unduh template CSV yang telah disediakan dengan mengklik tombol **Unduh Template CSV**.
3. Isi data produk pada template tersebut, lalu simpan kembali dalam format `.csv`.
4. Tarik dan lepas (*drag & drop*) file CSV Anda ke area upload yang disediakan.
5. Klik **Mulai Import**. Sistem akan memproses ribuan data di latar belakang dengan multi-threading, dan Anda dapat melihat progresnya secara langsung melalui *progress bar* interaktif.

---

### 2. FAQ (Frequently Asked Questions) - Minimal 10 Pertanyaan

#### Q1: Siapa saja yang bisa mengakses sistem SmartStock Pro?
**A**: Sistem memiliki 4 peran hak akses: **Admin** (akses penuh), **Manajer Gudang** (akses gudang tertentu & laporan), **Staf Gudang** (pencatatan transaksi gudang sendiri), dan **Viewer** (hanya melihat data dan laporan saja tanpa modifikasi).

#### Q2: Apa yang harus saya lakukan jika lupa password login?
**A**: Demi alasan keamanan siber yang ketat, password dienkripsi satu arah menggunakan hashing `bcrypt`. Anda harus menghubungi Administrator Sistem di kantor pusat untuk menyetel ulang (*reset*) password Anda melalui modul manajemen user Admin.

#### Q3: Bagaimana cara kerja perhitungan stok FIFO dan LIFO di sistem ini?
**A**: FIFO (First In, First Out) mengonsumsi stok dari batch pembelian terlama terlebih dahulu. LIFO (Last In, First Out) mengambil stok dari batch pembelian terbaru. Manajer dapat memantau pergerakan nilai aset berdasarkan alur batch tersebut di halaman detail produk.

#### Q4: Mengapa sistem tiba-tiba mengeluarkan saya (logout) secara otomatis?
**A**: Ini adalah fitur keamanan **Session Timeout**. Jika sistem mendeteksi tidak ada aktivitas keyboard atau mouse selama 15 menit, Anda akan di-logout otomatis untuk mencegah akses tidak sah saat komputer ditinggalkan.

#### Q5: Apakah saya bisa membatalkan transaksi transfer barang yang sudah berstatus 'COMPLETED'?
**A**: Tidak bisa. Transaksi yang sudah selesai tidak dapat diedit atau dihapus untuk menjaga integritas audit log dan akuntansi stok. Jika terjadi kesalahan pengiriman, Anda harus membuat transaksi transfer balik yang baru.

#### Q6: Mengapa proses upload CSV saya ditolak oleh sistem dengan pesan "SKU Duplikat"?
**A**: Sistem SmartStock Pro menerapkan aturan integritas unik pada kode SKU produk. Pastikan setiap baris produk di file CSV Anda memiliki SKU yang belum pernah terdaftar di sistem sebelumnya.

#### Q7: Berapa batas ukuran file CSV maksimal untuk proses Batch Import?
**A**: Sistem mendukung file CSV hingga ukuran **20 MB** atau sekitar 150.000 baris data produk dalam sekali proses, berkat arsitektur background thread Node.js.

#### Q8: Apakah pencatatan aktivitas (Audit Log) bisa dihapus oleh Manajer Gudang?
**A**: Tidak bisa. Audit log adalah catatan historis hukum aktivitas pengguna. Hanya sistem yang bisa menulis ke audit log, dan data tersebut tidak dapat dihapus oleh peran apa pun, termasuk Admin, demi transparansi audit perusahaan.

#### Q9: Bagaimana cara mengunduh laporan stok berukuran besar tanpa membuat website menjadi lambat?
**A**: Ketika Anda mengklik "Ekspor Laporan", sistem akan menjalankan tugas tersebut di latar belakang (*background job*). Anda bebas berpindah halaman atau melakukan pekerjaan lain. Sistem akan menampilkan notifikasi lonceng di pojok kanan atas begitu file laporan siap diunduh.

#### Q10: Browser apa saja yang didukung oleh SmartStock Pro?
**A**: Sistem dioptimalkan untuk browser modern berkecepatan tinggi yang mendukung standard CSS Grid, Flexbox, dan modern JavaScript, seperti Google Chrome, Mozilla Firefox, Microsoft Edge, dan Apple Safari (versi terbaru).

---

### 3. Dokumentasi API (REST API Endpoints)

SmartStock Pro menyediakan endpoint API terproteksi berbasis JSON untuk integrasi sistem eksternal:

#### A. Autentikasi
- **POST `/api/auth/login`**
  - *Deskripsi*: Melakukan autentikasi pengguna dan membuat session baru.
  - *Payload (JSON)*: `{"username": "admin", "password": "Password123!"}`
  - *Response*: `{"success": true, "user": {"username": "admin", "role": "Admin"}}`

#### B. Produk
- **GET `/api/products`**
  - *Deskripsi*: Mengambil daftar produk terpaginasi dengan filter.
  - *Query Params*: `page=1&limit=10&search=laptop&category_id=2`
  - *Response*: `{"data": [...], "pagination": {"total": 120, "pages": 12}}`
- **POST `/api/products`**
  - *Deskripsi*: Menambahkan produk baru (Admin/Manajer).
  - *Payload (JSON)*: `{"sku": "EL-MON-002", "name": "LG Monitor 24", "category_id": 1, "supplier_id": 2, "price": 2500000, "min_stock": 5}`

#### C. Transfer Gudang (Pemrosesan Paralel)
- **POST `/api/transfers`**
  - *Deskripsi*: Melakukan transfer stok paralel antar gudang.
  - *Payload (JSON)*: `{"product_id": 1, "from_warehouse_id": 1, "to_warehouse_id": 2, "quantity": 50}`
  - *Response*: `{"success": true, "message": "Transfer paralel berhasil diselesaikan.", "transaction_code": "TRF-20260526-0001"}`

---

### 4. Panduan Troubleshooting (Penyelesaian Masalah Umum)

#### Masalah 1: Muncul Error "403 Forbidden - Invalid CSRF Token"
- **Penyebab**: Sesi browser Anda telah kedaluwarsa atau token keamanan CSRF di halaman web tidak cocok dengan server.
- **Solusi**: Cukup muat ulang (*refresh*) halaman browser Anda dengan menekan tombol `F5` atau `Ctrl+R`, lalu lakukan login ulang.

#### Masalah 2: Import CSV Gagal di Tengah Jalan
- **Penyebab**: Ada format karakter yang tidak sesuai UTF-8, pemisah kolom bukan koma (`,`), atau ada SKU yang bertabrakan di baris tengah.
- **Solusi**: Buka file CSV menggunakan aplikasi text editor (seperti Notepad++ atau VS Code), pastikan enkripsinya adalah UTF-8 dan pemisahnya adalah koma. Perbaiki baris data yang bermasalah dan upload kembali.

#### Masalah 3: Notifikasi Stok Menipis Tidak Muncul di Dashboard Staf
- **Penyebab**: Hak akses peran Staf Gudang dibatasi hanya untuk melihat peringatan stok di gudang fisiknya sendiri, bukan gudang kota lain.
- **Solusi**: Pastikan akun staf tersebut telah dikaitkan dengan ID Gudang yang benar di profil pengguna.
