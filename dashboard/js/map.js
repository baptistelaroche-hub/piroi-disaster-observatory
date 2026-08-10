const SOUTH_AFRICA_ISO3 = "zaf";
const DEFAULT_YEAR_MIN = 2000;
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

  const { disasters, piroiIso3, territories, cycloneStats, nationalSocietiesSummary } = data;
  // "reliefweb" = catastrophes ReliefWeb ; "piroi" = catastrophes synthétiques créées pour les
  // opérations PIROI sans aucune correspondance ReliefWeb/IBTrACS (sinon invisibles partout).
  const displayDisasters = disasters.filter((d) => d.source === "reliefweb" || d.source === "piroi");
  const ibtracsDisasters = disasters.filter((d) => d.source === "ibtracs");
  const allTerritoryOptions = [
    ...territories,
    // Position schématique (pas géographique) — cf. commentaire sur SCHEMATIC map plus bas.
    { iso3: SOUTH_AFRICA_ISO3, name: "Afrique du Sud", piroi_region: "Hors zone PIROI", schematic_x: 14, schematic_y: 88 },
  ];

  const state = {
    yearMin: DEFAULT_YEAR_MIN,
    yearMax: DEFAULT_YEAR_MAX,
    territories: new Set(piroiIso3), // Afrique du Sud exclue par défaut
    piroiResponseOnly: false,
    hiddenCategories: new Set(),
  };

  const mapContainer = document.getElementById("map");
  let openPopupIso3 = null;
  initSchematicBackground(mapContainer);

  initStaticCharts(cycloneStats);
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
  // rattacher qu'à son pays "primaire" ReliefWeb.
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

    renderTerritoryBubbles(visible, mapContainer);

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
  }

  // Carte schématique (façon reliefweb.int/disasters) : positions fixes curatées
  // (territory.schematic_x/y, en % du conteneur), pas la vraie latitude/longitude. Demande
  // explicite du PIROI Center après plusieurs correctifs sur la vraie carte géographique
  // (Leaflet/OpenStreetMap) — des territoires réellement proches (ex: Mayotte/Madagascar,
  // Maurice/Réunion) restaient visuellement difficiles à distinguer une fois le zoom verrouillé,
  // quelle que soit la précision des coordonnées. Ici, l'espacement est choisi pour la
  // lisibilité, l'orientation générale (nord/sud/est/ouest) reste cohérente avec la vraie
  // géographie mais sans prétention de précision — cf. README pour le détail des tentatives
  // précédentes. Ne trace plus les trajectoires cycloniques (pas de sens sur un fond non
  // géographique) : retiré à la demande du PIROI Center, la donnée reste consultable sur la
  // fiche de chaque cyclone (sa propre mini-carte réelle).
  function initSchematicBackground(container) {
    container.innerHTML = `
      <svg class="schematic-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="schematic-land" d="M0,0 L28,0 C34,10 30,20 26,28 C22,36 24,45 28,52 C32,60 30,68 24,74 C18,80 20,86 26,90 C30,93 28,97 22,100 L0,100 Z" />
        <path class="schematic-land" d="M46,15 C50,14 54,18 55,26 C56,36 54,48 52,58 C50,66 48,70 44,72 C41,73 39,68 40,60 C41,50 42,38 43,26 C44,19 45,16 46,15 Z" />
      </svg>
      <div class="schematic-bubbles"></div>
    `;

    // Ferme la popup ouverte en cliquant n'importe où ailleurs sur la carte.
    container.addEventListener("click", (event) => {
      if (!event.target.closest(".schematic-bubble")) closeSchematicPopup();
    });
  }

  function closeSchematicPopup() {
    openPopupIso3 = null;
    const popup = document.querySelector(".schematic-popup");
    if (popup) popup.remove();
  }

  function renderTerritoryBubbles(visibleDisasters, container) {
    const bubblesLayer = container.querySelector(".schematic-bubbles");
    bubblesLayer.innerHTML = "";
    closeSchematicPopup();

    const selectedTerritories = allTerritoryOptions.filter((t) => state.territories.has(t.iso3));

    for (const territory of selectedTerritories) {
      if (territory.schematic_x == null || territory.schematic_y == null) continue;

      const territoryDisasters = visibleDisasters
        .filter((d) => d.iso3.includes(territory.iso3))
        .sort((a, b) => (b.date_start || "").localeCompare(a.date_start || ""));

      if (!territoryDisasters.length) continue;

      const hasResponse = territoryDisasters.some((d) => d.piroi_response);
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = "schematic-bubble";
      bubble.style.left = `${territory.schematic_x}%`;
      bubble.style.top = `${territory.schematic_y}%`;
      bubble.setAttribute("aria-label", `${territory.name} — ${territoryDisasters.length} catastrophe(s)`);
      bubble.innerHTML = `
        <span class="schematic-bubble-count">${territoryDisasters.length}</span>
        ${hasResponse ? '<i class="response-badge" title="Réponse PIROI"></i>' : ""}
        <span class="schematic-bubble-label">${escapeHTML(territory.name)}</span>
      `;
      bubble.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSchematicPopup(bubble, territory, territoryDisasters);
      });
      bubblesLayer.appendChild(bubble);
    }
  }

  function toggleSchematicPopup(bubble, territory, territoryDisasters) {
    if (openPopupIso3 === territory.iso3) {
      closeSchematicPopup();
      return;
    }
    closeSchematicPopup();
    openPopupIso3 = territory.iso3;

    const popup = document.createElement("div");
    popup.className = "schematic-popup";
    popup.innerHTML = `
      <button type="button" class="schematic-popup-close" aria-label="Fermer">×</button>
      ${territoryPopupContent(territory, territoryDisasters)}
    `;
    popup.addEventListener("click", (event) => event.stopPropagation());
    popup.querySelector(".schematic-popup-close").addEventListener("click", closeSchematicPopup);
    mapContainer.appendChild(popup);

    positionSchematicPopup(popup, bubble);
  }

  function positionSchematicPopup(popup, bubble) {
    const containerRect = mapContainer.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;

    const bubbleCenterX = bubbleRect.left - containerRect.left + bubbleRect.width / 2;
    const bubbleTop = bubbleRect.top - containerRect.top;
    const bubbleBottom = bubbleRect.bottom - containerRect.top;

    let left = bubbleCenterX - popupWidth / 2;
    left = Math.max(8, Math.min(left, containerRect.width - popupWidth - 8));

    const showBelow = bubbleTop < popupHeight + 16;
    const top = showBelow ? bubbleBottom + 10 : bubbleTop - popupHeight - 10;

    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(8, top)}px`;
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
