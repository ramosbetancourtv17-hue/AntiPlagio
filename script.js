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
     inicio:"https://scielo.org/", url:q=>`https://search.scielo.org/?q=${q}`},
    {nombre:"Redalyc", desc:"Artículos de revistas científicas iberoamericanas en acceso abierto.",
     inicio:"https://www.redalyc.org/", url:q=>`https://www.redalyc.org/busquedaArticuloFiltros.oa?q=${q}`},
    {nombre:"DANE", desc:"Estadísticas oficiales de Colombia: población, economía, empleo y censos.",
     inicio:"https://www.dane.gov.co/", url:q=>`https://www.google.com/search?q=site:dane.gov.co+${q}`},
    {nombre:"Banco de la República", desc:"Informes, investigaciones y estadísticas económicas del banco central de Colombia.",
     inicio:"https://www.banrep.gov.co/", url:q=>`https://www.google.com/search?q=site:banrep.gov.co+${q}`},
    {nombre:"Dialnet", desc:"Artículos, tesis y libros en español de universidades iberoamericanas.",
     inicio:"https://dialnet.unirioja.es/", url:q=>`https://dialnet.unirioja.es/buscar/documentos?querysDismax.DOCUMENTAL_TODO=${q}`},
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
  { nombre:"Crossref", desc:"Registro oficial de DOI de artículos, libros y congresos.", activa:true, conResumen:true,
    async buscar(q, n){
      const d = await pedir(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&select=title,author,issued,container-title,DOI,URL,abstract${mail("&")}`);
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
    <a class="btn chico" href="${q ? p.url(e) : p.inicio}" target="_blank" rel="noopener">${q ? "Buscar tema aquí ↗" : "Abrir portal ↗"}</a></div>`).join("");
}
function tarjeta(r, i){
  const aut = r.autores && r.autores.length ? r.autores.slice(0, 3).join("; ") + (r.autores.length > 3 ? " y otros" : "") : "Autor no disponible";
  return `<div class="resultado"><h4>${esc(r.titulo)}</h4>
    <p><span class="fuente-tag">${esc(r.revista || "Fuente no indicada")}</span><small>${esc(aut)} · ${esc(r.anio || "s. f.")}</small></p>
    <p><a href="${esc(r.url)}" target="_blank" rel="noopener">Consultar fuente original ↗</a>
    <button class="btn ghost chico usarapa" data-i="${i}">Usar en APA</button></p></div>`;
}
async function buscarFuentes(){
  const q = $("tema").value.trim(), m = $("msgBuscar"), out = $("resultadosFuentes");
  if(!q){ m.className = "msg err"; m.textContent = "Escribe un tema o palabras clave."; return; }
  pintarPortales(q);
  RESULTADOS.length = 0; out.innerHTML = "";
  const activas = BASES.filter(b => b.activa);
  m.className = "msg"; m.textContent = `Buscando en ${activas.length} bases de datos…`;
  let total = 0, fallidas = 0;
  await Promise.all(activas.map(async b => {
    const caja = document.createElement("div");
    caja.className = "grupo";
    caja.innerHTML = `<h4>${esc(b.nombre)} <small>${esc(b.desc)}</small></h4><p class="msg">Buscando…</p>`;
    out.appendChild(caja);
    const estado = caja.querySelector(".msg");
    try{
      const rs = (await b.buscar(q, CONFIG.porFuente)).filter(r => r.titulo && r.url);
      total += rs.length;
      if(!rs.length){ estado.textContent = "Sin resultados en esta base."; return; }
      const base = RESULTADOS.length;
      rs.forEach(r => RESULTADOS.push(r));
      estado.remove();
      caja.insertAdjacentHTML("beforeend", rs.map((r, k) => tarjeta(r, base + k)).join(""));
    }catch(e){
      fallidas++;
      estado.className = "msg err";
      estado.textContent = "No disponible ahora (sin conexión, límite de uso o bloqueo del servicio). Usa los portales de arriba.";
    }
  }));
  if(fallidas === activas.length){ m.className = "msg err"; m.textContent = "No se pudo conectar con ninguna base. Revisa tu conexión a Internet o usa los portales de arriba."; }
  else m.textContent = `Listo: ${total} resultados reales de ${activas.length - fallidas} bases${fallidas ? " (" + fallidas + " no disponibles)" : ""}. Revisa siempre la fuente original.`;
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
  const frases = t.split(/[.!?]+\s+|\n+/).filter(f => f.trim().length > 3);
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
    ? hall.map(x => `<div class="hallazgo">${esc(x.f)}<br><em>${x.motivos.join(" · ")}</em><br>
        <a href="https://scholar.google.com/scholar?q=${encodeURIComponent('"' + x.f.slice(0, 120) + '"')}" target="_blank" rel="noopener">Buscar esta frase en Google Académico ↗</a></div>`).join("")
    : '<p class="msg">No se detectaron datos, fechas ni afirmaciones evidentes. Eso no significa que no necesiten cita.</p>');
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
  const frases = texto.split(/[.!?]+\s+|\n+/).map(limpiarFrag).filter(f => f.split(" ").length > largo);
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

$("btnRef").onclick = () => {
  const autor = $("aAutor").value.trim();
  const anio = $("aAnio").value.trim() || "s. f.";
  const titulo = $("aTitulo").value.trim();
  const sitio = $("aSitio").value.trim();
  const url = $("aUrl").value.trim();
  const tipo = $("aTipo").value;
  const salida = $("refSalida");
  if(!titulo){ salida.textContent = "Escribe al menos el título del documento."; refTexto = ""; return; }

  const punto = s => /[.?!]$/.test(s) ? s : s + ".";
  const autores = autor.split(";").map(x => x.trim()).filter(Boolean);
  let autorTxt = "";
  if(autores.length > 2) autorTxt = autores.slice(0, -1).join(", ") + ", & " + autores[autores.length - 1];
  else if(autores.length === 2) autorTxt = autores[0] + ", & " + autores[1];
  else if(autores.length === 1) autorTxt = autores[0];

  const tituloH = tipo === "web" ? `<i>${esc(punto(titulo))}</i>` : esc(punto(titulo));
  const sitioH = sitio ? (tipo === "web" ? esc(punto(sitio)) : `<i>${esc(punto(sitio))}</i>`) : "";
  const fecha = `(${anio}).`;
  let html, plano;
  if(autorTxt){
    html  = [esc(punto(autorTxt)), esc(fecha), tituloH, sitioH, esc(url)];
    plano = [punto(autorTxt), fecha, punto(titulo), sitio ? punto(sitio) : "", url];
  } else {            // Sin autor: el título pasa al inicio (APA 7)
    html  = [tituloH, esc(fecha), sitioH, esc(url)];
    plano = [punto(titulo), fecha, sitio ? punto(sitio) : "", url];
  }
  salida.innerHTML = html.filter(Boolean).join(" ");
  refTexto = plano.filter(Boolean).join(" ");
  $("msgCopia").textContent = "";
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
actualizarLista();
pintarPortales("");
