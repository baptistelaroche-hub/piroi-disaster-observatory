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

Regénérer : `python etl/clean/build_disasters.py && python etl/clean/build_national_societies.py && python etl/clean/build_cyclone_tracks.py && python etl/clean/build_piroi_operations.py && python etl/clean/build_emdat_links.py`
(`build_disasters.py` en premier : les deux scripts suivants enrichissent `disasters.json` en
place et doivent tourner après lui, dans cet ordre.)

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
PIROI (les 8 territoires) par défaut — la donnée CLEAN reste mondiale (comparaison possible
plus tard), seul l'affichage par défaut est restreint.

Étape 1ter : barre de filtres — période (année min/max), territoires (chips par région PIROI,
Afrique du Sud incluse hors zone par défaut), réponse PIROI uniquement, et type d'aléa via la
légende cliquable (le compteur reste affiché même masqué, pour ne pas perdre l'info du volume
filtré). Tous les filtres se combinent, un bouton réinitialise l'ensemble.

Étape 1bis : badge "réponse PIROI" sur les marqueurs concernés (petit anneau blanc, visible
en cliquant un cluster ou en zoomant — beaucoup de catastrophes d'un même pays partagent le
même marqueur au niveau centroïde pays, donc plusieurs badges restent superposés tant qu'on
n'a pas zoomé/dé-clusterisé). La popup liste alors les opérations liées (activités,
bénéficiaires, budget) depuis `piroi_operations.json`.

`budget_total` est en euros (€) — confirmé avec le PIROI Center le 28/07/2026.

Étape 1quater : section graphiques/indicateurs sous la carte (Chart.js) — catastrophes par
année et par territoire×type d'aléa (dynamiques, réagissent aux mêmes filtres que la carte),
saisonnalité cyclonique (statique, `cyclone_stats.json`, historique complet), fiches Sociétés
nationales par territoire (`national_societies_summary.json`, filtrées par territoire coché).
Couleurs de catégorie identiques à la légende de la carte.

Bug trouvé et corrigé pendant les tests : le graphique "par territoire" comptait un événement
uniquement dans le pays "primaire" ReliefWeb, ce qui faisait apparaître La Réunion et Mayotte à
zéro alors qu'elles sont listées comme pays affectés sur plusieurs catastrophes régionales
(ex: cyclone Chido, primaire Mozambique, affecte aussi Comores/Madagascar/Mayotte). Corrigé en
comptant sur la liste complète des pays touchés plutôt que le seul pays primaire — un événement
régional est donc compté dans chaque territoire concerné (le total du graphique peut dépasser
le nombre total d'événements, c'est intentionnel, noté dans le sous-titre du graphique).

Deuxième bug du même type, trouvé après le premier déploiement public (signalé par Baptiste :
"aucune catastrophe pour La Réunion et Mayotte" sur la carte) : la carte elle-même filtrait
encore sur le seul pays primaire, contrairement au graphique déjà corrigé. Même correctif
appliqué à la carte : un marqueur par (catastrophe, territoire sélectionné qu'elle touche),
positionné aux coordonnées de ce territoire — un événement régional produit donc plusieurs
marqueurs (un par territoire concerné) plutôt qu'un seul au pays primaire. Vérifié : La Réunion
affiche maintenant ses 7 catastrophes, Mayotte ses 2 (dont le cyclone Chido, primaire
Mozambique). Le nombre total de catastrophes distinctes dans la tuile/légende reste néanmoins
un compte par événement (pas par marqueur), pour ne pas gonfler artificiellement l'indicateur
global.

Étape 1quinquies : trajectoires cycloniques IBTrACS sur la carte, case à cocher (chargement
paresseux de `cyclone_tracks.json`, ~23 Mo — pas imposé par défaut). Polylignes colorées comme
"Cyclone tropical" dans la légende, popup nom/dates/vent max/pression min au clic. Réagissent
aux mêmes filtres que le reste (période, territoires via `territories_piroi_approches`, réponse
PIROI) — pas de rattachement pour l'instant si seule "Afrique du Sud" est cochée (le champ
`territories_piroi_approches` ne couvre que les 8 territoires PIROI officiels, pas l'option
bonus Afrique du Sud ; limitation mineure, à corriger plus tard si besoin réel).

