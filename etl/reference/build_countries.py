"""Construit data/reference/countries.json à partir des pays présents dans reliefweb_raw.json.

ReliefWeb fournit déjà un lat/lon par pays (fields.country[].location) : plutôt que d'ajouter
une nouvelle source externe pour les coordonnées (utiles pour placer les Sociétés nationales
IFRC sur la carte), on les extrait de la donnée RAW déjà récupérée.

Usage:
    python etl/reference/build_countries.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SOURCE_PATH = DATA_DIR / "raw" / "reliefweb_raw.json"
OUTPUT_PATH = DATA_DIR / "reference" / "countries.json"


def main() -> int:
    if not SOURCE_PATH.exists():
        print(f"Erreur: {SOURCE_PATH} introuvable. Lancez d'abord etl/fetch_reliefweb.py.", file=sys.stderr)
        return 1

    raw = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))

    countries: dict[str, dict] = {}
    for disaster in raw["disasters"]:
        for country in disaster.get("country", []):
            iso3 = country.get("iso3")
            if not iso3 or iso3 in countries:
                continue
            countries[iso3] = {
                "iso3": iso3,
                "reliefweb_id": country["id"],
                "name": country["name"],
                "shortname": country.get("shortname", country["name"]),
                "lat": country.get("location", {}).get("lat"),
                "lon": country.get("location", {}).get("lon"),
            }

    result = sorted(countries.values(), key=lambda c: c["name"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {len(result)} pays écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
