/*
 * ui.js — Tout ce qui touche à l'affichage « brut » :
 *   - formatage des montants et des dates,
 *   - toasts de confirmation,
 *   - feuilles modales qui montent du bas,
 *   - dessin des graphiques SVG (ruban du mois, courbe d'épargne).
 *
 * Ne connaît rien des règles métier : reçoit des nombres, rend du visuel.
 */

const UI = (() => {
  // Formateur d'euros à la belge (séparateur d'espace, virgule décimale).
  const euro = new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // Formate un montant en euros. Ex : 1681 → « 1 681 € ».
  function money(n) {
    return euro.format(n || 0);
  }

  // Comme money(), mais enveloppé pour l'animation de défilement des chiffres.
  // Le texte rendu est déjà la valeur finale : si le JS d'animation ne tourne
  // pas (ou animations réduites), le montant correct s'affiche quand même.
  function countMoney(n) {
    return `<span class="count" data-count-to="${n || 0}">${money(n)}</span>`;
  }

  // Mois abrégés en français, pour les axes du graphique d'épargne.
  const MONTHS_SHORT = [
    'janv', 'févr', 'mars', 'avr', 'mai', 'juin',
    'juil', 'août', 'sept', 'oct', 'nov', 'déc',
  ];

  // « 2026-08 » → « août »
  function monthLabel(key) {
    const m = Number(key.split('-')[1]) - 1;
    return MONTHS_SHORT[m] || key;
  }

  // Date ISO → « 9 août » (jour + mois court), pour les listes.
  function shortDate(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  /* ------------------------------------------------------------------ *
   * Toast — petit bandeau de confirmation en bas
   * ------------------------------------------------------------------ */

  let toastTimer = null;
  // toast(message) simple, ou toast(message, { actionLabel, onAction }) avec
  // un bouton (ex. « Annuler »). Le toast reste plus longtemps s'il a une action.
  function toast(message, opts = {}) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = message;
    el.appendChild(span);

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = opts.actionLabel;
      btn.addEventListener('click', () => {
        clearTimeout(toastTimer);
        el.classList.remove('show');
        opts.onAction();
      });
      el.appendChild(btn);
    }

    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => el.classList.remove('show'),
      opts.actionLabel ? 5000 : 2200
    );
  }

  /* ------------------------------------------------------------------ *
   * Feuille modale — monte du bas, se ferme en tapant le fond
   * ------------------------------------------------------------------ */

  // Ouvre une feuille. `title` = titre affiché, `bodyHtml` = contenu,
  // `onMount` = callback(feuilleElement) pour brancher les événements.
  function openSheet(title, bodyHtml, onMount) {
    closeSheet(); // une seule feuille à la fois

    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'sheet-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', title);
    sheet.innerHTML = `
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 class="sheet-title">${title}</h2>
      <div class="sheet-body">${bodyHtml}</div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');

    // Fermeture en tapant le fond (mais pas la feuille elle-même).
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet();
    });

    // Fermeture au clavier (Échap).
    document.addEventListener('keydown', escToClose);

    // Animation d'entrée au tour suivant, pour laisser le DOM se poser.
    requestAnimationFrame(() => overlay.classList.add('open'));

    if (typeof onMount === 'function') onMount(sheet);

    // Focus sur le premier champ pour la saisie immédiate.
    const first = sheet.querySelector('input, textarea, select, button');
    if (first) first.focus();

    return sheet;
  }

  function escToClose(e) {
    if (e.key === 'Escape') closeSheet();
  }

  function closeSheet() {
    const overlay = document.getElementById('sheet-overlay');
    if (!overlay) return;
    document.removeEventListener('keydown', escToClose);
    document.body.classList.remove('no-scroll');
    overlay.classList.remove('open');
    // On retire après l'animation de sortie.
    setTimeout(() => overlay.remove(), 200);
  }

  /* ------------------------------------------------------------------ *
   * Ruban du mois — barre unique en trois segments (SVG dessiné main)
   * ------------------------------------------------------------------ */

  // segments : { paid, unpaid, free } en euros. `income` = total (= somme).
  // `dayRatio` ∈ [0,1] = position du jour courant dans le mois.
  function ribbon({ paid, unpaid, free, income, dayRatio }) {
    const W = 100; // largeur logique ; le SVG s'étire en 100 %.
    const H = 18;
    const r = H / 2;
    const total = income > 0 ? income : 1;

    // Largeurs proportionnelles au revenu.
    let wPaid = (paid / total) * W;
    let wUnpaid = (unpaid / total) * W;
    // Garde-fou : si les charges dépassent le revenu, on rééchelonne les deux
    // segments pour qu'ils ne débordent jamais de la barre.
    if (wPaid + wUnpaid > W) {
      const k = W / (wPaid + wUnpaid);
      wPaid *= k;
      wUnpaid *= k;
    }
    const wFree = Math.max(0, W - wPaid - wUnpaid);

    const xPaid = 0;
    const xUnpaid = wPaid;
    const xFree = wPaid + wUnpaid;

    const cursorX = Math.min(W, Math.max(0, dayRatio * W));

    // On dessine chaque segment comme un rectangle simple, puis on découpe
    // l'ensemble avec un rectangle arrondi (clipPath) pour les bords ronds.
    return `
      <svg class="ribbon" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           role="img" aria-label="Répartition du revenu : payé, à payer, libre">
        <defs>
          <clipPath id="ribbon-clip">
            <rect x="0" y="0" width="${W}" height="${H}" rx="${r}" ry="${r}" />
          </clipPath>
          <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse"
                   patternTransform="rotate(45)">
            <rect width="3" height="3" fill="var(--amber-dim)"></rect>
            <line x1="0" y1="0" x2="0" y2="3" stroke="var(--amber)" stroke-width="1.4"/>
          </pattern>
        </defs>
        <g clip-path="url(#ribbon-clip)">
          <rect class="seg seg-free" x="${xFree}" y="0" width="${wFree}" height="${H}" fill="var(--free)"/>
          <rect class="seg seg-unpaid" x="${xUnpaid}" y="0" width="${wUnpaid}" height="${H}" fill="url(#hatch)"/>
          <rect class="seg seg-paid" x="${xPaid}" y="0" width="${wPaid}" height="${H}" fill="var(--mint)"/>
          <line class="cursor" x1="${cursorX}" y1="-1" x2="${cursorX}" y2="${H + 1}"
                stroke="var(--text)" stroke-width="1.2" opacity="0.9"/>
        </g>
      </svg>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Courbe d'épargne cumulée — aire dégradée, points, libellés de mois
   * ------------------------------------------------------------------ */

  // series : [{ key, cumulative }] triée. Rend un SVG responsive.
  function savingsChart(series) {
    if (!series.length) {
      return '<p class="empty">Aucun versement pour l’instant. La courbe apparaîtra dès le premier euro mis de côté.</p>';
    }

    // Si un seul point, on en fabrique un second identique pour tracer une ligne.
    const pts = series.length === 1
      ? [series[0], { ...series[0] }]
      : series;

    const W = 320;
    const H = 160;
    const padX = 14;   // marge latérale
    const padTop = 16;
    const padBottom = 26; // place pour les libellés de mois

    const maxY = Math.max(...pts.map((p) => p.cumulative), 1);
    const innerW = W - padX * 2;
    const innerH = H - padTop - padBottom;

    // Coordonnée X d'un point selon son index.
    const xAt = (i) =>
      padX + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
    // Coordonnée Y d'une valeur cumulée (0 en bas, maxY en haut).
    const yAt = (v) => padTop + innerH - (v / maxY) * innerH;

    const linePoints = pts.map((p, i) => `${xAt(i)},${yAt(p.cumulative)}`);
    const linePath = 'M' + linePoints.join(' L');

    // Aire fermée sous la courbe (retour par le bas).
    const areaPath =
      linePath +
      ` L${xAt(pts.length - 1)},${padTop + innerH}` +
      ` L${xAt(0)},${padTop + innerH} Z`;

    // Points sur chaque mois.
    const dots = pts
      .map((p, i) => `<circle class="dot-pt" cx="${xAt(i)}" cy="${yAt(p.cumulative)}" r="2.6" fill="var(--mint)"/>`)
      .join('');

    // Libellés de mois. Les extrémités sont ancrées start/end pour ne pas
    // être rognées ; les intermédiaires restent centrés.
    const labels = pts
      .map((p, i) => {
        let anchor = 'middle';
        if (i === 0) anchor = 'start';
        else if (i === pts.length - 1) anchor = 'end';
        return `<text x="${xAt(i)}" y="${H - 8}" text-anchor="${anchor}"
                   class="chart-label">${monthLabel(p.key)}</text>`;
      })
      .join('');

    return `
      <svg class="savings-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Épargne cumulée mois après mois">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--mint)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--mint)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="area" d="${areaPath}" fill="url(#area-grad)"/>
        <path class="line" d="${linePath}" fill="none" stroke="var(--mint)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${labels}
      </svg>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Petite barre de progression réutilisable
   * ------------------------------------------------------------------ */

  // ratio ∈ [0,1] ; `danger` force la couleur corail (dépassement).
  function bar(ratio, danger = false) {
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    const cls = danger ? 'progress danger' : 'progress';
    return `<div class="${cls}"><span style="width:${pct}%"></span></div>`;
  }

  // Échappe le texte utilisateur avant insertion dans le HTML.
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  return {
    money,
    countMoney,
    monthLabel,
    shortDate,
    toast,
    openSheet,
    closeSheet,
    ribbon,
    savingsChart,
    bar,
    esc,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