Bug trouvé et corrigé pendant les tests : la tuile "Cyclones IBTrACS" ignorait le filtre de
période depuis sa création (comptait tout l'historique 1848-2026 quel que soit le filtre
année) — ne s'est vu qu'en comparant son chiffre (861) au nombre réel de trajectoires tracées
pour la période par défaut (202). Corrigé.

### Deuxième page : `liste.html`

Vue tableau des catastrophes ReliefWeb (nom, type d'aléa, territoires touchés, date, réponse
PIROI, lien ReliefWeb) — une ligne par catastrophe, contrairement à la carte qui affiche un
marqueur par territoire touché. Filtres identiques en logique à la carte (territoires, période,
types d'aléa via cases à cocher, réponse PIROI uniquement), tri par colonne en cliquant l'en-tête
(date décroissante par défaut). Navigation "Carte / Liste" ajoutée à l'en-tête des deux pages.

Testé en navigateur : 164 catastrophes par défaut (identique à la carte), filtre catégorie
(-56 sans "Inondation"), tri par nom, réponse PIROI uniquement (31, identique à la carte),
lien ReliefWeb vérifié, aucune erreur console.

### Retours PIROI Center (28/07/2026) : identité visuelle + détail des réponses

- **Popup carte simplifiée** : au clic, affiche juste "Réponse PIROI" (en rouge CRF) si
  applicable — le détail (activités, bénéficiaires, budget) a été déplacé vers le tableau.
- **Tableau enrichi** : colonnes Statut (traduit depuis `status` ReliefWeb — champ qui manquait
  dans `disasters.json`, ajouté dans `build_disasters.py`), coche verte (✓) pour la réponse
  PIROI (remplace l'ancien point plein), Type d'activité, Déploiement de stocks, Budget,
  Bénéficiaires — agrégés depuis `piroi_operations.json` (une catastrophe peut être liée à
  plusieurs opérations PIROI ; dans ce cas, activités = union, stocks/budget/bénéficiaires =
  somme).
- **Logo PIROI Center** ajouté à gauche du titre sur les deux pages (`dashboard/assets/piroi-logo.jpg`,
  fond blanc pour rester lisible en dark mode).
- **Charte graphique CRF** : rouge officiel `#e30613` (Pantone 485 C, extrait de
  `Charte_Croix-Rouge_francaise_202407.md`) appliqué aux éléments d'interface — navigation,
  bordure d'en-tête, bouton réinitialiser, tri des colonnes, cases à cocher. La palette
  catégorielle des types d'aléas (carte/graphiques) n'est pas touchée : elle a sa propre
  validation d'accessibilité (CVD-safe), indépendante de la charte de marque.

Testé en navigateur : rouge CRF vérifié par computed style (`rgb(227, 6, 19)`), logo chargé
(322×146 → 42px), agrégation multi-opérations vérifiée sur Cyclone Freddy 2023 (2 opérations
liées, Madagascar + Mozambique), tri par budget (Cyclone Chido 2024 en tête, cohérent avec une
réponse sur 4 territoires), aucune erreur console.

Filtres supplémentaires (intensité) à venir dans des sous-étapes suivantes.

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

## Mise à jour du 06/08/2026 (retours PIROI Center)

- **Période par défaut** : carte et liste s'ouvrent maintenant sur 2000+ (au lieu de 1982+).
  Toujours ajustable via le filtre.
- **Fiches Sociétés nationales** : 8 indicateurs retenus avec le PIROI Center — Branches
  (`KPI_noBranches`), Unités locales (`KPI_noLocalUnits`), Volontaires (`KPI_PeopleVol_Tot`),
  Staff rémunéré (`KPI_PStaff_Tot`), Formés aux premiers secours (`KPI_TrainFA_Tot`), Atteints
  réduction des risques (`KPI_ReachDRR_D_Tot`), Atteints réponse et relèvement précoce
  (`KPI_ReachDRER_D_Tot`), Atteints risque canicule (`KPI_ClimateHeat_D_Tot` — remplace
  `KPI_Climate_CPD_Public`/`KPI_ClimateHeat_I_Public`, quasi vides pour nos territoires ; le
  champ `_D_Tot`, plus rarement renseigné mais présent sur 4 des 6 territoires, est le bon choix).
  WASH retiré (non demandé). Testé : fiche Madagascar validée avec ses 8 valeurs réelles.

### Intégration EM-DAT

Source manuelle (comme IFRC et PIROI operations) : export personnalisé depuis
[public.emdat.be](https://public.emdat.be), déposé dans `etl/manual-drops/emdat_custom_request.xlsx`
(293 catastrophes, 6 pays — Comores, Madagascar, Maurice, Mozambique, Seychelles, Tanzanie ;
pas de Réunion/Mayotte, EM-DAT les rattache à la France).

- `etl/ingest_emdat.py` → `data/raw/emdat_raw.json` (toutes colonnes conservées, dates
  composées depuis année/mois/jour, codes GLIDE extraits de "External IDs").
- `etl/clean/build_emdat_links.py` rattache chaque ligne EM-DAT à une entrée de `disasters.json`
  (ReliefWeb **et** IBTrACS — plusieurs cyclones nommés comme Alvaro ou Belna n'existent que côté
  IBTrACS, pas ReliefWeb, il fallait donc chercher dans les deux). Deux niveaux :
  - **glide** (88 rattachements) : le GLIDE ReliefWeb (`glide`, champ ajouté — 82% de
    couverture) recoupe un GLIDE EM-DAT pour le même pays. Fiable.
  - **name** (28 rattachements) : repli par mot-clé du nom d'évènement dans le nom de la
    catastrophe, même pays, année à ±1 an. Pas de repli "pays+année" seul comme pour les
    opérations PIROI : on enrichit des chiffres officiels directement sur l'enregistrement
    canonique, mieux vaut ne rien rattacher qu'un mauvais rattachement.
  - 116/293 catastrophes EM-DAT rattachées au total ; les 177 non rattachées sont
    essentiellement des inondations/sécheresses/épidémies sans nom distinctif (pas de signal
    fiable pour les recouper).
  - Une catastrophe multi-pays (ex: cyclone Chido) reçoit un enregistrement EM-DAT par pays
    touché (`disasters[].emdat` est une liste), pas un total agrégé — pour ne pas perdre le
    détail par pays.

Validé sur plusieurs cas connus (Freddy : 3 pays rattachés par nom ; Chido : 3 pays rattachés
par glide ; Idai : Mozambique 603 morts / Madagascar 3 morts, cohérent avec les faits réels ;
Alvaro/Belna/Belal/Fame/Fari/Gamède/Izilda/Eliakim/Dumako, tous IBTrACS-only, correctement
rattachés par nom).

Regénérer (ordre important — chaque script mutant `disasters.json` doit tourner après
`build_disasters.py`) :
`python etl/clean/build_disasters.py && python etl/clean/build_piroi_operations.py && python etl/clean/build_emdat_links.py`

À venir : page détail par catastrophe (infos liste.html + données EM-DAT), refonte de
l'interaction carte (clic pays → 5 derniers aléas, façon reliefweb.int/disasters).

### Troisième page : `disaster.html?id=<id>`

Fiche détail d'une catastrophe : infos de base (nom, catégorie, territoires, dates, statut,
lien ReliefWeb, description), données cycloniques si IBTrACS (vent max, pression min, mini-carte
de trajectoire chargée à la demande depuis `cyclone_tracks.json`), réponse PIROI (activités,
stocks, budget, bénéficiaires — même agrégation que `liste.html`), et données EM-DAT (une entrée
par pays rattaché, morts/blessés/affectés/sans-abri/dégâts/localisation/origine/magnitude).
Messages honnêtes si rien n'est rattaché ("Aucune opération PIROI rattachée", "Aucune
correspondance EM-DAT trouvée") plutôt que de masquer la section.

Accessible depuis le nom cliquable dans `liste.html` et le lien "Voir la fiche" dans les popups
de la carte (marqueurs de catastrophes et trajectoires cycloniques).

Testé en navigateur : cas multi-pays avec rattachement GLIDE (Chido — les chiffres Mozambique
120 morts/868 blessés affichés correspondent exactement à ceux cités dans le texte libre
ReliefWeb, bonne validation croisée), cas IBTrACS-only avec rattachement par nom et trajectoire
(Alvaro), cas sans aucun rattachement (message honnête affiché), liens depuis la liste et la
carte (via dé-clusterisation) vérifiés, aucune erreur console.

À venir : refonte de l'interaction carte (clic pays → 5 derniers aléas, façon
reliefweb.int/disasters).
