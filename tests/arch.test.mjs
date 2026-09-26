// Uji BEKU arsitektur KATEPE: gagal bila struktur/keamanan inti berubah.
// Gerbang pengaman: `npm run gate` (== npm test + freeze --check) harus hijau sebelum deploy.
// Pola dipelajari dari brankas-esp32: byte-freeze + invarian logika, bukan sekadar tulisan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// NIK parser memakai namespace window.* (tanpa build); sediakan stub minimal.
globalThis.window = globalThis.window || {};
await import('../public/js/nik-parser.js');
const NIKHelper = globalThis.window.NIKHelper;

const jsDir = new URL('../public/js/', import.meta.url);
const readJS = (f) => readFileSync(new URL(f, jsDir), 'utf8');
const readRoot = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const readSrc = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('daftar modul frontend beku: tepat 11 file, tanpa file baru/liar', () => {
  const files = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(files, [
    'auth.js', 'cipher.js', 'crypto.js', 'filter.js', 'laporan-bulanan.js', 'modals.js',
    'nik-parser.js', 'print-rw.js', 'sync-status.js', 'table-renderer.js', 'ui-helpers.js',
  ]);
});

test('daftar modul backend beku: router + 4 routes + 2 utils', () => {
  const routes = readdirSync(new URL('../src/routes/', import.meta.url)).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(routes, ['auth.js', 'berkas.js', 'laporan.js', 'stats.js']);
  const utils = readdirSync(new URL('../src/utils/', import.meta.url)).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(utils, ['auth-crypto.js', 'response.js']);
  const index = readSrc('index.js');
  assert.match(index, /handleAuthVerify/);
  assert.match(index, /handleGetBerkas/);
  assert.match(index, /handleStats/);
  assert.match(index, /handleLaporanBulanan/);
  assert.match(index, /handleUnsyncAll/);
});

