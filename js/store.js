/*
 * store.js — Le cœur des données d'Oboli.
 * localStorage, données de départ, bascule de mois, calculs.
 *
 * Ajouts de cette version :
 *   - catégorie sur les sorties (+ répartition par catégorie),
 *   - prévision de fin de mois,
 *   - date estimée de fin des crédits,
 *   - jeu de démonstration (Store.seedDemo) pour les captures.
 */

const Store = (() => {
  const STORAGE_KEY = 'budgex.v1';

  // Catégories de sorties. « Divers » sert de repli pour les anciennes données.
  const CATEGORIES = ['Resto', 'Bar', 'Culture', 'Courses', 'Divers'];

  let state = null;

  /* ------------------------------------------------------------------ *
   * Utilitaires de dates
   * ------------------------------------------------------------------ */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function monthKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function monthsBetween(fromKey, toKey) {
    const [fy, fm] = fromKey.split('-').map(Number);
    const [ty, tm] = toKey.split('-').map(Number);
    return (ty - fy) * 12 + (tm - fm);
  }

  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  // Clé de mois décalée de n mois. addMonths('2026-08', 23) → '2028-07'
  function addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return monthKey(d);
  }

  /* ------------------------------------------------------------------ *
   * Données de départ
   * ------------------------------------------------------------------ */

  function seed() {
    const now = monthKey();
    return {
      version: 2,
      settings: { income: 0, savingsGoal: 0, outingBudget: 0 },
      charges: [],
      credits: [],
      months: { [now]: { paid: {}, savings: [], outings: [], envelope: 0 } },
      lastOpened: now,
      meta: { lastExport: null, backupSnooze: null },
    };
  }

  function ensureMeta() {
    if (!state.meta) state.meta = { lastExport: null, backupSnooze: null };
    if (!state.version || state.version < 2) state.version = 2;
    // Migration douce : les sorties sans catégorie deviennent « Divers ».
    for (const m of Object.values(state.months || {})) {
      for (const o of m.outings || []) if (!o.category) o.category = 'Divers';
    }
  }

  /* ------------------------------------------------------------------ *
   * Chargement / sauvegarde
   * ------------------------------------------------------------------ */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Sauvegarde impossible :', e);
    }
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch (e) { console.warn('Lecture du stockage impossible :', e); }

    if (!raw) {
      state = seed();
      save();
    } else {
      try { state = JSON.parse(raw); }
      catch (e) {
        console.warn('Données illisibles, réinitialisation :', e);
        state = seed();
        save();
      }
    }

    ensureMeta();
    rollover();
    return state;
  }

  /* ------------------------------------------------------------------ *
   * Bascule de mois
   * ------------------------------------------------------------------ */

  function ensureMonth(key) {
    if (!state.months[key]) {
      state.months[key] = {
        paid: {}, savings: [], outings: [],
        envelope: state.settings.outingBudget,
      };
    }
    return state.months[key];
  }

  function rollover() {
    const now = monthKey();
    let changed = false;

    if (!state.months[now]) { ensureMonth(now); changed = true; }

    for (const credit of state.credits) {
      if (!credit.lastApplied) { credit.lastApplied = now; changed = true; continue; }
      const elapsed = monthsBetween(credit.lastApplied, now);
      if (elapsed > 0) {
        const total = credit.monthly * elapsed;
        credit.remaining = Math.max(0, +(credit.remaining - total).toFixed(2));
        credit.lastApplied = now;
        changed = true;
      }
    }

    if (state.lastOpened !== now) { state.lastOpened = now; changed = true; }

    if (changed) save();
    return changed;
  }

  /* ------------------------------------------------------------------ *
   * Accès
   * ------------------------------------------------------------------ */

  function getState() { return state; }
  function currentKey() { return monthKey(); }
  function currentMonth() { return ensureMonth(currentKey()); }

  /* ------------------------------------------------------------------ *
   * Charges & disponible
   * ------------------------------------------------------------------ */

  function totalCharges() {
    return state.charges.reduce((sum, c) => sum + c.amount, 0);
  }

  function paidTotal() {
    const paid = currentMonth().paid;
    return state.charges.reduce((sum, c) => sum + (paid[c.id] ? c.amount : 0), 0);
  }

  function unpaidTotal() { return totalCharges() - paidTotal(); }
  function disponible() { return state.settings.income - totalCharges(); }
  // Reste à vivre = ce qu'il reste vraiment, une fois l'épargne mise de côté et
  // les sorties déduites : revenu − charges − épargne du mois − sorties du mois.
  function resteAVivre() { return disponible() - savingsMonth() - outingsMonth(); }

  function chargesSorted() {
    const paid = currentMonth().paid;
    const today = new Date().getDate();
    return [...state.charges]
      .sort((a, b) => a.dueDay - b.dueDay)
      .map((c) => ({
        ...c,
        paid: !!paid[c.id],
        late: !paid[c.id] && c.dueDay < today,
        daysLeft: c.dueDay - today,
      }));
  }

  function lateCount() { return chargesSorted().filter((c) => c.late).length; }
  function paidCount() { return Object.keys(currentMonth().paid).length; }

  /* ------------------------------------------------------------------ *
   * Épargne
   * ------------------------------------------------------------------ */

  function savingsMonth(key = currentKey()) {
    const m = state.months[key];
    return m ? m.savings.reduce((s, v) => s + v.amount, 0) : 0;
  }

  function savingsTotalAll() {
    return Object.values(state.months).reduce(
      (sum, m) => sum + m.savings.reduce((s, v) => s + v.amount, 0), 0);
  }

  function savingsSeries() {
    const keys = Object.keys(state.months).sort();
    let running = 0;
    return keys.map((key) => {
      const monthly = savingsMonth(key);
      running += monthly;
      return { key, monthly, cumulative: running };
    });
  }

  // Nombre de mois consécutifs (jusqu'au mois courant) avec au moins un versement.
  function savingsStreak() {
    const keys = Object.keys(state.months).sort().reverse();
    let streak = 0;
    for (const k of keys) {
      if (savingsMonth(k) > 0) streak++;
      else if (k !== currentKey()) break;
    }
    return streak;
  }

  /* ------------------------------------------------------------------ *
   * Sorties
   * ------------------------------------------------------------------ */

  function outingsMonth(key = currentKey()) {
    const m = state.months[key];
    return m ? m.outings.reduce((s, v) => s + v.amount, 0) : 0;
  }

  function outingsRemaining() { return currentMonth().envelope - outingsMonth(); }

  // Répartition par catégorie du mois courant, triée du plus gros au plus petit.
  function outingsByCategory(key = currentKey()) {
    const m = state.months[key];
    if (!m) return [];
    const totals = new Map();
    for (const o of m.outings) {
      const cat = o.category || 'Divers';
      totals.set(cat, (totals.get(cat) || 0) + o.amount);
    }
    const max = Math.max(...totals.values(), 1);
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total, ratio: total / max }))
      .sort((a, b) => b.total - a.total);
  }

  // Prévision : au rythme actuel, où finit-on le mois ?
  function forecast() {
    const key = currentKey();
    const day = new Date().getDate();
    const dim = daysInMonth(key);
    const spent = outingsMonth();
    const envelope = currentMonth().envelope;
    const projected = day > 0 ? (spent / day) * dim : 0;
    const daysLeft = dim - day + 1;
    const perDay = daysLeft > 0 ? Math.max(0, envelope - spent) / daysLeft : 0;
    return {
      projected: Math.round(projected),
      envelope,
      over: projected > envelope && envelope > 0,
      daysLeft,
      perDay,
    };
  }

  /* ------------------------------------------------------------------ *
   * Crédits
   * ------------------------------------------------------------------ */

  function creditsRemainingTotal() { return state.credits.reduce((s, c) => s + c.remaining, 0); }
  function creditsMonthlyTotal() { return state.credits.reduce((s, c) => s + c.monthly, 0); }

  function creditMonthsLeft(credit) {
    if (credit.monthly <= 0) return 0;
    return Math.ceil(credit.remaining / credit.monthly);
  }

  // Clé du mois de la dernière échéance, tous crédits confondus (ou null).
  function creditsPayoffKey() {
    if (!state.credits.length) return null;
    const max = Math.max(...state.credits.map(creditMonthsLeft));
    if (!isFinite(max) || max <= 0) return null;
    return addMonths(currentKey(), max);
  }

  /* ------------------------------------------------------------------ *
   * Mutations — factures
   * ------------------------------------------------------------------ */

  function togglePaid(chargeId) {
    const paid = currentMonth().paid;
    if (paid[chargeId]) delete paid[chargeId];
    else paid[chargeId] = true;
    save();
  }

  function addCharge({ name, amount, dueDay }) {
    state.charges.push({ id: uid(), name, amount, dueDay });
    save();
  }

  function updateCharge(id, { name, amount, dueDay }) {
    const c = state.charges.find((x) => x.id === id);
    if (c) { c.name = name; c.amount = amount; c.dueDay = dueDay; save(); }
  }

  function removeCharge(id) {
    state.charges = state.charges.filter((c) => c.id !== id);
    for (const m of Object.values(state.months)) delete m.paid[id];
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — épargne
   * ------------------------------------------------------------------ */

  function addSaving({ amount, note }) {
    currentMonth().savings.push({ id: uid(), amount, note: note || '', date: new Date().toISOString() });
    save();
  }

  function removeSaving(id) {
    const m = currentMonth();
    m.savings = m.savings.filter((s) => s.id !== id);
    save();
  }

  function restoreSaving(item, index) {
    const m = currentMonth();
    m.savings.splice(Math.max(0, Math.min(index, m.savings.length)), 0, item);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — sorties
   * ------------------------------------------------------------------ */

  function addOuting({ amount, label, category }) {
    currentMonth().outings.push({
      id: uid(), amount,
      label: label || '',
      category: CATEGORIES.includes(category) ? category : 'Divers',
      date: new Date().toISOString(),
    });
    save();
  }

  function removeOuting(id) {
    const m = currentMonth();
    m.outings = m.outings.filter((o) => o.id !== id);
    save();
  }

  function restoreOuting(item, index) {
    const m = currentMonth();
    m.outings.splice(Math.max(0, Math.min(index, m.outings.length)), 0, item);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — crédits
   * ------------------------------------------------------------------ */

  function addCredit({ name, remaining, monthly }) {
    state.credits.push({
      id: uid(), name, remaining, initial: remaining, monthly,
      lastApplied: currentKey(),
    });
    save();
  }

  function addCreditPayment(id, extra) {
    const c = state.credits.find((x) => x.id === id);
    if (c) { c.remaining = Math.max(0, +(c.remaining - extra).toFixed(2)); save(); }
  }

  function updateCredit(id, { remaining, monthly }) {
    const c = state.credits.find((x) => x.id === id);
    if (c) {
      c.remaining = remaining;
      c.monthly = monthly;
      if (remaining > c.initial) c.initial = remaining;
      save();
    }
  }

  function removeCredit(id) {
    state.credits = state.credits.filter((c) => c.id !== id);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Réglages & données
   * ------------------------------------------------------------------ */

  function updateSettings({ income, savingsGoal, outingBudget }) {
    state.settings.income = income;
    state.settings.savingsGoal = savingsGoal;
    state.settings.outingBudget = outingBudget;
    currentMonth().envelope = outingBudget;
    save();
  }

  function resetAll() { state = seed(); save(); }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function markExported() {
    ensureMeta();
    state.meta.lastExport = new Date().toISOString();
    state.meta.backupSnooze = null;
    save();
  }

  function snoozeBackup() {
    ensureMeta();
    const in7days = new Date();
    in7days.setDate(in7days.getDate() + 7);
    state.meta.backupSnooze = in7days.toISOString();
    save();
  }

  function hasMeaningfulData() {
    const months = Object.values(state.months);
    if (Object.keys(state.months).length > 1) return true;
    return months.some((m) => m.savings.length || m.outings.length || Object.keys(m.paid).length);
  }

  function backupStatus() {
    ensureMeta();
    const now = new Date();
    if (state.meta.backupSnooze && now < new Date(state.meta.backupSnooze)) return { needed: false, days: null };
    if (!hasMeaningfulData()) return { needed: false, days: null };
    if (!state.meta.lastExport) return { needed: true, days: null };
    const days = Math.floor((now - new Date(state.meta.lastExport)) / 86400000);
    return { needed: days >= 30, days };
  }

  function importJSON(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Fichier illisible : ce n’est pas du JSON valide.'); }
    if (!data || typeof data !== 'object' || !data.settings ||
        !Array.isArray(data.charges) || !Array.isArray(data.credits) ||
        typeof data.months !== 'object') {
      throw new Error('Fichier invalide : structure de budget non reconnue.');
    }
    state = data;
    ensureMeta();
    rollover();
    save();
  }

  /* ------------------------------------------------------------------ *
   * Démonstration — pour les captures et l'essai à blanc.
   * N'est appelée que si l'URL contient « ?demo » (voir app.js).
   * ------------------------------------------------------------------ */

  function seedDemo() {
    const now = currentKey();
    const prev = addMonths(now, -1);
    const prev2 = addMonths(now, -2);
    const iso = (day) => {
      const [y, m] = now.split('-').map(Number);
      return new Date(y, m - 1, day).toISOString();
    };

    state = seed();
    state.settings = { income: 2400, savingsGoal: 300, outingBudget: 250 };
    state.charges = [
      { id: 'c1', name: 'Loyer', amount: 780, dueDay: 5 },
      { id: 'c2', name: 'Énergie', amount: 95, dueDay: 8 },
      { id: 'c3', name: 'Internet', amount: 39, dueDay: 10 },
      { id: 'c4', name: 'Assurance habitation', amount: 62, dueDay: 15 },
      { id: 'c5', name: 'Téléphone', amount: 22, dueDay: 20 },
      { id: 'c6', name: 'Mutuelle', amount: 48, dueDay: 28 },
    ];
    state.credits = [
      { id: 'k1', name: 'Crédit auto', remaining: 6420, initial: 12000, monthly: 285, lastApplied: now },
      { id: 'k2', name: 'Prêt travaux', remaining: 2100, initial: 6000, monthly: 150, lastApplied: now },
    ];
    state.months = {
      [prev2]: { paid: { c1: true, c2: true, c3: true, c4: true, c5: true },
        savings: [{ id: 's0', amount: 180, note: 'Économie du mois', date: iso(4) }],
        outings: [{ id: 'o0', amount: 240, label: 'Divers', category: 'Divers', date: iso(9) }], envelope: 250 },
      [prev]: { paid: { c1: true, c2: true, c3: true, c4: true, c5: true, c6: true },
        savings: [{ id: 's1', amount: 300, note: 'Économie du mois', date: iso(3) }],
        outings: [{ id: 'o1', amount: 268, label: 'Sorties', category: 'Resto', date: iso(12) }], envelope: 250 },
      [now]: {
        paid: { c1: true, c2: true, c3: true },
        savings: [
          { id: 's2', amount: 50, note: 'Versement', date: iso(2) },
          { id: 's3', amount: 100, note: 'Économie du mois', date: iso(6) },
        ],
        outings: [
          { id: 'o2', amount: 34, label: 'Brunch', category: 'Resto', date: iso(1) },
          { id: 'o3', amount: 48, label: 'Bar entre amis', category: 'Bar', date: iso(3) },
          { id: 'o4', amount: 24, label: 'Cinéma', category: 'Culture', date: iso(5) },
          { id: 'o5', amount: 62, label: 'Restaurant', category: 'Resto', date: iso(8) },
        ],
        envelope: 250,
      },
    };
    state.lastOpened = now;
    save();
  }

  return {
    load, save, rollover, seed, seedDemo, resetAll,
    monthKey, monthsBetween, daysInMonth, addMonths, currentKey, currentMonth,
    getState, CATEGORIES,
    totalCharges, paidTotal, unpaidTotal, disponible, resteAVivre, chargesSorted, lateCount, paidCount,
    togglePaid, addCharge, updateCharge, removeCharge,
    savingsMonth, savingsTotalAll, savingsSeries, savingsStreak,
    addSaving, removeSaving, restoreSaving,
    outingsMonth, outingsRemaining, outingsByCategory, forecast,
    addOuting, removeOuting, restoreOuting,
    creditsRemainingTotal, creditsMonthlyTotal, creditMonthsLeft, creditsPayoffKey,
    addCredit, addCreditPayment, updateCredit, removeCredit,
    updateSettings, exportJSON, importJSON, markExported, snoozeBackup, backupStatus,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Store;
}
