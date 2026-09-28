/**
 * Route Handler: Verifikasi Publik Laporan RW (QR snapshot 7 hari)
 * POST /api/verify-rw      (staf, Bearer) — buat 1 token aktif per RW+jenis
 * GET  /api/verify-rw/:t   (publik, tanpa auth) — baca snapshot mask
 * Hanya menyimpan data MASK (nik 6******, nama, alamat, status).
 * Tanpa ciphertext / NIK penuh / PIN.
 */
import { jsonResponse } from "../utils/response.js";

export const VERIFY_TTL_MS = 7 * 24 * 3600 * 1000;
export const VERIFY_CONTACT_WA = "0821 4770 2966";

function isHex32(s) {
    return typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalRows(rw, jenis, rows) {
    return rows.map((r) => [r.no ?? "", r.nik_mask ?? "", r.nama ?? "", r.alamat ?? "", r.tgl_datang ?? "", r.status ?? ""].join("|")).join("\n") + `|${rw}|${jenis}`;
}

function sanitizeRows(rows) {
    if (!Array.isArray(rows)) return null;
    if (rows.length === 0 || rows.length > 500) return null;
    const clean = [];
    for (const r of rows) {
        if (!r || typeof r !== "object") return null;
        const no = Number(r.no);
        if (!Number.isFinite(no)) return null;
        clean.push({
            no,
            nik_mask: String(r.nik_mask ?? "").slice(0, 32),
            nama: String(r.nama ?? "").slice(0, 120),
            alamat: String(r.alamat ?? "").slice(0, 200),
            tgl_datang: String(r.tgl_datang ?? "").slice(0, 20),
            status: String(r.status ?? "").slice(0, 40),
        });
    }
    return clean;
}

// POST /api/verify-rw — dipanggil staf saat cetak laporan RW
export async function handleCreateVerify(request, env) {
    try {
        const body = await request.json();
        const rw = String(body?.rw ?? "").slice(0, 16);
        let jenis = String(body?.jenis ?? "KTP").toUpperCase().slice(0, 8);
        if (jenis === "E-KTP") jenis = "KTP";
        const rows = sanitizeRows(body?.rows);

        if (!rw || (jenis !== "KTP" && jenis !== "KIA") || !rows) {
            return jsonResponse({ success: false, error: "Payload verifikasi tidak valid (rw/jenis/rows)." }, 400);
        }

        const contentHash = await sha256Hex(canonicalRows(rw, jenis, rows));
        const now = new Date();

        // Smart reuse: isi sama persis (hash sama) + belum expired → pakai token
        // lama, cukup geser expires_at +7 hari (sliding). Hemat, tanpa URL baru.
        const existing = await env.DB.prepare(
            "SELECT token, content_hash, expires_at FROM verifikasi_rw WHERE rw = ? AND jenis = ?"
        ).bind(rw, jenis).first().catch(() => null);

        if (existing && existing.content_hash === contentHash && existing.expires_at && new Date(existing.expires_at).getTime() > now.getTime()) {
            const refreshed = new Date(now.getTime() + VERIFY_TTL_MS);
            await env.DB.prepare(
                "UPDATE verifikasi_rw SET payload_json = ?, expires_at = ? WHERE token = ?"
            ).bind(JSON.stringify(rows), refreshed.toISOString(), existing.token).run();
            await env.DB.prepare("DELETE FROM verifikasi_rw WHERE expires_at <= ?").bind(now.toISOString()).run().catch(() => {});
            return jsonResponse({ success: true, reused: true, token: existing.token, url_path: `/verify?c=${existing.token}`, content_hash: contentHash, expires_at: refreshed.toISOString() });
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const expires = new Date(now.getTime() + VERIFY_TTL_MS);

        // Anti-penuh: 1 RW + 1 jenis = 1 token aktif (cetak ulang beda isi mengganti lama)
        await env.DB.prepare("DELETE FROM verifikasi_rw WHERE rw = ? AND jenis = ?").bind(rw, jenis).run();
        await env.DB.prepare(
            "INSERT INTO verifikasi_rw (token, rw, jenis, payload_json, content_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(token, rw, jenis, JSON.stringify(rows), contentHash, now.toISOString(), expires.toISOString()).run();

        // Bersih-bersih oportunistik: hapus yang sudah lewat (batasi 50 per cetak)
        await env.DB.prepare("DELETE FROM verifikasi_rw WHERE expires_at <= ?").bind(now.toISOString()).run().catch(() => {});

        return jsonResponse({ success: true, reused: false, token, url_path: `/verify?c=${token}`, content_hash: contentHash, expires_at: expires.toISOString() });
    } catch (err) {
        console.error("Error create verify:", err);
        return jsonResponse({ success: false, error: "Gagal membuat tautan verifikasi." }, 500);
    }
}

// GET /api/verify-rw/:token — publik tanpa auth
export async function handleGetVerify(request, env, token) {
    try {
        const t = String(token || "").split("?")[0].trim();
        if (!isHex32(t)) {
            return jsonResponse({ success: false, error: "Tautan tidak dikenal.", contact_wa: VERIFY_CONTACT_WA }, 404);
        }
        const row = await env.DB.prepare(
            "SELECT token, rw, jenis, payload_json, content_hash, created_at, expires_at FROM verifikasi_rw WHERE token = ?"
        ).bind(t).first();

        if (!row) {
            return jsonResponse({ success: false, error: "Tautan tidak dikenal.", contact_wa: VERIFY_CONTACT_WA }, 404);
        }
        if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
            await env.DB.prepare("DELETE FROM verifikasi_rw WHERE token = ?").bind(t).run().catch(() => {});
            return jsonResponse({ success: false, expired: true, error: "Tautan kedaluwarsa (7 hari).", contact_wa: VERIFY_CONTACT_WA, rw: row.rw }, 410);
        }

        let rows = [];
        try {
            rows = JSON.parse(row.payload_json || "[]");
        } catch {
            rows = [];
        }
        return jsonResponse({
            success: true,
            rw: row.rw,
            jenis: row.jenis,
            rows,
            content_hash: row.content_hash,
            created_at: row.created_at,
            expires_at: row.expires_at,
            contact_wa: VERIFY_CONTACT_WA,
        });
    } catch (err) {
        console.error("Error get verify:", err);
        return jsonResponse({ success: false, error: "Gagal memuat verifikasi." }, 500);
    }
}

// Dipakai cron harian + fallback manual
export async function cleanupExpiredVerify(env) {
    try {
        await env.DB.prepare("DELETE FROM verifikasi_rw WHERE expires_at <= ?").bind(new Date().toISOString()).run();
    } catch (err) {
        console.error("Error cleanup verify:", err);
    }
}
