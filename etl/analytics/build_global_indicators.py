"""Construit data/analytics/global_indicators.json : indicateurs globaux (vue par défaut).

Petits agrégats fixes affichés en en-tête du dashboard, avant application de filtres.

Usage:
    python etl/analytics/build_global_indicators.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "analytics" / "global_indicators.json"


def main() -> int:
    disasters = json.loads((DATA_DIR / "clean" / "disasters.json").read_text(encoding="utf-8"))

    reliefweb = [d for d in disasters if d["source"] == "reliefweb"]
    ibtracs = [d for d in disasters if d["source"] == "ibtracs"]
    all_starts = [d["date_start"] for d in disasters if d["date_start"]]

    countries_touched = {iso3 for d in reliefweb for iso3 in d["iso3"]}
    piroi_touched = {d["id"] for d in disasters if d["territories_piroi_approches"]}

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_disasters_reliefweb": len(reliefweb),
        "total_cyclones_ibtracs": len(ibtracs),
        "total_events": len(disasters),
        "total_events_piroi": len(piroi_touched),
        "countries_covered_reliefweb": len(countries_touched),
        "period_start": min(all_starts) if all_starts else None,
        "period_end": max(all_starts) if all_starts else None,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: indicateurs globaux écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
