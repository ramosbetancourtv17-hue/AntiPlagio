const TIMEOUT = 8000;

async function pedirCSL(url, headers = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: {
        "Accept": "application/vnd.citationstyles.csl+json",
        "User-Agent": "AntiPlagio/2.0 (educativo; mailto:tu-correo@ejemplo.com)",
        ...headers
      }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const doi = String(req.query.doi || "").trim().replace(/^https?:\/\/doi\.org\//, "");
  if (!doi || !/^10\.\d{4,9}\//.test(doi)) {
    return res.status(400).json({ error: "DOI inválido o ausente" });
  }

  // 1º Crossref
  try {
    const csl = await pedirCSL(`https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/vnd.citationstyles.csl+json`);
    if (csl && csl.title) {
      // Caché en el CDN de Vercel: los metadatos de un DOI no cambian casi nunca
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      return res.status(200).json({ csl, origen: "crossref" });
    }
  } catch (e) { /* cae a DataCite */ }

  // 2º DataCite (cubre datasets, tesis y DOIs no registrados en Crossref)
  try {
    const csl = await pedirCSL(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, {
      "Accept": "application/vnd.citationstyles.csl+json"
    });
    if (csl && csl.title) {
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      return res.status(200).json({ csl, origen: "datacite" });
    }
  } catch (e) { /* nada */ }

  return res.status(404).json({ error: "No se encontraron metadatos para ese DOI" });
}