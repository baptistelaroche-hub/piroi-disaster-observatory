const SOUTH_AFRICA_ISO3 = "zaf";
const DEFAULT_YEAR_MIN = 1982;
const DEFAULT_YEAR_MAX = new Date().getFullYear();

(async function initDashboard() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("map").textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, countryByIso3, piroiIso3, territories, operationById, cycloneStats, nationalSocietiesSummary } = data;
  const reliefwebDisasters = disasters.filter((d) => d.source === "reliefweb");
  const ibtracsDisasters = disasters.filter((d) => d.source === "ibtracs");
  const allTerritoryOptions = [...territories, { iso3: SOUTH_AFRICA_ISO3, name: "Afrique du Sud", piroi_region: "Hors zone PIROI" }];

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
    return reliefwebDisasters.filter((d) => {
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

  // Un marqueur par (catastrophe, territoire sélectionné qu'elle touche) — pas un marqueur par
  // catastrophe au seul pays primaire. Un événement régional produit donc un marqueur par
  // territoire concerné, positionné aux coordonnées de CE territoire.
  function buildMarkerEntries(visibleDisasters) {
    const entries = [];
    for (const d of visibleDisasters) {
      for (const iso3 of d.iso3) {
        if (state.territories.has(iso3)) entries.push({ disaster: d, iso3 });
      }
    }
    return entries;
  }

  function render() {
    const base = applyBaseFilters();
    const visible = base.filter((d) => !state.hiddenCategories.has(d.hazard_category));

    if (currentLayer) map.removeLayer(currentLayer);
    const { markers } = buildMarkers(buildMarkerEntries(visible), countryByIso3, operationById);
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
    // Centré sur la zone PIROI (Océan Indien Sud-Ouest), pas une vue mondiale.
    const leafletMap = L.map("map").setView([-19, 50], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(leafletMap);
    return leafletMap;
  }

  function buildMarkers(entries, countryLookup, operationLookup) {
    const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40 });

    for (const { disaster, iso3 } of entries) {
      const country = countryLookup.get(iso3);
      if (!country || country.lat == null || country.lon == null) continue;

      const color = hazardColor(disaster.hazard_category);
      const badge = disaster.piroi_response ? '<i class="response-badge" title="Réponse PIROI"></i>' : "";
      const icon = L.divIcon({
        className: "hazard-marker",
        html: `<span style="background:${color}"></span>${badge}`,
        iconSize: [12, 12],
      });

      const marker = L.marker([country.lat, country.lon], { icon });
      marker.bindPopup(popupContent(disaster, country, operationLookup));
      clusterGroup.addLayer(marker);
    }

    return { markers: clusterGroup };
  }

  function popupContent(disaster, country, operationLookup) {
    const date = disaster.date_start ? disaster.date_start.slice(0, 10) : "date inconnue";
    const link = disaster.url
      ? `<div class="popup-link"><a href="${disaster.url}" target="_blank" rel="noopener">Voir sur ReliefWeb</a></div>`
      : "";
    return `
      <div class="popup-title">${escapeHTML(disaster.name)}</div>
      <div class="popup-meta">${escapeHTML(disaster.hazard_category)} · ${escapeHTML(country.name)} · ${date}</div>
      ${link}
      ${piroiResponseBlock(disaster, operationLookup)}
    `;
  }

  function piroiResponseBlock(disaster, operationLookup) {
    if (!disaster.piroi_response) return "";
    const ops = disaster.piroi_operation_ids.map((id) => operationLookup.get(id)).filter(Boolean);
    if (!ops.length) return "";

    const rows = ops
      .map((op) => {
        const parts = [];
        if (op.activities.length) parts.push(escapeHTML(op.activities.join(", ")));
        if (op.beneficiaries != null) parts.push(`${formatNumber(op.beneficiaries)} bénéficiaires`);
        if (op.budget_total != null) parts.push(`${formatNumber(op.budget_total)} € budget`);
        return `<div class="popup-op-row">${parts.join(" · ") || "détails non renseignés"}</div>`;
      })
      .join("");

    return `<div class="popup-response"><strong>Réponse PIROI</strong>${rows}</div>`;
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
          <span class="legend-swatch" style="background:${hazardColor(category)}"></span>
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
