# PIROI Disaster Observatory

Tableau de bord d'aide à la décision pour la PIROI (Croix-Rouge française, zone Océan Indien) :
connaissance des risques, suivi des catastrophes historiques, analyse de tendances, à partir de
plusieurs sources croisées (ReliefWeb, IBTrACS, IFRC).

## Architecture des données

- `data/raw/` — copie brute des sources externes, non modifiée, régénérée à chaque mise à jour.
- `data/reference/` — référentiels (pays, territoires PIROI, types d'aléas).
- `data/clean/` — données nettoyées et normalisées.
- `data/analytics/` — indicateurs et agrégations consommés par le dashboard.
- `dashboard/` — interface (HTML/CSS/JS).
- `etl/` — scripts Python de collecte et transformation.

Chaque table reste dans sa source d'origine ; les jointures (ISO3, SID, ID ReliefWeb) sont faites
côté dashboard, pas dupliquées dans les données.

## Mise à jour des données

Un workflow GitHub Actions planifié (`.github/workflows/update-data.yml`) exécute les scripts ETL
et commit les fichiers JSON mis à jour dans `data/`.

## Développement local

```bash
pip install -r etl/requirements.txt
cp .env.example .env   # renseigner RELIEFWEB_APPNAME (appname pré-approuvé, voir reliefweb.int/contact)

# Windows (PowerShell)
$env:RELIEFWEB_APPNAME="votre-appname"; python etl/fetch_reliefweb.py

# macOS/Linux
RELIEFWEB_APPNAME=votre-appname python etl/fetch_reliefweb.py
```

## Sources

| Source | Contenu | Statut |
|---|---|---|
| ReliefWeb | Catastrophes mondiales (officiel) | ✅ étape 1 |
| IBTrACS (NOAA) | Trajectoires de cyclones, bassin Sud Indien (zone PIROI) | ✅ étape 2 |
| IFRC | Sociétés nationales | à venir |

### IBTrACS — note sur la couverture des données

Le bassin Sud Indien (`SI`) couvre l'intégralité de la zone PIROI. Les données sont conservées
telles quelles (toutes colonnes sources) en RAW ; le filtrage (colonnes utiles, types de
trajectoire, période) se fera au niveau CLEAN. À noter : la couverture vent/pression est nulle
avant les années 1970 (ère pré-satellite, positions seules) et reste partielle (40-60%) ensuite —
à prendre en compte dans les analyses de fréquence et cartes de chaleur.
