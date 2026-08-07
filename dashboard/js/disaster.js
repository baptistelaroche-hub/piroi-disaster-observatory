const STATUS_LABELS_DETAIL = { past: "Terminée", ongoing: "En cours", alert: "Alerte" };
const CYCLONE_TRACKS_PATH_DETAIL = "../data/clean/cyclone_tracks.json";

(async function initDisasterPage() {
  const container = document.getElementById("disaster-content");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    container.textContent = "Aucune catastrophe spécifiée (paramètre ?id= manquant dans l'URL).";
    return;
  }

  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    container.textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, countryByIso3, territories, operationById } = data;
  const territoryByIso3 = new Map(territories.map((t) => [t.iso3, t]));
  const disaster = disasters.find((d) => d.id === id);

  if (!disaster) {
    container.textContent = `Catastrophe introuvable pour l'identifiant "${id}".`;
    return;
  }

  document.title = `${disaster.name} — PIROI Disaster Observatory`;
  container.innerHTML = renderDisaster(disaster, territoryByIso3, operationById);

  if (disaster.source === "ibtracs") {
    loadTrackMap(disaster);
  }

  function renderDisaster(d, territoryByIso3, operationById) {
    const dateStart = d.date_start ? d.date_start.slice(0, 10) : "—";
    const dateEnd = d.date_end ? d.date_end.slice(0, 10) : "—";
    const territoryNames = d.iso3.length
      ? d.iso3.map((iso3) => territoryByIso3.get(iso3)?.name || countryByIso3.get(iso3)?.name || iso3).join(", ")
      : d.territories_piroi_approches.map((iso3) => territoryByIso3.get(iso3)?.name || iso3).join(", ") || "—";
    const statusLabel = STATUS_LABELS_DETAIL[d.status] || d.status || "—";

    return `
      <div class="disaster-header">
        <span class="legend-swatch" style="background:${hazardColor(d.hazard_category)}"></span>
        <h2>${escapeHTML(d.name)}</h2>
      </div>
      <p class="disaster-meta">${escapeHTML(d.hazard_category)} · ${escapeHTML(territoryNames)} · ${dateStart} → ${dateEnd} · ${escapeHTML(statusLabel)}</p>

      ${d.url ? `<p><a href="${d.url}" target="_blank" rel="noopener">Voir sur ReliefWeb</a></p>` : ""}
      ${d.description ? `<div class="disaster-card"><h3>Description</h3><p>${escapeHTML(d.description)}</p></div>` : ""}

      ${renderCycloneStats(d)}
      ${renderPiroiResponse(d, operationById)}
      ${renderEmdat(d)}

      <div id="track-map-wrap" class="disaster-card" style="display:none;">
        <h3>Trajectoire</h3>
        <div id="track-map" style="height:360px;"></div>
      </div>
    `;
  }

  function renderCycloneStats(d) {
    if (d.source !== "ibtracs") return "";
    const wind = d.wind_max_kts != null ? `${d.wind_max_kts} kts` : "inconnu";
    const pressure = d.pressure_min_mb != null ? `${d.pressure_min_mb} mb` : "inconnue";
    return `
      <div class="disaster-card">
        <h3>Données cycloniques (IBTrACS)</h3>
        <dl class="detail-stats">
          <dt>Vent maximum</dt><dd>${wind}</dd>
          <dt>Pression minimale</dt><dd>${pressure}</dd>
        </dl>
      </div>`;
  }

  function renderPiroiResponse(d, operationById) {
    if (!d.piroi_response) {
      return `<div class="disaster-card"><h3>Réponse PIROI</h3><p>Aucune opération PIROI rattachée à cette catastrophe.</p></div>`;
    }
    const ops = d.piroi_operation_ids.map((opId) => operationById.get(opId)).filter(Boolean);
    const rows = ops
      .map((op) => {
        const items = [...Object.entries(op.items_distributed)]
          .filter(([, qty]) => qty != null)
          .map(([item, qty]) => `${item}: ${qty.toLocaleString("fr-FR")}`)
          .join(", ");
        return `
          <div class="op-block">
            <p class="op-block-title">${escapeHTML(op.year_month || String(op.year) || "")} — ${escapeHTML(op.activities.join(", ") || "activités non renseignées")}</p>
            <dl class="detail-stats">
              <dt>Bénéficiaires</dt><dd>${op.beneficiaries != null ? op.beneficiaries.toLocaleString("fr-FR") : "—"}</dd>
              <dt>Budget</dt><dd>${op.budget_total != null ? op.budget_total.toLocaleString("fr-FR") + " €" : "—"}</dd>
              <dt>Déploiement de stocks</dt><dd>${items ? escapeHTML(items) : "—"}</dd>
            </dl>
          </div>`;
      })
      .join("");
    return `<div class="disaster-card"><h3>Réponse PIROI</h3>${rows}</div>`;
  }

  function renderEmdat(d) {
    if (!d.emdat.length) {
      return `<div class="disaster-card"><h3>Données EM-DAT</h3><p>Aucune correspondance EM-DAT trouvée pour cette catastrophe.</p></div>`;
    }
    const rows = d.emdat
      .map((e) => {
        const fmt = (n, suffix = "") => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")}${suffix}`);
        return `
          <div class="op-block">
            <p class="op-block-title">${escapeHTML(e.country)} — ${escapeHTML(e.disno)} <span class="detail-tag">${e.match_type === "glide" ? "rattaché par GLIDE" : "rattaché par nom"}</span></p>
            <dl class="detail-stats">
              <dt>Morts</dt><dd>${fmt(e.total_deaths)}</dd>
              <dt>Blessés</dt><dd>${fmt(e.no_injured)}</dd>
              <dt>Affectés</dt><dd>${fmt(e.no_affected)}</dd>
              <dt>Sans-abri</dt><dd>${fmt(e.no_homeless)}</dd>
              <dt>Total affectés</dt><dd>${fmt(e.total_affected)}</dd>
              <dt>Dégâts totaux</dt><dd>${fmt(e.total_damage_000_usd, " k$")}</dd>
              <dt>Localisation</dt><dd>${e.location ? escapeHTML(e.location) : "—"}</dd>
              <dt>Origine</dt><dd>${e.origin ? escapeHTML(e.origin) : "—"}</dd>
              <dt>Magnitude</dt><dd>${e.magnitude != null ? `${e.magnitude} ${escapeHTML(e.magnitude_scale || "")}` : "—"}</dd>
            </dl>
          </div>`;
      })
      .join("");
    return `<div class="disaster-card"><h3>Données EM-DAT</h3>${rows}</div>`;
  }

  async function loadTrackMap(d) {
    try {
      const response = await fetch(CYCLONE_TRACKS_PATH_DETAIL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const tracks = await response.json();
      const points = tracks[d.id];
      if (!points || points.length < 2) return;

      const wrap = document.getElementById("track-map-wrap");
      wrap.style.display = "";
      const map = L.map("track-map");
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const latlngs = points.map((p) => [p.lat, p.lon]);
      const polyline = L.polyline(latlngs, { color: hazardColor("Cyclone tropical"), weight: 3 }).addTo(map);
      map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
    } catch (err) {
      console.error("Erreur de chargement de la trajectoire :", err);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
})();
