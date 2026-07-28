// Graphiques Chart.js. Les graphiques "par année" et "par territoire" sont dynamiques —
// reçoivent la même liste filtrée que la carte (mêmes filtres, mêmes chiffres partout).
// La saisonnalité cyclonique reste statique (cyclone_stats.json, historique complet 178 ans).

// Ordre fixe des catégories dans les barres empilées — jamais réassigné dynamiquement selon
// ce qui est présent, pour que la couleur d'une catégorie reste stable d'un rendu à l'autre.
// Les 4 catégories à faible effectif (cf. skill dataviz : au-delà de 8 teintes validées, on
// replie) sont regroupées sous "Autre" pour rester lisible dans un empilement.
const STACK_CATEGORY_ORDER = [
  "Cyclone tropical",
  "Volcan",
  "Inondation",
  "Sécheresse",
  "Glissement de terrain",
  "Crise sanitaire",
  "Cyclone/tempête",
  "Séisme",
];
const STACK_OTHER_LABEL = "Autre (regroupé)";

const SEQUENTIAL_BLUE = "#2a78d6";
const CHART_FONT = { family: "system-ui, -apple-system, 'Segoe UI', sans-serif" };

let byYearChart = null;
let byTerritoryChart = null;
let seasonalityChart = null;

function chartTextColor() {
  return getComputedStyle(document.body).getPropertyValue("--text-secondary").trim() || "#52514e";
}

function chartGridColor() {
  return getComputedStyle(document.body).getPropertyValue("--gridline").trim() || "#e1e0d9";
}

function baseScaleOptions() {
  return {
    ticks: { color: chartTextColor(), font: CHART_FONT },
    grid: { color: chartGridColor(), drawTicks: false },
    border: { display: false },
  };
}

function initStaticCharts(cycloneStats) {
  const ctx = document.getElementById("chart-seasonality");
  const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  seasonalityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: "Tempêtes",
          data: cycloneStats.by_month.map((m) => m.count),
          backgroundColor: SEQUENTIAL_BLUE,
          maxBarThickness: 24,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...baseScaleOptions(), grid: { display: false } },
        y: { ...baseScaleOptions(), beginAtZero: true },
      },
    },
  });
}

function updateByYearChart(visibleDisasters, yearMin, yearMax) {
  const counts = new Map();
  for (let y = yearMin; y <= yearMax; y++) counts.set(y, 0);
  for (const d of visibleDisasters) {
    if (!d.date_start) continue;
    const year = Number(d.date_start.slice(0, 4));
    if (counts.has(year)) counts.set(year, counts.get(year) + 1);
  }
  const labels = [...counts.keys()];
  const values = [...counts.values()];

  if (!byYearChart) {
    byYearChart = new Chart(document.getElementById("chart-by-year"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Catastrophes", data: values, backgroundColor: SEQUENTIAL_BLUE, maxBarThickness: 24, borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...baseScaleOptions(), grid: { display: false } },
          y: { ...baseScaleOptions(), beginAtZero: true, ticks: { ...baseScaleOptions().ticks, precision: 0 } },
        },
      },
    });
  } else {
    byYearChart.data.labels = labels;
    byYearChart.data.datasets[0].data = values;
    byYearChart.update();
  }
}

function categoryForStack(category) {
  return STACK_CATEGORY_ORDER.includes(category) ? category : STACK_OTHER_LABEL;
}

function updateByTerritoryChart(disastersList, selectedTerritories) {
  // selectedTerritories : liste ordonnée {iso3, name} des territoires actuellement cochés.
  // Compte un événement dans TOUS les territoires sélectionnés qu'il touche (liste complète
  // des pays ReliefWeb, pas seulement le pays "primaire") : un cyclone régional comme Chido
  // touche à la fois Mayotte, Madagascar, Comores et Mozambique — le limiter au pays primaire
  // sous-représenterait fortement les territoires rarement "primaires" (Mayotte, La Réunion).
  const stackLabels = [...STACK_CATEGORY_ORDER, STACK_OTHER_LABEL];
  const countsByTerritoryCategory = new Map(selectedTerritories.map((t) => [t.iso3, new Map(stackLabels.map((l) => [l, 0]))]));

  for (const d of disastersList) {
    const key = categoryForStack(d.hazard_category);
    for (const iso3 of d.iso3) {
      const territoryCounts = countsByTerritoryCategory.get(iso3);
      if (!territoryCounts) continue;
      territoryCounts.set(key, territoryCounts.get(key) + 1);
    }
  }

  const labels = selectedTerritories.map((t) => t.name);
  const datasets = stackLabels.map((category) => ({
    label: category,
    data: selectedTerritories.map((t) => countsByTerritoryCategory.get(t.iso3).get(category)),
    backgroundColor: category === STACK_OTHER_LABEL ? HAZARD_COLOR_FALLBACK : hazardColor(category),
    maxBarThickness: 20,
  }));

  if (!byTerritoryChart) {
    byTerritoryChart = new Chart(document.getElementById("chart-by-territory"), {
      type: "bar",
      data: { labels, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: chartTextColor(), font: CHART_FONT, boxWidth: 10, boxHeight: 10 } },
        },
        scales: {
          x: { ...baseScaleOptions(), stacked: true, beginAtZero: true, ticks: { ...baseScaleOptions().ticks, precision: 0 } },
          y: { ...baseScaleOptions(), stacked: true, grid: { display: false } },
        },
      },
    });
  } else {
    byTerritoryChart.data.labels = labels;
    byTerritoryChart.data.datasets = datasets;
    byTerritoryChart.update();
  }
}

function renderNsCards(nsSummary, selectedIso3) {
  const container = document.getElementById("ns-cards");
  const cards = nsSummary
    .filter((t) => selectedIso3.has(t.iso3))
    .map((t) => {
      const c = t.capacity;
      const ctx = t.context;
      const fmt = (entry, suffix = "") => (entry.value == null ? "—" : `${Number(entry.value).toLocaleString("fr-FR")}${suffix} (${entry.year})`);
      return `
        <div class="ns-card">
          <h3>${escapeHTMLChart(t.territory_name)}</h3>
          <p class="ns-card-subtitle">${escapeHTMLChart(t.national_society_name)}</p>
          <dl class="ns-card-stats">
            <dt>Branches</dt><dd>${fmt(c.branches)}</dd>
            <dt>Volontaires</dt><dd>${fmt(c.volunteers)}</dd>
            <dt>Staff rémunéré</dt><dd>${fmt(c.paid_staff)}</dd>
            <dt>Population</dt><dd>${fmt(ctx.population)}</dd>
            <dt>Taux de pauvreté</dt><dd>${fmt(ctx.poverty_rate, "%")}</dd>
            <dt>Population urbaine</dt><dd>${fmt(ctx.urban_population_pct, "%")}</dd>
            <dt>Catastrophes liées</dt><dd>${t.disasters.total_events} (dont ${t.disasters.total_cyclones} cyclones)</dd>
          </dl>
        </div>`;
    })
    .join("");

  container.innerHTML = cards || "<p>Aucun territoire sélectionné</p>";
}

function escapeHTMLChart(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
