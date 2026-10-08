# 📚 AntiPlagio — Investiga, crea y cita (v2)

Herramienta web universitaria para prevenir el plagio. Frontend estático + funciones serverless en Vercel. Sin base de datos, sin servicios de pago.

## Estructura

```
antiplagio/
├── api/               Funciones serverless (proxy de APIs académicas)
│   ├── _lib.js        Utilidades compartidas (no expuesto como endpoint)
│   └── buscar.js      Orquesta las 7 bases en paralelo
├── public/            Sitio estático
│   ├── index.html
│   ├── style.css
│   └── script.js
├── package.json
├── vercel.json
└── README.md
```

## Funciones

- **Buscador de fuentes:** 7 bases (OpenAlex, Crossref, DOAJ, Europe PMC, Semantic Scholar, Open Library, Datos Abiertos Colombia) + 9 portales académicos. Dedupe y orden por pertinencia hecho en el backend.
- **Analizador:** palabras, frases repetidas, afirmaciones a citar, cruce de citas (Autor, año) con tu lista.
- **Cotejo de fuentes:** busca hasta 8 frases informativas en Wikipedia y bases académicas, y compara las coincidencias con los resúmenes disponibles para localizar secuencias literales y solapamientos de términos. El cotejo corre en el navegador; solo se envían a los servicios de búsqueda las frases seleccionadas, no el texto completo.
- **Indicadores de estilo:** muestra métricas descriptivas y repeticiones locales. No atribuye autoría ni determina si un texto fue escrito por IA.
- **Generador APA 7:** usa `citation-js` si está disponible; si falla, usa un formateador propio de respaldo.
- **Guía + checklist** con barra de progreso.
- **Analíticas:** Vercel Web Analytics (activable con un clic en el dashboard).

## Despliegue en Vercel

1. Sube el repo a GitHub.
2. Importa el repo en Vercel.
3. **No requiere build ni framework.** Vercel detecta `/public` como sitio estático y `/api` como funciones.
4. (Opcional) En **Settings → Environment Variables**, agrega `CONTACT_EMAIL` con tu correo para mejorar el servicio de OpenAlex y Crossref.
5. En **Settings → Analytics** activa Web Analytics si quieres métricas de visitas.

## Desarrollo local

```bash
npm i -g vercel
vercel dev
```

Abre `http://localhost:3000`. La carpeta `/api` se sirve automáticamente.

## Variables de entorno

| Variable | Uso |
|---|---|
| `CONTACT_EMAIL` | Opcional. Tu correo para OpenAlex/Crossref (mejora el rate limit). |

## Limitaciones

- No es un detector profesional de plagio. **No calcula un porcentaje global de plagio.**
- Solo compara con resúmenes devueltos por las bases consultadas y fragmentos de Wikipedia; **no revisa el texto completo de artículos, libros, PDF, noticias ni trabajos de otros estudiantes**.
- El solapamiento temático o léxico no demuestra que una idea se haya tomado de una fuente. Abre el artículo y compara manualmente el pasaje, la fecha y las citas antes de sacar conclusiones.
- No existe aquí un detector de autoría de IA: las métricas de estilo no prueban quién escribió un texto.
- Los datos de "Mi lista" viven en `localStorage` del navegador.
- Los nombres de autores se convierten automáticamente a "Apellido, N."; verifica apellidos compuestos.

## Personalización

- Colores: variables al inicio de `style.css`.
- Portales y checklist: `CONFIG` en `script.js`.
- Bases de datos: array `BASES` en `api/buscar.js` (para desactivar una, elimínala del array).