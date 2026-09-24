-- ==============================================================================
-- Skema Database: Rekapitulasi Berkas KTP & KIA (Zero-Knowledge Architecture)
-- Engine: Cloudflare D1 (Serverless SQLite at Edge)
--
-- Seluruh PII (Personally Identifiable Information) seperti NIK, Nama, dan Alamat
-- disimpan dalam bentuk ciphertext terenkripsi di sisi klien dengan Web Crypto API
-- (AES-GCM 256-bit + PBKDF2). Pencarian cepat diindeks menggunakan NIK Hash (SHA-256).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS rekap_berkas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_urut INTEGER,
    tgl_datang TEXT NOT NULL,           -- YYYY-MM-DD
    jenis_berkas TEXT NOT NULL,         -- 'KTP' | 'KIA'
    nik_hash TEXT NOT NULL,             -- SHA-256 NIK untuk pencarian instan O(1)
    nik_encrypted TEXT NOT NULL,        -- Ciphertext NIK lengkap (AES-GCM 256-bit)
    nama_encrypted TEXT NOT NULL,       -- Ciphertext Nama Pemilik (AES-GCM 256-bit)
    alamat_encrypted TEXT,              -- Ciphertext Alamat (AES-GCM 256-bit)
    rw TEXT NOT NULL,                   -- Wilayah RW ('001', '002', dst)
    hubungan_pengambil TEXT DEFAULT 'Belum Diketahui', -- 'Yang Bersangkutan', 'Keluarga', 'Ketua RT', 'Ketua RW', 'KSH', 'Belum Diketahui', 'ARSIP'
    tgl_ambil TEXT,                     -- YYYY-MM-DD atau NULL
    status TEXT NOT NULL,               -- 'TERSEDIA', 'SELESAI', 'TAHAN (BELUM 17 TH)'
    kelahiran TEXT,                     -- DD-MM-YYYY (hasil parsing NIK)
    keterangan TEXT NOT NULL,           -- 'Cetak Biasa KIA' | 'Perekaman Baru 17 Tahun' | 'Cetak Biasa KTP'
    sinkronisasi TEXT DEFAULT 'BELUM',  -- 'SYNC' (Sudah Cocok Fisik) | 'BELUM' (Belum Cek Fisik)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rw ON rekap_berkas(rw);
CREATE INDEX IF NOT EXISTS idx_jenis ON rekap_berkas(jenis_berkas);
CREATE INDEX IF NOT EXISTS idx_status ON rekap_berkas(status);
CREATE INDEX IF NOT EXISTS idx_hubungan ON rekap_berkas(hubungan_pengambil);
CREATE INDEX IF NOT EXISTS idx_sinkronisasi ON rekap_berkas(sinkronisasi);
CREATE INDEX IF NOT EXISTS idx_nik_hash ON rekap_berkas(nik_hash);
CREATE INDEX IF NOT EXISTS idx_tgl_datang ON rekap_berkas(tgl_datang);
CREATE INDEX IF NOT EXISTS idx_tgl_ambil ON rekap_berkas(tgl_ambil);
CREATE INDEX IF NOT EXISTS idx_jenis_tgl ON rekap_berkas(jenis_berkas, tgl_datang);
CREATE INDEX IF NOT EXISTS idx_no_urut ON rekap_berkas(no_urut);
CREATE INDEX IF NOT EXISTS idx_updated_at ON rekap_berkas(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nik_tgl_jenis ON rekap_berkas(nik_hash, tgl_datang, jenis_berkas);

