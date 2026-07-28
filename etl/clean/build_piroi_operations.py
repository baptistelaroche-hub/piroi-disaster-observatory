"""Construit data/clean/piroi_operations.json à partir de l'export manuel des opérations
d'urgence PIROI, et enrichit data/clean/disasters.json avec un lien vers ces opérations.

Le fichier source (etl/manual-drops/piroi_operations_export.csv) est un export manuel du
Sheet de capitalisation PIROI — pas d'API, pas de cron, mise à jour manuelle comme IFRC.

Nettoyage appliqué :
- Lignes entièrement vides supprimées.
- Pays hors zone PIROI exclus (Zimbabwe, Haïti, RDC, Caraïbes, "OI" régional, etc.) — décision
  PIROI Center, cf. échange du 28/07/2026.
- "Année" très hétérogène ("mars-00", "Fev-21", "avril 2022", "Décembre 2021"...) parsée en
  année (+ mois quand disponible) — jamais de jour, cette précision n'existe pas dans la source.
- Quantités distribuées : "/" et "_" (valeurs "non applicable" dans le Sheet) -> null, espaces
  normaux et insécables retirés des milliers, virgule décimale (Tonnes/Volume) -> point.

Rattachement aux catastrophes (disasters.json) :
- Tier 1 "cyclone_name" : le nom de l'opération (colonne "intitulé") est recherché dans le nom
  des catastrophes du même territoire, à ±1 an — assez fiable car les noms de cyclones sont des
  identifiants relativement uniques dans une fenêtre de quelques années.
- Tier 2 "country_year" (repli, seulement si aucun match Tier 1) : toute catastrophe du même
  territoire et de la même année, catégorie d'aléa cohérente avec le "Type de catastrophe" de
  l'opération. Moins précis, à traiter comme une liste de candidats plutôt qu'un lien certain.

disasters.json est enrichi de `piroi_response` (bool) et `piroi_operation_ids` (liste) —
uniquement à partir des liens Tier 1, pour ne pas propager l'incertitude du Tier 2 dans la
table catastrophes elle-même (le Tier 2 reste consultable depuis piroi_operations.json).

Usage:
    python etl/clean/build_piroi_operations.py
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SOURCE_PATH = Path(__file__).resolve().parent.parent / "manual-drops" / "piroi_operations_export.csv"
OPERATIONS_OUTPUT = DATA_DIR / "clean" / "piroi_operations.json"
DISASTERS_PATH = DATA_DIR / "clean" / "disasters.json"

COUNTRY_MAP = {
    "mozambique": "moz",
    "reunion": "reu",
    "comores": "com",
    "madagascar": "mdg",
    "tanzanie": "tza",
    "seychelles": "syc",
    "maurice": "mus",
    "maurice -rodrigues": "mus",
    "mayotte": "myt",
}

DISASTER_TYPE_MAP = {
    "cyclone": "Cyclone tropical",
    "tempete tropical": "Cyclone/tempête",
    "tempete tropicale": "Cyclone/tempête",
    "forte tempete tropicale": "Cyclone/tempête",
    "inondation": "Inondation",
    "inondations": "Inondation",
    "secheresse": "Sécheresse",
    "secheresse / famine": "Sécheresse",
    "seisme": "Séisme",
    "tsunami": "Tsunami",
    "volcan": "Volcan",
    "eruption": "Volcan",
    "epidemie": "Crise sanitaire",
    "incendie": "Incendie",
    "crash aerien": "Autre",
}

ACTIVITY_COLUMNS = [
    "Alerte et actions anticipées",
    "Evaluations",
    "Shelter",
    "WatSan",
    "Santé",
    "Soutien Psy ",
    "Télécoms",
    "PPN",
    "CASH",
    "Autres ",
]

ITEM_COLUMNS = [
    "bâches",
    "kits abris",
    "Tentes",
    "kits cuisine",
    "kits hygiène",
    "kits nettoyage",
    "couvertures",
    "moustiquaires",
    "tapis de sol",
    "lits picots",
    "jerrycans",
    "seaux",
    "lampes solaire",
    "UTE",
    "Kit 2 / Wash",
    "EPI",
    "DLM",
    "Borne CO2",
]

MONTHS = {
    "janv": 1, "janvier": 1,
    "fev": 2, "fevr": 2, "fevrier": 2,
    "mars": 3,
    "avr": 4, "avril": 4,
    "mai": 5,
    "juin": 6,
    "juil": 7, "juillet": 7,
    "aout": 8,
    "sept": 9, "septembre": 9,
    "oct": 10, "octobre": 10,
    "nov": 11, "novembre": 11,
    "dec": 12, "decembre": 12,
}

NAME_MATCH_STOPWORDS = {
    "comore", "comores", "madagascar", "mozambique", "tanzanie", "tanzania", "reunion",
    "maurice", "seychelles", "mayotte", "region", "regions", "ile", "sud", "nord", "ouest",
    "est", "grande", "grand", "tempete", "tempetes", "tropicale", "tropical", "cyclone",
    "cyclones", "inondation", "inondations", "epidemie", "epidemies", "et", "des", "les",
    "de", "du", "la", "le",
}
WORD_RE = re.compile(r"[a-z]+")

NULL_TOKENS = {"/", "_", "", "-"}
NUMERIC_JUNK_RE = re.compile(r"[\s  €]")


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def clean_number(raw) -> float | None:
    if pd.isna(raw):
        return None
    text = str(raw).strip()
    if text in NULL_TOKENS:
        return None
    text = NUMERIC_JUNK_RE.sub("", text).replace(",", ".")
    if not text or text in NULL_TOKENS:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def parse_year_month(raw) -> tuple[int | None, str | None]:
    if pd.isna(raw):
        return None, None
    text = strip_accents(str(raw).strip().lower()).replace(".", "")

    if re.fullmatch(r"\d{4}", text):
        return int(text), None

    match = re.fullmatch(r"([a-z]+)[\s-](\d{2,4})", text)
    if not match:
        return None, None
    month_token, year_token = match.groups()
    month = MONTHS.get(month_token)
    if month is None:
        return None, None
    year = int(year_token) if len(year_token) == 4 else 2000 + int(year_token)
    return year, f"{year:04d}-{month:02d}"


def clean_country(raw) -> str | None:
    if pd.isna(raw):
        return None
    key = strip_accents(str(raw).strip().lower())
    return COUNTRY_MAP.get(key)


def clean_hazard_category(raw) -> str:
    if pd.isna(raw):
        return "Autre"
    key = strip_accents(str(raw).strip().lower())
    return DISASTER_TYPE_MAP.get(key, "Autre")


def find_linked_disasters(op: dict, disasters: list[dict]) -> list[dict]:
    iso3 = op["iso3"]
    year = op["year"]
    if year is None:
        return []

    def touches_territory(d: dict) -> bool:
        # Les catastrophes à portée "World" (primary_iso3 'wld', ex: pandémies mondiales)
        # listent souvent des dizaines de pays dans territories_piroi_approches sans que ce
        # soit un événement propre au pays — exclues du rattachement pour éviter les faux
        # positifs (ex: chikungunya Madagascar 2010 ne doit pas matcher le H1N1 mondial 2009).
        if d.get("primary_iso3") == "wld":
            return False
        return iso3 == d.get("primary_iso3") or iso3 in d.get("territories_piroi_approches", [])

    def year_of(d: dict) -> int | None:
        return int(d["date_start"][:4]) if d.get("date_start") else None

    candidates = [d for d in disasters if touches_territory(d) and year_of(d) is not None and abs(year_of(d) - year) <= 1]

    # Exclut aussi les fragments de noms de pays (ex: "mada" dans "Prison Mada" est une
    # abréviation de Madagascar, pas le nom d'un événement — matcherait à tort n'importe
    # quelle catastrophe malgache par simple inclusion de sous-chaîne).
    territory_names = {strip_accents(n.lower()) for n in COUNTRY_MAP}
    title_words = {
        w
        for w in WORD_RE.findall(strip_accents((op["title"] or "").lower()))
        if len(w) >= 4 and not any(w in tn or tn in w for tn in territory_names)
    } - NAME_MATCH_STOPWORDS
    if title_words:
        name_matches = []
        for d in candidates:
            dname = strip_accents(d["name"].lower())
            if any(word in dname for word in title_words):
                name_matches.append({"id": d["id"], "source": d["source"], "name": d["name"], "match_type": "cyclone_name"})
        if name_matches:
            return name_matches

    same_category = [d for d in candidates if d["hazard_category"] == op["hazard_category"]]
    return [
        {"id": d["id"], "source": d["source"], "name": d["name"], "match_type": "country_year"}
        for d in same_category
    ]


def build_operations(df: pd.DataFrame) -> list[dict]:
    operations = []
    seen_ids: set[str] = set()
    for _, row in df.iterrows():
        iso3 = clean_country(row["Pays"])
        if iso3 is None:
            continue  # ligne vide ou hors zone PIROI

        year, year_month = parse_year_month(row["Année "])
        activities = []
        other_detail = None
        for col in ACTIVITY_COLUMNS:
            value = row[col]
            if pd.isna(value):
                continue
            text_value = str(value).strip()
            if text_value in {"0", "0.0"}:
                continue
            activities.append(col.strip())
            if col == "Autres " and text_value not in {"1", "1.0"}:
                other_detail = text_value

        op_number = row["Numéro d'opération"]
        op_id = f"piroi_op:{int(op_number)}" if pd.notna(op_number) else f"piroi_op:{len(operations) + 1}"
        if op_id in seen_ids:
            # Numéro d'opération dupliqué dans la source (ex: deux catastrophes distinctes
            # enregistrées sous le même numéro) — suffixe pour garder des ids uniques.
            suffix = 2
            while f"{op_id}-{suffix}" in seen_ids:
                suffix += 1
            op_id = f"{op_id}-{suffix}"
        seen_ids.add(op_id)
        operations.append(
            {
                "id": op_id,
                "iso3": iso3,
                "year": year,
                "year_month": year_month,
                "disaster_type_raw": row["Type de catastrophe"].strip() if pd.notna(row["Type de catastrophe"]) else None,
                "hazard_category": clean_hazard_category(row["Type de catastrophe"]),
                "title": row["intitulé"].strip() if pd.notna(row["intitulé"]) else None,
                "activities": activities,
                "activities_other_detail": other_detail,
                "items_distributed": {col: clean_number(row[col]) for col in ITEM_COLUMNS},
                "tonnes": clean_number(row["Tonnes (t)"]),
                "volume_m3": clean_number(row["Volume (m3)"]),
                "beneficiaries": clean_number(row["Nombre bénéficiaires (en personnes)"]),
                "budget_total": clean_number(row["Budget total"]),
                "donors": row["Bailleurs (et partenaires)"].strip() if pd.notna(row["Bailleurs (et partenaires)"]) else None,
                "details": row["détail "].strip() if pd.notna(row["détail "]) else None,
                "comments": row["Commentaires "].strip() if pd.notna(row["Commentaires "]) else None,
            }
        )
    return operations


def main() -> int:
    if not SOURCE_PATH.exists():
        print(f"Erreur: {SOURCE_PATH} introuvable.")
        return 1

    df = pd.read_csv(SOURCE_PATH)
    operations = build_operations(df)

    disasters = json.loads(DISASTERS_PATH.read_text(encoding="utf-8"))
    disasters_by_id = {d["id"]: d for d in disasters}

    tier1_count = 0
    tier2_count = 0
    for op in operations:
        linked = find_linked_disasters(op, disasters)
        op["linked_disasters"] = linked
        if linked and linked[0]["match_type"] == "cyclone_name":
            tier1_count += 1
            for match in linked:
                d = disasters_by_id[match["id"]]
                d.setdefault("piroi_operation_ids", [])
                if op["id"] not in d["piroi_operation_ids"]:
                    d["piroi_operation_ids"].append(op["id"])
        elif linked:
            tier2_count += 1

    for d in disasters:
        d["piroi_response"] = bool(d.get("piroi_operation_ids"))
        d.setdefault("piroi_operation_ids", [])

    OPERATIONS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OPERATIONS_OUTPUT.write_text(json.dumps(operations, ensure_ascii=False, indent=2), encoding="utf-8")
    DISASTERS_PATH.write_text(json.dumps(disasters, ensure_ascii=False, indent=2), encoding="utf-8")

    unmatched = sum(1 for op in operations if not op["linked_disasters"])
    print(
        f"OK: {len(operations)} opérations écrites dans {OPERATIONS_OUTPUT}\n"
        f"  Tier 1 (nom de cyclone): {tier1_count} | Tier 2 (pays+année): {tier2_count} | "
        f"sans correspondance: {unmatched}"
    )
    print(f"OK: disasters.json enrichi (piroi_response / piroi_operation_ids)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
