"""Récupère l'intégralité des catastrophes ReliefWeb (RAW, non filtré) et les écrit dans data/raw/reliefweb_raw.json.

Usage:
    RELIEFWEB_APPNAME=xxx python etl/fetch_reliefweb.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

API_URL = "https://api.reliefweb.int/v2/disasters"
PAGE_SIZE = 1000
REQUEST_TIMEOUT = 30
FIELDS = [
    "name",
    "description",
    "status",
    "glide",
    "primary_country",
    "country",
    "type",
    "url",
    "date",
]

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "reliefweb_raw.json"


def fetch_all_disasters(appname: str) -> list[dict]:
    session = requests.Session()
    disasters: list[dict] = []
    offset = 0
    total_count: int | None = None

    while total_count is None or offset < total_count:
        params = {
            "appname": appname,
            "limit": PAGE_SIZE,
            "offset": offset,
            "sort[]": "date.created:asc",
            "fields[include][]": FIELDS,
        }

        response = session.get(API_URL, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        payload = response.json()

        total_count = payload["totalCount"]
        page = payload.get("data", [])
        for item in page:
            disasters.append({"id": item["id"], **item.get("fields", {})})

        print(f"  offset={offset:>6} +{len(page)} disasters (total attendu: {total_count})")

        if not page:
            break
        offset += PAGE_SIZE

    return disasters


def main() -> int:
    appname = os.environ.get("RELIEFWEB_APPNAME")
    if not appname:
        print("Erreur: variable d'environnement RELIEFWEB_APPNAME manquante.", file=sys.stderr)
        return 1

    print("Récupération des catastrophes ReliefWeb...")
    disasters = fetch_all_disasters(appname)

    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": API_URL,
        "total_count": len(disasters),
        "disasters": disasters,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {len(disasters)} catastrophes écrites dans {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
