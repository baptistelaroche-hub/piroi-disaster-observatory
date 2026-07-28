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

  const { disasters, countryByIso3, piroiIso3 } = data;
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
    const { markers, countsByCategory } = buildMarkers(inZone, countryByIso3);
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

  function buildMarkers(list, countryLookup) {
    const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40 });
    const countsByCategory = {};

    for (const disaster of list) {
      const country = countryLookup.get(disaster.primary_iso3);
      if (!country || country.lat == null || country.lon == null) continue;

      countsByCategory[disaster.hazard_category] = (countsByCategory[disaster.hazard_category] || 0) + 1;

      const color = hazardColor(disaster.hazard_category);
      const icon = L.divIcon({
        className: "hazard-marker",
        html: `<span style="background:${color}"></span>`,
        iconSize: [12, 12],
      });

      const marker = L.marker([country.lat, country.lon], { icon });
      marker.bindPopup(popupContent(disaster, country));
      clusterGroup.addLayer(marker);
    }

    return { markers: clusterGroup, countsByCategory };
  }

  function popupContent(disaster, country) {
    const date = disaster.date_start ? disaster.date_start.slice(0, 10) : "date inconnue";
    const link = disaster.url
      ? `<div class="popup-link"><a href="${disaster.url}" target="_blank" rel="noopener">Voir sur ReliefWeb</a></div>`
      : "";
    return `
      <div class="popup-title">${escapeHTML(disaster.name)}</div>
      <div class="popup-meta">${escapeHTML(disaster.hazard_category)} · ${escapeHTML(country.name)} · ${date}</div>
      ${link}
    `;
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

    legend.innerHTML = `<h2>Types d'aléas (ReliefWeb, zone PIROI)</h2>${rows || "<p>Aucun événement</p>"}`;
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
