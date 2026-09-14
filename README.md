# 📖 Novel Reader

Website untuk membaca novel bahasa Inggris dengan terjemahan otomatis menggunakan Speech-to-Text.

## Fitur
- 🎤 Speech-to-Text — bacakan novel, teks muncul otomatis
- 🌐 Terjemahan otomatis via Google Translate
- 🔊 Text-to-Speech — dengarkan terjemahan
- ☁️ Sinkronisasi cloud via Firebase Firestore
- 🔍 Pencarian dalam perpustakaan
- 📱 Responsif untuk HP dan PC

## Cara Deploy ke GitHub Pages

### 1. Buat repository baru di GitHub
- Pergi ke https://github.com/new
- Nama repository: `novel-reader`
- Set ke **Public**
- Klik **Create repository**

### 2. Upload semua file
- Klik **uploading an existing file**
- Drag & drop semua file dan folder (index.html, css/, js/)
- Klik **Commit changes**

### 3. Aktifkan GitHub Pages
- Buka tab **Settings** di repository
- Klik **Pages** di sidebar kiri
- Source: pilih **Deploy from a branch**
- Branch: pilih **main**, folder: **/ (root)**
- Klik **Save**

### 4. Akses website
Dalam 1-2 menit, website bisa diakses di:
```
https://[username-github-kamu].github.io/novel-reader
```

## Catatan
- Gunakan Google Chrome atau Microsoft Edge untuk fitur mikrofon
- Butuh koneksi internet untuk terjemahan dan sinkronisasi Firebase
- Data tersimpan di Firebase Firestore dan bisa diakses dari semua perangkat
