/* =====================================================================
   AntiPlagio · script.js
   Secciones: 1) Configuración  2) Utilidades  3) Bases de datos (APIs)
              4) Buscador  5) Analizador  6) Coincidencias  7) APA 7
              8) Lista de verificación
   ===================================================================== */

/* ===== 1. CONFIGURACIÓN (fácil de modificar) ===== */
const CONFIG = {
  porFuente: 5,        // resultados que se piden a cada base de datos
  correo: "",          // opcional: tu correo mejora el servicio de OpenAlex y Crossref
  portales: [          // accesos directos (se abren en otra pestaña)
    {nombre:"Google Académico", desc:"Artículos, tesis y libros académicos de todo el mundo.",
     inicio:"https://scholar.google.com/", url:q=>`https://scholar.google.com/scholar?hl=es&q=${q}`},
    {nombre:"SciELO", desc:"Revistas científicas de acceso abierto de Latinoamérica, España y Portugal.",
     inicio:"https://scielo.org/", url:q=>`https://search.scielo.org/?lang=es&q=${q}`},
    {nombre:"Redalyc", desc:"Artículos de revistas científicas iberoamericanas en acceso abierto.",
     inicio:"https://www.redalyc.org/", url:q=>`https://www.redalyc.org/busquedaArticuloFiltros.oa?q=${q}`},
    {nombre:"DANE", desc:"Estadísticas oficiales de Colombia: población, economía, empleo y censos.",
     inicio:"https://www.dane.gov.co/", url:q=>`https://www.google.com/search?q=site:dane.gov.co+${q}`},
    {nombre:"Banco de la República", desc:"Informes, investigaciones y estadísticas económicas del banco central de Colombia.",
     inicio:"https://www.banrep.gov.co/", url:q=>`https://www.google.com/search?q=site:banrep.gov.co+${q}`},
    {nombre:"Dialnet", desc:"Artículos, tesis y libros en español de universidades iberoamericanas.",
     inicio:"https://dialnet.unirioja.es/", url:(e, crudo)=>`https://dialnet.unirioja.es/buscar/documentos?querysDismax.DOCUMENTAL_TODO=${encodeURIComponent(crudo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).replace(/%20/g, "+")}`},
    {nombre:"LA Referencia", desc:"Repositorios de universidades latinoamericanas, incluida Colombia: tesis y artículos.",
     inicio:"https://www.lareferencia.info/", url:q=>`https://www.lareferencia.info/vufind/Search/Results?lookfor=${q}&type=AllFields`},
    {nombre:"Datos Abiertos Colombia", desc:"Conjuntos de datos oficiales de entidades del Estado colombiano.",
     inicio:"https://www.datos.gov.co/", url:q=>`https://www.datos.gov.co/browse?q=${q}`},
    {nombre:"CEPAL", desc:"Estudios y estadísticas sobre economía y desarrollo de América Latina.",
     inicio:"https://www.cepal.org/es", url:q=>`https://www.google.com/search?q=site:cepal.org+${q}`}
  ],
  checklist:[
    "¿Utilicé fuentes confiables?",
    "¿Escribí con mis propias palabras?",
    "¿Cité las ideas de otros autores?",
    "¿Incluí las referencias bibliográficas?",
    "¿Revisé las indicaciones del profesor sobre el uso de IA?"
  ]
};

/* ===== 2. UTILIDADES ===== */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const palabrasDe = t => t.toLowerCase().match(/[a-záéíóúüñ0-9]+/g) || [];
const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
const limpiarFrag = s => {           // quita signos, notas al pie pegadas ("que20") y palabras repetidas seguidas
  const p = s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).filter(w => !/^\p{L}+\d+$/u.test(w));
  return p.filter((w, i) => i === 0 || w.toLowerCase() !== p[i - 1].toLowerCase()).join(" ");
};
const limpiarHTML = s => new DOMParser().parseFromString(s || "", "text/html").body.textContent || "";

