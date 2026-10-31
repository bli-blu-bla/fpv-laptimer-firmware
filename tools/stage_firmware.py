#!/usr/bin/env python3
"""Stage the built firmware for the flash pages. GPL-3.0-or-later.

Derived from widscan58's tools/pages_firmware.py (CapnBry/widscan58).

Copies the bootloader, partition table and app of firmware/.pio/build/esp32c5
into <out>/esp32c5/ and writes <out>/manifest.json (ESP Web Tools' format
plus size and sha256 per part). <out> is web/public/firmware by default, so
this repository's page (npm run build) offers it.

    pio run -d firmware -e esp32c5
    tools/stage_firmware.py                       # -> web/public/firmware
    tools/stage_firmware.py --tar dist/           # and the release tarball

--tar also packs <out> as fpv-laptimer-firmware-<version>.tar.gz (manifest.json
and esp32c5/ at the top) plus a .sha256 next to it: the release asset the
laptimer fetches (its tools/fetch_firmware.sh) for its own page and server.

"version" is the one the firmware's INFO reports (project_version of the
build: git describe without the tag's "v"), so the pages can tell which
boards are up to date. Offsets come from flasher_args.json (the C5's
bootloader is at 0x2000).
"""
import argparse
import hashlib
import json
import shutil
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "firmware" / ".pio" / "build" / "esp32c5"
# flasher_args.json section -> file name in the PlatformIO build directory.
PARTS = {"bootloader": "bootloader.bin", "partition-table": "partitions.bin", "app": "firmware.bin"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path, nargs="?", default=ROOT / "web" / "public" / "firmware")
    ap.add_argument("--tar", type=Path, metavar="DIR", help="also write the release tarball into DIR")
    a = ap.parse_args()

    args = json.loads((BUILD / "flasher_args.json").read_text())
    desc = json.loads((BUILD / "project_description.json").read_text())
    if a.out.exists():
        shutil.rmtree(a.out)
    (a.out / "esp32c5").mkdir(parents=True)
    parts = []
    for section, name in PARTS.items():
        data = (BUILD / name).read_bytes()
        shutil.copyfile(BUILD / name, a.out / "esp32c5" / name)
        parts.append({
            "path": f"esp32c5/{name}",
            "offset": int(args[section]["offset"], 16),
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    version = desc["project_version"]
    manifest = {
        "name": "FPV Laptimer (widscan58)",
        "version": version,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "builds": [{"chipFamily": "ESP32-C5", "parts": parts}],
    }
    (a.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{version}: " + ", ".join(f"{p['path']} @ {p['offset']:#x}" for p in parts))
    print(f"-> {a.out}")

    if a.tar:
        a.tar.mkdir(parents=True, exist_ok=True)
        tarball = a.tar / f"fpv-laptimer-firmware-{version}.tar.gz"
        with tarfile.open(tarball, "w:gz") as t:
            for f in sorted(a.out.rglob("*")):
                if f.is_file():
                    info = t.gettarinfo(f, f.relative_to(a.out).as_posix())
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    with f.open("rb") as fp:
                        t.addfile(info, fp)
        digest = hashlib.sha256(tarball.read_bytes()).hexdigest()
        (a.tar / (tarball.name + ".sha256")).write_text(f"{digest}  {tarball.name}\n")
        print(f"-> {tarball} ({digest})")


if __name__ == "__main__":
    main()
