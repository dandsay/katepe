/**
 * Bangun direktori "pages/" untuk Cloudflare Pages.
 *
 * Pages DI SINI KHUSUS halaman verifikasi warga (bukan aplikasi staf).
 * Sumber tunggal ada di folder warga/ — sengaja TIDAK di public/, agar Worker
 * (aplikasi staf) tidak menyajikan halaman warga sama sekali. Logo tetap satu
 * sumber di public/img/ dan disalin saat build. Tidak ada file kembar.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("pages", { recursive: true, force: true });
mkdirSync("pages", { recursive: true });
cpSync("warga/index.html", "pages/index.html");
cpSync("warga/verify.html", "pages/verify.html");
cpSync("warga/robots.txt", "pages/robots.txt");
cpSync("warga/_headers", "pages/_headers");
cpSync("public/img", "pages/img", { recursive: true });
console.log("pages/ siap: index.html (pendarat) + verify.html + robots.txt + _headers + img/ (halaman verifikasi warga).");
