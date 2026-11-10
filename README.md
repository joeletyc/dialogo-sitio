# Diálogo: sitio web

Sitio de noticias de **Diálogo** (Apatzingán, Michoacán) para **dialogomx.com**. Se actualiza solo cada 30 minutos con lo que se publica en la página de Facebook.

Setup instructions: **[SETUP.md](SETUP.md)**.

- `config.json`: textos, contacto, publicidad y opciones
- `scripts/fetch-facebook.mjs`: lee las publicaciones de Facebook y descarga las fotos
- `scripts/build.mjs`: genera el sitio en `dist/`
- `assets/`: estilos, tipografías, íconos
- `.github/workflows/actualizar-sitio.yml`: la automatización

Tipografías: Archivo y Source Serif 4, licencia SIL Open Font License 1.1.
