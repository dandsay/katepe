---
name: cloudflare-dev
description: >-
  Panduan standar pengembangan ekosistem Cloudflare Workers, Cloudflare D1 (SQLite),
  Static Assets, dan Wrangler CLI yang disesuaikan dengan arsitektur dan kebiasaan di workspace cloudflare_dev.
---

# Panduan Standar Cloudflare Workers & D1 (Workspace cloudflare_dev)

Skill ini menetapkan alur kerja, standar arsitektur, dan perintah baku untuk pengembangan aplikasi berbasis Cloudflare Workers di lingkungan ini.

---

## 1. Profil Lingkungan & Akun
- **Wrangler Version**: v4.x (`wrangler 4.71.0`+)
- **Cloudflare Account ID**: `492cf9c3616beafb672b710a88266d3e` (Account: `umum`)
- **OAuth Status**: Terhubung (`mdandysafitra@gmail.com`)

---

## 2. Standar Arsitektur (Zero-Bloat & Modular)
1. **Backend (Workers)**:
   - Gunakan **Native ES Modules** (`export default { async fetch(request, env, ctx) { ... } }`).
   - Manfaatkan Web Standard APIs bawaan (`Request`, `Response`, `URL`, `crypto.subtle`) tanpa menambahkan dependency external npm berlebih.
   - Pecah kode menjadi modul berukuran ringkas (<200 baris per file) di folder `src/routes/` dan `src/utils/`.
2. **Database (Cloudflare D1)**:
   - Selalu gunakan binding `DB` untuk database SQLite edge.
   - Simpan DDL di file `schema.sql`.
   - Gunakan prepared statements (`env.DB.prepare(...).bind(...).run()` / `.all()`).
3. **Frontend (Static Assets)**:
   - Sajikan aset frontend langsung melalui asset binding:
     `assets: { "directory": "./public", "binding": "ASSETS" }`
   - Gunakan HTML + Vanilla JS modular + Tailwind CDN + Lucide Icons untuk performa instan tanpa langkah build yang rumit.
4. **Keamanan (Zero-Knowledge & Privacy)**:
   - Data warga/identitas sensitif dienkripsi di browser via Web Crypto API (AES-GCM 256-bit + PBKDF2) sebelum dikirim ke Worker/D1.
   - Amankan endpoint API dengan validasi PIN (`X-App-PIN` atau hash pepper).

---

## 3. Standar Konfigurasi `wrangler.jsonc`
Gunakan format `wrangler.jsonc` (bukan `.toml`):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<nama-worker>",
  "account_id": "492cf9c3616beafb672b710a88266d3e",
  "compatibility_date": "2026-09-18",
  "main": "src/index.js",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "<nama-db>",
      "database_id": "<uuid-database-d1>"
    }
  ],
  "vars": {
    "APP_PIN": "123456"
  }
}
```

---

## 4. Alur Kerja Perintah (Runbook)

### A. Validasi Konfigurasi & TypeScript Types
Sebelum menjalankan atau melakukan deployment, verifikasi struktur konfigurasi:
```bash
npx wrangler types
```

### B. Pengujian Lokal (Dev Mode)
Jalankan server pengembangan lokal (Worker + Static Assets + Local D1):
```bash
npx wrangler dev
```

### C. Manajemen Database Cloudflare D1
- **Melihat Daftar Database D1:**
  ```bash
  npx wrangler d1 list
  ```
- **Inisialisasi / Migrasi Skema ke Database Lokal (Testing):**
  ```bash
  npx wrangler d1 execute <database_name> --local --file=./schema.sql
  ```
- **Inisialisasi / Migrasi Skema ke Database Cloudflare Remote (Produksi):**
  > [!WARNING]
  > Selalu mintakan konfirmasi eksplisit dari pengguna sebelum mengeksekusi skrip ke database `--remote`.
  ```bash
  npx wrangler d1 execute <database_name> --remote --file=./schema.sql
  ```
- **Kueri Langsung D1 Remote:**
  ```bash
  npx wrangler d1 execute <database_name> --remote --command="SELECT count(*) FROM rekap_berkas;"
  ```

### D. Deployment ke Cloudflare
Deploy kode Worker & Static Assets ke edge network Cloudflare:
```bash
npx wrangler deploy
```

### E. Monitoring Real-time
Pantau log live dari worker yang berjalan:
```bash
npx wrangler tail <nama-worker>
```
