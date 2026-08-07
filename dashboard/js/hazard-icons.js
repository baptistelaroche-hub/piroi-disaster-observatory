// Pictogrammes par catégorie d'aléa (icônes ligne simples, SVG inline 24x24). Renfort visuel
// en plus de la couleur catégorielle — jamais le seul identifiant, la couleur reste celle de
// hazard-colors.js et le nom de catégorie reste toujours affiché à côté.
const HAZARD_ICON_PATHS = {
  "Cyclone tropical":
    '<path d="M21 4H3"/><path d="M18 8H6"/><path d="M19 12H9"/><path d="M16 16h-6"/><path d="M11 20H9"/>',
  "Cyclone/tempête":
    '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
  Inondation:
    '<path d="M2 15c1.4-1.3 2.8-1.3 4.2 0s2.8 1.3 4.2 0 2.8-1.3 4.2 0 2.8 1.3 4.2 0"/><path d="M2 19c1.4-1.3 2.8-1.3 4.2 0s2.8 1.3 4.2 0 2.8-1.3 4.2 0 2.8 1.3 4.2 0"/>',
  Sécheresse:
    '<circle cx="12" cy="12" r="4"/><path d="M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1 3.5 20.5M20.5 3.5 19.1 4.9"/>',
  Séisme: '<path d="M2 12h4l2-7 3 14 3-10 2 3h6"/>',
  Tsunami:
    '<path d="M2 19c3-5.5 5-5.5 6-9 1 3.5 3 3.5 4-1 1 4.5 3 4.5 4 1 1 3.5 3 3.5 6-1"/><path d="M2 21h20"/>',
  Volcan: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M8 3 6.5.8M8 3l1.7-1.8"/>',
  "Glissement de terrain":
    '<path d="M3 20 12 4l9 16"/><circle cx="9" cy="15" r="1"/><circle cx="14.5" cy="17.5" r="1"/>',
  "Crise sanitaire": '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  Incendie:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  Météorologique: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 1 1 0 9z"/>',
  Autre:
    '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
};
const HAZARD_ICON_FALLBACK = HAZARD_ICON_PATHS["Autre"];

function hazardIconMarkup(category) {
  return HAZARD_ICON_PATHS[category] || HAZARD_ICON_FALLBACK;
}

function hazardIconSVG(category, sizePx) {
  return `<svg viewBox="0 0 24 24" width="${sizePx}" height="${sizePx}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${hazardIconMarkup(category)}</svg>`;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Badge = pictogramme + couleur catégorielle sur fond teinté transparent. Remplace l'ancien
// simple point de couleur plein (legend-swatch) partout où une catégorie d'aléa est affichée.
function hazardBadge(category, sizePx = 20) {
  const color = hazardColor(category);
  const iconSize = Math.round(sizePx * 0.58);
  return `<span class="hazard-badge" style="--hazard-color:${color};--hazard-tint:${hexToRgba(color, 0.16)};width:${sizePx}px;height:${sizePx}px" title="${category}">${hazardIconSVG(category, iconSize)}</span>`;
}
