# ARSITEKTUR BEKU — KATEPE (Database KTP & KIA)

Dokumen ini adalah kontrak. Perubahan apa pun di bawah ini **wajib**
disertai pembaruan `tests/arch.test.mjs` + alasan eksplisit di commit.
Pola dipelajari dari `brankas-esp32` (byte-freeze + gate sebelum deploy).

## Lapisan (tetap)

| Lapisan | Isi | Aturan |
|---|---|---|
| `public/js/*.js` | 11 modul tanpa build (crypto, cipher portal, auth, nik-parser, filter, table, modals, sync, print, laporan, ui) | Daftar file beku; kosmetik (`index.html`/`css`/`img`) tidak dibekukan |
| `src/*.js` | Router + Bearer gatekeeper + `/api/berkas/batch` 410 + ASSETS fallthrough | Endpoint inti stabil (lihat bawah) |
| `src/routes/*.js` | 4 route: auth, berkas, stats, laporan | Handler inti tidak boleh hilang/rename diam-diam |
| `src/utils/*.js` | auth-crypto, response | Parameter kripto dipin |
| D1 `rekap_berkas` | `nik_hash` + 3 kolom `*_encrypted` first-class | Unik komposit `(nik_hash,tgl_datang,jenis_berkas)` dipertahankan |
| `tests/` | Gerbang pengaman (node bawaan) | Hijau = syarat deploy |
| `scripts/freeze.mjs` + `freeze.manifest.json` | SHA-256 per file (21 file) | 1 byte berubah → gate merah → deploy batal |

## Invarian keamanan (diuji)

1. Klien: AES-GCM 256 + PBKDF2-SHA256 **50.000 iterasi**, salt `kelurahan-aac-salt-2026`,
   IV acak 12-byte via `crypto.getRandomValues`; NIK dicari via `hashNIK` SHA-256 (O(1)).
2. Server: verifikasi PIN PBKDF2-SHA256 **100.000 iterasi** (`APP_PIN_HASH` format
   `pbkdf2$iter$salt$hash`) + `timingSafeEqual` + session HMAC-SHA256 **12 jam** Bearer.
3. Acak hanya `crypto.getRandomValues` — `Math.random(` dilarang di seluruh area beku.
4. Server tidak pernah melihat NIK/nama/alamat plaintext (hanya ciphertext + `nik_hash`
   + kolom non-PII `tgl/rw/jenis/status/keterangan/sinkronisasi`).
5. Semua `/api/*` (kecuali `/api/auth/verify`) wajib lewat `verifySessionToken`, gagal → 401.

## Invarian administrasi (diuji — jangan dilonggarkan diam-diam)

1. Validasi tanggal dua arah: `tgl_ambil < tgl_datang` ditolak di create maupun update
   (termasuk saat hanya satu sisi diubah — bandingkan ke DB).
2. Opsi duplikat aktif: NIK+jenis yang masih aktif (`tgl_ambil` kosong + bukan `ARSIP`)
   → **409 + `conflict:true` + daftar existing**; `force_new:true` membuat baru dan
   menandai lama dengan `catatan_admin='BELUM DILAPORKAN: KEMUNGKINAN SUDAH DIAMBIL'`;
   saat berkas diserahkan (`tgl_ambil` diisi) flag dikosongkan.
3. Duplikat persis (`nik_hash,tgl_datang,jenis_berkas`) dihapus sebelum insert;
   update menolak bila komposit target sudah dipakai baris lain.
4. **Batch dimatikan permanen**: `/api/berkas/batch` selalu **410 Gone**; tidak ada
   `handleBatch` hidup; migrasi spreadsheet era GAS selesai — semua input lewat
   penjagaan manual yang sama.
5. Baca hemat kuota: `scope=active|archive|all` + filter `PENDING/SENT` + cari NIK
   via `nik_hash` exact; stats single-pass + `DB.batch` tahun; laporan agregat
   `datang vs keluar per YYYY-MM` (`substr(...,1,7)`).
6. NIK parser: 16 digit, perempuan hari+40, pivot tahun `<=26→2000` else `1900`,
   `keterangan` (`Cetak Biasa KIA` / `Perekaman Baru 17 Tahun` saat umur 17 /
   `Cetak Biasa KTP`), `computeStatus` (`SELESAI`/`TAHAN (BELUM 17 TH)`/`TERSEDIA`),
   `maskNIK`, `isLansia(>=60)`.
7. Mode ARSIP selalu tabel TOTAL: masuk ARSIP memaksa status `ALL` (filter
   Diambil/Belum tab sebelumnya tidak terbawa ke kolom tabel), keluar ARSIP
   mengembalikan filter semula; reset filter di mode ARSIP tetap `ALL`.

## Beku byte-level (ditegakkan kode, bukan tulisan)

`scripts/freeze.mjs` + `freeze.manifest.json`: SHA-256 per file untuk
`public/js/*.js` (10), `src/**/*.js` (7), `schema.sql`, `wrangler.jsonc`,
dan skrip freeze itu sendiri (21 file).

- 1 byte berubah di area beku (termasuk 1 angka) → `--check` exit 1 →
  `npm run gate` merah → `npm run deploy` **batal sebelum wrangler jalan**.
- Perubahan sah: review `git diff` → `npm run freeze` → commit manifest
  + kode **bersamaan** (manifest basi = gate merah juga).

## Jalur pengaman (gate)

```
npm run deploy  =  npm run gate  &&  wrangler deploy
                       |                    |
              npm test + freeze --check   wrangler deploy
              (17 uji + 21 hash)          (hanya bila gate hijau)
```

- Lokal: `npm run gate` sebelum commit apa pun yang menyentuh kripto/NIK/validasi.
- Wrangler **tidak dijalankan manual** — selalu lewat `npm run deploy`
  agar deploy tanpa bukti gate hijau tidak mungkin terjadi.
- `git push` hanya setelah gate hijau. Sync publik (`scripts/sync-publik.sh`)
  tetap jalan setelahnya; ia menyalin `freeze.manifest.json` apa adanya.

## Yang boleh berubah tanpa mencairkan bekunya

Isi pesan error, label UI, gaya, ikon, teks toast, opsi RW di `index.html` —
selama invarian di atas tetap hijau. Menambah endpoint/tabel/kolom baru =
mencairkan bekunya (perlu uji + dokumen baru).
