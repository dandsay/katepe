/**
 * Route Handler: Laporan Rekapitulasi Bulanan KTP & KIA
 * Porting dari Google Apps Script (getRecapData)
 */
import { jsonResponse } from "../utils/response.js";

const MONTH_NAMES = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", 
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
];

export async function handleLaporanBulanan(request, env, url) {
    try {
        const type = (url.searchParams.get("jenis") || "KTP").toUpperCase();

        const query = `
            WITH datang AS (
                SELECT substr(tgl_datang, 1, 7) as periode, COUNT(*) as total_masuk 
                FROM rekap_berkas 
                WHERE jenis_berkas = ? AND tgl_datang IS NOT NULL AND length(tgl_datang) >= 7
                GROUP BY 1
            ),
            ambil AS (
                SELECT substr(tgl_ambil, 1, 7) as periode, COUNT(*) as total_keluar 
                FROM rekap_berkas 
                WHERE jenis_berkas = ? AND tgl_ambil IS NOT NULL AND length(tgl_ambil) >= 7
                GROUP BY 1
            )
            SELECT 
                COALESCE(d.periode, a.periode) as periode,
                COALESCE(d.total_masuk, 0) as total_masuk,
                COALESCE(a.total_keluar, 0) as total_keluar
            FROM datang d
            FULL OUTER JOIN ambil a ON d.periode = a.periode
            WHERE COALESCE(d.periode, a.periode) IS NOT NULL AND length(COALESCE(d.periode, a.periode)) = 7
            ORDER BY periode ASC
        `;

        const { results } = await env.DB.prepare(query).bind(type, type).all();

        const report = (results || []).map(row => {
            const parts = row.periode.split("-");
            const year = parseInt(parts[0], 10);
            const monthIdx = parseInt(parts[1], 10) - 1;
            return {
                tahun: year,
                bulan: MONTH_NAMES[monthIdx] || `BULAN ${monthIdx + 1}`,
                ktpElYangDatang: row.total_masuk || 0,
                ktpYangDidistribusikan: row.total_keluar || 0
            };
        });

        return jsonResponse({ success: true, data: report });
    } catch (err) {
        console.error("Error laporan bulanan:", err);
        return jsonResponse({ success: false, error: "Gagal memuat rekapitulasi laporan bulanan." }, 500);
    }
}
