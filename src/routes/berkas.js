/**
 * Route Handler: Manajemen Data Berkas KTP & KIA
 * Mendukung Operasi CRUD, Batch Upsert Pintar, dan Auto-Merge Konflik
 */
import { jsonResponse } from "../utils/response.js";

// 1. GET /api/berkas
export async function handleGetBerkas(request, env, url) {
    try {
        const rw = url.searchParams.get("rw");
        const jenis = url.searchParams.get("jenis");
        const status = url.searchParams.get("status");
        const year = url.searchParams.get("year");
        const scope = url.searchParams.get("scope") || "active"; // 'active' | 'archive' | 'all'
        const nikHash = url.searchParams.get("nik_hash");
        const limitSent = parseInt(url.searchParams.get("limit_sent") || "100", 10);

        // A. Direct search on-demand by exact NIK Hash (Super fast O(1))
        if (nikHash) {
            const { results } = await env.DB.prepare(
                "SELECT * FROM rekap_berkas WHERE nik_hash = ? ORDER BY tgl_datang DESC, id DESC"
            ).bind(nikHash).all();
            return jsonResponse({ success: true, data: results || [] });
        }

        const stmtYears = env.DB.prepare(
            "SELECT DISTINCT substr(tgl_datang, 1, 4) as tahun FROM rekap_berkas WHERE tgl_datang IS NOT NULL AND length(tgl_datang) >= 4 ORDER BY tahun DESC"
        );

        // B. Deep Search / Seluruh Arsip On-Demand (Hanya saat user eksplisit mencari ke seluruh arsip)
        if (scope === "archive" || scope === "all" || year === "ALL") {
            let query = "SELECT * FROM rekap_berkas WHERE 1=1";
            const params = [];

            if (jenis && jenis !== "ALL") {
                query += " AND jenis_berkas = ?";
                params.push(jenis);
            }

            if (rw && rw !== "ALL") {
                query += " AND rw = ?";
                params.push(rw);
            }

            query += " ORDER BY tgl_datang DESC, id DESC";
            const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
            const [resData, resYears] = await env.DB.batch([stmt, stmtYears]);
            const availableYears = (resYears?.results || []).map(r => r.tahun).filter(Boolean);

            return jsonResponse({ success: true, data: resData?.results || [], scope: "all", years: availableYears });
        }

        // C. Per-Tahun Terpilih (Model Register Surat: 1x Load per Tahun Aktif + Data Pending)
        // Mengambil seluruh data pada tahun terpilih ditambah berkas pending (belum diambil) agar fisik tidak terlewat
        const targetYear = year || new Date().getFullYear().toString();
        const startYear = `${targetYear}-01-01`;
        const endYear = `${targetYear}-12-31`;

        let query = "SELECT * FROM rekap_berkas WHERE ((tgl_datang >= ? AND tgl_datang <= ?) OR (tgl_ambil IS NULL OR tgl_ambil = ''))";
        const params = [startYear, endYear];

        if (status === "PENDING") {
            query = "SELECT * FROM rekap_berkas WHERE (tgl_ambil IS NULL OR tgl_ambil = '')";
            params.length = 0; // reset
        } else if (status === "SENT") {
            query = "SELECT * FROM rekap_berkas WHERE (tgl_ambil IS NOT NULL AND tgl_ambil != '') AND tgl_datang >= ? AND tgl_datang <= ?";
        }

        if (jenis && jenis !== "ALL") {
            query += " AND jenis_berkas = ?";
            params.push(jenis);
        }

        if (rw && rw !== "ALL") {
            query += " AND rw = ?";
            params.push(rw);
        }

        query += " ORDER BY tgl_datang DESC, id DESC";
        const stmt = env.DB.prepare(query).bind(...params);
        const [resData, resYears] = await env.DB.batch([stmt, stmtYears]);
        const availableYears = (resYears?.results || []).map(r => r.tahun).filter(Boolean);

        return jsonResponse({ success: true, data: resData?.results || [], year: targetYear, years: availableYears });
    } catch (err) {
        console.error("Error get berkas:", err);
        return jsonResponse({ success: false, error: "Gagal memuat daftar berkas." }, 500);
    }
}

