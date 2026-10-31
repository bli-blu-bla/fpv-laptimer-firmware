# FPV Laptimer: Firmware

Firmware für die ESP32-C5-Boards des [FPV Laptimers](https://github.com/bli-blu-bla/fpv-laptimer):
[widscan58](https://github.com/CapnBry/widscan58) von Bryan Mayland, erweitert um die Befehle,
die der Laptimer-Server braucht (`LEVELBATCH`, `TIME?`, `NAME`).

**Im Browser aufspielen: [bli-blu-bla.github.io/fpv-laptimer-firmware](https://bli-blu-bla.github.io/fpv-laptimer-firmware/)**
(Chrome oder Edge am Computer, Board per USB). Die Seite

- spielt die neueste Firmware auf,
- zeigt, was auf einem Board läuft (Version, Chip, Stand) und ob es aktuell ist,
- setzt den **Namen** des Boards (bleibt beim Flashen; der Laptimer zeigt ihn an),
- zeigt die **Pegel** der Kanäle live, wie der Laptimer sie misst,
- hat eine **Konsole** für Befehle.

Der Laptimer bringt eine feste Firmware-Version mit und kann sie selbst aufspielen
(Boards → Firmware), auch auf Boards, die am Raspberry Pi stecken.

## Ordner

| Ordner | Inhalt |
|---|---|
| `firmware/` | widscan58 (per `git subtree` aus CapnBry/widscan58) plus unsere Änderungen ([NOTICE.md](NOTICE.md)) |
| `web/` | die Seite: JavaScript mit JSDoc, Vite, esptool-js |
| `tools/` | Bauen bereitstellen, mehrere Boards flashen, Upstream holen |

## Bauen und flashen

Braucht [PlatformIO](https://platformio.org) ab 6.2 (`pio`) und Python 3.

```sh
pio run -d firmware -e esp32c5
tools/flash_c5_many.sh --no-build        # ein Board nach dem anderen anstecken
tools/flash_c5_many.sh --no-build --all  # alle gerade angesteckten
```

`flash_c5_many.sh` ohne `--no-build` baut vorher selbst. Hängt ein Board: BOOT halten, RESET
drücken, BOOT loslassen, dann `tools/flash_c5_many.sh --no-build --once --manual`.

Die Seite lokal, mit der eben gebauten Firmware:

```sh
tools/stage_firmware.py                  # → web/public/firmware
cd web && npm install && npm run dev     # http://localhost:5173 (Web Serial geht auf localhost)
```

## Versionen und Releases

Die Version ist `git describe` ohne das „v“ des Tags: `0.1.0` auf dem Tag `v0.1.0`,
`0.1.0-3-gabc1234` drei Commits danach, mit `-dirty` bei ungespeicherten Änderungen. Das Board
meldet sie in `INFO`.

Ein Release: `git tag v0.2.0 && git push origin v0.2.0`. Die CI baut die Firmware, hängt
`fpv-laptimer-firmware-0.2.0.tar.gz` (`manifest.json` + `esp32c5/*.bin`) samt `.sha256` an das
Release und baut die Seite neu. Im Laptimer-Repo holt `tools/fetch_firmware.sh --update 0.2.0`
die neue Version und trägt sie mit Prüfsumme in `firmware.env` ein; ab dem nächsten Laptimer-
Release bringt er sie mit. Eine Version mit „-“ (`v0.2.0-rc1`) wird ein Pre-Release und kommt
nicht auf die Seite.

## Upstream

`tools/update_firmware.sh` holt den neuesten Stand von CapnBry/widscan58 per `git subtree` und
führt ihn mit unseren Änderungen zusammen.

## Lizenz

GPL-3.0-or-later, wie widscan58. Herkunft und Änderungen: [NOTICE.md](NOTICE.md).
