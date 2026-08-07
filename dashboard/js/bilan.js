const BILAN_YEAR_MIN = 2026;

// Config par zone — curatée avec le PIROI Center (le 07/08/2026). Uniquement des liens vers
// des ressources externes (jamais d'embed d'un dashboard tiers non vérifié comme intégrable),
// sauf le graphique Mpox qui utilise l'API publique Odissé (CORS ouvert, vérifié).
const ZONE_RESOURCES = {
  regional: {
    name: "Régional – Océan Indien",
    reliefweb_url: null,
    sanitaire: { links: [] },
    meteo: { links: [{ label: "Bulletins ZCIT — Météo-France La Réunion", url: "http://www.meteo.fr/temps/domtom/La_Reunion/webcmrs9.0/francais/index.html" }] },
  },
  mdg: {
    name: "Madagascar",
    reliefweb_url: "https://reliefweb.int/country/mdg",
    sanitaire: { links: [] },
    meteo: {
      links: [
        { label: "Prévision hebdomadaire — Météo Madagascar", url: "https://www.meteomadagascar.mg/prevision/prevision-hebdomadaire/" },
        { label: "Vigilance — Météo Madagascar", url: "https://www.meteomadagascar.mg/vigilance/" },
      ],
    },
  },
  moz: {
    name: "Mozambique",
    reliefweb_url: "https://reliefweb.int/country/moz",
    sanitaire: {
      who_cholera: true,
      links: [{ label: "WHO Global Cholera and AWD Dashboard", url: "https://www.who.int/emergencies/surveillance/cholera-cases-and-deaths" }],
    },
    meteo: { links: [{ label: "Prévision à 4 jours — INAM Mozambique", url: "https://inam.gov.mz/produtos/previs%C3%A3o-de-4-dias/" }] },
  },
  tza: {
    name: "Tanzanie",
    reliefweb_url: "https://reliefweb.int/country/tza",
    sanitaire: {
      who_cholera: true,
      links: [{ label: "WHO Global Cholera and AWD Dashboard", url: "https://www.who.int/emergencies/surveillance/cholera-cases-and-deaths" }],
    },
    meteo: { links: [{ label: "Prévisions à 10 jours — TMA Tanzanie", url: "https://www.meteo.go.tz/ten_days_forecasts" }] },
  },
  syc: {
    name: "Seychelles",
    reliefweb_url: "https://reliefweb.int/country/syc",
    sanitaire: { links: [] },
    meteo: { links: [] },
  },
  mus: {
    name: "Île Maurice",
    reliefweb_url: "https://reliefweb.int/country/mus",
    sanitaire: { links: [] },
    meteo: { links: [{ label: "Bulletins ZCIT — Météo-France La Réunion", url: "http://www.meteo.fr/temps/domtom/La_Reunion/webcmrs9.0/francais/index.html" }] },
  },
  com: {
    name: "Comores",
    reliefweb_url: "https://reliefweb.int/country/com",
    sanitaire: { links: [] },
    meteo: { links: [{ label: "Bulletin météorologique spécial — Météo Comores", url: "https://meteocomores.km/produits/bulletin-m%C3%A9t%C3%A9orologie-sp%C3%A9cial/" }] },
  },
  reu: {
    name: "La Réunion",
    reliefweb_url: "https://reliefweb.int/country/reu",
    sanitaire: {
      spf_mpox: true,
      odisse_region_code: 4,
      links: [{ label: "Publications — Santé publique France Océan Indien", url: "https://www.santepubliquefrance.fr/ocean-indien" }],
    },
    meteo: { links: [{ label: "Bulletins climatiques mensuels — Météo-France La Réunion", url: "https://meteofrance.re/fr/climat/bulletins-mensuels" }] },
  },
  myt: {
    name: "Mayotte",
    reliefweb_url: "https://reliefweb.int/country/myt",
    sanitaire: {
      spf_mpox: true,
      odisse_region_code: 6,
      links: [{ label: "Publications — Santé publique France Océan Indien", url: "https://www.santepubliquefrance.fr/ocean-indien" }],
    },
    meteo: { links: [{ label: "Prévision saisonnière — Météo-France Mayotte (juillet 2026)", url: "https://meteofrance.yt/fr/climat/prevision-saisonniere-mayotte-juillet-2026" }] },
  },
};
const ZONE_ORDER = ["regional", "mdg", "moz", "tza", "syc", "mus", "com", "reu", "myt"];