// 2. POST /api/berkas (Tambah Berkas Baru)
export async function handleCreateBerkas(request, env) {
    try {
        const body = await request.json();
        const {
            no_urut,
            tgl_datang,
            jenis_berkas,
            nik_hash,
            nik_encrypted,
            nama_encrypted,
            alamat_encrypted,
            rw,
            hubungan_pengambil,
            tgl_ambil,
            status,
            kelahiran,
            keterangan,
            sinkronisasi
        } = body;

        // Jaring Pengaman Administrasi: Tanggal diambil tidak boleh lebih awal dari tanggal datang
        if (tgl_ambil && tgl_datang && tgl_ambil < tgl_datang) {
            return jsonResponse({
                success: false,
                error: `Jaring Pengaman Administrasi: Tanggal diambil (${tgl_ambil}) tidak boleh lebih awal dari tanggal berkas datang (${tgl_datang}).`
            }, 400);
        }

        let nextNo = no_urut;
        if (!nextNo) {
            const maxNo = await env.DB.prepare("SELECT MAX(no_urut) as max_no FROM rekap_berkas").first();
            nextNo = (maxNo?.max_no || 0) + 1;
        }

        // Bersihkan data duplikat dengan NIK, tgl_datang, dan jenis_berkas yang sama persis jika ada
        if (nik_hash && tgl_datang && jenis_berkas) {
            await env.DB.prepare("DELETE FROM rekap_berkas WHERE nik_hash = ? AND tgl_datang = ? AND jenis_berkas = ?")
                .bind(nik_hash, tgl_datang, jenis_berkas).run();
        }

        const insertQuery = `
            INSERT INTO rekap_berkas (
                no_urut, tgl_datang, jenis_berkas, nik_hash, nik_encrypted, 
                nama_encrypted, alamat_encrypted, rw, hubungan_pengambil, 
                tgl_ambil, status, kelahiran, keterangan, sinkronisasi
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const result = await env.DB.prepare(insertQuery).bind(
            nextNo,
            tgl_datang,
            jenis_berkas,
            nik_hash,
            nik_encrypted,
            nama_encrypted,
            alamat_encrypted || "",
            rw,
            hubungan_pengambil || "Belum Diketahui",
            tgl_ambil || null,
            status,
            kelahiran || "",
            keterangan,
            sinkronisasi || "BELUM"
        ).run();

        return jsonResponse({ success: true, id: result.meta?.last_row_id || null });
    } catch (err) {
        console.error("Error create berkas:", err);
        return jsonResponse({ success: false, error: "Gagal menyimpan berkas baru." }, 500);
    }
}

// 3. PUT /api/berkas/:id (Update Berkas Cepat & Hemat Kuota)
export async function handleUpdateBerkas(request, env, id) {
    try {
        const body = await request.json();

        // Jaring Pengaman Administrasi: Tanggal diambil tidak boleh kurang dari tanggal berkas datang
        if (body.tgl_ambil !== undefined && body.tgl_ambil !== null && body.tgl_ambil !== "") {
            let refTglDatang = body.tgl_datang;
            if (!refTglDatang) {
                const rec = await env.DB.prepare("SELECT tgl_datang FROM rekap_berkas WHERE id = ?").bind(id).first();
                refTglDatang = rec?.tgl_datang;
            }
            if (refTglDatang && body.tgl_ambil < refTglDatang) {
                return jsonResponse({
                    success: false,
                    error: `Jaring Pengaman Administrasi: Tanggal diambil (${body.tgl_ambil}) tidak boleh lebih awal dari tanggal berkas datang (${refTglDatang}).`
                }, 400);
            }
        } else if (body.tgl_datang !== undefined && body.tgl_datang !== null && body.tgl_datang !== "") {
            const rec = await env.DB.prepare("SELECT tgl_ambil FROM rekap_berkas WHERE id = ?").bind(id).first();
            if (rec?.tgl_ambil && rec.tgl_ambil.trim() !== "" && body.tgl_datang > rec.tgl_ambil) {
                return jsonResponse({
                    success: false,
                    error: `Jaring Pengaman Administrasi: Tanggal berkas datang (${body.tgl_datang}) tidak boleh lebih baru dari tanggal berkas diambil (${rec.tgl_ambil}).`
                }, 400);
            }
        }

        // Hanya jalankan pre-flight query jika kunci komposit unik (NIK, Tgl Datang, Jenis) diubah
        const isKeyFieldChanged = body.nik_hash !== undefined || body.tgl_datang !== undefined || body.jenis_berkas !== undefined;

        if (isKeyFieldChanged) {
            const current = await env.DB.prepare(
                "SELECT id, nik_hash, jenis_berkas, tgl_datang FROM rekap_berkas WHERE id = ?"
            ).bind(id).first();

            if (!current) {
                return jsonResponse({ success: false, error: "Berkas tidak ditemukan" }, 404);
            }

            const targetHash = body.nik_hash !== undefined ? body.nik_hash : current.nik_hash;
            const targetTglDatang = body.tgl_datang !== undefined ? body.tgl_datang : current.tgl_datang;
            const targetJenis = body.jenis_berkas !== undefined ? body.jenis_berkas : current.jenis_berkas;

            if (targetHash && targetTglDatang && targetJenis) {
                const conflict = await env.DB.prepare(
                    "SELECT id FROM rekap_berkas WHERE nik_hash = ? AND tgl_datang = ? AND jenis_berkas = ? AND id != ?"
                ).bind(targetHash, targetTglDatang, targetJenis, id).first();

                if (conflict) {
                    return jsonResponse({ 
                        success: false, 
                        error: "Berkas dengan NIK, Tanggal Datang, dan Jenis Berkas yang sama sudah ada di database!" 
                    }, 400);
                }
            }
        }

        // Field yang diizinkan untuk di-update
        const allowedFields = [
            "hubungan_pengambil", "tgl_ambil", "status", "sinkronisasi", 
            "alamat_encrypted", "nama_encrypted", "rw", "catatan",
            "tgl_datang", "jenis_berkas", "nik_hash", "nik_encrypted", 
            "kelahiran", "keterangan"
        ];
        
        const updates = [];
        const params = [];

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(body[field]);
            }
        }

        if (updates.length === 0) {
            return jsonResponse({ success: false, error: "Tidak ada field yang diupdate" }, 400);
        }

        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(id);

        const updateQuery = `UPDATE rekap_berkas SET ${updates.join(", ")} WHERE id = ?`;
        await env.DB.prepare(updateQuery).bind(...params).run();

        return jsonResponse({ 
            success: true, 
            message: "Data berhasil diperbarui"
        });
    } catch (err) {
        console.error("Error update berkas:", err);
        return jsonResponse({ success: false, error: "Gagal memperbarui data berkas." }, 500);
    }
}

// 4. DELETE /api/berkas/:id (Hapus Berkas)
export async function handleDeleteBerkas(request, env, id) {
    try {
        await env.DB.prepare("DELETE FROM rekap_berkas WHERE id = ?").bind(id).run();
        return jsonResponse({ success: true, message: "Data berhasil dihapus" });
    } catch (err) {
        console.error("Error delete berkas:", err);
        return jsonResponse({ success: false, error: "Gagal menghapus data berkas." }, 500);
    }
}

// 5. POST /api/berkas/unsync-all (Reset Semua Status Sinkronisasi)
export async function handleUnsyncAll(request, env, url) {
    try {
        const jenis = url.searchParams.get("jenis");
        let query = "UPDATE rekap_berkas SET sinkronisasi = 'BELUM', updated_at = CURRENT_TIMESTAMP";
        const params = [];
        if (jenis && jenis !== "ALL") {
            query += " WHERE jenis_berkas = ?";
            params.push(jenis);
        }
        const stmt = env.DB.prepare(query);
        if (params.length > 0) {
            await stmt.bind(...params).run();
        } else {
            await stmt.run();
        }
        return jsonResponse({ success: true, message: "Semua berkas berhasil di-unsync" });
    } catch (err) {
        console.error("Error unsync all berkas:", err);
        return jsonResponse({ success: false, error: "Gagal me-reset status sinkronisasi." }, 500);
    }
}

// 6. POST /api/berkas/batch (Batch Upsert Cerdas Sinkronisasi Spreadsheet)
export async function handleBatchUpsert(request, env) {
    try {
        const { items } = await request.json();
        if (!Array.isArray(items) || items.length === 0) {
            return jsonResponse({ success: false, error: "Items array kosong" }, 400);
        }

        // Upsert cerdas berbasis Kunci Komposit Unik: NIK + Tgl Datang + Jenis Berkas
        const upsertStmt = env.DB.prepare(`
            INSERT INTO rekap_berkas (
                no_urut, tgl_datang, jenis_berkas, nik_hash, nik_encrypted, 
                nama_encrypted, alamat_encrypted, rw, hubungan_pengambil, 
                tgl_ambil, status, kelahiran, keterangan, sinkronisasi
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(nik_hash, tgl_datang, jenis_berkas) DO UPDATE SET
                no_urut = excluded.no_urut,
                nama_encrypted = excluded.nama_encrypted,
                alamat_encrypted = excluded.alamat_encrypted,
                rw = excluded.rw,
                hubungan_pengambil = CASE 
                    WHEN (excluded.hubungan_pengambil IS NOT NULL AND excluded.hubungan_pengambil != '' AND excluded.hubungan_pengambil != 'Belum Diketahui') 
                        THEN excluded.hubungan_pengambil 
                    ELSE rekap_berkas.hubungan_pengambil 
                END,
                tgl_ambil = CASE 
                    WHEN (excluded.tgl_ambil IS NOT NULL AND excluded.tgl_ambil != '') 
                        THEN excluded.tgl_ambil 
                    ELSE rekap_berkas.tgl_ambil 
                END,
                status = CASE 
                    WHEN (excluded.tgl_ambil IS NOT NULL AND excluded.tgl_ambil != '') 
                        THEN 'SELESAI'
                    WHEN (rekap_berkas.tgl_ambil IS NOT NULL AND rekap_berkas.tgl_ambil != '') 
                        THEN 'SELESAI'
                    ELSE excluded.status 
                END,
                kelahiran = excluded.kelahiran,
                keterangan = excluded.keterangan,
                sinkronisasi = excluded.sinkronisasi,
                updated_at = CURRENT_TIMESTAMP
        `);

        const CHUNK_SIZE = 50;
        let processed = 0;

        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);
            
            const batchStatements = [];
            for (const item of chunk) {
                batchStatements.push(upsertStmt.bind(
                    item.no_urut,
                    item.tgl_datang,
                    item.jenis_berkas,
                    item.nik_hash,
                    item.nik_encrypted,
                    item.nama_encrypted,
                    item.alamat_encrypted || "",
                    item.rw,
                    item.hubungan_pengambil || "Belum Diketahui",
                    item.tgl_ambil || null,
                    item.status,
                    item.kelahiran || "",
                    item.keterangan,
                    item.sinkronisasi || "BELUM"
                ));
            }

            await env.DB.batch(batchStatements);
            processed += chunk.length;
        }

        const totalRow = await env.DB.prepare("SELECT COUNT(*) as total FROM rekap_berkas").first();

        return jsonResponse({ 
            success: true, 
            count: processed, 
            dbTotal: totalRow?.total || 0,
            message: "Sinkronisasi berhasil dengan resolusi cerdas data terupdate."
        });
    } catch (err) {
        console.error("Error batch upsert berkas:", err);
        return jsonResponse({ success: false, error: "Gagal memproses sinkronisasi data berkas." }, 500);
    }
}
