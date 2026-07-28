"""Construit data/clean/disasters.json : table unifiée ReliefWeb + IBTrACS (une ligne par événement).

ReliefWeb : un événement = une ligne (déjà le cas dans reliefweb_raw.json).
IBTrACS : agrégé par tempête (SID), en ne gardant que les points TRACK_TYPE == "main".

Pas de déduplication entre les deux sources : un même cyclone peut apparaître deux fois
(une fois par source), chaque ligne porte une colonne `source` pour les distinguer.

Le champ `territories_piroi_approches` est calculé par distance à vol d'oiseau entre les
points de trajectoire (IBTrACS) ou le pays touché (ReliefWeb) et le centroïde de chaque
territoire PIROI. Pour IBTrACS, c'est une approximation grossière (un centroïde de pays
n'est pas sa côte) — à affiner si besoin en CLEAN v2.

Usage:
    python etl/clean/build_disasters.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _geo import haversine_km  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "clean" / "disasters.json"
PROXIMITY_THRESHOLD_KM = 300

IBTRACS_COLUMNS = [
    "SID",
    "NAME",
    "ISO_TIME",
    "LAT",
    "LON",
    "TRACK_TYPE",
    "WMO_WIND",
    "WMO_PRES",
    "REUNION_WIND",
    "REUNION_PRES",
]


def load_hazard_lookup() -> dict[str, str]:
    hazards = json.loads((DATA_DIR / "reference" / "hazard_types.json").read_text(encoding="utf-8"))
    return {t["code"]: h["category"] for h in hazards for t in h["reliefweb_types"]}


def load_territories() -> list[dict]:
    territories = json.loads((DATA_DIR / "reference" / "territories.json").read_text(encoding="utf-8"))
    countries = {c["iso3"]: c for c in json.loads((DATA_DIR / "reference" / "countries.json").read_text(encoding="utf-8"))}
    for t in territories:
        country = countries.get(t["iso3"])
        t["lat"] = country["lat"] if country else None
        t["lon"] = country["lon"] if country else None
    return [t for t in territories if t["lat"] is not None]


def territories_near(lat: float, lon: float, territories: list[dict], threshold_km: float) -> set[str]:
    return {
        t["iso3"]
        for t in territories
        if haversine_km(lat, lon, t["lat"], t["lon"]) <= threshold_km
    }


def build_reliefweb_disasters(hazard_lookup: dict[str, str], territories_iso3: set[str]) -> list[dict]:
    raw = json.loads((DATA_DIR / "raw" / "reliefweb_raw.json").read_text(encoding="utf-8"))
    rows = []
    for d in raw["disasters"]:
        primary_type = next((t for t in d["type"] if t.get("primary")), d["type"][0])
        countries = d.get("country", [])
        iso3_list = [c["iso3"] for c in countries]
        primary_country = next((c for c in countries if c.get("primary")), countries[0] if countries else None)
        rows.append(
            {
                "id": f"reliefweb:{d['id']}",
                "source": "reliefweb",
                "name": d["name"],
                "hazard_category": hazard_lookup.get(primary_type["code"], "Autre"),
                "iso3": iso3_list,
                "primary_iso3": primary_country["iso3"] if primary_country else None,
                "date_start": d["date"]["event"],
                "date_end": d["date"]["event"],
                "description": d.get("description"),
                "url": d.get("url"),
                "wind_max_kts": None,
                "pressure_min_mb": None,
                "territories_piroi_approches": sorted(set(iso3_list) & territories_iso3),
            }
        )
    return rows


def build_ibtracs_disasters(territories: list[dict]) -> list[dict]:
    df = pd.read_csv(
        DATA_DIR / "raw" / "ibtracs_si_raw.csv",
        skiprows=[1],
        usecols=IBTRACS_COLUMNS,
        na_values=[" ", ""],
        skipinitialspace=True,
    )
    df = df[df["TRACK_TYPE"] == "main"].copy()
    df["WIND"] = df["WMO_WIND"].fillna(df["REUNION_WIND"])
    df["PRES"] = df["WMO_PRES"].fillna(df["REUNION_PRES"])

    rows = []
    for sid, group in df.groupby("SID"):
        name_mode = group["NAME"].mode()
        name = name_mode.iat[0] if not name_mode.empty else "NOT_NAMED"

        approached: set[str] = set()
        for lat, lon in zip(group["LAT"], group["LON"]):
            approached |= territories_near(lat, lon, territories, PROXIMITY_THRESHOLD_KM)

        rows.append(
            {
                "id": f"ibtracs:{sid}",
                "source": "ibtracs",
                "name": name,
                "hazard_category": "Cyclone tropical",
                "iso3": [],
                "primary_iso3": None,
                "date_start": group["ISO_TIME"].min(),
                "date_end": group["ISO_TIME"].max(),
                "description": None,
                "url": None,
                "wind_max_kts": float(group["WIND"].max()) if group["WIND"].notna().any() else None,
                "pressure_min_mb": float(group["PRES"].min()) if group["PRES"].notna().any() else None,
                "territories_piroi_approches": sorted(approached),
            }
        )
    return rows


def main() -> int:
    hazard_lookup = load_hazard_lookup()
    territories = load_territories()
    territories_iso3 = {t["iso3"] for t in territories}

    disasters = build_reliefweb_disasters(hazard_lookup, territories_iso3)
    disasters += build_ibtracs_disasters(territories)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(disasters, ensure_ascii=False, indent=2), encoding="utf-8")

    n_reliefweb = sum(1 for d in disasters if d["source"] == "reliefweb")
    n_ibtracs = sum(1 for d in disasters if d["source"] == "ibtracs")
    print(f"OK: {len(disasters)} événements ({n_reliefweb} ReliefWeb + {n_ibtracs} IBTrACS) écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
