const SOUTH_AFRICA_ISO3 = "zaf";

(async function initDashboard() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("map").textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, countryByIso3, piroiIso3, operationById } = data;
  const reliefwebDisasters = disasters.filter((d) => d.source === "reliefweb");

  const map = initMap();
  let currentLayer = null;

  render(false);

  document.getElementById("include-zaf").addEventListener("change", (event) => {
    render(event.target.checked);
  });

  function render(includeZaf) {
    const zoneIso3 = new Set(piroiIso3);
    if (includeZaf) zoneIso3.add(SOUTH_AFRICA_ISO3);

    const inZone = reliefwebDisasters.filter((d) => zoneIso3.has(d.primary_iso3));

    if (currentLayer) map.removeLayer(currentLayer);
    const { markers, countsByCategory } = buildMarkers(inZone, countryByIso3, operationById);
    markers.addTo(map);
    currentLayer = markers;

    renderStatTiles(inZone);
    renderLegend(countsByCategory);
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

  function buildMarkers(list, countryLookup, operationLookup) {
    const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40 });
    const countsByCategory = {};

    for (const disaster of list) {
      const country = countryLookup.get(disaster.primary_iso3);
      if (!country || country.lat == null || country.lon == null) continue;

      countsByCategory[disaster.hazard_category] = (countsByCategory[disaster.hazard_category] || 0) + 1;

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

    return { markers: clusterGroup, countsByCategory };
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

  function renderStatTiles(inZone) {
    const cyclonesInZone = disasters.filter(
      (d) => d.source === "ibtracs" && d.territories_piroi_approches.length > 0
    ).length;
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
    const categories = Object.keys(countsByCategory).sort((a, b) => countsByCategory[b] - countsByCategory[a]);

    const rows = categories
      .map(
        (category) => `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${hazardColor(category)}"></span>
          <span>${escapeHTML(category)}</span>
          <span class="legend-count">${formatNumber(countsByCategory[category])}</span>
        </div>`
      )
      .join("");

    legend.innerHTML = `
      <h2>Types d'aléas (ReliefWeb, zone PIROI)</h2>${rows || "<p>Aucun événement</p>"}
      <div class="legend-row legend-response-note">
        <span class="legend-swatch legend-swatch--badge"></span>
        <span>Réponse PIROI</span>
      </div>
    `;
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
