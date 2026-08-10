// Chargement des données CLEAN / ANALYTICS consommées par le dashboard.
const DATA_PATHS = {
  disasters: "../data/clean/disasters.json",
  countries: "../data/reference/countries.json",
  globalIndicators: "../data/analytics/global_indicators.json",
  territories: "../data/reference/territories.json",
  piroiOperations: "../data/clean/piroi_operations.json",
  cycloneStats: "../data/analytics/cyclone_stats.json",
  nationalSocietiesSummary: "../data/analytics/national_societies_summary.json",
};

async function fetchJSON(path) {
  // cache: "no-store" — ces fichiers sont régénérés par les workflows automatiques (quotidien/
  // hebdomadaire) ou par des mises à jour manuelles ; un fetch() par défaut peut rester en cache
  // navigateur indéfiniment et masquer des données à jour (ou un correctif) à tout visiteur
  // récurrent, sans aucun moyen de le savoir depuis l'interface.
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Échec du chargement de ${path} : ${response.status}`);
  }
  return response.json();
}

async function loadDashboardData() {
  const [disasters, countries, globalIndicators, territories, piroiOperations, cycloneStats, nsSummary] =
    await Promise.all([
      fetchJSON(DATA_PATHS.disasters),
      fetchJSON(DATA_PATHS.countries),
      fetchJSON(DATA_PATHS.globalIndicators),
      fetchJSON(DATA_PATHS.territories),
      fetchJSON(DATA_PATHS.piroiOperations),
      fetchJSON(DATA_PATHS.cycloneStats),
      fetchJSON(DATA_PATHS.nationalSocietiesSummary),
    ]);

  const countryByIso3 = new Map(countries.map((c) => [c.iso3, c]));
  const piroiIso3 = new Set(territories.map((t) => t.iso3));
  const operationById = new Map(piroiOperations.map((op) => [op.id, op]));
  return {
    disasters,
    countryByIso3,
    globalIndicators,
    piroiIso3,
    territories,
    operationById,
    piroiOperations,
    cycloneStats,
    nationalSocietiesSummary: nsSummary.territories,
  };
}
