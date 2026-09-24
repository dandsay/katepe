# Panduan Berkontribusi (Contributing Guide)

Halo rekan-rekan staf pemerintahan (kelurahan, desa, kecamatan), pegiat IT publik, dan developer se-Indonesia! Terima kasih atas ketertarikan Anda untuk berkontribusi pada **KATEPE (Sistem Rekapitulasi Database KTP & KIA Digital)**.

---

## 💡 Cara Berpartisipasi

1. **Melaporkan Kendala / Masalah:** Buka [GitHub Issues](https://github.com/dandsay/katepe/issues) jika Anda menemukan bug atau kebingungan saat setup.
2. **Usulan Ide / Fitur:** Punya alur kependudukan atau format laporan khas daerah Anda? Diskusikan di Issue.
3. **Kirim Pull Request (PR):**
   - Fork repositori ini.
   - Buat branch fitur Anda: `git checkout -b fitur/nama-fitur`.
   - Lakukan commit dengan deskripsi yang jelas.
   - Buka Pull Request ke branch `main`.

---

## 🛠️ Standar Pengembangan

- **Zero-Knowledge Encryption Wajib:** Data NIK, Nama, dan Alamat warga **tidak boleh** dikirim dalam bentuk teks polos (*plaintext*) ke server/database. Wajib selalu melalui enkripsi Web Crypto API (AES-GCM 256-bit).
- **Zero-Cost Server:** Pertahankan agar sistem tetap ringan dan ramah paket gratis Cloudflare Workers & D1.

---

## 🇮🇩 Semangat Pelayanan Publik
Mari satukan langkah untuk mendigitalkan birokrasi pemerintahan desa dan kelurahan di seluruh penjuru Indonesia!
