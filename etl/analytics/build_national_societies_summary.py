"""Construit data/analytics/national_societies_summary.json : un résumé par territoire PIROI.

Pour chaque indicateur retenu, on garde la dernière valeur connue ET l'année à laquelle elle
a été rapportée : ces champs ne sont jamais tous renseignés la même année (GDP peut dater de
2022, le taux de pauvreté de 2012 pour le même pays), donc une "dernière année" unique
masquerait la plupart des données disponibles.

Trois indicateurs "reach" (KPI_ReachRCRCEd_D_Public, KPI_ReachRCRCEd_D_IP,
KPI_ClimateHeat_I_Public) sont exclus : vides pour les 6 Sociétés nationales PIROI sur
toute la période disponible.

Le lien avec les catastrophes vient de disasters.json (CLEAN), par correspondance sur `iso3`
(ReliefWeb) ou `territories_piroi_approches` (IBTrACS).

Usage:
    python etl/analytics/build_national_societies_summary.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "analytics" / "national_societies_summary.json"

CAPACITY_FIELDS = {
    "branches": "KPI_noBranches",
    "volunteers": "KPI_PeopleVol_Tot",
    "paid_staff": "KPI_PStaff_Tot",
}

REACH_FIELDS = {
    "drr": "KPI_ReachDRR_D_Tot",
    "wash": "KPI_ReachWASH_CPD",
    "first_aid_training": "KPI_TrainFA_Tot",
    "climate": "KPI_Climate_CPD_Public",
}

CONTEXT_FIELDS = {
    "population": "Population",
    "gdp": "GDP",
    "gni_per_capita": "GNIPC",
    "life_expectancy": "LifeExp",
    "literacy_rate": "Literacy",
    "urban_population_pct": "UrbPop",
    "poverty_rate": "Poverty",
    "child_mortality_rate": "ChildMortality",
    "maternal_mortality_rate": "MaternalMortality",
}


def latest_value(rows: list[dict], field: str) -> dict:
    known = [(r["KPI_Year"], r[field]) for r in rows if r.get(field) is not None]
    if not known:
        return {"value": None, "year": None}
    year, value = max(known, key=lambda pair: pair[0])
    return {"value": value, "year": year}


def disaster_summary(disasters: list[dict], iso3: str) -> dict:
    linked = [
        d
        for d in disasters
        if iso3 in d["iso3"] or iso3 in d["territories_piroi_approches"]
    ]
    cyclones = [d for d in linked if d["source"] == "ibtracs"]
    dates = [d["date_start"] for d in linked if d["date_start"]]
    return {
        "total_events": len(linked),
        "total_cyclones": len(cyclones),
        "most_recent_event_date": max(dates) if dates else None,
    }


def main() -> int:
    ns_rows = json.loads((DATA_DIR / "clean" / "national_societies.json").read_text(encoding="utf-8"))
    disasters = json.loads((DATA_DIR / "clean" / "disasters.json").read_text(encoding="utf-8"))
    territories = json.loads((DATA_DIR / "reference" / "territories.json").read_text(encoding="utf-8"))

    summaries = []
    for territory in territories:
        iso3 = territory["iso3"]
        rows = [r for r in ns_rows if r["iso3"] == iso3]
        if not rows:
            continue  # pas de Société nationale distincte (ex: Réunion, Mayotte)

        ns_name = rows[0]["NSO_DON_name"]
        summaries.append(
            {
                "iso3": iso3,
                "territory_name": territory["name"],
                "piroi_region": territory["piroi_region"],
                "national_society_name": ns_name,
                "capacity": {key: latest_value(rows, field) for key, field in CAPACITY_FIELDS.items()},
                "reach": {key: latest_value(rows, field) for key, field in REACH_FIELDS.items()},
                "context": {key: latest_value(rows, field) for key, field in CONTEXT_FIELDS.items()},
                "disasters": disaster_summary(disasters, iso3),
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {"generated_at": datetime.now(timezone.utc).isoformat(), "territories": summaries},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"OK: {len(summaries)} territoires écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
