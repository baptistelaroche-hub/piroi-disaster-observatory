"""Rattache les catastrophes EM-DAT aux entrées ReliefWeb de disasters.json et les enrichit.

Deux niveaux de rattachement (même logique que etl/clean/build_piroi_operations.py) :
- Tier 1 "glide" : le code GLIDE ReliefWeb (ex: "TC-2024-000224-MOZ") a son radical
  ("TC-2024-000224", sans le suffixe pays) qui apparaît dans les GLIDE EM-DAT de la même
  catastrophe pour le même pays — identifiant standardisé partagé entre les deux sources,
  fiable. Couverture ReliefWeb : ~82% des catastrophes ont un GLIDE.
- Tier 2 "name" (repli, uniquement si aucun GLIDE ne matche) : même pays, année à ±1 an, et un
  mot significatif du nom d'événement EM-DAT retrouvé dans le nom de la catastrophe ReliefWeb.
  Pas de repli "pays+année" seul (contrairement aux opérations PIROI) : ici on enrichit des
  chiffres officiels (morts, dégâts...) directement sur l'enregistrement canonique, mieux vaut
  ne rien rattacher que rattacher un mauvais évènement.

Une même catastrophe ReliefWeb multi-pays (ex: cyclone Chido) peut recevoir plusieurs
enregistrements EM-DAT (un par pays impacté) : EM-DAT a une ligne par (évènement, pays), gardée
telle quelle dans `emdat` plutôt qu'agrégée en un seul total, pour ne pas perdre le détail par
pays.

Usage:
    python etl/clean/build_emdat_links.py
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
EMDAT_PATH = DATA_DIR / "raw" / "emdat_raw.json"
DISASTERS_PATH = DATA_DIR / "clean" / "disasters.json"

NAME_MATCH_STOPWORDS = {
    "comores", "comoros", "madagascar", "maurice", "mauritius", "mozambique", "seychelles",
    "tanzanie", "tanzania", "republic", "united", "region", "regions", "province", "provinces",
    "district", "districts", "island", "islands", "isl", "tropical", "cyclone", "storm",
    "flood", "floods", "epidemic", "drought", "and", "the", "de", "des", "du", "la", "le",
}
WORD_RE = re.compile(r"[a-z]+")

# 6 pays EM-DAT (pas de Réunion/Mayotte : rattachées à la France dans EM-DAT).
COUNTRY_NAME_FRAGMENTS = {"comores", "comoros", "madagascar", "maurice", "mauritius", "mozambique", "seychelles", "tanzanie", "tanzania"}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def glide_core(glide: str) -> str:
    """'TC-2024-000224-MOZ' -> 'TC-2024-000224' (retire le suffixe pays)."""
    parts = glide.split("-")
    return "-".join(parts[:3]) if len(parts) >= 4 else glide


def find_match(emdat_record: dict, disasters_by_iso3: dict[str, list[dict]]) -> tuple[dict | None, str | None]:
    iso3 = emdat_record["iso3"]
    candidates = disasters_by_iso3.get(iso3, [])
    if not candidates:
        return None, None

    year = emdat_record["start_year"]
    year_candidates = [
        d for d in candidates if d["date_start"] and abs(int(d["date_start"][:4]) - year) <= 1
    ]

    glide_codes = set(emdat_record["glide_codes"])
    if glide_codes:
        for d in year_candidates:
            if d.get("glide") and glide_core(d["glide"]) in glide_codes:
                return d, "glide"

    event_name = emdat_record.get("event_name")
    if event_name:
        words = {w for w in WORD_RE.findall(strip_accents(event_name.lower())) if len(w) >= 4}
        words -= NAME_MATCH_STOPWORDS
        words = {w for w in words if not any(w in frag or frag in w for frag in COUNTRY_NAME_FRAGMENTS)}
        if words:
            for d in year_candidates:
                dname = strip_accents(d["name"].lower())
                if any(w in dname for w in words):
                    return d, "name"

    return None, None


def main() -> int:
    emdat_records = json.loads(EMDAT_PATH.read_text(encoding="utf-8"))
    disasters = json.loads(DISASTERS_PATH.read_text(encoding="utf-8"))

    # Candidats des deux sources : ReliefWeb (iso3 = liste des pays listés par ReliefWeb) ET
    # IBTrACS (iso3 vide par construction — on utilise territories_piroi_approches à la place,
    # sinon aucun cyclone IBTrACS-only comme Alvaro ou Belna ne serait jamais candidat).
    disasters_by_iso3: dict[str, list[dict]] = {}
    for d in disasters:
        country_list = d["iso3"] or d["territories_piroi_approches"]
        for iso3 in country_list:
            disasters_by_iso3.setdefault(iso3, []).append(d)

    for d in disasters:
        d["emdat"] = []

    tier_counts = {"glide": 0, "name": 0}
    unmatched = []

    for rec in emdat_records:
        match, match_type = find_match(rec, disasters_by_iso3)
        if match is None:
            unmatched.append(rec)
            continue
        tier_counts[match_type] += 1
        match["emdat"].append(
            {
                "disno": rec["disno"],
                "match_type": match_type,
                "country": rec["country"],
                "iso3": rec["iso3"],
                "start_date": rec["start_date"],
                "end_date": rec["end_date"],
                "location": rec.get("location"),
                "origin": rec.get("origin"),
                "magnitude": rec.get("magnitude"),
                "magnitude_scale": rec.get("magnitude_scale"),
                "total_deaths": rec.get("total_deaths"),
                "no_injured": rec.get("no_injured"),
                "no_affected": rec.get("no_affected"),
                "no_homeless": rec.get("no_homeless"),
                "total_affected": rec.get("total_affected"),
                "total_damage_000_usd": rec.get("total_damage_000_usd"),
            }
        )

    DISASTERS_PATH.write_text(json.dumps(disasters, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"OK: {sum(tier_counts.values())}/{len(emdat_records)} catastrophes EM-DAT rattachées "
        f"(glide: {tier_counts['glide']} | nom: {tier_counts['name']} | sans correspondance: {len(unmatched)})"
    )
    print("disasters.json enrichi du champ emdat (liste, vide si aucun rattachement).")
    if unmatched:
        print("\nSans correspondance :")
        for rec in unmatched:
            print(f"  {rec['disno']:16} {rec['country']:14} {rec.get('event_name') or rec['disaster_type']} ({rec['start_year']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
