/* =====================================================================
   AntiPlagio · script.js (v2.1)
   Integra: /api/buscar (proxy de 7 bases) y /api/metadata (DOI → CSL-JSON)
   Todo el análisis de texto se hace localmente en el navegador.
   ===================================================================== */

/* ===== 1. CONFIGURACIÓN ===== */
const CONFIG = {
  portales: [
    { nombre: "Google Académico", desc: "Artículos, tesis y libros académicos de todo el mundo.",
      inicio: "https://scholar.google.com/", url: q => `https://scholar.google.com/scholar?hl=es&q=${q}` },
    { nombre: "SciELO", desc: "Revistas científicas de acceso abierto de Latinoamérica, España y Portugal.",
      inicio: "https://scielo.org/", url: q => `https://search.scielo.org/?lang=es&q=${q.replace(/%20/g, "+")}` },
    { nombre: "Redalyc", desc: "Artículos de revistas científicas iberoamericanas en acceso abierto.",
      inicio: "https://www.redalyc.org/", url: q => `https://www.redalyc.org/busquedaArticuloFiltros.oa?q=${q}` },
    { nombre: "DANE", desc: "Estadísticas oficiales de Colombia: población, economía, empleo y censos.",
      inicio: "https://www.dane.gov.co/", url: q => `https://www.google.com/search?q=site:dane.gov.co+${q}` },
    { nombre: "Banco de la República", desc: "Informes, investigaciones y estadísticas económicas del banco central de Colombia.",
      inicio: "https://www.banrep.gov.co/", url: q => `https://www.google.com/search?q=site:banrep.gov.co+${q}` },
    { nombre: "Dialnet", desc: "Artículos, tesis y libros en español de universidades iberoamericanas.",
      inicio: "https://dialnet.unirioja.es/", url: (e, crudo) => `https://dialnet.unirioja.es/buscar/documentos?querysDismax.DOCUMENTAL_TODO=${encodeURIComponent(crudo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).replace(/%20/g, "+")}` },
    { nombre: "LA Referencia", desc: "Repositorios de universidades latinoamericanas, incluida Colombia.",
      inicio: "https://www.lareferencia.info/", url: q => `https://www.lareferencia.info/vufind/Search/Results?lookfor=${q}&type=AllFields` },
    { nombre: "Datos Abiertos Colombia", desc: "Conjuntos de datos oficiales de entidades del Estado colombiano.",
      inicio: "https://www.datos.gov.co/", url: q => `https://www.datos.gov.co/browse?q=${q}` },
    { nombre: "CEPAL", desc: "Estudios y estadísticas sobre economía y desarrollo de América Latina.",
      inicio: "https://www.cepal.org/es", url: q => `https://www.cepal.org/es/busqueda?query=${q.replace(/%20/g, "+")}&date_from=&date_to=` }
  ],
  checklist: [
    "¿Utilicé fuentes confiables?",
    "¿Escribí con mis propias palabras?",
    "¿Cité las ideas de otros autores?",
    "¿Incluí las referencias bibliográficas?",
    "¿Revisé las indicaciones del profesor sobre el uso de IA?"
  ]
};

/* ===== 2. UTILIDADES ===== */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const palabrasDe = t => t.toLowerCase().match(/[a-záéíóúüñ0-9]+/g) || [];
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
const limpiarFrag = s => {
  const p = String(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).filter(w => !/^\p{L}+\d+$/u.test(w));
  return p.filter((w, i) => i === 0 || w.toLowerCase() !== p[i - 1].toLowerCase()).join(" ");
};
const limpiarHTML = s => new DOMParser().parseFromString(s || "", "text/html").body.textContent || "";
const limpiarTitulo = t => limpiarHTML(String(t || "")).replace(/\s+/g, " ").trim();
const claveUrl = u => String(u || "").toLowerCase().replace(/^https?:\/\/(dx\.)?(doi\.org\/)?/, "").replace(/\/$/, "");
const anioK = a => (String(a || "").match(/\d{4}/) || ["sf"])[0];
const autor1 = b => (b.autores && b.autores[0]) || b.titulo || "";
const SPLIT = /(?<!\b(?:al|p|pp|vol|ed|etc))[.!?]+\s+|\n+/i;
const STOP = new Set("de la el los las un una unos unas y o u en a por para con sin sobre entre del al que se su sus es son como mas the of and in on for to".split(" "));
const terminos = q => [...new Set(norm(q).filter(w => w.length > 2 && !STOP.has(w)))];

async function pedir(url) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ===== 3. ESTADO PERSISTENTE ===== */
let TEMA = "", BIBLIO = [], RESULTADOS = [];
try { BIBLIO = JSON.parse(localStorage.getItem("ap_biblio") || "[]"); } catch (e) {}

function setTema(q) {
  TEMA = q;
  try { localStorage.setItem("ap_tema", q); } catch (e) {}
  document.querySelectorAll(".temaActivo").forEach(e =>
    e.textContent = q ? "Tema activo: «" + q + "»" : "Aún no definiste un tema (escríbelo en «Fuentes»)."
  );
}

