export const STOP = new Set(
  "de la el los las un una unos unas y o u en a por para con sin sobre entre del al que se su sus es son como mas the of and in on for to".split(" ")
);

export const norm = t =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];

export const terminos = q => [...new Set(norm(q).filter(w => w.length > 2 && !STOP.has(w)))];

export const limpiarHTML = s =>
  String(s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

export const limpiarTitulo = t => limpiarHTML(t);

export const iniciales = s =>
  s.split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase() + ".").join(" ");

export function aAPA(nombre) {
  nombre = (nombre || "").trim().replace(/\.$/, "");
  if (!nombre) return "";
  if (nombre.includes(",")) {
    const p = nombre.split(",");
    return p[0].trim() + ", " + iniciales(p.slice(1).join(" "));
  }
  const p = nombre.split(/\s+/);
  if (p.length === 1) return p[0];
  const ult = p[p.length - 1];
  if (/^[A-Z]{1,3}$/.test(ult)) {
    return p.slice(0, -1).join(" ") + ", " + ult.split("").map(c => c + ".").join(" ");
  }
  return ult + ", " + iniciales(p.slice(0, -1).join(" "));
}

export function abstractDe(inv) {
  if (!inv) return "";
  const arr = [];
  Object.keys(inv).forEach(w => inv[w].forEach(p => { arr[p] = w; }));
  return arr.join(" ");
}

export async function pedir(url, ms = 9000, headers = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { "User-Agent": "AntiPlagio/2.0 (educativo)", ...headers }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}