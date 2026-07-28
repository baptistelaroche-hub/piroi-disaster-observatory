// Chargement des données CLEAN / ANALYTICS consommées par le dashboard.
const DATA_PATHS = {
  disasters: "../data/clean/disasters.json",
  countries: "../data/reference/countries.json",
  globalIndicators: "../data/analytics/global_indicators.json",
  territories: "../data/reference/territories.json",
};

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Échec du chargement de ${path} : ${response.status}`);
  }
  return response.json();
}

async function loadDashboardData() {
  const [disasters, countries, globalIndicators, territories] = await Promise.all([
    fetchJSON(DATA_PATHS.disasters),
    fetchJSON(DATA_PATHS.countries),
    fetchJSON(DATA_PATHS.globalIndicators),
    fetchJSON(DATA_PATHS.territories),
  ]);

  const countryByIso3 = new Map(countries.map((c) => [c.iso3, c]));
  const piroiIso3 = new Set(territories.map((t) => t.iso3));
  return { disasters, countryByIso3, globalIndicators, piroiIso3 };
}