/* ===== 4. BUSCADOR ===== */
function pintarPortales(q) {
  const e = encodeURIComponent(q);
  $("portales").innerHTML = CONFIG.portales.map(p => `
    <div class="portal"><h4>${esc(p.nombre)}</h4><p>${esc(p.desc)}</p>
    <a class="btn chico" href="${q ? p.url(e, q) : p.inicio}" target="_blank" rel="noopener">${q ? "Buscar tema aquí ↗" : "Abrir portal ↗"}</a></div>`).join("");
}

let busquedaActual = 0;
async function buscarFuentes() {
  const q = $("tema").value.trim().slice(0, 200), m = $("msgBuscar"), out = $("resultadosFuentes");
  if (!q) { m.className = "msg err"; m.textContent = "Escribe un tema o palabras clave."; return; }
  setTema(q);
  const miId = ++busquedaActual;
  pintarPortales(q);
  RESULTADOS.length = 0; out.innerHTML = "";
  m.className = "msg"; m.textContent = "Consultando bases de datos…";
  $("btnBuscar").disabled = true;

  try {
    const d = await pedir(`/api/buscar?q=${encodeURIComponent(q)}`);
    if (miId !== busquedaActual) return;
    RESULTADOS.push(...(d.resultados || []));
    const ok = d.basesConsultadas - (d.errores || []).length;
    out.innerHTML = RESULTADOS.map(tarjeta).join("") +
      (d.errores && d.errores.length
        ? `<p class="msg err">No respondieron: ${esc(d.errores.map(e => e.base + " (" + e.error + ")").join(" | "))}</p>`
        : "");
    if (!RESULTADOS.length) m.textContent = "Sin resultados. Prueba palabras más generales o en inglés.";
    else m.textContent = `${RESULTADOS.length} fuentes únicas, ordenadas por pertinencia (${ok} de ${d.basesConsultadas} bases respondieron). Revisa siempre la fuente original.`;
  } catch (e) {
    m.className = "msg err"; m.textContent = "Error al buscar: " + e.message;
  } finally {
    $("btnBuscar").disabled = false;
  }
}
$("btnBuscar").onclick = buscarFuentes;
$("tema").addEventListener("keydown", e => { if (e.key === "Enter") buscarFuentes(); });

function tarjeta(r, i) {
  const aut = r.autores && r.autores.length
    ? r.autores.slice(0, 3).join("; ") + (r.autores.length > 3 ? " y otros" : "")
    : "Autor no disponible";
  const en = BIBLIO.some(b => claveUrl(b.url) === claveUrl(r.url));
  return `<div class="resultado"><h4>${esc(r.titulo)}</h4>
    <p><span class="fuente-tag">${esc((r.bases || []).join(" · "))}</span><small>${esc(r.revista || "")} · ${esc(aut)} · ${esc(r.anio || "s. f.")}${r.resumen ? "" : " · sin resumen"}</small></p>
    <p><a href="${esc(r.url)}" target="_blank" rel="noopener">Consultar fuente original ↗</a>
    <button class="btn ghost chico usarapa" data-i="${i}">Usar en APA</button>
    <button class="btn chico guardar" data-i="${i}">${en ? "✔ En mi lista" : "＋ Guardar en mi lista"}</button></p></div>`;
}

/* ===== 5. BIBLIOGRAFÍA Y APA ===== */
function parseAutorAPA(nombre) {
  nombre = (nombre || "").trim();
  if (!nombre) return { literal: "" };
  if (nombre.includes(",")) {
    const [family, given] = nombre.split(",");
    return { family: family.trim(), given: (given || "").trim() };
  }
  const p = nombre.split(/\s+/);
  if (p.length === 1) return { literal: p[0] };
  return { family: p[p.length - 1], given: p.slice(0, -1).join(" ") };
}

function aCSL(d) {
  const tipo = d.tipo === "web" ? "webpage" : "article-journal";
  const autor = (d.autores || []).map(parseAutorAPA).filter(a => a.family || a.literal);
  const csl = { type: tipo, title: d.titulo || "", author: autor, URL: d.url || "" };
  if (d.anio && /\d{4}/.test(d.anio)) csl.issued = { "date-parts": [[parseInt(d.anio, 10)]] };
  if (d.revista) csl["container-title"] = d.revista;
  if (d.doi) csl.DOI = d.doi;
  return csl;
}

function formatoAPAFallback(d) {
  const punto = s => /[.?!]$/.test(s) ? s : s + ".";
  const au = (d.autores || []).filter(Boolean), web = d.tipo === "web";
  const aut = au.length > 20
    ? au.slice(0, 19).join(", ") + ", . . . " + au[au.length - 1]
    : au.length > 1
      ? au.slice(0, -1).join(", ") + ", & " + au[au.length - 1]
      : (au[0] || "");
  const fecha = `(${String(d.anio || "").trim() || "s. f."}).`;
  const t = punto(d.titulo || "");
  const s = d.revista ? punto(d.revista) : "";
  const tH = web ? `<i>${esc(t)}</i>` : esc(t);
  const sH = s ? (web ? esc(s) : `<i>${esc(s)}</i>`) : "";
  const h = aut ? [esc(punto(aut)), esc(fecha), tH, sH, esc(d.url || "")] : [tH, esc(fecha), sH, esc(d.url || "")];
  const p = aut ? [punto(aut), fecha, t, s, d.url || ""] : [t, fecha, s, d.url || ""];
  return { html: h.filter(Boolean).join(" "), plano: p.filter(Boolean).join(" ") };
}