async function pedir(url){            // fetch con límite de 12 segundos
  const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
  try{
    const r = await fetch(url, {signal: c.signal});
    if(!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function abstractDe(inv){             // OpenAlex entrega el resumen "desordenado"
  if(!inv) return "";
  const arr = [];
  Object.keys(inv).forEach(w => inv[w].forEach(p => { arr[p] = w; }));
  return arr.join(" ");
}
const iniciales = s => s.split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase() + ".").join(" ");
function aAPA(nombre){                // "Gabriel García Márquez" -> "Márquez, G. G." (verifica apellidos compuestos)
  nombre = (nombre || "").trim().replace(/\.$/, "");
  if(!nombre) return "";
  if(nombre.includes(",")){ const p = nombre.split(","); return p[0].trim() + ", " + iniciales(p.slice(1).join(" ")); }
  const p = nombre.split(/\s+/);
  if(p.length === 1) return p[0];
  const ult = p[p.length - 1];
  if(/^[A-Z]{1,3}$/.test(ult)) return p.slice(0, -1).join(" ") + ", " + ult.split("").map(c => c + ".").join(" ");
  return ult + ", " + iniciales(p.slice(0, -1).join(" "));
}
function ngramas(palabras, n){
  const s = new Set();
  for(let i = 0; i <= palabras.length - n; i++) s.add(palabras.slice(i, i + n).join(" "));
  return s;
}
function comparte(a, b, n){           // primera secuencia de n palabras compartida (o null)
  const sb = ngramas(norm(b), n);
  for(const g of ngramas(norm(a), n)) if(sb.has(g)) return g;
  return null;
}

/* ===== 3. BASES DE DATOS (APIs gratuitas, sin clave) =====
   Cada base devuelve una lista de {titulo, autores[], anio, revista, url, resumen, tipo}.
   Para quitar una base pon activa:false. Para agregar otra, copia una y cambia la URL. */
const mail = (sep) => CONFIG.correo ? `${sep}mailto=${encodeURIComponent(CONFIG.correo)}` : "";

const BASES = [
  { nombre:"OpenAlex", desc:"Más de 200 millones de trabajos académicos de todo el mundo.", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${n}${mail("&")}`);
      return (d.results || []).map(w => {
        const loc = w.primary_location || {};
        return {titulo:w.title, autores:(w.authorships || []).map(a => a.author && aAPA(a.author.display_name)).filter(Boolean),
          anio:w.publication_year, revista:(loc.source && loc.source.display_name) || "",
          url:w.doi || loc.landing_page_url || w.id, resumen:abstractDe(w.abstract_inverted_index)};
      });
    }},
  { nombre:"Crossref", desc:"Registro oficial de DOI: artículos de revistas científicas.", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&filter=type:journal-article&select=title,author,issued,container-title,DOI,URL,abstract${mail("&")}`);
      return ((d.message && d.message.items) || []).map(x => ({
        titulo:(x.title || [])[0], anio:x.issued && x.issued["date-parts"] && x["issued"]["date-parts"][0] && x.issued["date-parts"][0][0],
        autores:(x.author || []).map(a => a.family ? a.family + (a.given ? ", " + iniciales(a.given) : "") : (a.name || "")).filter(Boolean),
        revista:(x["container-title"] || [])[0] || "", url:x.DOI ? "https://doi.org/" + x.DOI : x.URL,
        resumen:limpiarHTML(x.abstract || "")}));
    }},
  { nombre:"DOAJ", desc:"Directorio de revistas de acceso abierto con revisión por pares.", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=${n}`);
      return (d.results || []).map(x => {
        const b = x.bibjson || {}, doi = (b.identifier || []).filter(i => i.type === "doi")[0];
        return {titulo:b.title, autores:(b.author || []).map(a => aAPA(a.name)).filter(Boolean), anio:b.year,
          revista:(b.journal && b.journal.title) || "", url:doi ? "https://doi.org/" + doi.id : (b.link || [])[0] && b.link[0].url,
          resumen:b.abstract || ""};
      });
    }},
  { nombre:"Europe PMC", desc:"Literatura de salud y ciencias de la vida (medicina, biología, psicología).", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=${n}&resultType=core`);
      return ((d.resultList && d.resultList.result) || []).map(x => ({
        titulo:limpiarHTML(x.title || ""), autores:(x.authorString || "").split(", ").map(aAPA).filter(Boolean),
        anio:x.pubYear, revista:x.journalTitle || "",
        url:x.doi ? "https://doi.org/" + x.doi : `https://europepmc.org/article/${x.source}/${x.id}`,
        resumen:limpiarHTML(x.abstractText || "")}));
    }},
  { nombre:"Semantic Scholar", desc:"Buscador académico con inteligencia artificial (puede limitar el uso).", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=title,year,authors,venue,externalIds,abstract,url`);
      return (d.data || []).map(p => ({titulo:p.title, autores:(p.authors || []).map(a => aAPA(a.name)).filter(Boolean),
        anio:p.year, revista:p.venue || "", url:(p.externalIds && p.externalIds.DOI) ? "https://doi.org/" + p.externalIds.DOI : p.url,
        resumen:p.abstract || ""}));
    }},
  { nombre:"Open Library", desc:"Catálogo de libros: autores, años y ediciones.", activa:true, conResumen:false,
    async buscar(q, n){
      const d = await pedir(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${n}&fields=title,author_name,first_publish_year,key,publisher`);
      return (d.docs || []).map(x => ({titulo:x.title, autores:(x.author_name || []).map(aAPA).filter(Boolean), anio:x.first_publish_year,
        revista:(x.publisher || [])[0] || "Open Library", url:"https://openlibrary.org" + x.key, resumen:"", tipo:"web"}));
    }},
  { nombre:"Datos Abiertos Colombia", desc:"Datos oficiales publicados por entidades del Estado colombiano.", activa:true, conResumen:false,
    async buscar(q, n){
      const d = await pedir(`https://api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&search_context=www.datos.gov.co&q=${encodeURIComponent(q)}&limit=${n}`);
      return (d.results || []).map(x => {
        const r = x.resource || {};
        return {titulo:r.name, autores:[r.attribution || "Gobierno de Colombia"], anio:r.updatedAt ? String(r.updatedAt).slice(0, 4) : "",
          revista:"Datos Abiertos Colombia", url:x.link || x.permalink, resumen:"", tipo:"web"};
      });
    }}
];

