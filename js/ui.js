/*
 * ui.js — Affichage « brut » d'Oboli (thème Nocturne).
 *   - formatage des montants et des dates,
 *   - toasts, feuilles modales,
 *   - dessin SVG : cadran du mois, jauge des sorties, courbe d'épargne,
 *   - animations d'entrée (UI.activate) : cadran, jauges, compteurs, cascade.
 *
 * Ne connaît rien des règles métier : reçoit des nombres, rend du visuel.
 */

const UI = (() => {
  const euro = new Intl.NumberFormat('fr-BE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });

  function money(n) { return euro.format(n || 0); }

  const MONTHS_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

  function monthLabel(key) {
    const m = Number(key.split('-')[1]) - 1;
    return MONTHS_SHORT[m] || key;
  }

  function shortDate(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  const reduced = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */

  let toastTimer = null;
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

    el.classList.remove('show');
    // Force un reflow pour rejouer l'animation même sur toasts successifs.
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), opts.actionLabel ? 5000 : 2200);
  }

  /* ------------------------------------------------------------------ *
   * Feuille modale
   * ------------------------------------------------------------------ */

  function openSheet(title, bodyHtml, onMount) {
    closeSheet();

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

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
    document.addEventListener('keydown', escToClose);

    requestAnimationFrame(() => overlay.classList.add('open'));

    if (typeof onMount === 'function') onMount(sheet);

    const first = sheet.querySelector('input, textarea, select, button');
    if (first) first.focus();

    return sheet;
  }

  function escToClose(e) { if (e.key === 'Escape') closeSheet(); }

  function closeSheet() {
    const overlay = document.getElementById('sheet-overlay');
    if (!overlay) return;
    document.removeEventListener('keydown', escToClose);
    document.body.classList.remove('no-scroll');
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  }

  /* ------------------------------------------------------------------ *
   * Cadran du mois — trois arcs sur un même cercle
   * ------------------------------------------------------------------ */

  // segments en euros ; income = total de référence.
  function dial({ paid, unpaid, income, centerLabel, centerValue, centerSub }) {
    const R = 88;
    const C = 2 * Math.PI * R;           // circonférence ≈ 552.9
    const total = income > 0 ? income : 1;

    let pPaid = paid / total;
    let pUnpaid = unpaid / total;
    if (pPaid + pUnpaid > 1) {           // charges > revenu : on rééchelonne
      const k = 1 / (pPaid + pUnpaid);
      pPaid *= k; pUnpaid *= k;
    }
    const pFree = Math.max(0, 1 - pPaid - pUnpaid);

    const gap = 4;                        // respiration entre les arcs
    const len = (p) => Math.max(0, p * C - (p > 0.02 ? gap : 0));
    const lPaid = len(pPaid);
    const lUnpaid = len(pUnpaid);
    const lFree = len(pFree);

    // dasharray posé après le premier rendu (UI.activate) → animation.
    // Un segment de longueur nulle est omis : un linecap rond dessinerait un point.
    const seg = (color, length, offset, extra = '') => length < 0.5 ? '' : `
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="${color}" stroke-width="16"
        stroke-linecap="round" stroke-dasharray="0 ${C.toFixed(1)}"
        stroke-dashoffset="${(-offset).toFixed(1)}"
        data-dash="${length.toFixed(1)} ${(C - length).toFixed(1)}" ${extra}></circle>`;

    return `
      <div class="dial-wrap">
        <svg class="dial" viewBox="0 0 220 220" role="img"
             aria-label="Répartition du revenu : payé, à payer, libre">
          <circle cx="110" cy="110" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="16"/>
          <defs>
            <linearGradient id="dial-paid" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4FE3B0"/><stop offset="100%" stop-color="#3FC9E0"/>
            </linearGradient>
          </defs>
          ${seg('url(#dial-paid)', lPaid, 0)}
          ${seg('#F0B54A', lUnpaid, pPaid * C)}
          ${seg('rgba(255,255,255,.14)', lFree, (pPaid + pUnpaid) * C)}
        </svg>
        <div class="dial-center">
          <p class="eyebrow">${centerLabel}</p>
          <p class="dial-value" data-count="${centerValue}">${money(centerValue)}</p>
          <p class="subtle">${centerSub}</p>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ *
   * Jauge demi-cercle (sorties)
   * ------------------------------------------------------------------ */

  // ratio ∈ [0,1] = part consommée ; over = dépassement.
  function gauge({ ratio, label, value, sub, over }) {
    const ARC = 314;                       // longueur de l'arc dessiné
    const filled = Math.max(0, Math.min(1, ratio)) * ARC;
    const stroke = over ? '#FF6F5E' : 'url(#gauge-grad)';
    return `
      <div class="gauge-wrap">
        <svg class="gauge" viewBox="0 0 240 136" role="img" aria-label="${label}">
          <defs>
            <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#4FE3B0"/><stop offset="100%" stop-color="#F0B54A"/>
            </linearGradient>
          </defs>
          <path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="rgba(255,255,255,.06)"
                stroke-width="16" stroke-linecap="round"/>
          <path class="val" d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="${stroke}"
                stroke-width="16" stroke-linecap="round"
                stroke-dasharray="0 ${ARC}" data-dash="${filled.toFixed(1)} ${ARC}"/>
        </svg>
        <div class="gauge-center">
          <p class="eyebrow">${label}</p>
          <p class="gauge-value${over ? ' coral-t' : ''}" data-count="${value}">${money(value)}</p>
          <p class="subtle">${sub}</p>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ *
   * Courbe d'épargne cumulée
   * ------------------------------------------------------------------ */

  function savingsChart(series) {
    if (!series.length) {
      return '<p class="empty">Aucun versement pour l’instant. La courbe apparaîtra dès le premier euro mis de côté.</p>';
    }
    const pts = series.length === 1 ? [series[0], { ...series[0] }] : series;

    const W = 320, H = 140, padX = 10, padTop = 14, padBottom = 16;
    const maxY = Math.max(...pts.map((p) => p.cumulative), 1);
    const innerW = W - padX * 2;
    const innerH = H - padTop - padBottom;

    const xAt = (i) => padX + (i / (pts.length - 1)) * innerW;
    const yAt = (v) => padTop + innerH - (v / maxY) * innerH;

    const linePath = 'M' + pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.cumulative).toFixed(1)}`).join(' L');
    const areaPath = `${linePath} L${xAt(pts.length - 1).toFixed(1)},${(padTop + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;
    const last = pts[pts.length - 1];

    const labels = pts.map((p) => `<span>${monthLabel(p.key)}</span>`).join('');

    return `
      <svg class="savings-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           role="img" aria-label="Épargne cumulée mois après mois">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4FE3B0" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#4FE3B0" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#3FC9E0"/><stop offset="100%" stop-color="#4FE3B0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="${padTop + innerH * 0.25}" x2="${W}" y2="${padTop + innerH * 0.25}" stroke="rgba(255,255,255,.05)"/>
        <line x1="0" y1="${padTop + innerH * 0.62}" x2="${W}" y2="${padTop + innerH * 0.62}" stroke="rgba(255,255,255,.05)"/>
        <path class="area" d="${areaPath}" fill="url(#area-grad)"/>
        <path class="line" d="${linePath}" fill="none" stroke="url(#line-grad)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>
        <circle cx="${xAt(pts.length - 1).toFixed(1)}" cy="${yAt(last.cumulative).toFixed(1)}" r="9" fill="#4FE3B0" opacity=".18"/>
        <circle cx="${xAt(pts.length - 1).toFixed(1)}" cy="${yAt(last.cumulative).toFixed(1)}" r="4" fill="#4FE3B0"/>
      </svg>
      <div class="chart-months">${labels}</div>`;
  }

  /* ------------------------------------------------------------------ *
   * Barre de progression
   * ------------------------------------------------------------------ */

  function bar(ratio, danger = false) {
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    return `<div class="progress${danger ? ' danger' : ''}"><span data-width="${pct.toFixed(1)}%"></span></div>`;
  }

  /* ------------------------------------------------------------------ *
   * Animations d'entrée — à appeler après chaque rendu
   * ------------------------------------------------------------------ */

  function countUp(el, target) {
    const dur = 700;
    const start = performance.now();
    const from = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = money(target);
    }
    requestAnimationFrame(frame);
  }

  // Pose les valeurs finales (dasharray, largeurs) au tour suivant :
  // le navigateur anime la transition depuis l'état initial à zéro.
  function activate(root) {
    if (!root) return;

    // Cascade : index sur les enfants des piles.
    root.querySelectorAll('.stagger').forEach((list) => {
      [...list.children].forEach((child, i) => child.style.setProperty('--i', Math.min(i, 12)));
    });

    const paint = () => {
      root.querySelectorAll('[data-dash]').forEach((el) => {
        el.setAttribute('stroke-dasharray', el.dataset.dash);
      });
      root.querySelectorAll('.progress span[data-width], .cat-bar span[data-width]').forEach((el) => {
        el.style.width = el.dataset.width;
      });
    };

    if (reduced()) { paint(); return; }

    requestAnimationFrame(() => requestAnimationFrame(paint));

    root.querySelectorAll('[data-count]').forEach((el) => {
      const target = parseFloat(el.dataset.count);
      if (!isNaN(target)) countUp(el, target);
    });
  }

  return {
    money, monthLabel, shortDate, esc,
    toast, openSheet, closeSheet,
    dial, gauge, savingsChart, bar,
    activate, countUp,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