function refDe(d) {
  if (typeof window.Cite === "undefined") return formatoAPAFallback(d);
  try {
    // Si tenemos CSL enriquecido desde /api/metadata, lo usamos tal cual.
    const csl = d._csl || aCSL(d);
    const cite = new window.Cite(csl);
    const plano = cite.format("bibliography", { template: "apa", format: "text", lang: "es-ES" }).trim();
    const html = esc(plano).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return { html, plano };
  } catch (e) {
    return formatoAPAFallback(d);
  }
}

const listaOrdenada = () => BIBLIO.map((b, i) => ({ i, r: refDe(b) })).sort((a, b) => a.r.plano.localeCompare(b.r.plano, "es"));

function pintarBiblio() {
  const l = listaOrdenada();
  $("biblio").innerHTML = l.length
    ? l.map(x => `<div class="refitem"><span>${x.r.html}</span><button class="btn ghost chico quitar" data-i="${x.i}" aria-label="Quitar referencia">✕</button></div>`).join("")
    : '<p class="msg">Aún no hay fuentes. Guárdalas desde el buscador o el generador.</p>';
  $("btnCopiarLista").disabled = !l.length;
}

function agregarBiblio(r) {
  if (!r || BIBLIO.some(b => claveUrl(b.url) === claveUrl(r.url))) return;
  BIBLIO.push({
    autores: r.autores || [], anio: r.anio || "", titulo: r.titulo,
    revista: r.revista || "", url: r.url, tipo: r.tipo || "revista",
    doi: r.doi || "", _csl: r._csl || null   // preservamos el CSL enriquecido si lo hubo
  });
  try { localStorage.setItem("ap_biblio", JSON.stringify(BIBLIO)); } catch (e) {}
  pintarBiblio();
}

document.addEventListener("click", e => {
  const g = e.target.closest(".guardar"), q = e.target.closest(".quitar");
  if (g) {
    agregarBiblio(RESULTADOS[+g.dataset.i]);
    document.querySelectorAll('.guardar[data-i="' + g.dataset.i + '"]').forEach(b => b.textContent = "✔ En mi lista");
  }
  if (q) {
    BIBLIO.splice(+q.dataset.i, 1);
    try { localStorage.setItem("ap_biblio", JSON.stringify(BIBLIO)); } catch (e2) {}
    pintarBiblio();
  }
});

$("btnCopiarLista").onclick = async () => {
  try {
    await navigator.clipboard.writeText(listaOrdenada().map(x => x.r.plano).join("\n"));
    $("msgLista").textContent = "Lista copiada ✔";
  } catch (e) { $("msgLista").textContent = "No se pudo copiar automáticamente."; }
};

$("resultadosFuentes").addEventListener("click", e => {
  const b = e.target.closest(".usarapa");
  if (b) usarEnAPA(RESULTADOS[Number(b.dataset.i)]);
});

/* ===== 6. ANALIZADOR DE TEXTO ===== */
$("texto").addEventListener("input", () => {
  $("contadorVivo").textContent = palabrasDe($("texto").value).length + " palabras";
});
$("btnLimpiar").onclick = () => {
  $("texto").value = ""; $("resultadoAnalisis").innerHTML = ""; $("resultadoCoincidencias").innerHTML = "";
  $("msgCoinc").textContent = ""; $("contadorVivo").textContent = "0 palabras";
};

