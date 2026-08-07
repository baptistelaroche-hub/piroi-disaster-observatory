"""Ingère l'export manuel EM-DAT dans data/raw/emdat_raw.json.

Comme IFRC et les opérations PIROI, EM-DAT n'a pas d'API publique simple pour un export
personnalisé : le fichier est téléchargé manuellement depuis https://public.emdat.be et
déposé dans etl/manual-drops/emdat_custom_request.xlsx avant d'exécuter ce script.

Export déjà scopé par le PIROI Center aux 6 pays couverts par EM-DAT dans la zone
(Comores, Madagascar, Maurice, Mozambique, Seychelles, Tanzanie — La Réunion et Mayotte n'ont
pas d'entrée EM-DAT distincte, rattachées à la France) : pas de filtrage supplémentaire, toutes
les colonnes sont conservées (RAW non modifié).

Usage:
    python etl/ingest_emdat.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

SOURCE_PATH = Path(__file__).resolve().parent / "manual-drops" / "emdat_custom_request.xlsx"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "emdat_raw.json"

# Colonnes source -> clé JSON. Conserve toutes les colonnes de l'export (RAW).
COLUMN_MAP = {
    "DisNo.": "disno",
    "Historic": "historic",
    "Classification Key": "classification_key",
    "Disaster Group": "disaster_group",
    "Disaster Subgroup": "disaster_subgroup",
    "Disaster Type": "disaster_type",
    "Disaster Subtype": "disaster_subtype",
    "External IDs": "external_ids",
    "Event Name": "event_name",
    "ISO": "iso3",
    "Country": "country",
    "Subregion": "subregion",
    "Region": "region",
    "Location": "location",
    "Origin": "origin",
    "Associated Types": "associated_types",
    "OFDA/BHA Response": "ofda_bha_response",
    "Appeal": "appeal",
    "Declaration": "declaration",
    "AID Contribution ('000 US$)": "aid_contribution_000_usd",
    "Magnitude": "magnitude",
    "Magnitude Scale": "magnitude_scale",
    "Latitude": "latitude",
    "Longitude": "longitude",
    "River Basin": "river_basin",
    "Start Year": "start_year",
    "Start Month": "start_month",
    "Start Day": "start_day",
    "End Year": "end_year",
    "End Month": "end_month",
    "End Day": "end_day",
    "Total Deaths": "total_deaths",
    "No. Injured": "no_injured",
    "No. Affected": "no_affected",
    "No. Homeless": "no_homeless",
    "Total Affected": "total_affected",
    "Reconstruction Costs ('000 US$)": "reconstruction_costs_000_usd",
    "Reconstruction Costs, Adjusted ('000 US$)": "reconstruction_costs_adjusted_000_usd",
    "Insured Damage ('000 US$)": "insured_damage_000_usd",
    "Insured Damage, Adjusted ('000 US$)": "insured_damage_adjusted_000_usd",
    "Total Damage ('000 US$)": "total_damage_000_usd",
    "Total Damage, Adjusted ('000 US$)": "total_damage_adjusted_000_usd",
    "CPI": "cpi",
    "Admin Units": "admin_units",
    "GADM Admin Units": "gadm_admin_units",
    "Entry Date": "entry_date",
    "Last Update": "last_update",
}


def clean_date(year, month, day) -> str | None:
    if pd.isna(year):
        return None
    y = int(year)
    m = int(month) if pd.notna(month) else 1
    d = int(day) if pd.notna(day) else 1
    return f"{y:04d}-{m:02d}-{d:02d}"


def main() -> int:
    if not SOURCE_PATH.exists():
        print(f"Erreur: {SOURCE_PATH} introuvable.", file=sys.stderr)
        return 1

    df = pd.read_excel(SOURCE_PATH)
    missing = [c for c in COLUMN_MAP if c not in df.columns]
    if missing:
        print(f"Erreur: colonnes absentes de l'export EM-DAT: {missing}", file=sys.stderr)
        return 1

    records = json.loads(df.rename(columns=COLUMN_MAP)[list(COLUMN_MAP.values())].to_json(orient="records"))

    for rec, (_, row) in zip(records, df.iterrows()):
        rec["iso3"] = rec["iso3"].lower() if rec.get("iso3") else None
        rec["start_date"] = clean_date(row["Start Year"], row["Start Month"], row["Start Day"])
        rec["end_date"] = clean_date(row["End Year"], row["End Month"], row["End Day"])
        rec["glide_codes"] = (
            [code.replace("GLIDE:", "").strip() for code in rec["external_ids"].split("|")]
            if rec.get("external_ids")
            else []
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {len(records)} catastrophes EM-DAT écrites dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
