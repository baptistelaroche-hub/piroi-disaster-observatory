const SOUTH_AFRICA_ISO3_LIST = "zaf";
const DEFAULT_YEAR_MIN_LIST = 2000;
const DEFAULT_YEAR_MAX_LIST = new Date().getFullYear();
const STATUS_LABELS = { past: "Terminée", ongoing: "En cours", alert: "Alerte" };

(async function initList() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("disasters-tbody").textContent = "";
    document.getElementById("list-count").textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, piroiIso3, territories, operationById } = data;
  const reliefwebDisasters = disasters.filter((d) => d.source === "reliefweb");
  const allTerritoryOptions = [...territories, { iso3: SOUTH_AFRICA_ISO3_LIST, name: "Afrique du Sud", piroi_region: "Hors zone PIROI" }];
  const territoryByIso3 = new Map(allTerritoryOptions.map((t) => [t.iso3, t]));
  const allCategories = [...new Set(reliefwebDisasters.map((d) => d.hazard_category))];

  const state = {
    yearMin: DEFAULT_YEAR_MIN_LIST,
    yearMax: DEFAULT_YEAR_MAX_LIST,
    territories: new Set(piroiIso3),
    categories: new Set(allCategories),
    piroiResponseOnly: false,
    sortKey: "date_start",
    sortDir: "desc",
  };

  buildTerritoryFilterUI();
  buildCategoryFilterUI();
  wireFilterControls();
  wireSortableHeaders();
  render();

  function wireFilterControls() {
    const yearMinInput = document.getElementById("filter-year-min");
    const yearMaxInput = document.getElementById("filter-year-max");
    yearMinInput.value = state.yearMin;
    yearMaxInput.value = state.yearMax;
    yearMinInput.addEventListener("change", () => {
      state.yearMin = Number(yearMinInput.value) || DEFAULT_YEAR_MIN_LIST;
      render();
    });
    yearMaxInput.addEventListener("change", () => {
      state.yearMax = Number(yearMaxInput.value) || DEFAULT_YEAR_MAX_LIST;
      render();
    });

    document.getElementById("filter-piroi-response").addEventListener("change", (event) => {
      state.piroiResponseOnly = event.target.checked;
      render();
    });

    document.getElementById("filter-reset").addEventListener("click", () => {
      state.yearMin = DEFAULT_YEAR_MIN_LIST;
      state.yearMax = DEFAULT_YEAR_MAX_LIST;
      state.territories = new Set(piroiIso3);
      state.categories = new Set(allCategories);
      state.piroiResponseOnly = false;
      yearMinInput.value = state.yearMin;
      yearMaxInput.value = state.yearMax;
      document.getElementById("filter-piroi-response").checked = false;
      document.querySelectorAll(".territory-checkbox").forEach((cb) => (cb.checked = state.territories.has(cb.value)));
      document.querySelectorAll(".category-checkbox").forEach((cb) => (cb.checked = state.categories.has(cb.value)));
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
      group.innerHTML = `<span class="territory-region-label">${escapeHTMLList(region)}</span>`;
      for (const t of list) {
        const label = document.createElement("label");
        label.className = "territory-chip";
        const checked = state.territories.has(t.iso3);
        label.innerHTML = `<input type="checkbox" class="territory-checkbox" value="${t.iso3}" ${checked ? "checked" : ""}/> ${escapeHTMLList(t.name)}`;
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

  function buildCategoryFilterUI() {
    const container = document.getElementById("filter-categories");
    for (const category of allCategories) {
      const label = document.createElement("label");
      label.className = "territory-chip";
      label.innerHTML = `<input type="checkbox" class="category-checkbox" value="${escapeHTMLList(category)}" checked/> <span class="legend-swatch" style="background:${hazardColor(category)}"></span> ${escapeHTMLList(category)}`;
      label.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) state.categories.add(category);
        else state.categories.delete(category);
        render();
      });
      container.appendChild(label);
    }
  }

  function wireSortableHeaders() {
    document.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "asc";
        }
        render();
      });
    });
  }

  function matchedTerritories(disaster) {
    return disaster.iso3.filter((iso3) => state.territories.has(iso3)).map((iso3) => territoryByIso3.get(iso3));
  }

  // Un même événement peut être lié à plusieurs opérations PIROI (rare, ex. phases
  // successives) — on agrège : union des activités, somme des stocks/budget/bénéficiaires.
  function aggregateOperations(disaster) {
    const ops = disaster.piroi_operation_ids.map((id) => operationById.get(id)).filter(Boolean);
    if (!ops.length) return null;

    const activities = new Set();
    const items = new Map();
    let budget = null;
    let beneficiaries = null;

    for (const op of ops) {
      op.activities.forEach((a) => activities.add(a));
      for (const [item, qty] of Object.entries(op.items_distributed)) {
        if (qty == null) continue;
        items.set(item, (items.get(item) || 0) + qty);
      }
      if (op.budget_total != null) budget = (budget || 0) + op.budget_total;
      if (op.beneficiaries != null) beneficiaries = (beneficiaries || 0) + op.beneficiaries;
    }

    return { activities: [...activities], items, budget, beneficiaries };
  }

  function applyFilters() {
    return reliefwebDisasters.filter((d) => {
      if (!state.categories.has(d.hazard_category)) return false;
      if (state.piroiResponseOnly && !d.piroi_response) return false;
      const year = d.date_start ? Number(d.date_start.slice(0, 4)) : null;
      if (year == null || year < state.yearMin || year > state.yearMax) return false;
      return matchedTerritories(d).length > 0;
    });
  }

  function buildRows() {
    return applyFilters().map((d) => ({
      disaster: d,
      territoryNames: matchedTerritories(d).map((t) => t.name).join(", "),
      statusLabel: STATUS_LABELS[d.status] || d.status || "—",
      agg: aggregateOperations(d),
    }));
  }

  function sortValue(row, key) {
    switch (key) {
      case "territories":
        return row.territoryNames;
      case "status":
        return row.statusLabel;
      case "budget_total":
        return row.agg?.budget ?? -Infinity;
      case "beneficiaries":
        return row.agg?.beneficiaries ?? -Infinity;
      default:
        return row.disaster[key] ?? "";
    }
  }

  function sortRows(rows) {
    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, state.sortKey);
      const vb = sortValue(b, state.sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function render() {
    const rows = sortRows(buildRows());
    document.getElementById("list-count").textContent = `${formatNumberList(rows.length)} catastrophe${rows.length > 1 ? "s" : ""}`;

    const tbody = document.getElementById("disasters-tbody");
    tbody.innerHTML = rows.map(renderRow).join("");

    document.querySelectorAll("th[data-sort]").forEach((th) => {
      th.classList.toggle("th-sorted", th.dataset.sort === state.sortKey);
      th.dataset.sortDir = th.dataset.sort === state.sortKey ? state.sortDir : "";
    });
  }

  function renderRow({ disaster: d, territoryNames, statusLabel, agg }) {
    const date = d.date_start ? d.date_start.slice(0, 10) : "—";
    const responseBadge = d.piroi_response ? '<span class="table-response-badge" title="Réponse PIROI">✓</span>' : "—";
    const link = d.url ? `<a href="${d.url}" target="_blank" rel="noopener">Voir</a>` : "—";
    const activities = agg?.activities.length ? escapeHTMLList(agg.activities.join(", ")) : "—";
    const stocks = agg?.items.size
      ? escapeHTMLList([...agg.items].map(([item, qty]) => `${item}: ${qty.toLocaleString("fr-FR")}`).join(", "))
      : "—";
    const budget = agg?.budget != null ? `${formatNumberList(agg.budget)} €` : "—";
    const beneficiaries = agg?.beneficiaries != null ? formatNumberList(agg.beneficiaries) : "—";

    return `
      <tr>
        <td><a class="disaster-link" href="disaster.html?id=${encodeURIComponent(d.id)}">${escapeHTMLList(d.name)}</a></td>
        <td><span class="legend-swatch" style="background:${hazardColor(d.hazard_category)}"></span> ${escapeHTMLList(d.hazard_category)}</td>
        <td>${escapeHTMLList(territoryNames)}</td>
        <td class="table-date">${date}</td>
        <td>${escapeHTMLList(statusLabel)}</td>
        <td class="table-center">${responseBadge}</td>
        <td>${activities}</td>
        <td>${stocks}</td>
        <td class="table-date">${budget}</td>
        <td class="table-date">${beneficiaries}</td>
        <td>${link}</td>
      </tr>`;
  }

  function formatNumberList(n) {
    return n.toLocaleString("fr-FR");
  }

  function escapeHTMLList(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
})();
