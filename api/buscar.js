import { aAPA, abstractDe, limpiarHTML, limpiarTitulo, norm, terminos, pedir } from "./_lib.js";

const MAIL = process.env.CONTACT_EMAIL
  ? `&mailto=${encodeURIComponent(process.env.CONTACT_EMAIL)}`
  : "";

const BASES = [
  {
    nombre: "OpenAlex",
    conResumen: true,
    async buscar(q, n) {
      const d = await pedir(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${n}${MAIL}`);
      return (d.results || []).map(w => {
        const loc = w.primary_location || {};
        return {
          titulo: w.title,
          autores: (w.authorships || []).map(a => a.author && aAPA(a.author.display_name)).filter(Boolean),
          anio: w.publication_year,
          revista: (loc.source && loc.source.display_name) || "",
          url: w.doi || loc.landing_page_url || w.id,
          resumen: abstractDe(w.abstract_inverted_index),
          doi: (w.doi || "").replace(/^https?:\/\/doi\.org\//, "")
        };
      });
    }
  },
  {
    nombre: "Crossref",
    conResumen: true,
    async buscar(q, n) {
      const d = await pedir(
        `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&filter=type:journal-article&select=title,author,issued,container-title,DOI,URL,abstract${MAIL.replace("&mailto", "&mailto")}`
      );
      return ((d.message && d.message.items) || []).map(x => ({
        titulo: (x.title || [])[0],
        anio: x.issued && x.issued["date-parts"] && x.issued["date-parts"][0] && x.issued["date-parts"][0][0],
        autores: (x.author || []).map(a =>
          a.family ? a.family + (a.given ? ", " + a.given.split(/\s+/).map(s => s[0] + ".").join(" ") : "") : (a.name || "")
        ).filter(Boolean),
        revista: (x["container-title"] || [])[0] || "",
        url: x.DOI ? "https://doi.org/" + x.DOI : x.URL,
        resumen: limpiarHTML(x.abstract || ""),
        doi: x.DOI || ""
      }));
    }
  },
  {
    nombre: "DOAJ",
    conResumen: true,
    async buscar(q, n) {
      const d = await pedir(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=${n}`);
      return (d.results || []).map(x => {
        const b = x.bibjson || {};
        const doi = (b.identifier || []).filter(i => i.type === "doi")[0];
        return {
          titulo: b.title,
          autores: (b.author || []).map(a => aAPA(a.name)).filter(Boolean),
          anio: b.year,
          revista: (b.journal && b.journal.title) || "",
          url: doi ? "https://doi.org/" + doi.id : (b.link || [])[0] && b.link[0].url,
          resumen: b.abstract || "",
          doi: doi ? doi.id : ""
        };
      });
    }
  },
  {
    nombre: "Europe PMC",
    conResumen: true,
    async buscar(q, n) {
      const d = await pedir(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=${n}&resultType=core`
      );
      return ((d.resultList && d.resultList.result) || []).map(x => ({
        titulo: limpiarHTML(x.title || ""),
        autores: (x.authorString || "").split(", ").map(aAPA).filter(Boolean),
        anio: x.pubYear,
        revista: x.journalTitle || "",
        url: x.doi ? "https://doi.org/" + x.doi : `https://europepmc.org/article/${x.source}/${x.id}`,
        resumen: limpiarHTML(x.abstractText || ""),
        doi: x.doi || ""
      }));
    }
  },
  {
    nombre: "Semantic Scholar",
    conResumen: true,
    async buscar(q, n) {
      const d = await pedir(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=title,year,authors,venue,externalIds,abstract,url`
      );
      return (d.data || []).map(p => ({
        titulo: p.title,
        autores: (p.authors || []).map(a => aAPA(a.name)).filter(Boolean),
        anio: p.year,
        revista: p.venue || "",
        url: (p.externalIds && p.externalIds.DOI) ? "https://doi.org/" + p.externalIds.DOI : p.url,
        resumen: p.abstract || "",
        doi: (p.externalIds && p.externalIds.DOI) || ""
      }));
    }
  },
  {
    nombre: "Open Library",
    conResumen: false,
    async buscar(q, n) {
      const d = await pedir(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${n}&fields=title,author_name,first_publish_year,key,publisher`
      );
      return (d.docs || []).map(x => ({
        titulo: x.title,
        autores: (x.author_name || []).map(aAPA).filter(Boolean),
        anio: x.first_publish_year,
        revista: (x.publisher || [])[0] || "Open Library",
        url: "https://openlibrary.org" + x.key,
        resumen: "",
        tipo: "web"
      }));
    }
  },
  {
    nombre: "Datos Abiertos Colombia",
    conResumen: false,
    async buscar(q, n) {
      const d = await pedir(
        `https://api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&search_context=www.datos.gov.co&q=${encodeURIComponent(q)}&limit=${n}`
      );
      return (d.results || []).map(x => {
        const r = x.resource || {};
        return {
          titulo: r.name,
          autores: [r.attribution || "Gobierno de Colombia"],
          anio: r.updatedAt ? String(r.updatedAt).slice(0, 4) : "",
          revista: "Datos Abiertos Colombia",
          url: x.link || x.permalink,
          resumen: "",
          tipo: "web"
        };
      });
    }
  }
];

function puntuar(r, ts) {
  const ti = norm(r.titulo).join(" ");
  const rs = norm(r.resumen || "").join(" ");
  const edad = new Date().getFullYear() - Number(r.anio || 0);
  let s = 0;
  ts.forEach(t => { if (ti.includes(t)) s += 3; if (rs.includes(t)) s += 1; });
  if (r.anio && edad <= 5) s += 1.5;
  else if (r.anio && edad <= 10) s += 0.5;
  return s + (r.bases.length - 1) * 2 + (r.resumen ? 0.5 : 0);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = (req.query.q || "").trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: "Falta el parámetro q" });

  const ts = terminos(q);
  const consulta = ts.length ? ts.join(" ") : q;
  const n = 5;

  const mapa = new Map();
  const errores = [];

  await Promise.allSettled(BASES.map(async b => {
    try {
      const crudos = await b.buscar(consulta, n);
      crudos.forEach(r0 => {
        const r = {
          ...r0,
          titulo: limpiarTitulo(r0.titulo),
          revista: limpiarTitulo(r0.revista),
          autores: r0.autores || [],
          bases: [b.nombre]
        };
        if (!r.titulo || !r.url) return;
        const k = norm(r.titulo).join("").slice(0, 90);
        const previo = mapa.get(k);
        if (previo) {
          previo.bases.push(b.nombre);
          if (!previo.resumen && r.resumen) previo.resumen = r.resumen;
          if (!previo.autores.length) previo.autores = r.autores;
          if (!previo.doi && r.doi) previo.doi = r.doi;
        } else {
          mapa.set(k, r);
        }
      });
    } catch (e) {
      errores.push({ base: b.nombre, error: String(e.message || e) });
    }
  }));

  const ordenados = [...mapa.values()]
    .sort((a, b) => puntuar(b, ts) - puntuar(a, ts))
    .slice(0, 30);

  return res.status(200).json({
    query: q,
    consulta,
    resultados: ordenados,
    errores,
    basesConsultadas: BASES.length
  });
}