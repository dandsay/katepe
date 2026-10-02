/**
 * Cloudflare Worker Backend for Rekapitulasi KTP & KIA
 * Kelurahan Alun-Alun Contong
 * 
 * Modular Entry Point & Router
 */

import { jsonResponse } from "./utils/response.js";
import { verifySessionToken } from "./utils/auth-crypto.js";
import { handleAuthVerify } from "./routes/auth.js";
import { handleStats } from "./routes/stats.js";
import { handleLaporanBulanan } from "./routes/laporan.js";
import { handleCreateVerify, handleGetVerify, cleanupExpiredVerify } from "./routes/verify-rw.js";
import {
    handleGetBerkas,
    handleCreateBerkas,
    handleUpdateBerkas,
    handleDeleteBerkas,
    handleUnsyncAll
} from "./routes/berkas.js";

export default {
    async fetch(request, env, ctx) {
        // 1. Handle CORS Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
            });
        }

        const url = new URL(request.url);

        // 2. Security Check for API routes (Session Token Gatekeeper)
        // Pengecualian publik: /api/auth/verify + GET /api/verify-rw/:token (QR warga).
        // POST /api/verify-rw tetap wajib Bearer (staf saja).
        const isPublicVerifyGet = request.method === "GET" && url.pathname.startsWith("/api/verify-rw/");
        if (url.pathname.startsWith("/api/") && url.pathname !== "/api/auth/verify" && !isPublicVerifyGet) {
            let authorized = false;

            // Otorisasi Resmi: Authorization Header (Bearer Session Token HMAC-SHA256)
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                const token = authHeader.substring(7).trim();
                const session = await verifySessionToken(token, env);
                if (session) {
                    authorized = true;
                }
            }

            if (!authorized) {
                return jsonResponse({ success: false, error: "Akses ditolak. Sesi tidak valid atau telah kedaluwarsa." }, 401);
            }
        }

        // 3. API Route Dispatcher
        // 3.1 Auth
        if (url.pathname === "/api/auth/verify" && request.method === "POST") {
            return handleAuthVerify(request, env);
        }

        // 3.2 Statistik Database
        if (url.pathname === "/api/stats" && request.method === "GET") {
            return handleStats(request, env, url);
        }

        // 3.4 Rekap Laporan Bulanan
        if (url.pathname === "/api/laporan-bulanan" && request.method === "GET") {
            return handleLaporanBulanan(request, env, url);
        }

        // 3.45 Verifikasi Publik Laporan RW (QR 7 hari, snapshot mask)
        if (url.pathname === "/api/verify-rw" && request.method === "POST") {
            return handleCreateVerify(request, env);
        }
        if (url.pathname.startsWith("/api/verify-rw/") && request.method === "GET") {
            const token = decodeURIComponent(url.pathname.split("/")[3] || "");
            return handleGetVerify(request, env, token);
        }

        // 3.5 Berkas: Batch Upsert — DIMATIKAN PERMANEN (410 Gone).
        // Migrasi spreadsheet (era GAS) telah selesai; proses data kini 100%
        // manual via web. Endpoint ini pernah jadi pintu tanpa penjagaan
        // (melewati validasi tanggal/enum/duplikat), jadi dibekukan penuh.
        if (url.pathname === "/api/berkas/batch") {
            return jsonResponse({
                success: false,
                error: "Endpoint batch sudah dimatikan. Migrasi spreadsheet telah selesai — gunakan input manual di aplikasi web."
            }, 410);
        }

        // 3.6 Berkas: Unsync All
        if (url.pathname === "/api/berkas/unsync-all" && request.method === "POST") {
            return handleUnsyncAll(request, env, url);
        }

        // 3.7 Berkas: List & Create
        if (url.pathname === "/api/berkas") {
            if (request.method === "GET") return handleGetBerkas(request, env, url);
            if (request.method === "POST") return handleCreateBerkas(request, env);
        }

        // 3.8 Berkas: Update & Delete by ID (/api/berkas/:id)
        if (url.pathname.startsWith("/api/berkas/")) {
            const id = url.pathname.split("/")[3];
            if (request.method === "PUT") return handleUpdateBerkas(request, env, id);
            if (request.method === "DELETE") return handleDeleteBerkas(request, env, id);
        }

        // 4. Static Assets Fallthrough (Frontend UI)
        // Anti-crawler: semua aset statis diberi X-Robots-Tag agar tidak diindeks.
        if (env.ASSETS) {
            const res = await env.ASSETS.fetch(request);
            const headers = new Headers(res.headers);
            headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
            return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
        }

        return new Response("Not Found", { status: 404 });
    },

    // Cron harian: bersihkan tautan verifikasi QR yang lewat 7 hari
    async scheduled(event, env, ctx) {
        ctx.waitUntil(cleanupExpiredVerify(env));
    }
};
