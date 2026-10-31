# FPV Laptimer Firmware: Entwicklernotizen

Firmware der ESP32-C5-Boards des FPV Laptimers (Server, Seite, Doku:
[`bli-blu-bla/fpv-laptimer`](https://github.com/bli-blu-bla/fpv-laptimer), lokal meist
`../laptimer`) und die Flash-Seite auf GitHub Pages. Bis 2026-10-31 lag die Firmware dort unter
`firmware/`; herausgelöst, damit nicht jeder Server-Commit eine neue Firmware-Version ergibt.

Antworten und Doku auf Deutsch. Der Nutzer kann Python, lernt Rust und schreibt kein
TypeScript: die Seite in JavaScript mit JSDoc (`// @ts-check`, `npm run check`).

## Aufbau

| Teil | Inhalt |
|---|---|
| `firmware/` | widscan58 per `git subtree` von CapnBry/widscan58 (`tools/update_firmware.sh`), plus `LEVELBATCH`/`TIME?`/`NAME` und die Version ohne „v“. Jede Änderung an Upstream-Dateien im Kopf der Datei und in `NOTICE.md` vermerken (GPL §5a). Die vollständige Firmware-Doku (Befehle, Messwerte, Flash-Probleme, RotorHazard-Modus) steht upstream in `CLAUDE.md` und `PLAN.md` |
| `web/` | Seite ohne Framework (`index.html` mit den Elementen, `src/main.js` füllt sie): Verbinden über Web Serial (`link.js`, hält einen Writer, damit zwei Befehle nicht um die Sperre rennen), `INFO`/`NAME?` lesen, Version vergleichen (`version.js`), `NAME` setzen (≤ 32 Byte, kein `\|`, keine Steuerzeichen), aufspielen (`flasher.js`, dieselbe Datei wie im Laptimer, nur mit `import.meta.env.BASE_URL`, weil Pages unter `/fpv-laptimer-firmware/` liegt) und danach wieder verbinden, Pegel live (`PROTOCOL MONITOR`, `CHANNELS`, `METRICS RSSI`, `LEVELBATCH 10`; Frames in `frames.js` wie `server/src/esp/frame.rs`; „Anhalten“ = `PROTOCOL RH`), Konsole. Tests `npm test` (node:test) |
| `tools/` | `stage_firmware.py [--tar DIR]` (Build → `web/public/firmware` + Release-Tarball), `flash_c5_many.sh`, `update_firmware.sh` |
| `.github/workflows/` | `ci.yml` (Build, `pio test -e native`, Seite), `release.yml` (Tag `v*` → Release mit Tarball + `.sha256`, dann `pages.yml`), `pages.yml` (Seite mit der Firmware des neuesten Releases; auch bei Push auf `main` unter `web/`) |

## Versionen

`PROJECT_VER` = `git describe --tags --always --dirty` ohne führendes „v“ (`CMakeLists.txt`,
`version_check.py` erzwingt das Neukonfigurieren, wenn es sich ändert). `INFO` meldet
`widscan58|<chip>|<proto>|<version>|<commit-datum>|<phy>`. Vergleich (`web/src/version.js`, im
Laptimer `frontend/src/firmwareVersion.js`, gleiche Regeln): Zahlen, dann Release > `-rc`,
dann Commits nach dem Tag, dann `-dirty`; reiner Hash = nicht vergleichbar („andere Version“).
Boards mit Firmware aus dem Laptimer-Repo melden dessen Version (`v0.0.12-…`) und gelten
damit als veraltet gegenüber `0.1.0`.

Der Laptimer pinnt Version und sha256 des Tarballs in `firmware.env` (`tools/fetch_firmware.sh
--update <ver>`); `build_release.sh` lädt genau diese. Release-Builds sind nicht
bit-gleich reproduzierbar (Zeitstempel im App-Header), daher kommt die Prüfsumme vom Release.

## Lokal bauen

PlatformIO ab 6.2 (die Plattform `pioarduino 55.03.312-1` verlangt das; 6.1.18 entfernt sie
mit einer Fehlermeldung). Firmware ~1:20 min frisch auf dem Linux-PC.

```sh
pio run -d firmware -e esp32c5 && tools/stage_firmware.py
cd web && npm run dev
```

Getestet 2026-10-31: Build, `pio test -e native` (17 Tests), Seite in headless Chromium gegen
ein nachgebautes Board (Verbinden, INFO, Name, Pegelgraph, Trennen); Flashen über die Seite
noch nicht mit einem echten Board.