test('parameter kripto klien beku: AES-GCM-256 + PBKDF2 50.000 + salt + NIK hash', () => {
  const crypto = readJS('crypto.js');
  assert.match(crypto, /AES-GCM/);
  assert.match(crypto, /length: 256/);
  assert.match(crypto, /PBKDF2/);
  assert.match(crypto, /SHA-256/);
  assert.match(crypto, /iterations: 50000/);
  assert.match(crypto, /kelurahan-aac-salt-2026/);
  assert.match(crypto, /getRandomValues\(new Uint8Array\(12\)\)/);
  assert.match(crypto, /combined\.set\(iv, 0\)/);
  // Pencarian O(1) via SHA-256 NIK — jangan ganti algoritma diam-diam
  assert.match(crypto, /hashNIK/);
  assert.match(crypto, /digest\("SHA-256"/);
});

test('parameter kripto server beku: PBKDF2 100.000 + HMAC session 12 jam + timing-safe', () => {
  const auth = readSrc('utils/auth-crypto.js');
  assert.match(auth, /computePbkdf2Hash/);
  assert.match(auth, /iterations = 100000/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /HMAC/);
  assert.match(auth, /SHA-256/);
  assert.match(auth, /12 \* 3600/);
  assert.match(auth, /verifySessionToken/);
  assert.match(auth, /createSessionToken/);
  const gen = readRoot('scripts/generate-pin-hash.js');
  assert.match(gen, /100000/);
  assert.match(gen, /pbkdf2\$/);
});

test('tanpa PRNG lemah di area beku', () => {
  for (const f of ['auth', 'cipher', 'crypto', 'filter', 'laporan-bulanan', 'modals', 'nik-parser', 'print-rw', 'sync-status', 'table-renderer', 'ui-helpers']) {
    const src = readJS(`${f}.js`);
    assert.ok(!/Math\.random\s*\(/.test(src), `${f}.js: tanpa Math.random()`);
  }
  for (const f of ['index', 'routes/berkas', 'routes/auth', 'routes/stats', 'routes/laporan', 'utils/auth-crypto', 'utils/response']) {
    const src = readSrc(`${f}.js`);
    assert.ok(!/Math\.random\s*\(/.test(src), `src/${f}.js: tanpa Math.random()`);
  }
});

test('skema zero-knowledge beku: nik_hash + 3 kolom *_encrypted + unik komposit', () => {
  const schema = readRoot('schema.sql');
  for (const col of ['nik_hash', 'nik_encrypted', 'nama_encrypted', 'alamat_encrypted']) {
    assert.ok(schema.includes(col), `kolom ${col} wajib ada`);
  }
  assert.match(schema, /idx_nik_hash/);
  assert.match(schema, /idx_nik_tgl_jenis/);
  assert.match(schema, /UNIQUE.*nik_hash.*tgl_datang.*jenis_berkas/si);
  // Enum inti jangan berubah diam-diam
  assert.ok(schema.includes("'KTP'") && schema.includes("'KIA'"), 'enum jenis berkas wajib ada');
  assert.ok(schema.includes("'TERSEDIA'") || readSrc('routes/berkas.js').includes('TERSEDIA'), 'status TERSEDIA wajib ada');
});

test('permukaan API stabil: endpoint inti ada di router', () => {
  const index = readSrc('index.js');
  for (const ep of ['/api/auth/verify', '/api/stats', '/api/laporan-bulanan', '/api/berkas', '/api/berkas/unsync-all', '/api/berkas/batch']) {
    assert.ok(index.includes(ep), `endpoint ${ep} wajib ada`);
  }
  assert.match(index, /startsWith\("\/api\/berkas\/"\)/);
  assert.match(index, /Authorization/);
  assert.match(index, /Bearer /);
  assert.match(index, /verifySessionToken/);
  assert.match(index, /401/);
  assert.match(index, /env\.ASSETS/);
  assert.match(index, /OPTIONS/);
});

test('endpoint batch DIMATIKAN PERMANEN (410 Gone) — jangan dihidupkan lagi', () => {
  const index = readSrc('index.js');
  assert.match(index, /DIMATIKAN PERMANEN/);
  assert.match(index, /410/);
  assert.ok(index.includes('Endpoint batch sudah dimatikan'), 'pesan 410 wajib ada');
  const berkas = readSrc('routes/berkas.js');
  assert.match(berkas, /DIHAPUS PERMANEN/);
  // Tidak ada handler batch aktif yang bisa diimpor router
  assert.ok(!/export async function handleBatch/.test(berkas), 'handler batch tidak boleh hidup lagi');
  assert.ok(!/handleBatch/.test(index), 'router tidak boleh merujuk handler batch');
});

test('jaring pengaman tanggal beku: tgl_ambil tidak boleh < tgl_datang', () => {
  const berkas = readSrc('routes/berkas.js');
  // Create guard
  assert.match(berkas, /tgl_ambil && tgl_datang && tgl_ambil < tgl_datang/);
  // Update guard dua arah (ambil vs datang)
  assert.match(berkas, /body\.tgl_ambil !== undefined/);
  assert.match(berkas, /body\.tgl_datang !== undefined/);
  assert.ok(berkas.includes('Jaring Pengaman Administrasi'), 'label jaring pengaman wajib ada');
});

test('opsi duplikat beku: 409 + force_new + flag lupa lapor + ARSIP dikecualikan', () => {
  const berkas = readSrc('routes/berkas.js');
  assert.match(berkas, /conflict: true/);
  assert.match(berkas, /409/);
  assert.match(berkas, /force_new !== true/);
  assert.match(berkas, /force_new === true/);
  assert.match(berkas, /catatan_admin/);
  assert.ok(berkas.includes('BELUM DILAPORKAN'), 'flag lupa lapor wajib ada');
  assert.match(berkas, /hubungan_pengambil != 'ARSIP'/);
  // Hapus duplikat persis (nik_hash + tgl_datang + jenis) sebelum insert
  assert.match(berkas, /DELETE FROM rekap_berkas WHERE nik_hash = \? AND tgl_datang = \? AND jenis_berkas = \?/);
  // Update menjaga unik komposit
  assert.match(berkas, /nik_hash = \? AND tgl_datang = \? AND jenis_berkas = \? AND id != \?/);
  // Saat diserahkan, flag dikosongkan
  assert.match(berkas, /catatan_admin = ''/);
});

test('mode baca hemat kuota beku: scope + pending/sent + batch tahun', () => {
  const berkas = readSrc('routes/berkas.js');
  assert.match(berkas, /scope/);
  assert.match(berkas, /archive/);
  assert.match(berkas, /PENDING/);
  assert.match(berkas, /SENT/);
  assert.match(berkas, /nik_hash = \?/);
  assert.match(berkas, /env\.DB\.batch/);
  const stats = readSrc('routes/stats.js');
  assert.match(stats, /single-pass|COUNT\(\*\) as dbTotal/s);
  assert.match(stats, /env\.DB\.batch/);
  const laporan = readSrc('routes/laporan.js');
  assert.match(laporan, /substr\(tgl_datang, 1, 7\)/);
  assert.match(laporan, /substr\(tgl_ambil, 1, 7\)/);
  assert.match(laporan, /total_masuk/);
  assert.match(laporan, /total_keluar/);
});

test('NIK parser beku: format 16 digit + pivot tahun + proteksi 17 thn', () => {
  assert.equal(typeof NIKHelper, 'object');
  // NIK valid laki-laki: 3578010101060001 -> lahir 01-01-2006
  const laki = NIKHelper.parse('3578010101060001', 'KTP');
  assert.equal(laki.isValid, true);
  assert.equal(laki.formattedBirth, '01-01-2006');
  // Perempuan: hari +40 (41 -> tgl 1)
  const perempuan = NIKHelper.parse('3578014101060001', 'KTP');
  assert.equal(perempuan.isValid, true);
  assert.equal(perempuan.day, 1);
  // Pivot tahun: <=26 -> 2000-an, >26 -> 1900-an
  assert.equal(NIKHelper.parse('3578010101260001', 'KTP').year, 2026);
  assert.equal(NIKHelper.parse('3578010101270001', 'KTP').year, 1927);
  // NIK pendek ditolak
  assert.equal(NIKHelper.parse('123', 'KTP').isValid, false);
  // Keterangan: KIA selalu cetak biasa; KTP umur 17 -> perekaman baru
  assert.equal(NIKHelper.parse('3578010101060001', 'KIA').keterangan, 'Cetak Biasa KIA');
  // Status: sudah diambil -> SELESAI; di bawah umur & belum diambil -> TAHAN
  assert.equal(NIKHelper.computeStatus('2026-01-02', '2026-01-01', null), 'SELESAI');
  assert.equal(NIKHelper.computeStatus('', '2026-01-01', { isUnderage: true }), 'TAHAN (BELUM 17 TH)');
  assert.equal(NIKHelper.computeStatus('', '2026-01-01', { isUnderage: false }), 'TERSEDIA');
  // Mask + lansia
  assert.ok(NIKHelper.maskNIK('3578010101060001').includes('******'), 'mask wajib ada');
  assert.equal(NIKHelper.isLansia({ jenis_berkas: 'KIA' }), false);
  // Enum status di source jangan berubah diam-diam
  const src = readJS('nik-parser.js');
  assert.match(src, /Perekaman Baru 17 Tahun/);
  assert.match(src, /Cetak Biasa KTP/);
  assert.match(src, /Cetak Biasa KIA/);
  assert.match(src, /TAHAN \(BELUM 17 TH\)/);
});

test('tombol arsip kontekstual: di baris ARSIP tampil Batal Arsip (bukan ARSIP)', () => {
  const t = readJS('table-renderer.js');
  assert.ok(t.includes('Batal Arsip'), 'label Batal Arsip wajib ada (mobile + desktop)');
  assert.ok(!/isArsip \? ['"]ARSIP['"]/.test(t), 'label ARSIP mentah sebagai aksi tidak boleh ada');
  assert.ok(t.includes('undo-2'), 'ikon unarchive (undo-2) wajib ada');
  assert.ok(t.includes('kembalikan ke antrean aktif'), 'tooltip kembalikan ke antrean wajib ada');
  // Modal konfirmasi batal-arsip (amber) vs arsipkan (rose) tetap dibedakan
  const s = readJS('sync-status.js');
  assert.match(s, /Batalkan Status ARSIP\?/);
  assert.match(s, /Ya, Batalkan ARSIP/);
});

test('mode ARSIP selalu pakai tabel TOTAL: tak terbawa filter Diambil/Belum', () => {
  const f = readJS('filter.js');
  // Masuk ARSIP: paksa ALL + simpan filter lama; keluar ARSIP: kembalikan
  assert.ok(f.includes('savedStatusBeforeArsip'), 'penampung filter pra-ARSIP wajib ada');
  assert.ok(f.includes('selStatus.value = "ALL"'), 'masuk ARSIP wajib paksa status ALL (TOTAL)');
  assert.ok(f.includes('selStatus.value = savedStatusBeforeArsip'), 'keluar ARSIP wajib kembalikan filter semula');
  // Reset filter di mode ARSIP tidak boleh mengembalikan PENDING
  assert.match(f, /activeJenis === "ARSIP"\) \? "ALL" : "PENDING"/);
  // Data ARSIP memang mengabaikan status (hanya RW + sync yang berlaku)
  assert.match(f, /if \(isArsipMode\) \{[\s\S]*?if \(!isArsip\) return false;/);
});

test('portal cipher beku: scramble deterministik ala brankas + terpasang di portal', async () => {
  // Logika murni deterministik (diport dari brankas-esp32 cipher.js)
  globalThis.window = globalThis.window || {};
  await import('../public/js/cipher.js');
  const PC = globalThis.window.PortalCipher;
  assert.equal(typeof PC, 'object');
  assert.deepEqual(
    [PC.PHASE.TYPE, PC.PHASE.SPIN0, PC.PHASE.DECRYPT, PC.PHASE.HOLD, PC.PHASE.ENCRYPT, PC.PHASE.SPIN],
    [24, 14, 24, 22, 24, 19]
  );
  const base = 'Database kependudukan';
  assert.equal(PC.renderCipherTick(base, -1), '');
  assert.equal(PC.renderCipherTick(base, 0), '', 'intro buka dari kosong');
  const tengah = PC.renderCipherTick(base, 11);
  assert.ok(tengah.length > 0 && tengah.length < base.length, 'intro tumbuh bertahap');
  const penuhAcak = PC.renderCipherTick(base, PC.PHASE.TYPE - 1);
  assert.equal(penuhAcak.length, base.length);
  assert.notEqual(penuhAcak, base, 'fase acak tidak menampilkan teks asli');
  assert.equal(PC.renderCipherTick(base, PC.PHASE.INTRO + PC.PHASE.DECRYPT - 1), base);
  assert.equal(PC.renderCipherTick(base, PC.PHASE.INTRO + PC.PHASE.DECRYPT), base);
  assert.match(PC.rotorTick(0, 0), /^[A-Z]$/);
  assert.equal(typeof globalThis.window.initPortalCipher, 'function');
  // Intro langsung acak penuh (bukan dari nol): start tick = INTRO - 1
  const cipherSrc = readJS('cipher.js');
  assert.ok(cipherSrc.includes('PHASE.INTRO - 1'), 'intro wajib mulai dari acak penuh');
  // Terpasang hanya pada frasa kunci portal login (selebihnya statis)
  const html = readRoot('public/index.html');
  assert.match(html, /Database kependudukan <span data-scramble[^>]*>Terenkripsi End-to-end<\/span> dengan kunci lokal\./);
  assert.match(html, /js\/cipher\.js\?v=/);
  // Hormati reduced-motion + kunci anti layout-shift
  const css = readRoot('public/css/style.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /portal-cipher-desc/);
  assert.match(css, /shadow-orbit/);
});

test('auth backend beku: PIN verify + bruteforce delay + Bearer helper', () => {
  const authRoute = readSrc('routes/auth.js');
  assert.match(authRoute, /verifyPin/);
  assert.match(authRoute, /createSessionToken/);
  assert.match(authRoute, /setTimeout.*500/);
  const frontend = readJS('auth.js');
  assert.match(frontend, /getAuthHeaders/);
  assert.match(frontend, /Bearer \$/);
  assert.match(frontend, /AppCrypto\.deriveKey/);
});

test('konfigurasi wrangler beku: binding DB + assets ./public', () => {
  const w = readRoot('wrangler.jsonc');
  assert.match(w, /"binding": "DB"/);
  assert.match(w, /ktp-kia-db/);
  assert.match(w, /"directory": "\.\/public"/);
  assert.match(w, /"binding": "ASSETS"/);
  assert.match(w, /"main": "src\/index\.js"/);
});