/* ===== 4. BUSCADOR DE FUENTES ===== */
const RESULTADOS = [];   // guarda los resultados para el botón "Usar en APA"

function pintarPortales(q){
  const e = encodeURIComponent(q);
  $("portales").innerHTML = CONFIG.portales.map(p => `
    <div class="portal"><h4>${esc(p.nombre)}</h4><p>${esc(p.desc)}</p>
    <a class="btn chico" href="${q ? p.url(e, q) : p.inicio}" target="_blank" rel="noopener">${q ? "Buscar tema aquí ↗" : "Abrir portal ↗"}</a></div>`).join("");
}
/* --- Tema central, lista de referencias y puntuación --- */
let TEMA = "", BIBLIO = [];
try{ BIBLIO = JSON.parse(localStorage.getItem("ap_biblio") || "[]"); }catch(e){}
const SPLIT = /(?<!\b(?:al|p|pp|vol|ed|etc))[.!?]+\s+|\n+/i;
const STOP = new Set("de la el los las un una unos unas y o u en a por para con sin sobre entre del al que se su sus es son como mas the of and in on for to".split(" "));
const terminos = q => [...new Set(norm(q).filter(w => w.length > 2 && !STOP.has(w)))];
function setTema(q){
  TEMA = q;
  try{ localStorage.setItem("ap_tema", q); }catch(e){}
  document.querySelectorAll(".temaActivo").forEach(e => e.textContent = q ? "Tema activo: «" + q + "»" : "Aún no definiste un tema (escríbelo en «Fuentes»).");
}
const anioK = a => (String(a || "").match(/\d{4}/) || ["sf"])[0];
const autor1 = b => (b.autores && b.autores[0]) || b.titulo || "";
function puntuar(r, ts){
  const ti = norm(r.titulo).join(" "), rs = norm(r.resumen || "").join(" "), edad = new Date().getFullYear() - Number(r.anio || 0);
  let s = 0;
  ts.forEach(t => { if(ti.includes(t)) s += 3; if(rs.includes(t)) s += 1; });
  if(r.anio && edad <= 5) s += 1.5; else if(r.anio && edad <= 10) s += .5;
  return s + (r.bases.length - 1) * 2 + (r.resumen ? .5 : 0);
}
function refDe(d){
  const punto = s => /[.?!]$/.test(s) ? s : s + ".";
  const au = (d.autores || []).filter(Boolean), web = d.tipo === "web";
  const aut = au.length > 20 ? au.slice(0, 19).join(", ") + ", . . . " + au[au.length - 1]
    : au.length > 1 ? au.slice(0, -1).join(", ") + ", & " + au[au.length - 1] : (au[0] || "");
  const fecha = `(${String(d.anio || "").trim() || "s. f."}).`, t = punto(d.titulo || ""), s = d.revista ? punto(d.revista) : "";
  const tH = web ? `<i>${esc(t)}</i>` : esc(t), sH = s ? (web ? esc(s) : `<i>${esc(s)}</i>`) : "";
  const h = aut ? [esc(punto(aut)), esc(fecha), tH, sH, esc(d.url || "")] : [tH, esc(fecha), sH, esc(d.url || "")];
  const p = aut ? [punto(aut), fecha, t, s, d.url || ""] : [t, fecha, s, d.url || ""];
  return {html:h.filter(Boolean).join(" "), plano:p.filter(Boolean).join(" ")};
}
const listaOrdenada = () => BIBLIO.map((b, i) => ({i, r:refDe(b)})).sort((a, b) => a.r.plano.localeCompare(b.r.plano, "es"));
function pintarBiblio(){
  const l = listaOrdenada();
  $("biblio").innerHTML = l.length ? l.map(x => `<div class="refitem"><span>${x.r.html}</span><button class="btn ghost chico quitar" data-i="${x.i}" aria-label="Quitar referencia">✕</button></div>`).join("")
    : '<p class="msg">Aún no hay fuentes. Guárdalas desde el buscador o el generador.</p>';
  $("btnCopiarLista").disabled = !l.length;
}
function agregarBiblio(r){
  if(!r || BIBLIO.some(b => claveUrl(b.url) === claveUrl(r.url))) return;
  BIBLIO.push({autores:r.autores || [], anio:r.anio || "", titulo:r.titulo, revista:r.revista || "", url:r.url, tipo:r.tipo || "revista"});
  try{ localStorage.setItem("ap_biblio", JSON.stringify(BIBLIO)); }catch(e){}
  pintarBiblio();
}
document.addEventListener("click", e => {
  const g = e.target.closest(".guardar"), q = e.target.closest(".quitar");
  if(g){ agregarBiblio(RESULTADOS[+g.dataset.i]); document.querySelectorAll('.guardar[data-i="' + g.dataset.i + '"]').forEach(b => b.textContent = "✔ En mi lista"); }
  if(q){ BIBLIO.splice(+q.dataset.i, 1); try{ localStorage.setItem("ap_biblio", JSON.stringify(BIBLIO)); }catch(e2){} pintarBiblio(); }
});
$("btnCopiarLista").onclick = async () => {
  try{ await navigator.clipboard.writeText(listaOrdenada().map(x => x.r.plano).join("\n")); $("msgLista").textContent = "Lista copiada ✔"; }
  catch(e){ $("msgLista").textContent = "No se pudo copiar automáticamente."; }
};
function sugHTML(f){
  const ts = terminos(f);
  const s = RESULTADOS.map((r, i) => ({r, i, n:ts.filter(x => norm(r.titulo + " " + (r.resumen || "")).join(" ").includes(x)).length}))
    .filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2);
  return s.length ? "<small>Posible respaldo (pista, no verificación): " + s.map(x =>
    `<a href="${esc(x.r.url)}" target="_blank" rel="noopener">${esc(x.r.titulo.slice(0, 80))}</a> <button class="btn ghost chico guardar" data-i="${x.i}">＋ Guardar</button>`).join(" · ") + "</small><br>" : "";
}
function cruceHTML(t){
  let h = "<h3>Tema y citas</h3>";
  const ts = terminos(TEMA), tn = norm(t).join(" ");
  if(ts.length){ const ok = ts.filter(x => tn.includes(x));
    h += `<p>Términos de tu tema presentes en el texto: <b>${ok.length} de ${ts.length}</b>${ok.length < ts.length ? " (no aparecen: " + esc(ts.filter(x => !ok.includes(x)).join(", ")) + ")" : ""}.</p>`; }
  const nom = "[A-ZÁÉÍÓÚÑ][\\p{L}'-]+", citas = [];
  const add = (s, y, txt) => { const k = norm(s).join(" "); if(!citas.some(c => c.s === k && c.y === anioK(y))) citas.push({s:k, y:anioK(y), txt}); };
  const otro = "(?:\\s+et al\\.|\\s+(?:y|&)\\s+" + nom + ")?";
  const r1 = /\(([^()]*)\)/g, r3 = new RegExp("(" + nom + ")" + otro + "\\s*,\\s*(\\d{4}[a-z]?|s\\. ?f\\.)", "u"), r2 = new RegExp("(" + nom + ")" + otro + "\\s*\\((\\d{4})[a-z]?[^)]*\\)", "gu");
  let m;
  while((m = r1.exec(t))) m[1].split(";").forEach(c => { const x = c.match(r3); if(x) add(x[1], x[2], x[1] + ", " + x[2]); });
  while((m = r2.exec(t))) add(m[1], m[2], m[1] + " (" + m[2] + ")");
  const refs = BIBLIO.map(b => ({b, k:norm(autor1(b)).join(" "), y:anioK(b.anio)})), usadas = new Set();
  const sinRef = citas.filter(c => { const hit = refs.find(r => r.y === c.y && r.k.includes(c.s)); if(hit) usadas.add(hit); return !hit; });
  const sinCita = refs.filter(r => !usadas.has(r));
  h += citas.length ? `<p>Citas detectadas en el texto: <b>${citas.length}</b>.</p>` : '<p class="msg">No se detectaron citas en formato (Autor, año).</p>';
  if(!BIBLIO.length) h += '<p class="msg">Tu lista de referencias está vacía: guarda fuentes desde el buscador para poder cruzarlas.</p>';
  else{
    if(sinRef.length) h += `<div class="hallazgo"><em>Citadas pero ausentes de tu lista de referencias:</em> ${esc(sinRef.map(c => c.txt).join("; "))}</div>`;
    if(sinCita.length) h += `<div class="hallazgo"><em>En tu lista pero sin cita en el texto:</em> ${esc(sinCita.map(r => r.k + " (" + r.y + ")").join("; "))}</div>`;
  }
  return h + '<p class="msg">El cruce compara apellido y año; no verifica que la fuente diga lo que afirmas.</p>';
}
function tarjeta(r, i){
  const aut = r.autores && r.autores.length ? r.autores.slice(0, 3).join("; ") + (r.autores.length > 3 ? " y otros" : "") : "Autor no disponible";
  const en = BIBLIO.some(b => claveUrl(b.url) === claveUrl(r.url));
  return `<div class="resultado"><h4>${esc(r.titulo)}</h4>
    <p><span class="fuente-tag">${esc(r.bases.join(" · "))}</span><small>${esc(r.revista || "")} · ${esc(aut)} · ${esc(r.anio || "s. f.")}${r.resumen ? "" : " · sin resumen"}</small></p>
    <p><a href="${esc(r.url)}" target="_blank" rel="noopener">Consultar fuente original ↗</a>
    <button class="btn ghost chico usarapa" data-i="${i}">Usar en APA</button>
    <button class="btn chico guardar" data-i="${i}">${en ? "✔ En mi lista" : "＋ Guardar en mi lista"}</button></p></div>`;
}
const limpiarTitulo = t => limpiarHTML(String(t || "")).replace(/\s+/g, " ").trim();   // quita <i>, &amp;, etc.
const claveUrl = u => String(u || "").toLowerCase().replace(/^https?:\/\/(dx\.)?(doi\.org\/)?/, "").replace(/\/$/, "");
function motivoFallo(e){
  const t = String(e && (e.message || e.name));
  if(/429/.test(t)) return "límite de uso alcanzado: espera un minuto e intenta de nuevo.";
  if(e && e.name === "AbortError") return "el servicio tardó demasiado en responder.";
  if(e instanceof TypeError) return "sin conexión o bloqueado por el navegador.";
  return "el servicio no respondió correctamente (" + t + ").";
}
let busquedaActual = 0;   // evita que una búsqueda lenta se mezcle con la siguiente

