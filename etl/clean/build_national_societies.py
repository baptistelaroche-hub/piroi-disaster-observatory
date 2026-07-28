"""Construit data/clean/national_societies.json à partir de ifrc_ns_raw.csv.

Enrichit chaque ligne avec les coordonnées du pays (countries.json) et un flag indiquant
si le pays est un territoire PIROI (territories.json) — l'export IFRC ne contient ni l'un
ni l'autre.

Usage:
    python etl/clean/build_national_societies.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "clean" / "national_societies.json"


def main() -> int:
    df = pd.read_csv(DATA_DIR / "raw" / "ifrc_ns_raw.csv")
    df["iso3"] = df["iso3"].str.lower()

    countries = {c["iso3"]: c for c in json.loads((DATA_DIR / "reference" / "countries.json").read_text(encoding="utf-8"))}
    piroi_iso3 = {t["iso3"] for t in json.loads((DATA_DIR / "reference" / "territories.json").read_text(encoding="utf-8"))}

    # to_json/loads plutôt que to_dict : convertit proprement NaN -> null et les types
    # numpy (int64/float64) en types JSON natifs.
    records = json.loads(df.to_json(orient="records"))
    for row in records:
        country = countries.get(row["iso3"])
        row["lat"] = country["lat"] if country else None
        row["lon"] = country["lon"] if country else None
        row["is_piroi_territory"] = row["iso3"] in piroi_iso3

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    n_piroi = sum(1 for r in records if r["is_piroi_territory"])
    print(f"OK: {len(records)} lignes ({n_piroi} PIROI) écrites dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