const REGLAS = [
  [/\d+([.,]\d+)?\s?(%|por ciento)/i, "Contiene un porcentaje"],
  [/\b(1[5-9]\d\d|20\d\d)\b/, "Menciona una fecha o año"],
  [/\b\d{1,3}([.,]\d{3})+\b|\b\d{4,}\b/, "Contiene una cifra o dato numérico"],
  [/seg[uú]n|estudios|investigaciones|encuestas|informes|expertos|cient[ií]ficos|se ha demostrado|est[aá] comprobado/i, "Atribuye algo a estudios o expertos sin nombrarlos"],
  [/\b(siempre|nunca|todos los|ninguno|la mayor[ií]a|millones)\b/i, "Afirmación absoluta o generalizada"],
  [/["“«][^"”»]{15,}["”»]/, "Contiene una cita entre comillas"]
];

/* --- Indicadores descriptivos de estilo; no clasifican autoría --- */
function analizarEstilo(texto) {
  const palabras = palabrasDe(texto);
  const frases = texto.split(SPLIT).map(f => f.trim()).filter(f => palabrasDe(f).length >= 3);
  if (palabras.length < 120 || frases.length < 4) {
    return { suficiente: false, mensaje: "Se necesitan al menos 120 palabras y 4 frases para describir algunos patrones de estilo." };
  }

  const longitudes = frases.map(f => palabrasDe(f).length).sort((a, b) => a - b);
  const mediana = longitudes[Math.floor(longitudes.length / 2)];
  const promedio = longitudes.reduce((a, b) => a + b, 0) / longitudes.length;
  const desviacion = Math.sqrt(longitudes.reduce((a, b) => a + (b - promedio) ** 2, 0) / longitudes.length);
  const ventanas = [];
  for (let i = 0; i < palabras.length; i += 100) {
    const parte = palabras.slice(i, i + 100);
    if (parte.length >= 40) ventanas.push(new Set(parte).size / parte.length);
  }
  const repetidos = new Map();
  for (let i = 0; i <= palabras.length - 5; i++) {
    const grupo = palabras.slice(i, i + 5);
    if (grupo.filter(w => w.length > 3).length < 2) continue;
    const clave = grupo.join(" ");
    repetidos.set(clave, (repetidos.get(clave) || 0) + 1);
  }
  const frasesRepetidas = [...repetidos].filter(([, n]) => n > 1).slice(0, 5).map(([frase, veces]) => ({ frase, veces }));

  return {
    suficiente: true,
    detalles: {
      mediana, min: longitudes[0], max: longitudes[longitudes.length - 1],
      variacion: promedio ? (desviacion / promedio).toFixed(2) : "0.00",
      diversidadVentanas: ventanas.length
        ? (ventanas.reduce((a, b) => a + b, 0) / ventanas.length).toFixed(2)
        : "no disponible",
      frasesRepetidas
    }
  };
}

function panelEstilo(estilo) {
  if (!estilo.suficiente) return `<div class="ia-panel"><div class="ia-detalles"><b>Indicadores de estilo</b><p>${esc(estilo.mensaje)}</p></div></div>`;
  return `<div class="ia-panel">
    <div class="ia-detalles"><b>Indicadores descriptivos de estilo</b>
      <p>Longitud mediana de frase: ${estilo.detalles.mediana} palabras (rango ${estilo.detalles.min}–${estilo.detalles.max}); variación de longitud: ${estilo.detalles.variacion}; diversidad léxica media por bloques: ${estilo.detalles.diversidadVentanas}.</p>
      ${estilo.detalles.frasesRepetidas.length
        ? `<p>Secuencias de cinco palabras repetidas: ${estilo.detalles.frasesRepetidas.map(x => `«${esc(x.frase)}» (${x.veces} veces)`).join("; ")}.</p>`
        : "<p>No se detectaron secuencias de cinco palabras repetidas.</p>"}
      <p class="msg" style="margin:6px 0 0"><b>Importante:</b> estos datos describen regularidades, no detectan si una persona o una IA escribió el texto. No uses estos indicadores como evidencia de autoría.</p>
    </div></div>`;
}

/* --- Análisis general --- */
function analizar() {
  const t = $("texto").value.trim(), out = $("resultadoAnalisis");
  if (!t) { out.innerHTML = '<p class="msg err">Pega un texto para analizarlo.</p>'; return; }
  const pal = palabrasDe(t);
  const frases = t.split(SPLIT).filter(f => f.trim().length > 3);
  const N = 4, conteo = {};
  for (let i = 0; i <= pal.length - N; i++) {
    const g = pal.slice(i, i + N);
    if (g.every(w => w.length <= 3)) continue;
    const k = g.join(" "); conteo[k] = (conteo[k] || 0) + 1;
  }
  const rep = Object.entries(conteo).filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const hall = [];
  frases.forEach(f => {
    const motivos = REGLAS.filter(r => r[0].test(f)).map(r => r[1]);
    if (motivos.length) hall.push({ f, motivos });
  });
  const hayCita = /\([^()]*[A-Za-zÁÉÍÓÚÑáéíóúñ][^()]*,?\s*(\d{4}|s\.\s?f\.)[^()]*\)/.test(t);
  const estilo = analizarEstilo(t);

  let h = `<div class="stats">
    <div class="stat"><b>${pal.length}</b>palabras</div>
    <div class="stat"><b>${frases.length}</b>frases</div>
    <div class="stat"><b>${rep.length}</b>frases repetidas</div>
    <div class="stat"><b>${hall.length}</b>afirmaciones a citar</div></div>`;

  h += "<h3>Indicadores de estilo (no determinan autoría)</h3>" + panelEstilo(estilo);

  h += "<h3>Frases repetidas</h3>" + (rep.length
    ? "<ul>" + rep.map(([k, c]) => `<li>«${esc(k)}…» aparece ${c} veces</li>`).join("") + "</ul>"
    : '<p class="msg">No se encontraron grupos de 4 palabras repetidos.</p>');

  h += "<h3>Afirmaciones que podrían necesitar cita</h3>" + (hall.length
    ? hall.map(x => `<div class="hallazgo">${esc(x.f)}<br><em>${x.motivos.join(" · ")}</em><br>${sugHTML(x.f)}
        <a href="https://scholar.google.com/scholar?q=${encodeURIComponent('"' + x.f.slice(0, 120) + '"')}" target="_blank" rel="noopener">Buscar esta frase en Google Académico ↗</a></div>`).join("")
    : '<p class="msg">No se detectaron datos, fechas ni afirmaciones evidentes. Eso no significa que no necesiten cita.</p>');

  h += cruceHTML(t);

  const rec = [];
  if (hall.length && !hayCita) rec.push("Hay afirmaciones que parecen necesitar respaldo, pero no se detectaron citas en formato (Autor, año).");
  else if (hall.length) rec.push("Verifica que cada dato marcado tenga su cita (Autor, año) y su referencia al final.");
  if (rep.length) rec.push("Reformula las frases repetidas para variar tu redacción.");
  if (pal.length < 50) rec.push("El fragmento es corto; el análisis es más útil con párrafos completos.");
  rec.push("Parafrasea con tus propias palabras y cita la fuente aunque no uses comillas.");
  rec.push("Agrega las referencias completas en APA 7 (usa el generador de esta página).");

  h += "<h3>Recomendaciones</h3><ul>" + rec.map(r => `<li>${r}</li>`).join("") + "</ul>";
  out.innerHTML = h;
}
$("btnAnalizar").onclick = analizar;

function sugHTML(f) {
  const ts = terminos(f);
  const s = RESULTADOS.map((r, i) => ({ r, i, n: ts.filter(x => norm(r.titulo + " " + (r.resumen || "")).join(" ").includes(x)).length }))
    .filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2);
  return s.length ? "<small>Posible respaldo: " + s.map(x =>
    `<a href="${esc(x.r.url)}" target="_blank" rel="noopener">${esc(x.r.titulo.slice(0, 80))}</a> <button class="btn ghost chico guardar" data-i="${x.i}">＋ Guardar</button>`).join(" · ") + "</small><br>" : "";
}

function cruceHTML(t) {
  let h = "<h3>Tema y citas</h3>";
  const ts = terminos(TEMA), tn = norm(t).join(" ");
  if (ts.length) {
    const ok = ts.filter(x => tn.includes(x));
    h += `<p>Términos de tu tema presentes en el texto: <b>${ok.length} de ${ts.length}</b>${ok.length < ts.length ? " (no aparecen: " + esc(ts.filter(x => !ok.includes(x)).join(", ")) + ")" : ""}.</p>`;
  }
  const nom = "[A-ZÁÉÍÓÚÑ][\\p{L}'-]+", citas = [];
  const add = (s, y, txt) => { const k = norm(s).join(" "); if (!citas.some(c => c.s === k && c.y === anioK(y))) citas.push({ s: k, y: anioK(y), txt }); };
  const otro = "(?:\\s+et al\\.|\\s+(?:y|&)\\s+" + nom + ")?";
  const r1 = /\(([^()]*)\)/g, r3 = new RegExp("(" + nom + ")" + otro + "\\s*,\\s*(\\d{4}[a-z]?|s\\. ?f\\.)", "u"), r2 = new RegExp("(" + nom + ")" + otro + "\\s*\\((\\d{4})[a-z]?[^)]*\\)", "gu");
  let m;
  while ((m = r1.exec(t))) m[1].split(";").forEach(c => { const x = c.match(r3); if (x) add(x[1], x[2], x[1] + ", " + x[2]); });
  while ((m = r2.exec(t))) add(m[1], m[2], m[1] + " (" + m[2] + ")");
  const refs = BIBLIO.map(b => ({ b, k: norm(autor1(b)).join(" "), y: anioK(b.anio) })), usadas = new Set();
  const sinRef = citas.filter(c => { const hit = refs.find(r => r.y === c.y && r.k.includes(c.s)); if (hit) usadas.add(hit); return !hit; });
  const sinCita = refs.filter(r => !usadas.has(r));
  h += citas.length ? `<p>Citas detectadas en el texto: <b>${citas.length}</b>.</p>` : '<p class="msg">No se detectaron citas en formato (Autor, año).</p>';
  if (!BIBLIO.length) h += '<p class="msg">Tu lista de referencias está vacía: guarda fuentes para poder cruzarlas.</p>';
  else {
    if (sinRef.length) h += `<div class="hallazgo"><em>Citadas pero ausentes de tu lista:</em> ${esc(sinRef.map(c => c.txt).join("; "))}</div>`;
    if (sinCita.length) h += `<div class="hallazgo"><em>En tu lista pero sin cita en el texto:</em> ${esc(sinCita.map(r => r.k + " (" + r.y + ")").join("; "))}</div>`;
  }
  return h + '<p class="msg">El cruce compara apellido y año; no verifica que la fuente diga lo que afirmas.</p>';
}

/* ===== 7. BÚSQUEDA DE COINCIDENCIAS EN TEXTO Y RESÚMENES ===== */
const STOP_COTEJO = new Set([...STOP, "esta", "este", "estos", "estas", "tambien", "donde", "cuando", "desde", "hasta", "sobre", "entre", "porque", "sino", "cada", "todo", "toda", "todos", "todas", "ser", "fue", "son", "han", "hay", "puede", "pueden", "mediante", "estudio", "estudios", "analisis", "resultado", "resultados", "metodo", "metodos", "investigacion", "investigaciones", "objetivo", "objetivos", "paper", "study", "studies", "results", "result", "method", "methods", "research", "analysis", "using", "used", "based", "show", "shows", "found"]);

function tokensClave(texto) {
  return norm(texto).filter(p => p.length > 2 && !STOP_COTEJO.has(p));
}

function fragmentosClave(texto, max = 8) {
  const frases = texto.split(SPLIT).map(f => f.trim()).filter(f => tokensClave(f).length >= 7);
  const documentos = frases.map((frase, indice) => ({ frase, indice, tokens: tokensClave(frase) }));
  const df = new Map();
  documentos.forEach(d => new Set(d.tokens).forEach(token => df.set(token, (df.get(token) || 0) + 1)));
  documentos.forEach(d => {
    d.peso = d.tokens.reduce((s, token) => s + Math.log(1 + documentos.length / (df.get(token) || 1)), 0);
  });
  const elegidas = [];
  documentos.sort((a, b) => b.peso - a.peso).forEach(candidata => {
    if (elegidas.length >= max) return;
    const terminos = new Set(candidata.tokens);
    const redundante = elegidas.some(e => {
      const comunes = [...terminos].filter(t => new Set(e.tokens).has(t)).length;
      return comunes / Math.min(terminos.size, new Set(e.tokens).size) >= 0.7;
    });
    if (!redundante) elegidas.push(candidata);
  });
  return elegidas.sort((a, b) => a.indice - b.indice).map(x => x.frase.slice(0, 180));
}

function secuenciaLiteral(a, b) {
  let mejor = 0, fin = 0, anterior = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const actual = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) actual[j] = anterior[j - 1] + 1;
      if (actual[j] > mejor) { mejor = actual[j]; fin = i; }
    }
    anterior = actual;
  }
  return { longitud: mejor, frase: a.slice(fin - mejor, fin).join(" ") };
}