async function buscarFuentes(){
  const q = $("tema").value.trim().slice(0, 200), m = $("msgBuscar"), out = $("resultadosFuentes");
  if(!q){ m.className = "msg err"; m.textContent = "Escribe un tema o palabras clave."; return; }
  setTema(q);
  const miId = ++busquedaActual;
  pintarPortales(q);
  RESULTADOS.length = 0; out.innerHTML = "";
  const ts = terminos(q), consulta = ts.length ? ts.join(" ") : q;
  const activas = BASES.filter(b => b.activa), mapa = new Map(), caidas = [];
  m.className = "msg"; m.textContent = `Buscando «${consulta}» en ${activas.length} bases de datos…`;
  $("btnBuscar").disabled = true;
  await Promise.all(activas.map(async b => {
    try{
      const crudos = await b.buscar(consulta, CONFIG.porFuente);
      if(miId !== busquedaActual) return;
      crudos.forEach(r0 => {
        const r = Object.assign({}, r0, {titulo:limpiarTitulo(r0.titulo), revista:limpiarTitulo(r0.revista), autores:r0.autores || []});
        if(!r.titulo || !r.url) return;
        const k = norm(r.titulo).join("").slice(0, 90), previo = mapa.get(k);
        if(previo){ previo.bases.push(b.nombre); if(!previo.resumen && r.resumen) previo.resumen = r.resumen; if(!previo.autores.length) previo.autores = r.autores; }
        else mapa.set(k, Object.assign(r, {bases:[b.nombre]}));
      });
    }catch(e){ if(miId === busquedaActual) caidas.push(b.nombre + ": " + motivoFallo(e)); }
  }));
  if(miId !== busquedaActual) return;
  $("btnBuscar").disabled = false;
  Array.from(mapa.values()).sort((a, b) => puntuar(b, ts) - puntuar(a, ts)).slice(0, 30).forEach(r => RESULTADOS.push(r));
  const ok = activas.length - caidas.length;
  out.innerHTML = RESULTADOS.map(tarjeta).join("") +
    (caidas.length ? `<p class="msg err">No respondieron: ${esc(caidas.join(" | "))}</p>` : "");
  if(ok === 0){ m.className = "msg err"; m.textContent = "No se pudo conectar con ninguna base. Revisa tu conexión o usa los portales de arriba."; }
  else if(!RESULTADOS.length){ m.textContent = "Sin resultados. Prueba palabras más generales o en inglés."; }
  else m.textContent = `${RESULTADOS.length} fuentes únicas, ordenadas por pertinencia a tu tema (${ok} de ${activas.length} bases respondieron). Revisa siempre la fuente original.`;
}
$("btnBuscar").onclick = buscarFuentes;
$("tema").addEventListener("keydown", e => { if(e.key === "Enter") buscarFuentes(); });
$("resultadosFuentes").addEventListener("click", e => {
  const b = e.target.closest(".usarapa");
  if(b) usarEnAPA(RESULTADOS[Number(b.dataset.i)]);
});

