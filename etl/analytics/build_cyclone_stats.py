"""Construit data/analytics/cyclone_stats.json : fréquence annuelle et saisonnalité IBTrACS.

Calculé une fois ici plutôt qu'en JavaScript à chaque chargement du dashboard, car ça porte
sur 178 ans d'historique. Contrairement aux graphiques filtrables (année, territoire...), la
saisonnalité et la fréquence annuelle changent rarement de forme d'une consultation à l'autre.

"Année" = année civile du début de la tempête (date_start), pas la convention de saison
IBTrACS (qui regroupe nov-avr à cheval sur deux années civiles) — plus simple, à garder en tête
pour l'interprétation des tempêtes de fin/début d'année.

Usage:
    python etl/analytics/build_cyclone_stats.py
"""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "analytics" / "cyclone_stats.json"


def main() -> int:
    disasters = json.loads((DATA_DIR / "clean" / "disasters.json").read_text(encoding="utf-8"))
    cyclones = [d for d in disasters if d["source"] == "ibtracs"]

    by_year: dict[int, list[dict]] = defaultdict(list)
    by_month: dict[int, list[dict]] = defaultdict(list)

    for c in cyclones:
        start = datetime.fromisoformat(c["date_start"])
        by_year[start.year].append(c)
        by_month[start.month].append(c)

    def summarize(group: list[dict]) -> dict:
        winds = [c["wind_max_kts"] for c in group if c["wind_max_kts"] is not None]
        return {
            "count": len(group),
            "count_piroi_approached": sum(1 for c in group if c["territories_piroi_approches"]),
            "avg_wind_max_kts": round(statistics.mean(winds), 1) if winds else None,
            "max_wind_kts": max(winds) if winds else None,
        }

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Année = année civile de début de tempête. Statistiques de vent basées uniquement "
        "sur les tempêtes avec données WMO/REUNION disponibles (couverture quasi nulle avant 1970).",
        "by_year": [
            {"year": year, **summarize(group)} for year, group in sorted(by_year.items())
        ],
        "by_month": [
            {"month": month, **summarize(by_month.get(month, []))} for month in range(1, 13)
        ],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {len(result['by_year'])} années, 12 mois écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
