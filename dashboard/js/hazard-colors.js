// Palette catégorielle validée (skill dataviz) : 8 teintes fixes pour les catégories les plus
// fréquentes, repli neutre pour les 4 restantes. L'ordre est figé — ne jamais réassigner
// dynamiquement selon les filtres actifs. La couleur est un renfort, jamais le seul identifiant
// (le nom de la catégorie reste toujours visible en légende et en popup).
const HAZARD_COLORS = {
  "Cyclone tropical": "#2a78d6",
  "Volcan": "#eb6834",
  "Inondation": "#1baf7a",
  "Sécheresse": "#eda100",
  "Glissement de terrain": "#e87ba4",
  "Crise sanitaire": "#008300",
  "Cyclone/tempête": "#4a3aa7",
  "Séisme": "#e34948",
};
const HAZARD_COLOR_FALLBACK = "#898781"; // Météorologique, Incendie, Tsunami, Autre

function hazardColor(category) {
  return HAZARD_COLORS[category] || HAZARD_COLOR_FALLBACK;
}