/* ===== 5. ANALIZADOR DE TEXTO ===== */
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
function analizar(){
  const t = $("texto").value.trim(), out = $("resultadoAnalisis");
  if(!t){ out.innerHTML = '<p class="msg err">Pega un texto para analizarlo.</p>'; return; }
  const pal = palabrasDe(t);
  const frases = t.split(SPLIT).filter(f => f.trim().length > 3);
  const N = 4, conteo = {};                       // grupos de 4 palabras repetidos
  for(let i = 0; i <= pal.length - N; i++){
    const g = pal.slice(i, i + N);
    if(g.every(w => w.length <= 3)) continue;
    const k = g.join(" "); conteo[k] = (conteo[k] || 0) + 1;
  }
  const rep = Object.entries(conteo).filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const hall = [];
  frases.forEach(f => {
    const motivos = REGLAS.filter(r => r[0].test(f)).map(r => r[1]);
    if(motivos.length) hall.push({f, motivos});
  });
  const hayCita = /\([^()]*[A-Za-zÁÉÍÓÚÑáéíóúñ][^()]*,?\s*(\d{4}|s\.\s?f\.)[^()]*\)/.test(t);

  let h = `<div class="stats">
    <div class="stat"><b>${pal.length}</b>palabras</div>
    <div class="stat"><b>${frases.length}</b>frases</div>
    <div class="stat"><b>${rep.length}</b>frases repetidas</div>
    <div class="stat"><b>${hall.length}</b>posibles afirmaciones a citar</div></div>`;
  h += "<h3>Frases repetidas</h3>" + (rep.length
    ? "<ul>" + rep.map(([k, c]) => `<li>«${esc(k)}…» aparece ${c} veces</li>`).join("") + "</ul>"
    : '<p class="msg">No se encontraron grupos de 4 palabras repetidos.</p>');
  h += "<h3>Afirmaciones que podrían necesitar cita</h3>" + (hall.length
    ? hall.map(x => `<div class="hallazgo">${esc(x.f)}<br><em>${x.motivos.join(" · ")}</em><br>${sugHTML(x.f)}
        <a href="https://scholar.google.com/scholar?q=${encodeURIComponent('"' + x.f.slice(0, 120) + '"')}" target="_blank" rel="noopener">Buscar esta frase en Google Académico ↗</a></div>`).join("")
    : '<p class="msg">No se detectaron datos, fechas ni afirmaciones evidentes. Eso no significa que no necesiten cita.</p>');
  h += cruceHTML(t);
  const rec = [];
  if(hall.length && !hayCita) rec.push("Hay afirmaciones que parecen necesitar respaldo, pero no se detectaron citas en formato (Autor, año). Agrégalas.");
  else if(hall.length) rec.push("Verifica que cada dato o afirmación marcada tenga su cita (Autor, año) y su referencia al final.");
  if(rep.length) rec.push("Reformula las frases repetidas para variar tu redacción.");
  if(pal.length < 50) rec.push("El fragmento es corto; el análisis es más útil con párrafos completos.");
  rec.push("Parafrasea con tus propias palabras y cita la fuente aunque no uses comillas.");
  rec.push("Agrega las referencias completas en APA 7 (usa el generador de esta página).");
  rec.push("Si usaste IA, revisa las reglas de tu profesor y decláralo cuando corresponda.");
  h += "<h3>Recomendaciones</h3><ul>" + rec.map(r => `<li>${r}</li>`).join("") + "</ul>";
  out.innerHTML = h;
}
$("btnAnalizar").onclick = analizar;

