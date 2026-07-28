// Trajectoires cycloniques IBTrACS. Chargement paresseux (cyclone_tracks.json fait ~23 Mo,
// pas de raison de l'imposer à tout le monde tant que la case n'est pas cochée).

const CYCLONE_TRACKS_PATH = "../data/clean/cyclone_tracks.json";

let cycloneTracksData = null;
let tracksLayerGroup = null;
let tracksEnabled = false;

async function ensureCycloneTracksLoaded() {
  if (cycloneTracksData) return cycloneTracksData;
  const response = await fetch(CYCLONE_TRACKS_PATH);
  if (!response.ok) throw new Error(`Échec du chargement des trajectoires : ${response.status}`);
  cycloneTracksData = await response.json();
  return cycloneTracksData;
}

function initTracksToggle(map, getIbtracsDisasters, getFilterState) {
  const checkbox = document.getElementById("filter-show-tracks");
  const label = document.getElementById("filter-tracks-text");
  const defaultLabel = label.textContent;

  tracksLayerGroup = L.layerGroup();

  checkbox.addEventListener("change", async () => {
    if (checkbox.checked) {
      checkbox.disabled = true;
      label.textContent = "Chargement des trajectoires…";
      try {
        await ensureCycloneTracksLoaded();
        tracksEnabled = true;
        tracksLayerGroup.addTo(map);
        renderTracks(getIbtracsDisasters(), getFilterState());
      } catch (err) {
        console.error(err);
        checkbox.checked = false;
        tracksEnabled = false;
      } finally {
        checkbox.disabled = false;
        label.textContent = defaultLabel;
      }
    } else {
      tracksEnabled = false;
      map.removeLayer(tracksLayerGroup);
    }
  });
}

function renderTracks(ibtracsDisasters, state) {
  if (!tracksEnabled || !cycloneTracksData) return;
  tracksLayerGroup.clearLayers();

  for (const d of ibtracsDisasters) {
    const year = d.date_start ? Number(d.date_start.slice(0, 4)) : null;
    if (year == null || year < state.yearMin || year > state.yearMax) continue;
    if (state.piroiResponseOnly && !d.piroi_response) continue;
    if (!d.territories_piroi_approches.some((iso3) => state.territories.has(iso3))) continue;

    const points = cycloneTracksData[d.id];
    if (!points || points.length < 2) continue;

    const polyline = L.polyline(
      points.map((p) => [p.lat, p.lon]),
      { color: hazardColor("Cyclone tropical"), weight: 2, opacity: 0.75, lineJoin: "round", lineCap: "round" }
    );
    polyline.bindPopup(trackPopupContent(d));
    tracksLayerGroup.addLayer(polyline);
  }
}

function trackPopupContent(disaster) {
  const start = disaster.date_start ? disaster.date_start.slice(0, 10) : "?";
  const end = disaster.date_end ? disaster.date_end.slice(0, 10) : "?";
  const wind = disaster.wind_max_kts != null ? `${disaster.wind_max_kts} kts` : "inconnu";
  const pressure = disaster.pressure_min_mb != null ? `${disaster.pressure_min_mb} mb` : "inconnue";
  return `
    <div class="popup-title">${escapeHTMLTracks(disaster.name)}</div>
    <div class="popup-meta">${start} → ${end}</div>
    <div class="popup-meta">Vent max : ${wind} · Pression min : ${pressure}</div>
  `;
}

function escapeHTMLTracks(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
