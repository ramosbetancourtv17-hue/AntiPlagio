# 📚 AntiPlagio — Investiga, crea y cita

Herramienta web universitaria para prevenir el plagio y ayudar a los estudiantes a hacer trabajos académicos originales. Funciona en el navegador, sin servidor, sin base de datos y sin servicios de pago.

## Funciones

- **Buscador de fuentes:** consulta 7 bases de datos abiertas (OpenAlex, Crossref, DOAJ, Europe PMC, Semantic Scholar, Open Library y Datos Abiertos Colombia) y ofrece accesos directos a 9 portales (Google Académico, SciELO, Redalyc, DANE, Banco de la República, Dialnet, LA Referencia, Datos Abiertos Colombia y CEPAL).
- **Analizador de texto:** cuenta palabras, detecta frases repetidas y señala afirmaciones que podrían necesitar cita (cifras, fechas, porcentajes, "según estudios").
- **Búsqueda de coincidencias:** compara fragmentos del texto con Wikipedia en español y con resúmenes de artículos académicos, y propone enlaces de verificación manual en Google y Google Académico.
- **Generador de referencias APA 7:** página web y artículo de revista, con botón para copiar y opción «Usar en APA» desde el buscador.
- **Guía para evitar el plagio** y **lista de verificación** con barra de progreso.

## Cómo usarlo

1. Descarga los tres archivos (`index.html`, `style.css`, `script.js`) en la misma carpeta.
2. Abre `index.html` con Chrome, Edge o Firefox. Necesitas Internet para el buscador y las coincidencias.

## Limitaciones (importante)

- **No es un detector de plagio profesional** y no calcula porcentajes de plagio.
- La búsqueda de coincidencias solo cubre Wikipedia en español y resúmenes de artículos. **No revisa libros, PDF, noticias ni trabajos de otros estudiantes**; que no aparezcan coincidencias no prueba que un texto sea original.
- Los resultados son orientativos y no reemplazan la revisión del profesor ni un servicio como Turnitin.
- Los nombres de autores se convierten automáticamente al formato «Apellido, N.»; verifica los apellidos compuestos.

## Personalización

- Colores: variables al inicio de `style.css`.
- Portales, preguntas de la lista y bases de datos: `CONFIG` y `BASES` en `script.js` (para quitar una base, `activa:false`).
- Opcional: escribe tu correo en `CONFIG.correo` para mejor servicio de OpenAlex y Crossref.

## Publicar gratis con GitHub Pages

En el repositorio: **Settings → Pages → Branch: main / (root) → Save**. En unos minutos tendrás un enlace público.
