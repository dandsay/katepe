/**
 * Route Handler: Statistik Rekapitulasi Database Cloudflare D1
 */
import { jsonResponse } from "../utils/response.js";

export async function handleStats(request, env, url) {
    try {
        const year = url ? url.searchParams.get("year") : null;
        const jenis = url ? (url.searchParams.get("jenis") || "KTP") : "KTP";
        const targetJenis = jenis || "ALL";
        const isAllYear = !year || year === "ALL";

        // Query 1: Single-pass conditional aggregation (DB global + filter spesifik)
        let statsQuery = "";
        let statsParams = [];

        if (isAllYear) {
            statsQuery = `
                SELECT 
                    COUNT(*) as dbTotal,
                    COUNT(CASE WHEN jenis_berkas = 'KTP' THEN 1 END) as dbKtp,
                    COUNT(CASE WHEN jenis_berkas = 'KIA' THEN 1 END) as dbKia,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) THEN 1 END) as total,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND (tgl_ambil IS NOT NULL AND tgl_ambil != '') THEN 1 END) as sent,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND (tgl_ambil IS NULL OR tgl_ambil = '') THEN 1 END) as pending,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND keterangan = 'Perekaman Baru 17 Tahun' THEN 1 END) as ikd
                FROM rekap_berkas
            `;
            statsParams = [
                targetJenis, targetJenis,
                targetJenis, targetJenis,
                targetJenis, targetJenis,
                targetJenis, targetJenis
            ];
        } else {
            const startYear = `${year}-01-01`;
            const endYear = `${year}-12-31`;

            statsQuery = `
                SELECT 
                    COUNT(*) as dbTotal,
                    COUNT(CASE WHEN jenis_berkas = 'KTP' THEN 1 END) as dbKtp,
                    COUNT(CASE WHEN jenis_berkas = 'KIA' THEN 1 END) as dbKia,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND tgl_datang >= ? AND tgl_datang <= ? THEN 1 END) as total,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND (tgl_ambil IS NOT NULL AND tgl_ambil != '') AND tgl_datang >= ? AND tgl_datang <= ? THEN 1 END) as sent,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND (tgl_ambil IS NULL OR tgl_ambil = '') AND tgl_datang <= ? THEN 1 END) as pending,
                    COUNT(CASE WHEN (? = 'ALL' OR jenis_berkas = ?) AND keterangan = 'Perekaman Baru 17 Tahun' AND tgl_datang >= ? AND tgl_datang <= ? THEN 1 END) as ikd
                FROM rekap_berkas
            `;
            statsParams = [
                targetJenis, targetJenis, startYear, endYear,
                targetJenis, targetJenis, startYear, endYear,
                targetJenis, targetJenis, endYear,
                targetJenis, targetJenis, startYear, endYear
            ];
        }

        const stmtStats = env.DB.prepare(statsQuery).bind(...statsParams);
        const stmtYears = env.DB.prepare(
            "SELECT DISTINCT substr(tgl_datang, 1, 4) as tahun FROM rekap_berkas WHERE tgl_datang IS NOT NULL AND length(tgl_datang) >= 4 ORDER BY tahun DESC"
        );

        // Eksekusi stats dan list tahun dalam 1 batch network roundtrip
        const [resStats, resYears] = await env.DB.batch([stmtStats, stmtYears]);
        const row = resStats?.results?.[0] || {};
        const availableYears = (resYears?.results || []).map(r => r.tahun).filter(Boolean);

        return jsonResponse({
            success: true,
            total: row.total || 0,
            sent: row.sent || 0,
            pending: row.pending || 0,
            ikd: row.ikd || 0,
            dbTotal: row.dbTotal || 0,
            dbKtp: row.dbKtp || 0,
            dbKia: row.dbKia || 0,
            years: availableYears
        });
    } catch (err) {
        console.error("Error get stats:", err);
        return jsonResponse({ success: false, error: "Gagal memuat data statistik." }, 500);
    }
}
