/**
 * Cloudflare Pages Function — proxy HANYA endpoint verifikasi publik ke Worker.
 *
 * Halaman verifikasi warga disajikan oleh Pages (ktp-kia-aac.pages.dev), dan
 * pemanggilan "/api/verify-rw/<token>" diteruskan ke Worker yang memegang D1.
 * Endpoint staf lain (auth/berkas/stats/laporan) SENGAJA tidak diteruskan agar
 * domain publik ini tidak membuka permukaan API internal.
 */
const API_ORIGIN = "https://database-ktp-kia.pemkot.workers.dev";

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const target = API_ORIGIN + url.pathname + url.search;
    return fetch(new Request(target, context.request));
}
