import { getStore } from "@netlify/blobs";
export const config = { path: "/api/*" };
const ADMIN = () => process.env.ADMIN_KEY || "";
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export default async (req) => {
  const recs = getStore("records"), files = getStore("files");
  const seg = new URL(req.url).pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const res = seg[1], id = seg[2];
  const isAdmin = ADMIN() !== "" && req.headers.get("x-admin-key") === ADMIN();
  const needsAdmin = req.method !== "POST";
  if (needsAdmin && !isAdmin) return json({ error: "Clave incorrecta" }, 401);
  try {
    if (res === "records") {
      if (req.method === "GET") {
        const { blobs } = await recs.list();
        const all = (await Promise.all(blobs.map(b => recs.get(b.key, { type: "json" })))).filter(Boolean);
        return json(all.sort((a, b) => a.ts - b.ts));
      }
      if (req.method === "POST") {
        const { kind, data, files: fl = [] } = await req.json();
        if (kind !== "tras") return json({ error: "Tipo inválido" }, 400);
        const rid = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        const meta = [];
        for (const f of fl) {
          const fid = rid + "-" + meta.length;
          await files.set(fid, new Blob([Buffer.from(f.dataUrl.split(",")[1], "base64")]), { metadata: { type: f.type, nombre: f.nombre } });
          meta.push({ id: fid, nombre: f.nombre, type: f.type });
        }
        const rec = { id: rid, ts: Date.now(), kind, data, files: meta };
        await recs.setJSON(rid, rec);
        return json(rec, 201);
      }
      if (req.method === "DELETE" && id) {
        const r = await recs.get(id, { type: "json" });
        for (const f of r?.files || []) await files.delete(f.id);
        await recs.delete(id);
        return json({ ok: true });
      }
    }
    if (res === "files" && id && req.method === "GET") {
      const r = await files.getWithMetadata(id, { type: "arrayBuffer" });
      if (!r) return new Response("No encontrado", { status: 404 });
      return new Response(r.data, { headers: { "content-type": r.metadata.type || "application/octet-stream", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.metadata.nombre || id)}` } });
    }
  } catch (e) { return json({ error: String(e) }, 500); }
  return json({ error: "No encontrado" }, 404);
};
