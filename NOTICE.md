# Herkunft und Änderungen

Diese Firmware steht unter der **GPL-3.0-or-later** (Text in [`LICENSE`](LICENSE)).

## widscan58

Der Ordner `firmware/` ist **[widscan58](https://github.com/CapnBry/widscan58)** von
**Bryan Mayland (CapnBry)**, GPL-3.0-or-later. Sie macht aus dem Funkteil des ESP32 einen
Empfänger, der die FPV-Kanäle reihum misst.

- Übernommen per `git subtree` aus dem Ordner `firmware/` von widscan58, zuerst auf dem Stand
  von Commit `21ad729` (2026-10-22), bis 2026-10-31 im Repo
  [fpv-laptimer](https://github.com/bli-blu-bla/fpv-laptimer), seitdem hier (mit derselben
  Geschichte). `tools/update_firmware.sh` holt neuere Stände.
- Für den FPV Laptimer geändert (jeweils im Kopf der Datei vermerkt):

  | Datum | Änderung | Dateien |
  |---|---|---|
  | 2026-10-22 | Befehle `LEVELBATCH` (Pegel aller Kanäle als ein Frame, Typ 7) und `TIME?` (Uhrabgleich mehrerer Boards) | `src/proto/commands.c`, `src/proto/frames.h`, `src/scan/scanner.c`, `src/scan/scanner.h` |
  | 2026-10-26 | Befehle `NAME`, `NAME?` (Name des Boards im NVS) | `src/proto/commands.c` |
  | 2026-10-31 | Version ohne das „v“ des Tags (`v0.1.0` → `0.1.0`) | `CMakeLists.txt`, `version_check.py` |
  | 2026-11-02 | Befehl `TEMP` (auch `TEMP?`): Temperatur des Chips | `src/proto/commands.c`, `src/CMakeLists.txt` |

- Abgeleitet aus widscan58: `web/src/flasher.js` (aus `web/src/serial/flasher.ts`),
  `web/src/link.js` (Leseschleife aus `web/src/serial/device.ts`), `tools/stage_firmware.py`
  (aus `tools/pages_firmware.py`).

## C5VRX und esp-sdr

widscan58 wiederum gäbe es nicht ohne **[C5VRX](https://github.com/Twotoz/C5VRX)** und die davon
abgeleiteten **[esp-sdr](https://github.com/ESPARGOS/esp-sdr)**-Projekte (GPL-3.0-or-later). Sie
haben den versteckten Debug-Pfad gefunden, über den ein ESP32 rohe I/Q-Werte aus seinem eigenen
Funkteil liest. Die davon abgeleiteten Dateien in `firmware/src/radio/` und `firmware/src/scan/`
sagen das in ihren Köpfen.

## Quellcode

Die Releases enthalten die Firmware als fertige Binärdateien. Den vollständigen Quellcode dazu,
für jede Version unter ihrem Tag, gibt es in diesem Repo:
<https://github.com/bli-blu-bla/fpv-laptimer-firmware>; den der unveränderten Firmware unter
<https://github.com/CapnBry/widscan58>.

## Weitere Bibliotheken

Die Seite nutzt esptool-js, spark-md5 und die Schrift Inter (npm) unter ihren eigenen, freien
Lizenzen (`web/package-lock.json`); die Firmware ESP-IDF und deren Komponenten
(`firmware/dependencies.lock.*`).