function cotejarTexto(texto, fuente) {
  const frasesTexto = texto.split(SPLIT).map(f => ({ original: f.trim(), tokens: norm(f) }))
    .filter(f => tokensClave(f.original).length >= 7);
  const frasesFuente = fuente.split(/[.!?;\n]+/).map(f => f.trim()).filter(Boolean);
  let mejor = null;
  for (const frase of frasesTexto) {
    const claveUsuario = tokensClave(frase.original);
    const conjuntoUsuario = new Set(claveUsuario);
    for (const fraseFuente of frasesFuente) {
      const tokensFuente = norm(fraseFuente);
      const clavesFuente = new Set(tokensClave(fraseFuente));
      if (clavesFuente.size < 5) continue;
      const literal = secuenciaLiteral(frase.tokens, tokensFuente);
      const comunes = [...conjuntoUsuario].filter(t => clavesFuente.has(t));
      const cobertura = comunes.length / conjuntoUsuario.size;
      const jaccard = comunes.length / new Set([...conjuntoUsuario, ...clavesFuente]).size;
      const exacta = literal.longitud >= 8;
      const posibleParafrasis = !exacta && comunes.length >= 6 && cobertura >= 0.55 && jaccard >= 0.28;
      if (!exacta && !posibleParafrasis) continue;
      const puntuacion = exacta ? 1000 + literal.longitud : comunes.length * cobertura * jaccard;
      if (!mejor || puntuacion > mejor.puntuacion) {
        mejor = {
          tipo: exacta ? "literal" : "terminos",
          puntuacion,
          fraseUsuario: frase.original,
          fraseFuente,
          literal: literal.frase,
          longitudLiteral: literal.longitud,
          compartidos: comunes.length,
          totalUsuario: conjuntoUsuario.size,
          cobertura: Math.round(cobertura * 100),
          terminos: comunes
        };
      }
    }
  }
  return mejor;
}

