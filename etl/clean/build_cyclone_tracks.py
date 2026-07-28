"""Construit data/clean/cyclone_tracks.json : géométrie des trajectoires IBTrACS pour la carte.

Un événement `DISASTERS` de source "ibtracs" (une ligne par tempête) ne porte pas les points
de trajectoire individuels. Ce fichier les fournit séparément, groupés par SID, pour tracer
les lignes de trajectoire sur la carte — ce n'est pas une table analytique en soi, juste la
géométrie derrière les entrées "Cyclone tropical" de `disasters.json`.

Usage:
    python etl/clean/build_cyclone_tracks.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "clean" / "cyclone_tracks.json"

COLUMNS = ["SID", "ISO_TIME", "LAT", "LON", "TRACK_TYPE", "WMO_WIND", "WMO_PRES", "REUNION_WIND", "REUNION_PRES"]


def main() -> int:
    df = pd.read_csv(
        DATA_DIR / "raw" / "ibtracs_si_raw.csv",
        skiprows=[1],
        usecols=COLUMNS,
        na_values=[" ", ""],
        skipinitialspace=True,
    )
    df = df[df["TRACK_TYPE"] == "main"].copy()
    df["WIND"] = df["WMO_WIND"].fillna(df["REUNION_WIND"])
    df["PRES"] = df["WMO_PRES"].fillna(df["REUNION_PRES"])
    df = df.sort_values(["SID", "ISO_TIME"])

    points_by_sid = json.loads(
        df[["SID", "ISO_TIME", "LAT", "LON", "WIND", "PRES"]].to_json(orient="records")
    )

    tracks: dict[str, list[dict]] = {}
    for point in points_by_sid:
        sid = point.pop("SID")
        tracks.setdefault(f"ibtracs:{sid}", []).append(
            {
                "time": point["ISO_TIME"],
                "lat": point["LAT"],
                "lon": point["LON"],
                "wind_kts": point["WIND"],
                "pressure_mb": point["PRES"],
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(tracks, ensure_ascii=False, indent=2), encoding="utf-8")

    n_points = sum(len(v) for v in tracks.values())
    print(f"OK: {len(tracks)} tempêtes, {n_points} points écrits dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