/* ===== 6. BÚSQUEDA DE COINCIDENCIAS (Wikipedia + bases con resumen) ===== */
function fragmentosClave(texto, max, largo){      // fragmentos repartidos por todo el texto
  const frases = texto.split(SPLIT).map(limpiarFrag).filter(f => f.split(" ").length > largo);
  if(!frases.length){
    const p = limpiarFrag(texto).split(" ");
    return p.length >= 6 ? [p.slice(0, largo).join(" ")] : [];
  }
  const paso = Math.max(1, Math.floor(frases.length / max)), sel = [];
  for(let i = 0; i < frases.length && sel.length < max; i += paso) sel.push(frases[i].split(" ").slice(0, largo).join(" "));
  return sel;
}
async function buscarWikipedia(frag){
  const q = '"' + limpiarFrag(frag) + '"';
  const d = await pedir(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&srprop=snippet&format=json&origin=*`);
  return ((d.query && d.query.search) || []).map(x => ({
    fuente:"Wikipedia (es)", titulo:x.title,
    url:"https://es.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")),
    coincidencia:comparte(frag, limpiarHTML(x.snippet), 5)
  })).filter(x => x.coincidencia);
}
async function buscarCoincidencias(){
  const t = $("texto").value.trim(), m = $("msgCoinc"), out = $("resultadoCoincidencias");
  out.innerHTML = "";
  if(palabrasDe(t).length < 12){ m.className = "msg err"; m.textContent = "Pega un texto de al menos 12 palabras."; return; }
  const frags = fragmentosClave(t, 6, 9);
  if(!frags.length){ m.className = "msg err"; m.textContent = "El texto es demasiado corto para buscar coincidencias."; return; }
  const bases = BASES.filter(b => b.activa && b.conResumen);
  const stats = {"Wikipedia (es)":{ok:0, fallo:0}};
  bases.forEach(b => { stats[b.nombre] = {ok:0, fallo:0}; });
  const hallazgos = new Map();
  m.className = "msg"; $("btnCoinc").disabled = true;

  for(let i = 0; i < frags.length; i++){
    m.textContent = `Revisando fragmento ${i + 1} de ${frags.length} en ${bases.length + 1} fuentes…`;
    const limpio = limpiarFrag(frags[i]);
    const tareas = [{n:"Wikipedia (es)", p:buscarWikipedia(frags[i])}].concat(bases.map(b => ({
      n:b.nombre,
      p:b.buscar(limpio, 5).then(rs => rs.map(r => ({fuente:b.nombre, titulo:r.titulo, url:r.url,
        coincidencia:comparte(t, r.resumen || "", 6)})).filter(x => x.coincidencia))
    })));
    const res = await Promise.allSettled(tareas.map(x => x.p));
    res.forEach((r, k) => {
      const n = tareas[k].n;
      if(r.status === "rejected"){ stats[n].fallo++; return; }
      stats[n].ok++;
      r.value.forEach(x => { if(x.url && !hallazgos.has(x.url)) hallazgos.set(x.url, x); });
    });
  }
  $("btnCoinc").disabled = false;

  const nombres = Object.keys(stats);
  const consultadas = nombres.filter(n => stats[n].ok > 0), caidas = nombres.filter(n => stats[n].ok === 0);
  if(!consultadas.length){
    m.className = "msg err";
    m.textContent = "No se pudo conectar con ninguna fuente. Revisa tu conexión a Internet. Si abres la página desde un entorno que bloquea conexiones externas, esta función no puede funcionar.";
    return;
  }
  const lista = Array.from(hallazgos.values());
  let h = "";
  if(lista.length){
    m.textContent = `Se encontraron ${lista.length} posible(s) coincidencia(s). Ábrelas y compara con tu texto: no todas implican plagio.`;
    h += lista.map(x => `<div class="coinc"><b>${esc(x.titulo)}</b><br><span class="fuente-tag">${esc(x.fuente)}</span>
      Secuencia compartida: «${esc(x.coincidencia)}…»<br><a href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente ↗</a></div>`).join("");
  } else {
    m.textContent = "No se encontraron coincidencias en las fuentes consultadas. Esto NO prueba que tu texto sea original: es lo esperable si el texto viene de un PDF, libro o documento de un sitio institucional, porque estas bases solo revisan resúmenes. Usa los enlaces de verificación manual de abajo.";
  }
  h += `<p class="msg">Fuentes consultadas: ${esc(consultadas.join(", "))}.` +
       (caidas.length ? ` No disponibles en esta revisión: ${esc(caidas.join(", "))}.` : "") + "</p>";
  h += `<h3 class="tit">Verificación manual recomendada</h3>
    <p class="msg" style="margin:0 0 8px">Usa <b>Google</b> si el texto viene de una página web, noticia o blog. <b>Google Académico</b> solo sirve si viene de un artículo, tesis o libro académico publicado en línea. Si una búsqueda no da nada, prueba la otra o la versión sin comillas.</p>` +
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

/* ===== 7. GENERADOR APA 7 ===== */
$("aTipo").onchange = () => {
  $("lblSitio").textContent = $("aTipo").value === "web" ? "Nombre del sitio web" : "Nombre de la revista";
};
let refTexto = "";    // versión en texto plano para copiar

let refActual = null;
$("btnRef").onclick = () => {
  const d = {autores:$("aAutor").value.split(";").map(x => x.trim()).filter(Boolean), anio:$("aAnio").value,
    titulo:$("aTitulo").value.trim(), revista:$("aSitio").value.trim(), url:$("aUrl").value.trim(), tipo:$("aTipo").value};
  if(!d.titulo){ $("refSalida").textContent = "Escribe al menos el título del documento."; refTexto = ""; refActual = null; return; }
  const r = refDe(d);
  $("refSalida").innerHTML = r.html; refTexto = r.plano; refActual = d; $("msgCopia").textContent = "";
};
$("btnGuardarRef").onclick = () => {
  if(!refActual){ $("msgCopia").textContent = "Primero genera una referencia."; return; }
  agregarBiblio(refActual); $("msgCopia").textContent = "Guardada en «Mi lista de referencias» ✔";
};
$("btnCopiar").onclick = async () => {
  const m = $("msgCopia");
  if(!refTexto){ m.textContent = "Primero genera una referencia."; return; }
  try{
    await navigator.clipboard.writeText(refTexto);
    m.textContent = "Referencia copiada ✔";
  }catch(e){
    const ta = document.createElement("textarea");
    ta.value = refTexto; document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); m.textContent = "Referencia copiada ✔"; }
    catch(e2){ m.textContent = "No se pudo copiar. Selecciónala y copia con Ctrl+C."; }
    ta.remove();
  }
};
function usarEnAPA(r){        // llena el generador con un resultado del buscador
  if(!r) return;
  $("aTipo").value = r.tipo || "revista"; $("aTipo").onchange();
  $("aAutor").value = (r.autores || []).slice(0, 20).join("; ");
  $("aAnio").value = r.anio || "";
  $("aTitulo").value = r.titulo || "";
  $("aSitio").value = r.revista || "";
  $("aUrl").value = r.url || "";
  $("btnRef").onclick();
  $("msgCopia").textContent = "Datos cargados desde el buscador. Verifica autores, año y nombre de la revista antes de entregar.";
  $("apa").scrollIntoView({behavior:"smooth"});
}

/* ===== 8. LISTA DE VERIFICACIÓN ===== */
$("items").innerHTML = CONFIG.checklist.map((q, i) =>
  `<label class="check"><input type="checkbox" data-i="${i}"><span>${esc(q)}</span></label>`).join("");
function actualizarLista(){
  const cs = Array.from(document.querySelectorAll("#items input"));
  const n = cs.filter(c => c.checked).length;
  $("progreso").style.width = (n / cs.length * 100) + "%";
  $("estadoLista").textContent = n === cs.length
    ? "¡Completaste los 5 puntos! Aun así, relee tu trabajo antes de entregar."
    : `${n} de ${cs.length} completados. Revisa los puntos pendientes.`;
}
document.querySelectorAll("#items input").forEach(c => c.onchange = actualizarLista);
$("btnReiniciar").onclick = () => {
  document.querySelectorAll("#items input").forEach(c => c.checked = false);
  actualizarLista();
};

/* ===== INICIO ===== */
try{ const t = localStorage.getItem("ap_tema"); if(t){ $("tema").value = t; setTema(t); } else setTema(""); }catch(e){ setTema(""); }
actualizarLista();
pintarBiblio();
pintarPortales(TEMA);
