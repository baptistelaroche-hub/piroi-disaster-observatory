"""Ingère l'export manuel IFRC FDRS (National Society Development) dans data/raw/ifrc_ns_raw.csv.

Contrairement à ReliefWeb et IBTrACS, il n'existe pas d'URL publique stable pour ces données :
data.ifrc.org/fdrs est une application authentifiée. L'export CSV doit être téléchargé
manuellement et déposé dans etl/manual-drops/ifrc_ns_export.csv avant d'exécuter ce script.

Sur les ~1791 colonnes de l'export source, seules les colonnes d'identification (nécessaires
aux jointures) et les colonnes d'indicateurs retenues avec le PIROI Center sont conservées.

Usage:
    python etl/ingest_ifrc.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

SOURCE_PATH = Path(__file__).resolve().parent / "manual-drops" / "ifrc_ns_export.csv"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "ifrc_ns_raw.csv"

ID_COLUMNS = [
    "KPI_Year",
    "NSO_ZON_name",
    "NSO_DON_name",
    "country",
    "iso3",
    "DON_Code",
]

INDICATOR_COLUMNS = [
    "Population",
    "GDP",
    "Poverty",
    "GNIPC",
    "LifeExp",
    "ChildMortality",
    "Literacy",
    "UrbPop",
    "MaternalMortality",
    "KPI_GB_age",
    "KPI_GB_sex",
    "KPI_GB_Tot",
    "KPI_noLocalUnits",
    "KPI_noBranches",
    "KPI_PeopleVol_Tot_M",
    "KPI_PeopleVol_Tot_F",
    "KPI_PeopleVol_Tot_OtherSex",
    "KPI_PeopleVol_Tot_UnknownSex",
    "KPI_PeopleVol_Tot",
    "KPI_PStaff_Tot_M",
    "KPI_PStaff_Tot_F",
    "KPI_PStaff_Tot_OtherSex",
    "KPI_PStaff_Tot_UnknownSex",
    "KPI_PStaff_Tot",
    "KPI_IncomeLC_CHF",
    "KPI_IncomeLC",
    "KPI_expenditureLC_CHF",
    "KPI_expenditureLC",
    "ind_CHF",
    "ind",
    "corp_CHF",
    "corp",
    "found_CHF",
    "found",
    "un_CHF",
    "un",
    "pooled_f_CHF",
    "pooled_f",
    "ngo_CHF",
    "ngo",
    "si_CHF",
    "si",
    "iga_CHF",
    "iga",
    "KPI_incomeFromNSsLC_CHF",
    "KPI_incomeFromNSsLC",
    "ifrc_CHF",
    "ifrc",
    "icrc_CHF",
    "icrc",
    "other_CHF",
    "other",
    "KPI_TrainFA_Tot",
    "KPI_TrainFA_Tot_F",
    "KPI_TrainFA_Tot_UnknownSex",
    "KPI_TrainFA_Tot_M",
    "KPI_ReachDRER_D_Tot",
    "KPI_ReachDRR_D_Tot",
    "KPI_ReachDRR_CPD",
    "KPI_ReachWASH_CPD",
    "KPI_ReachRCRCEd_CPD_Public",
    "KPI_ReachRCRCEd_D_Public",
    "KPI_ReachRCRCEd_D_IP",
    "KPI_ClimateHeat_I_Public",
    "KPI_Climate_CPD_Public",
]


def main() -> int:
    if not SOURCE_PATH.exists():
        print(
            f"Erreur: {SOURCE_PATH} introuvable. "
            "Téléchargez l'export depuis data.ifrc.org/fdrs et déposez-le à cet emplacement.",
            file=sys.stderr,
        )
        return 1

    df = pd.read_csv(SOURCE_PATH, low_memory=False)

    columns = ID_COLUMNS + INDICATOR_COLUMNS
    missing = [c for c in columns if c not in df.columns]
    if missing:
        print(f"Erreur: colonnes absentes de l'export source: {missing}", file=sys.stderr)
        return 1

    df = df[columns]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)

    print(f"OK: {len(df)} lignes, {len(columns)} colonnes écrites dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