(async function initBilan() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("bilan-content").textContent = "Erreur de chargement des données : " + err.message;
    console.error(err);
    return;
  }

  const { disasters, piroiOperations, territories, nationalSocietiesSummary } = data;
  // "reliefweb" = catastrophes ReliefWeb ; "piroi" = catastrophes synthétiques (opérations PIROI
  // sans catastrophe internationale correspondante) — mêmes deux sources que la carte/liste.
  const displayDisasters = disasters.filter((d) => d.source === "reliefweb" || d.source === "piroi");
  const piroiIso3List = territories.map((t) => t.iso3);
  const nsSummaryByIso3 = new Map(nationalSocietiesSummary.map((t) => [t.iso3, t]));

  const params = new URLSearchParams(window.location.search);
  const state = {
    zone: ZONE_RESOURCES[params.get("zone")] ? params.get("zone") : "regional",
    section: ["bilan", "sanitaire", "meteo"].includes(params.get("section")) ? params.get("section") : "bilan",
  };

  buildZoneTabs();
  wireSectionTabs();
  render();

  function buildZoneTabs() {
    const container = document.getElementById("zone-tabs");
    container.innerHTML = ZONE_ORDER.map(
      (iso3) => `<button type="button" class="zone-tab" data-zone="${iso3}">${escapeHTML(ZONE_RESOURCES[iso3].name)}</button>`
    ).join("");
    container.querySelectorAll(".zone-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.zone = btn.dataset.zone;
        updateUrl();
        render();
      });
    });
  }

  function wireSectionTabs() {
    document.querySelectorAll(".section-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.section = btn.dataset.section;
        updateUrl();
        render();
      });
    });
  }

  function updateUrl() {
    const p = new URLSearchParams();
    p.set("zone", state.zone);
    p.set("section", state.section);
    history.replaceState(null, "", `?${p.toString()}`);
  }

  function zoneTerritories() {
    return state.zone === "regional" ? piroiIso3List : [state.zone];
  }

  function render() {
    document.querySelectorAll(".zone-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.zone === state.zone));
    document.querySelectorAll(".section-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.section === state.section));

    const container = document.getElementById("bilan-content");
    if (state.section === "bilan") renderBilan(container);
    else if (state.section === "sanitaire") renderSanitaire(container);
    else renderMeteo(container);

    // Relance l'animation d'entrée à chaque changement de zone/onglet (retrait puis réajout de
    // la classe pour forcer le navigateur à rejouer le keyframe).
    container.classList.remove("fade-in");
    void container.offsetWidth;
    container.classList.add("fade-in");
  }

  // --- Bilan 2026 ---

  function zoneDisasters() {
    const isos = new Set(zoneTerritories());
    return displayDisasters.filter((d) => {
      if (!d.iso3.some((iso3) => isos.has(iso3))) return false;
      const year = d.date_start ? Number(d.date_start.slice(0, 4)) : null;
      return year != null && year >= BILAN_YEAR_MIN;
    });
  }

  function zoneEmdatTotals(zoneDis) {
    const isos = new Set(zoneTerritories());
    const totals = { deaths: null, injured: null, affected: null, damage: null };
    const acc = { deaths: 0, injured: 0, affected: 0, damage: 0 };
    const has = { deaths: false, injured: false, affected: false, damage: false };

    for (const d of zoneDis) {
      for (const e of d.emdat) {
        if (!isos.has(e.iso3)) continue;
        if (e.total_deaths != null) { acc.deaths += e.total_deaths; has.deaths = true; }
        if (e.no_injured != null) { acc.injured += e.no_injured; has.injured = true; }
        if (e.total_affected != null) { acc.affected += e.total_affected; has.affected = true; }
        if (e.total_damage_000_usd != null) { acc.damage += e.total_damage_000_usd; has.damage = true; }
      }
    }
    for (const key of Object.keys(totals)) totals[key] = has[key] ? acc[key] : null;
    return totals;
  }

  function zoneOperations() {
    const isos = new Set(zoneTerritories());
    return piroiOperations.filter((op) => isos.has(op.iso3) && op.year != null && op.year >= BILAN_YEAR_MIN);
  }

  function renderBilan(container) {
    const zoneDis = zoneDisasters();
    const emdat = zoneEmdatTotals(zoneDis);
    const ops = zoneOperations();
    const beneficiaries = ops.reduce((sum, op) => (op.beneficiaries != null ? sum + op.beneficiaries : sum), 0);
    const hasBeneficiaries = ops.some((op) => op.beneficiaries != null);

    const byType = new Map();
    for (const d of zoneDis) byType.set(d.hazard_category, (byType.get(d.hazard_category) || 0) + 1);
    const typeRows = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([cat, n]) =>
          `<li>${hazardBadge(cat, 18)} ${escapeHTML(cat)}<span class="popup-list-date">${n}</span></li>`
      )
      .join("");

    const fmt = (n, suffix = "") => (n == null ? "—" : `${n.toLocaleString("fr-FR")}${suffix}`);
    const zone = ZONE_RESOURCES[state.zone];
    const reliefwebLink = zone.reliefweb_url
      ? `<p><a class="disaster-link" href="${zone.reliefweb_url}" target="_blank" rel="noopener">Page pays ReliefWeb</a></p>`
      : "";

    container.innerHTML = `
      <h2>${escapeHTML(zone.name)} — Bilan ${BILAN_YEAR_MIN}</h2>
      ${reliefwebLink}
      <div class="bilan-grid">
        <div class="disaster-card">
          <h3>Catastrophes depuis ${BILAN_YEAR_MIN}</h3>
          <p class="bilan-figure">${fmt(zoneDis.length)}</p>
          <ul class="popup-disaster-list">${typeRows || "<li>Aucune</li>"}</ul>
        </div>
        <div class="disaster-card">
          <h3>Impact (EM-DAT)</h3>
          <dl class="detail-stats">
            <dt>Personnes affectées</dt><dd>${fmt(emdat.affected)}</dd>
            <dt>Blessés</dt><dd>${fmt(emdat.injured)}</dd>
            <dt>Morts</dt><dd>${fmt(emdat.deaths)}</dd>
            <dt>Dégâts</dt><dd>${fmt(emdat.damage, " k$")}</dd>
          </dl>
          <p class="chart-subtitle">Uniquement les catastrophes rattachées à une entrée EM-DAT — couverture partielle, cf. page liste.</p>
        </div>
        <div class="disaster-card">
          <h3>Réponse PIROI</h3>
          <dl class="detail-stats">
            <dt>Interventions PIROI</dt><dd>${fmt(ops.length)}</dd>
            <dt>Bénéficiaires</dt><dd>${hasBeneficiaries ? fmt(beneficiaries) : "—"}</dd>
          </dl>
        </div>
      </div>
      ${renderCountryCard()}
    `;
  }

  // --- Fiche pays (indicateurs de contexte IFRC) ---

  function renderCountryCard() {
    const zone = ZONE_RESOURCES[state.zone];

    if (state.zone === "regional") {
      return `
        <div class="disaster-card">
          <h3>Fiche pays</h3>
          <p class="chart-subtitle">Sélectionnez un territoire pour afficher sa fiche pays (indicateurs IFRC).</p>
        </div>`;
    }

    const ns = nsSummaryByIso3.get(state.zone);
    if (!ns) {
      return `
        <div class="disaster-card">
          <h3>Fiche pays</h3>
          <p class="chart-subtitle">Pas de Société nationale distincte pour ${escapeHTML(zone.name)} — rattachée à la Croix-Rouge française, donc pas de données pays IFRC séparées pour ce territoire.</p>
        </div>`;
    }

    const c = ns.context;
    const fmtEntry = (entry, formatter) => (entry.value == null ? "—" : `${formatter(entry.value)} <span class="detail-tag">(${entry.year})</span>`);
    const pct = (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

    return `
      <div class="disaster-card">
        <h3>Fiche pays — ${escapeHTML(zone.name)}</h3>
        <dl class="detail-stats">
          <dt>PIB</dt><dd>${fmtEntry(c.gdp, (v) => `${(v / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Md$`)}</dd>
          <dt>RNB par habitant</dt><dd>${fmtEntry(c.gni_per_capita, (v) => `${Math.round(v).toLocaleString("fr-FR")} $/hab`)}</dd>
          <dt>Taux de pauvreté</dt><dd>${fmtEntry(c.poverty_rate, pct)}</dd>
          <dt>Espérance de vie</dt><dd>${fmtEntry(c.life_expectancy, (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ans`)}</dd>
          <dt>Mortalité infantile (-5 ans)</dt><dd>${fmtEntry(c.child_mortality_rate, (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ‰`)}</dd>
          <dt>Taux d'alphabétisation</dt><dd>${fmtEntry(c.literacy_rate, pct)}</dd>
          <dt>Population urbaine</dt><dd>${fmtEntry(c.urban_population_pct, pct)}</dd>
          <dt>Mortalité maternelle</dt><dd>${fmtEntry(c.maternal_mortality_rate, (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 100 000 naiss.`)}</dd>
        </dl>
        <p class="chart-subtitle">Source : IFRC (FDRS) — dernière valeur connue par indicateur, année de référence entre parenthèses (jamais la même pour tous : le PIB peut dater de 2022, le taux de pauvreté de 2012).</p>
      </div>`;
  }

  // --- Sanitaire ---

  function renderSanitaire(container) {
    const zone = ZONE_RESOURCES[state.zone];
    const res = zone.sanitaire;
    const linksHtml = res.links
      .map((l) => `<div class="disaster-card"><a class="disaster-link" href="${l.url}" target="_blank" rel="noopener">${escapeHTML(l.label)}</a></div>`)
      .join("");

    const whoNote = res.who_cholera
      ? `<div class="disaster-card"><h3>Indicateurs à consulter sur le dashboard</h3><p>Cumulative cases · Cases reported in the last 28 days · Cumulative deaths</p></div>`
      : "";

    const mpoxHtml = res.spf_mpox
      ? `<div class="disaster-card">
          <h3>Focus Mpox — cas mensuels confirmés depuis ${BILAN_YEAR_MIN}</h3>
          <div class="chart-canvas-wrap" style="height:260px;"><canvas id="mpox-chart"></canvas></div>
          <p class="chart-subtitle">Source : Santé publique France, données Odissé (mpox-incidence-selon-le-sexe-region)</p>
        </div>`
      : "";

    const noExternalResource = res.links.length === 0 && !res.who_cholera && !res.spf_mpox;
    const fallback = noExternalResource ? zoneHealthDisastersFallback() : "";

    container.innerHTML = `<h2>${escapeHTML(zone.name)} — Sanitaire</h2>${linksHtml}${whoNote}${mpoxHtml}${fallback}`;

    if (res.spf_mpox) loadMpoxChart(res.odisse_region_code);
  }

  function zoneHealthDisastersFallback() {
    const isos = new Set(zoneTerritories());
    const zoneDis = displayDisasters
      .filter((d) => d.hazard_category === "Crise sanitaire" && d.iso3.some((iso3) => isos.has(iso3)))
      .sort((a, b) => (b.date_start || "").localeCompare(a.date_start || ""))
      .slice(0, 8);

    const rows = zoneDis
      .map(
        (d) =>
          `<li><a href="disaster.html?id=${encodeURIComponent(d.id)}">${escapeHTML(d.name)}</a><span class="popup-list-date">${d.date_start ? d.date_start.slice(0, 10) : "?"}</span></li>`
      )
      .join("");

    return `
      <div class="disaster-card">
        <h3>Aucune ressource externe configurée pour cette zone</h3>
        <p>Crises sanitaires enregistrées dans l'observatoire (les plus récentes) :</p>
        <ul class="popup-disaster-list">${rows || "<li>Aucune catastrophe sanitaire enregistrée</li>"}</ul>
      </div>`;
  }

  async function loadMpoxChart(regionCode) {
    const canvas = document.getElementById("mpox-chart");
    if (!canvas) return;
    try {
      const where = `reg=${regionCode} and sexe="Hommes et Femmes" and date_complet>=date'${BILAN_YEAR_MIN}-01-01'`;
      const url =
        "https://odisse.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets/mpox-incidence-selon-le-sexe-region/records/" +
        `?where=${encodeURIComponent(where)}&order_by=date_complet%20asc&limit=100`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();

      const byMonth = new Map();
      for (const rec of payload.results) {
        const month = rec.date_complet.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) || 0) + (rec.n_conf || 0));
      }
      const months = [...byMonth.keys()].sort();

      const font = { family: "'Lato', system-ui, -apple-system, 'Segoe UI', sans-serif" };
      const textColor = getComputedStyle(document.body).getPropertyValue("--text-secondary").trim() || "#52514e";
      const gridColor = getComputedStyle(document.body).getPropertyValue("--gridline").trim() || "#e1e0d9";

      new Chart(canvas, {
        type: "bar",
        data: {
          labels: months,
          datasets: [{ label: "Cas confirmés", data: months.map((m) => byMonth.get(m)), backgroundColor: "#e30613", maxBarThickness: 24, borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor, font }, grid: { display: false } },
            y: { ticks: { color: textColor, font, precision: 0 }, grid: { color: gridColor, drawTicks: false }, beginAtZero: true },
          },
        },
      });
    } catch (err) {
      canvas.parentElement.innerHTML = "Erreur de chargement des données Mpox (Odissé) : " + err.message;
      console.error(err);
    }
  }

  // --- Météorologique ---

  function renderMeteo(container) {
    const zone = ZONE_RESOURCES[state.zone];
    const res = zone.meteo;
    const linksHtml = res.links
      .map((l) => `<div class="disaster-card"><a class="disaster-link" href="${l.url}" target="_blank" rel="noopener">${escapeHTML(l.label)}</a></div>`)
      .join("");
    container.innerHTML = `<h2>${escapeHTML(zone.name)} — Météorologique</h2>${linksHtml || '<div class="disaster-card"><p>Aucune ressource configurée pour cette zone.</p></div>'}`;
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
})();