async function buscarWikipedia(frag) {
  const q = limpiarFrag(frag);
  const d = await pedir(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&srprop=snippet&format=json&origin=*`);
  return ((d.query && d.query.search) || []).map(x => ({
    fuente: "Wikipedia (es)", titulo: x.title,
    url: "https://es.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")),
    resumen: limpiarHTML(x.snippet)
  }));
}

async function buscarCoincidencias() {
  const t = $("texto").value.trim(), m = $("msgCoinc"), out = $("resultadoCoincidencias");
  out.innerHTML = "";
  if (palabrasDe(t).length < 30) { m.className = "msg err"; m.textContent = "Pega al menos 30 palabras para buscar fragmentos informativos."; return; }
  const frags = fragmentosClave(t);
  if (!frags.length) { m.className = "msg err"; m.textContent = "No hay suficientes frases con términos informativos para hacer una búsqueda útil."; return; }
  m.className = "msg"; $("btnCoinc").disabled = true;

  const hallazgos = new Map();
  const erroresBase = new Set();
  let hechas = 0, siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(3, frags.length) }, async () => {
    while (siguiente < frags.length) {
      const indice = siguiente++;
      const fragmento = frags[indice];
      m.textContent = `Consultando fragmento ${indice + 1} de ${frags.length}…`;
      const [wiki, articulos] = await Promise.allSettled([
        buscarWikipedia(fragmento),
        pedir(`/api/buscar?q=${encodeURIComponent(limpiarFrag(fragmento))}`)
      ]);
      if (wiki.status === "fulfilled") {
        wiki.value.forEach(x => hallazgos.set(x.url, { ...x, fuente: x.fuente || "Wikipedia (es)" }));
      } else erroresBase.add("Wikipedia");
      if (articulos.status === "fulfilled") {
        (articulos.value.resultados || []).forEach(r => {
          if (!r.resumen || !r.url) return;
          const clave = r.doi ? "doi:" + r.doi.toLowerCase() : r.url.toLowerCase().replace(/\/$/, "");
          const previo = hallazgos.get(clave);
          if (previo) {
            previo.fuente = [...new Set([...(previo.fuente || "").split(" · "), ...(r.bases || [])])].filter(Boolean).join(" · ");
            if (!previo.resumen) previo.resumen = r.resumen;
          } else hallazgos.set(clave, { titulo: r.titulo, url: r.url, fuente: (r.bases || []).join(" · "), resumen: r.resumen });
        });
      } else erroresBase.add("Bases académicas");
      hechas++;
      m.textContent = `Consultas completadas: ${hechas} de ${frags.length}…`;
    }
  });
  await Promise.all(trabajadores);
  $("btnCoinc").disabled = false;

  const lista = [...hallazgos.values()].map(x => ({ ...x, evidencia: cotejarTexto(t, x.resumen || "") }))
    .filter(x => x.evidencia)
    .sort((a, b) => b.evidencia.puntuacion - a.evidencia.puntuacion);

  if (!lista.length) {
    m.textContent = "No se halló evidencia suficiente de coincidencia literal o de términos en los resúmenes consultados. Esto no demuestra originalidad: los artículos completos no fueron comparados.";
  } else {
    m.textContent = `Se encontraron ${lista.length} fuente(s) con fragmentos que vale la pena cotejar. El orden prioriza coincidencias literales; revisa el artículo original antes de sacar conclusiones.`;
  }

  let h = "";
  if (lista.length) {
    h += lista.map(x => {
      const e = x.evidencia;
      const evidencia = e.tipo === "literal"
        ? `<p><b>Coincidencia literal:</b> ${e.longitudLiteral} palabras consecutivas.<br><b>Fragmento compartido:</b> «${esc(e.literal)}»</p>`
        : `<p><b>Posible paráfrasis o tema coincidente:</b> ${e.compartidos} de ${e.totalUsuario} términos clave de la frase aparecen en el fragmento del resumen (${e.cobertura}%). Esto solo indica solapamiento léxico, no demuestra que una idea se haya tomado de esta fuente.<br><b>Frase del trabajo:</b> «${esc(e.fraseUsuario)}»<br><b>Fragmento del resumen:</b> «${esc(e.fraseFuente)}»<br><b>Términos compartidos:</b> ${esc(e.terminos.join(", "))}</p>`;
      return `<div class="coinc">
        <b>${esc(x.titulo)}</b><br>
        <span class="fuente-tag">${esc(x.fuente)}</span>
        ${evidencia}
        <p style="margin:8px 0 0"><a href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente ↗</a></p>
      </div>`;
    }).join("");
  }
  if (erroresBase.size) h += `<p class="msg err">No respondieron: ${esc([...erroresBase].join(", "))}.</p>`;
  h += `<h3 class="tit">Cómo interpretar la evidencia</h3>
    <p class="msg" style="margin:0 0 8px"><b>Coincidencia literal</b> señala una secuencia igual en el resumen. <b>Posible paráfrasis o tema coincidente</b> solo mide términos en común: no puede probar una relación de origen indirecto. Para verificarla, abre el artículo, compara el pasaje completo, revisa la fecha y confirma si la idea está citada. Esta herramienta no accede al texto completo ni a trabajos cerrados; sin coincidencias no significa que no haya plagio.</p>
    <p class="msg" style="margin:0 0 8px">Amplía la búsqueda manualmente en <b>Google</b> o <b>Google Académico</b>, especialmente para páginas, tesis y libros que no estén en los resúmenes consultados.</p>` +
    frags.map(f => {
      const corto = limpiarFrag(f).split(" ").slice(0, 7).join(" ");
      const exacto = encodeURIComponent('"' + corto + '"'), libre = encodeURIComponent(corto);
      const prior = encodeURIComponent('"' + corto + '" (site:banrep.gov.co OR site:dane.gov.co OR site:scielo.org.co OR site:redalyc.org)');
      return `<div class="hallazgo">${esc(corto)}…<br>
        <a href="https://www.google.com/search?q=${exacto}" target="_blank" rel="noopener">Google (frase exacta) ↗</a> ·
        <a href="https://www.google.com/search?q=${prior}" target="_blank" rel="noopener">BanRep, DANE, SciELO y Redalyc ↗</a> ·
        <a href="https://www.google.com/search?q=${libre}" target="_blank" rel="noopener">Google (sin comillas) ↗</a> ·
        <a href="https://scholar.google.com/scholar?hl=es&q=${libre}" target="_blank" rel="noopener">Google Académico ↗</a></div>`;
    }).join("");
  out.innerHTML = h;
}
$("btnCoinc").onclick = buscarCoincidencias;

/* ===== 8. GENERADOR APA 7 ===== */
$("aTipo").onchange = () => {
  $("lblSitio").textContent = $("aTipo").value === "web" ? "Nombre del sitio web" : "Nombre de la revista";
};
let refTexto = "", refActual = null;

$("btnRef").onclick = () => {
  const d = {
    autores: $("aAutor").value.split(";").map(x => x.trim()).filter(Boolean),
    anio: $("aAnio").value,
    titulo: $("aTitulo").value.trim(),
    revista: $("aSitio").value.trim(),
    url: $("aUrl").value.trim(),
    tipo: $("aTipo").value
  };
  if (refActual && refActual.doi && refActual.titulo === d.titulo) d.doi = refActual.doi;
  if (!d.titulo) { $("refSalida").textContent = "Escribe al menos el título."; refTexto = ""; refActual = null; return; }
  const r = refDe(d);
  $("refSalida").innerHTML = r.html; refTexto = r.plano; refActual = d; $("msgCopia").textContent = "";
};
$("btnGuardarRef").onclick = () => {
  if (!refActual) { $("msgCopia").textContent = "Primero genera una referencia."; return; }
  agregarBiblio(refActual); $("msgCopia").textContent = "Guardada ✔";
};
$("btnCopiar").onclick = async () => {
  const m = $("msgCopia");
  if (!refTexto) { m.textContent = "Primero genera una referencia."; return; }
  try { await navigator.clipboard.writeText(refTexto); m.textContent = "Copiada ✔"; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = refTexto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); m.textContent = "Copiada ✔"; }
    catch (e2) { m.textContent = "No se pudo copiar. Selecciónala y usa Ctrl+C."; }
    ta.remove();
  }
};

async function enriquecerCSL(d) {
  if (!d.doi) return null;
  try {
    const r = await pedir(`/api/metadata?doi=${encodeURIComponent(d.doi)}`);
    return r.csl || null;
  } catch (e) {
    return null;
  }
}

async function usarEnAPA(r) {
  if (!r) return;
  // Relleno inmediato con lo que ya tenemos (feedback rápido al usuario)
  $("aTipo").value = r.tipo || "revista"; $("aTipo").onchange();
  $("aAutor").value = (r.autores || []).slice(0, 20).join("; ");
  $("aAnio").value = r.anio || "";
  $("aTitulo").value = r.titulo || "";
  $("aSitio").value = r.revista || "";
  $("aUrl").value = r.url || "";
  refActual = { ...r, autores: r.autores || [], tipo: r.tipo || "revista" };
  $("btnRef").onclick();
  $("msgCopia").textContent = "Cargando metadatos completos…";
  $("apa").scrollIntoView({ behavior: "smooth" });

  // Enriquecimiento con metadatos completos si hay DOI
  const csl = await enriquecerCSL(r);
  if (!csl) {
    $("msgCopia").textContent = "Datos cargados. Verifica autores, año y revista antes de entregar.";
    return;
  }

  // Guardamos el CSL en el propio objeto para que refDe() lo use directamente
  r._csl = csl;
  refActual = { ...r, _csl: csl, autores: r.autores || [], tipo: r.tipo || "revista" };
  $("btnRef").onclick();
  $("msgCopia").textContent = `Metadatos completos cargados desde ${csl.DOI ? "Crossref/DataCite" : "la búsqueda"}. Verifica antes de entregar.`;
}

/* ===== 9. LISTA DE VERIFICACIÓN ===== */
$("items").innerHTML = CONFIG.checklist.map((q, i) =>
  `<label class="check"><input type="checkbox" data-i="${i}"><span>${esc(q)}</span></label>`).join("");
function actualizarLista() {
  const cs = Array.from(document.querySelectorAll("#items input"));
  const n = cs.filter(c => c.checked).length;
  $("progreso").style.width = (n / cs.length * 100) + "%";
  $("estadoLista").textContent = n === cs.length
    ? "¡Completaste los 5 puntos! Aun así, relee tu trabajo antes de entregar."
    : `${n} de ${cs.length} completados. Revisa los pendientes.`;
}
document.querySelectorAll("#items input").forEach(c => c.onchange = actualizarLista);
$("btnReiniciar").onclick = () => {
  document.querySelectorAll("#items input").forEach(c => c.checked = false);
  actualizarLista();
};

/* ===== 10. INICIO ===== */
try {
  const t = localStorage.getItem("ap_tema");
  if (t) { $("tema").value = t; setTema(t); } else setTema("");
} catch (e) { setTema(""); }
actualizarLista();
pintarBiblio();
pintarPortales(TEMA);