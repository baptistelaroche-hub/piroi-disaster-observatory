const SOUTH_AFRICA_ISO3 = "zaf";
const DEFAULT_YEAR_MIN = 2000;
const DEFAULT_YEAR_MAX = new Date().getFullYear();
// Zoom verrouillé sur un seul niveau (demande PIROI Center, cf. reliefweb.int/disasters) : la
// disposition relative des marqueurs de territoire ne doit jamais changer d'apparence — seul le
// glisser-déposer (pan, contraint à la zone) reste possible. Choisi pour que les 8 territoires
// PIROI restent visibles sans avoir à déplacer la carte.
const FIXED_ZOOM = 5;

(async function initDashboard() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("map").textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, countryByIso3, piroiIso3, territories, cycloneStats, nationalSocietiesSummary } = data;
  // "reliefweb" = catastrophes ReliefWeb ; "piroi" = catastrophes synthétiques créées pour les
  // opérations PIROI sans aucune correspondance ReliefWeb/IBTrACS (sinon invisibles partout).
  const displayDisasters = disasters.filter((d) => d.source === "reliefweb" || d.source === "piroi");
  const ibtracsDisasters = disasters.filter((d) => d.source === "ibtracs");
  const allTerritoryOptions = [
    ...territories,
    // Prétoria (capitale administrative) — mêmes règles de précision que les 8 territoires
    // PIROI (cf. territories.json) : un point curaté plutôt que le point ReliefWeb générique.
    { iso3: SOUTH_AFRICA_ISO3, name: "Afrique du Sud", piroi_region: "Hors zone PIROI", lat: -25.7479, lon: 28.2293 },
  ];

  const state = {
    yearMin: DEFAULT_YEAR_MIN,
    yearMax: DEFAULT_YEAR_MAX,
    territories: new Set(piroiIso3), // Afrique du Sud exclue par défaut
    piroiResponseOnly: false,
    hiddenCategories: new Set(),
  };

  const map = initMap();
  let currentLayer = null;

  initStaticCharts(cycloneStats);
  initTracksToggle(map, () => ibtracsDisasters, () => state);
  buildTerritoryFilterUI();
  wireFilterControls();
  render();

  function wireFilterControls() {
    const yearMinInput = document.getElementById("filter-year-min");
    const yearMaxInput = document.getElementById("filter-year-max");
    yearMinInput.value = state.yearMin;
    yearMaxInput.value = state.yearMax;
    yearMinInput.addEventListener("change", () => {
      state.yearMin = Number(yearMinInput.value) || DEFAULT_YEAR_MIN;
      render();
    });
    yearMaxInput.addEventListener("change", () => {
      state.yearMax = Number(yearMaxInput.value) || DEFAULT_YEAR_MAX;
      render();
    });

    document.getElementById("filter-piroi-response").addEventListener("change", (event) => {
      state.piroiResponseOnly = event.target.checked;
      render();
    });

    document.getElementById("filter-reset").addEventListener("click", () => {
      state.yearMin = DEFAULT_YEAR_MIN;
      state.yearMax = DEFAULT_YEAR_MAX;
      state.territories = new Set(piroiIso3);
      state.piroiResponseOnly = false;
      state.hiddenCategories.clear();
      yearMinInput.value = state.yearMin;
      yearMaxInput.value = state.yearMax;
      document.getElementById("filter-piroi-response").checked = false;
      document.querySelectorAll(".territory-checkbox").forEach((cb) => {
        cb.checked = state.territories.has(cb.value);
      });
      render();
    });
  }

  function buildTerritoryFilterUI() {
    const container = document.getElementById("filter-territories");
    const byRegion = new Map();
    for (const t of allTerritoryOptions) {
      if (!byRegion.has(t.piroi_region)) byRegion.set(t.piroi_region, []);
      byRegion.get(t.piroi_region).push(t);
    }

    for (const [region, list] of byRegion) {
      const group = document.createElement("div");
      group.className = "territory-region";
      group.innerHTML = `<span class="territory-region-label">${escapeHTML(region)}</span>`;
      for (const t of list) {
        const label = document.createElement("label");
        label.className = "territory-chip";
        const checked = state.territories.has(t.iso3);
        label.innerHTML = `<input type="checkbox" class="territory-checkbox" value="${t.iso3}" ${checked ? "checked" : ""}/> ${escapeHTML(t.name)}`;
        label.querySelector("input").addEventListener("change", (event) => {
          if (event.target.checked) state.territories.add(t.iso3);
          else state.territories.delete(t.iso3);
          render();
        });
        group.appendChild(label);
      }
      container.appendChild(group);
    }
  }

  // Filtres période/réponse PIROI, sans le filtre territoire — réutilisé par le graphique
  // "par territoire" qui doit pouvoir compter un événement dans plusieurs territoires à la fois
  // (ex: le cyclone Chido touche Comores/Madagascar/Mayotte/Mozambique) plutôt que de ne le
  // rattacher qu'à son pays "primaire" ReliefWeb (utile pour un marqueur unique sur la carte,
  // mais sous-représente les territoires rarement primaires comme Mayotte ou La Réunion).
  function applyNonTerritoryFilters() {
    return displayDisasters.filter((d) => {
      if (state.piroiResponseOnly && !d.piroi_response) return false;
      const year = d.date_start ? Number(d.date_start.slice(0, 4)) : null;
      if (year == null || year < state.yearMin || year > state.yearMax) return false;
      return true;
    });
  }

  // Filtres hors catégorie d'aléa : un événement est "dans la vue" dès qu'il touche au moins un
  // territoire sélectionné (liste complète des pays ReliefWeb, pas seulement le pays
  // "primaire" — sinon La Réunion et Mayotte, quasiment jamais primaires dans le dataset,
  // n'affichent jamais aucune catastrophe alors qu'elles sont bien listées comme pays affectés
  // sur plusieurs événements régionaux, ex: cyclone Chido). Sert de base pour les compteurs
  // (légende, tuiles) qui doivent rester visibles même pour une catégorie masquée.
  function applyBaseFilters() {
    return applyNonTerritoryFilters().filter((d) => d.iso3.some((iso3) => state.territories.has(iso3)));
  }

  function render() {
    const base = applyBaseFilters();
    const visible = base.filter((d) => !state.hiddenCategories.has(d.hazard_category));

    if (currentLayer) map.removeLayer(currentLayer);
    const markers = buildTerritoryMarkers(visible, countryByIso3);
    markers.addTo(map);
    currentLayer = markers;

    const countsByCategory = {};
    for (const d of base) {
      countsByCategory[d.hazard_category] = (countsByCategory[d.hazard_category] || 0) + 1;
    }

    renderStatTiles(visible);
    renderLegend(countsByCategory);

    const selectedTerritories = allTerritoryOptions.filter((t) => state.territories.has(t.iso3));
    const forTerritoryChart = applyNonTerritoryFilters().filter((d) => !state.hiddenCategories.has(d.hazard_category));
    updateByYearChart(visible, state.yearMin, state.yearMax);
    updateByTerritoryChart(forTerritoryChart, selectedTerritories);
    renderNsCards(nationalSocietiesSummary, state.territories);
    renderTracks(ibtracsDisasters, state);
  }

  function initMap() {
    // Bassin Sud-Ouest Océan Indien : couvre les 8 territoires PIROI (+ Afrique du Sud en
    // option) ET l'étendue réelle des trajectoires IBTrACS qui les approchent (calculé sur les
    // données : lat -59.7 à -0.4, lon 11.3 à 118.9, avec marge).
    const zoneBounds = L.latLngBounds([-63, 5], [3, 123]);

    const leafletMap = L.map("map", {
      maxBounds: zoneBounds,
      maxBoundsViscosity: 1.0, // limite dure : le glisser-panoramique "rebondit" sur la bordure
      zoomControl: false, // pas de boutons +/- : le zoom est fixe, ils n'auraient aucun effet
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      minZoom: FIXED_ZOOM,
      maxZoom: FIXED_ZOOM,
    });
    leafletMap.setView([-19, 50], FIXED_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      noWrap: true,
    }).addTo(leafletMap);

    return leafletMap;
  }

  // Un marqueur par territoire (façon reliefweb.int/disasters), pas un marqueur par catastrophe :
  // au clic, la popup liste les catastrophes les plus récentes de ce territoire plutôt que
  // d'obliger à dé-clusteriser une pile de points superposés au même centroïde pays.
  //
  // Position : coordonnées curatées de territory.lat/lon (capitale/préfecture, cf.
  // territories.json), PAS le point ReliefWeb de countryLookup — ce dernier est extrait
  // automatiquement du premier pays trouvé dans les données brutes (build_countries.py) et
  // s'est révélé imprécis pour de petits territoires insulaires : le point Seychelles pointait
  // vers un atoll périphérique à ~330 km de Mahé/Victoria, celui de Maurice à ~30 km en mer à
  // l'est de l'île — invisible dans toute vérification par les mathématiques de projection
  // Leaflet (toujours cohérentes), seulement en comparant le marqueur à la vraie géographie.
  // countryLookup reste un repli défensif si un territoire n'a pas encore de coordonnées curatées.
  function buildTerritoryMarkers(visibleDisasters, countryLookup) {
    const layerGroup = L.layerGroup();
    const selectedTerritories = allTerritoryOptions.filter((t) => state.territories.has(t.iso3));

    for (const territory of selectedTerritories) {
      const country = countryLookup.get(territory.iso3);
      const lat = territory.lat ?? country?.lat;
      const lon = territory.lon ?? country?.lon;
      if (lat == null || lon == null) continue;

      const territoryDisasters = visibleDisasters
        .filter((d) => d.iso3.includes(territory.iso3))
        .sort((a, b) => (b.date_start || "").localeCompare(a.date_start || ""));

      if (!territoryDisasters.length) continue;

      const hasResponse = territoryDisasters.some((d) => d.piroi_response);
      const icon = L.divIcon({
        className: "territory-marker",
        html: `<span class="territory-marker-count">${territoryDisasters.length}</span>${hasResponse ? '<i class="response-badge" title="Réponse PIROI"></i>' : ""}`,
        iconSize: [30, 30],
      });

      const marker = L.marker([lat, lon], { icon });
      marker.bindPopup(territoryPopupContent(territory, territoryDisasters), { maxWidth: 320 });
      layerGroup.addLayer(marker);
    }

    return layerGroup;
  }

  function territoryPopupContent(territory, territoryDisasters) {
    const recent = territoryDisasters.slice(0, 5);
    const rows = recent
      .map((d) => {
        const date = d.date_start ? d.date_start.slice(0, 10) : "?";
        const responseMark = d.piroi_response ? '<span class="table-response-badge" title="Réponse PIROI">✓</span> ' : "";
        return `<li>
          ${hazardBadge(d.hazard_category, 18)}
          <a href="disaster.html?id=${encodeURIComponent(d.id)}">${escapeHTML(d.name)}</a>
          <span class="popup-list-date">${date}</span> ${responseMark}
        </li>`;
      })
      .join("");

    return `
      <div class="popup-title">${escapeHTML(territory.name)}</div>
      <div class="popup-meta">${formatNumber(territoryDisasters.length)} catastrophe${territoryDisasters.length > 1 ? "s" : ""} — 5 plus récentes :</div>
      <ul class="popup-disaster-list">${rows}</ul>
      <div class="popup-link"><a href="liste.html?territory=${territory.iso3}">Voir tout (${formatNumber(territoryDisasters.length)})</a></div>
    `;
  }

  function filteredIbtracsCount() {
    return ibtracsDisasters.filter((d) => {
      if (!d.territories_piroi_approches.some((iso3) => state.territories.has(iso3))) return false;
      if (state.piroiResponseOnly && !d.piroi_response) return false;
      const year = d.date_start ? Number(d.date_start.slice(0, 4)) : null;
      return year != null && year >= state.yearMin && year <= state.yearMax;
    }).length;
  }

  function renderStatTiles(inZone) {
    const cyclonesInZone = filteredIbtracsCount();
    const dates = inZone.map((d) => d.date_start).filter(Boolean);

    document.getElementById("stat-total-disasters").textContent = formatNumber(inZone.length);
    document.getElementById("stat-total-cyclones").textContent = formatNumber(cyclonesInZone);
    document.getElementById("stat-total-piroi").textContent = formatNumber(inZone.length + cyclonesInZone);
    const start = dates.length ? Math.min(...dates.map((d) => new Date(d).getFullYear())) : "?";
    const end = dates.length ? Math.max(...dates.map((d) => new Date(d).getFullYear())) : "?";
    document.getElementById("stat-period").textContent = `${start} – ${end}`;
  }

  function renderLegend(countsByCategory) {
    const legend = document.getElementById("legend");
    const allCategories = new Set([...Object.keys(countsByCategory), ...state.hiddenCategories]);
    const categories = [...allCategories].sort((a, b) => (countsByCategory[b] || 0) - (countsByCategory[a] || 0));

    const rows = categories
      .map((category) => {
        const isHidden = state.hiddenCategories.has(category);
        return `
        <div class="legend-row${isHidden ? " legend-row--hidden" : ""}" data-category="${escapeHTML(category)}" role="button" tabindex="0">
          ${hazardBadge(category, 20)}
          <span>${escapeHTML(category)}</span>
          <span class="legend-count">${formatNumber(countsByCategory[category] || 0)}</span>
        </div>`;
      })
      .join("");

    legend.innerHTML = `
      <h2>Types d'aléas (cliquer pour filtrer)</h2>${rows || "<p>Aucun événement</p>"}
      <div class="legend-row legend-response-note">
        <span class="legend-swatch legend-swatch--badge"></span>
        <span>Réponse PIROI</span>
      </div>
    `;

    legend.querySelectorAll(".legend-row[data-category]").forEach((row) => {
      row.addEventListener("click", () => toggleCategory(row.dataset.category));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCategory(row.dataset.category);
        }
      });
    });
  }

  function toggleCategory(category) {
    if (state.hiddenCategories.has(category)) state.hiddenCategories.delete(category);
    else state.hiddenCategories.add(category);
    render();
  }

  function formatNumber(n) {
    return typeof n === "number" ? n.toLocaleString("fr-FR") : "—";
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
})();
