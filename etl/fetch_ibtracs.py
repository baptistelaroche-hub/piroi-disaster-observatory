"""Télécharge le fichier IBTrACS du bassin Sud Indien (RAW, non modifié) dans data/raw/.

Bassin SI = couvre l'intégralité de la zone PIROI (Madagascar, Comores, Maurice,
Seychelles, Réunion, Mayotte, Mozambique, Tanzanie). Toutes les colonnes sources
sont conservées à ce stade ; le filtrage (colonnes, types de trajectoire, période)
se fera au niveau CLEAN.

Usage:
    python etl/fetch_ibtracs.py
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

SOURCE_URL = (
    "https://www.ncei.noaa.gov/data/"
    "international-best-track-archive-for-climate-stewardship-ibtracs/"
    "v04r01/access/csv/ibtracs.SI.list.v04r01.csv"
)
REQUEST_TIMEOUT = 120

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUTPUT_PATH = RAW_DIR / "ibtracs_si_raw.csv"
META_PATH = RAW_DIR / "ibtracs_si_raw.meta.json"


def main() -> int:
    print(f"Téléchargement de {SOURCE_URL} ...")
    response = requests.get(SOURCE_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    content = response.content

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(content)

    line_count = content.count(b"\n")
    row_count = max(line_count - 2, 0)  # moins l'en-tête et la ligne d'unités
    checksum = hashlib.sha256(content).hexdigest()

    META_PATH.write_text(
        json.dumps(
            {
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "source": SOURCE_URL,
                "row_count": row_count,
                "sha256": checksum,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    size_mb = len(content) / 1_000_000
    print(f"OK: {OUTPUT_PATH} ({size_mb:.1f} Mo, {row_count} points de trajectoire)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
