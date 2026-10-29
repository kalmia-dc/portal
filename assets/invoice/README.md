# Invoice PDF dependencies

- pdf-lib 1.17.1: bundled Codex runtime package; MIT, see pdf-lib-LICENSE.md.
- @pdf-lib/fontkit 1.1.1: https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js ; MIT, see fontkit-LICENSE.txt and fontkit-package.json. The self-contained UMD distribution is wrapped locally as an ES module (globalThis receiver plus default export) to avoid the external pako import in the upstream ES build.
- Kalmia Invoice Serif Regular is derived from Noto Serif JP Regular: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/JP/NotoSerifJP-Regular.otf ; SIL OFL 1.1, see NotoSerifJP-LICENSE.txt. Source Git blob at retrieval: c8df42713ff38a06b34497f24ef38d8c72dbd02d. Converted from CFF outlines to TrueType outlines with fontTools 4.60.1 (Cu2QuPen, max_err=1 font unit, reverse_direction=True), preserving all 17923 glyphs, Unicode cmap and horizontal metrics. Renamed to Kalmia Invoice Serif to distinguish the modified font; copyright and license strings are retained in the font. The generated PDFs embed the complete TrueType font (subset=false); subset embedding was rejected because visual QA detected missing Japanese glyphs. Normal and long-name samples were re-rendered and verified after switching to full embedding.
- PDF rendering/printing reuses the existing local PDF.js assets in ../labor/ with their existing Apache license.

All invoice inputs and generated document bytes stay in the browser and in the administrator-selected directory. These dependencies are served by the portal; no invoice data is sent to a PDF service.
