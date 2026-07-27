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

Deux workflows GitHub Actions planifiés exécutent les scripts ETL et commitent les fichiers
mis à jour dans `data/raw/` :

- `update-reliefweb.yml` — quotidien, nécessite le secret `RELIEFWEB_APPNAME`.
- `update-ibtracs.yml` — hebdomadaire, pas de secret requis.

IFRC n'a pas de workflow automatique (voir section IFRC ci-dessous) — mise à jour manuelle.

## Développement local

```bash
pip install -r etl/requirements.txt
cp .env.example .env   # renseigner RELIEFWEB_APPNAME (appname pré-approuvé, voir reliefweb.int/contact)

# Windows (PowerShell)
$env:RELIEFWEB_APPNAME="votre-appname"; python etl/fetch_reliefweb.py

# macOS/Linux
RELIEFWEB_APPNAME=votre-appname python etl/fetch_reliefweb.py

python etl/fetch_ibtracs.py
python etl/reference/build_countries.py
python etl/ingest_ifrc.py
```

## Sources

| Source | Contenu | Statut |
|---|---|---|
| ReliefWeb | Catastrophes mondiales (officiel) | ✅ étape 1 |
| IBTrACS (NOAA) | Trajectoires de cyclones, bassin Sud Indien (zone PIROI) | ✅ étape 2 |
| IFRC (FDRS) | Indicateurs institutionnels des Sociétés nationales | ✅ étape 3 |

### IBTrACS — note sur la couverture des données

Le bassin Sud Indien (`SI`) couvre l'intégralité de la zone PIROI. Les données sont conservées
telles quelles (toutes colonnes sources) en RAW ; le filtrage (colonnes utiles, types de
trajectoire, période) se fera au niveau CLEAN. À noter : la couverture vent/pression est nulle
avant les années 1970 (ère pré-satellite, positions seules) et reste partielle (40-60%) ensuite —
à prendre en compte dans les analyses de fréquence et cartes de chaleur.

### IFRC — mise à jour manuelle

Il n'existe pas d'URL publique stable pour l'export FDRS (data.ifrc.org/fdrs est une application
authentifiée) : contrairement à ReliefWeb et IBTrACS, cette source n'est pas automatisée par
GitHub Actions.

Pour rafraîchir les données :

1. Télécharger un nouvel export depuis [data.ifrc.org/fdrs](https://data.ifrc.org/fdrs/).
2. Remplacer `etl/manual-drops/ifrc_ns_export.csv` par ce fichier.
3. Exécuter `python etl/ingest_ifrc.py` (ne garde que les colonnes d'identification et les
   65 indicateurs retenus avec le PIROI Center — l'export source fait ~1791 colonnes).
4. Committer `data/raw/ifrc_ns_raw.csv`.

Le fichier source ne contient pas de coordonnées géographiques : `data/reference/countries.json`
(généré par `etl/reference/build_countries.py` à partir des pays présents dans les données
ReliefWeb déjà récupérées) sert de référentiel de coordonnées pour la jointure par `iso3`.

Note : Réunion et Mayotte (territoires PIROI) n'ont pas de Société nationale distincte dans le
registre IFRC — elles sont rattachées à la Croix-Rouge française. C'est attendu, pas un manque
de données.
