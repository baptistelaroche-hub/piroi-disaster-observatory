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

### CLEAN

- `disasters.json` — table unifiée ReliefWeb + IBTrACS, une ligne par événement (6396 lignes :
  3715 ReliefWeb + 2681 tempêtes IBTrACS, points `TRACK_TYPE != main` exclus). Pas de
  déduplication entre les deux sources : un même cyclone peut apparaître deux fois (une fois
  par source), distinguées par la colonne `source`. Le champ `territories_piroi_approches` est
  calculé par distance à vol d'oiseau (seuil 300 km) entre les points de trajectoire (IBTrACS)
  ou le pays touché (ReliefWeb) et le centroïde de chaque territoire PIROI — une approximation
  volontairement simple à affiner plus tard si besoin.
- `national_societies.json` — export IFRC enrichi des coordonnées et du flag `is_piroi_territory`.
- `cyclone_tracks.json` — géométrie des trajectoires (points lat/lon/vent/pression par tempête),
  utilisée pour tracer les lignes sur la carte. Ce n'est pas une table analytique à part entière,
  juste la géométrie derrière les entrées "Cyclone tropical" de `disasters.json`.
- `piroi_operations.json` — opérations d'urgence PIROI (export manuel de capitalisation),
  nettoyé et rattaché aux catastrophes de `disasters.json`. Deux niveaux de confiance :
  `cyclone_name` (nom d'opération retrouvé dans le nom d'une catastrophe du même territoire,
  ±1 an — fiable) et `country_year` (repli : même territoire/année/catégorie d'aléa, sans
  correspondance de nom — à traiter comme des candidats, pas une certitude). `disasters.json`
  est enrichi en conséquence de `piroi_response` (bool) et `piroi_operation_ids`, uniquement à
  partir des liens `cyclone_name` pour ne pas propager l'incertitude du repli dans la table
  catastrophes. Pays hors zone PIROI exclus (Zimbabwe, Haïti, RDC, régions "OI"...).

Regénérer : `python etl/clean/build_disasters.py && python etl/clean/build_national_societies.py && python etl/clean/build_cyclone_tracks.py && python etl/clean/build_piroi_operations.py`

Mise à jour manuelle (comme IFRC, pas d'API) : remplacer
`etl/manual-drops/piroi_operations_export.csv` par un nouvel export du Sheet de capitalisation
PIROI, puis relancer `build_piroi_operations.py`.

### ANALYTICS

Contient uniquement les agrégats coûteux à recalculer ou pertinents en vue par défaut. Les
graphiques qui doivent réagir aux filtres du dashboard (période, territoire, type d'aléa...)
sont calculés côté client à partir des données CLEAN, pas ici — éviter de dupliquer la logique
de filtrage à deux endroits.

- `global_indicators.json` — compteurs globaux (nb catastrophes, nb cyclones, période couverte).
- `cyclone_stats.json` — fréquence annuelle et saisonnalité (par mois) des cyclones IBTrACS,
  calculé sur 178 ans d'historique.
- `national_societies_summary.json` — un résumé par territoire PIROI (capacité, reach par
  thématique, contexte socio-économique, lien avec les catastrophes). Pour chaque indicateur,
  la dernière valeur connue est gardée avec son année de référence plutôt qu'une "dernière
  année" unique — ces champs ne sont jamais tous renseignés la même année dans l'export IFRC.

Regénérer : `python etl/analytics/build_global_indicators.py && python etl/analytics/build_cyclone_stats.py && python etl/analytics/build_national_societies_summary.py`

### DASHBOARD (en cours)

Étape 1 : structure de page + carte Leaflet avec les catastrophes ReliefWeb (clustering,
couleur par catégorie d'aléa, popup nom/date/lien). Carte centrée et filtrée sur la zone
PIROI (les 8 territoires) par défaut, avec une case à cocher pour inclure l'Afrique du Sud —
la donnée CLEAN reste mondiale (comparaison possible plus tard), seul l'affichage par défaut
est restreint. Trajectoires cycloniques, filtres avancés et graphiques à venir dans des
sous-étapes suivantes.

Palette catégorielle validée avec le skill dataviz (8 teintes fixes pour les catégories les
plus fréquentes, repli neutre gris pour les 4 restantes — la couleur renforce l'identité mais
n'est jamais le seul identifiant : nom toujours visible en légende et en popup).

Servir en local (fetch() sur les fichiers JSON, ne fonctionne pas en `file://`) :

```bash
python -m http.server 8765
# puis ouvrir http://localhost:8765/dashboard/
```

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

### Référentiel (REFERENCE)

- `countries.json` — 229 pays (iso3, nom, coordonnées), extraits des données ReliefWeb.
- `territories.json` — les 8 territoires PIROI, regroupés par région (Océan Indien / Afrique
  australe / Afrique de l'Est), référencés par `iso3`.
- `hazard_types.json` — 12 catégories d'aléas (vocabulaire PIROI), avec le mapping des 21 codes
  de la taxonomie ReliefWeb vers chaque catégorie. La catégorie `Cyclone tropical` porte le flag
  `is_ibtracs_join: true` : c'est le point de jonction entre les catastrophes ReliefWeb de type
  `TC` et l'ensemble des trajectoires IBTrACS (qui sont, par construction, toutes des cyclones).
