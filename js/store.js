/*
 * store.js — Le cœur des données d'Oboli.
 * Gère : le chargement/sauvegarde dans localStorage, les données de départ,
 * la bascule automatique de mois, et tous les calculs (totaux, disponible…).
 *
 * Aucune dépendance externe. Tout vit dans un seul objet `Store`.
 */

const Store = (() => {
  // Clé unique sous laquelle tout l'état est rangé dans le navigateur.
  const STORAGE_KEY = 'budgex.v1';

  // L'état vivant en mémoire. Rempli par load() au démarrage.
  let state = null;

  /* ------------------------------------------------------------------ *
   * Petites fonctions utilitaires de dates
   * ------------------------------------------------------------------ */

  // Identifiant unique et court, sans dépendance externe.
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Clé de mois « AAAA-MM » à partir d'une Date (mois par défaut : aujourd'hui).
  function monthKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // Nombre de mois entiers écoulés entre deux clés « AAAA-MM ».
  // monthsBetween('2026-06', '2026-08') === 2
  function monthsBetween(fromKey, toKey) {
    const [fy, fm] = fromKey.split('-').map(Number);
    const [ty, tm] = toKey.split('-').map(Number);
    return (ty - fy) * 12 + (tm - fm);
  }

  // Nombre de jours dans le mois d'une clé « AAAA-MM ».
  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate(); // jour 0 du mois suivant = dernier jour
  }

  /* ------------------------------------------------------------------ *
   * Données de départ
   * ------------------------------------------------------------------ */

  // Construit un état neuf et VIDE : chacun renseigne son propre budget.
  // (L'app démarre sans factures ni crédits ; l'accueil guide les premiers pas.)
  function seed() {
    const now = monthKey();
    return {
      version: 1,
      settings: { income: 0, savingsGoal: 0, outingBudget: 0, theme: 'auto' },
      charges: [],
      credits: [],
      months: {
        [now]: { paid: {}, savings: [], outings: [], envelope: 0 },
      },
      lastOpened: now,
      // Métadonnées : suivi des sauvegardes pour le filet de sécurité des données.
      meta: { lastExport: null, backupSnooze: null },
    };
  }

  // Garantit la présence du bloc `meta` (pour les anciens états importés).
  function ensureMeta() {
    if (!state.meta) state.meta = { lastExport: null, backupSnooze: null };
  }

  // Garantit des réglages complets (pour les anciennes sauvegardes sans thème).
  function ensureSettings() {
    if (!state.settings) state.settings = { income: 0, savingsGoal: 0, outingBudget: 0 };
    if (!state.settings.theme) state.settings.theme = 'auto';
  }

  /* ------------------------------------------------------------------ *
   * Chargement / sauvegarde
   * ------------------------------------------------------------------ */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Le stockage peut être plein ou bloqué (navigation privée) : on prévient.
      console.warn('Sauvegarde impossible :', e);
    }
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Lecture du stockage impossible :', e);
    }

    if (!raw) {
      state = seed();
      save();
    } else {
      try {
        state = JSON.parse(raw);
      } catch (e) {
        // Données corrompues : on repart proprement plutôt que de planter.
        console.warn('Données illisibles, réinitialisation :', e);
        state = seed();
        save();
      }
    }

    ensureMeta();
    ensureSettings();
    rollover(); // met l'état à jour selon le mois courant
    return state;
  }

  /* ------------------------------------------------------------------ *
   * Bascule de mois — appelée au lancement et au retour au premier plan
   * ------------------------------------------------------------------ */

  // Garantit qu'un enregistrement existe pour la clé de mois donnée.
  function ensureMonth(key) {
    if (!state.months[key]) {
      state.months[key] = {
        paid: {},
        savings: [],
        outings: [],
        envelope: state.settings.outingBudget,
      };
    }
    return state.months[key];
  }

  // Cœur de la bascule : nouveau mois → factures « à payer », crédits décrémentés.
  // Retourne true si quelque chose a changé (pour redéclencher un rendu).
  function rollover() {
    const now = monthKey();
    let changed = false;

    // 1) Un enregistrement vide pour le mois courant si besoin.
    //    Les factures redeviennent automatiquement « à payer » car
    //    l'objet `paid` du nouveau mois est vide.
    if (!state.months[now]) {
      ensureMonth(now);
      changed = true;
    }

    // 2) Décrément des crédits, une seule fois par mois via `lastApplied`.
    //    Si plusieurs mois se sont écoulés, on décrémente d'autant de mensualités.
    for (const credit of state.credits) {
      if (!credit.lastApplied) {
        // Ancien crédit sans repère : on l'ancre au mois courant sans décrémenter.
        credit.lastApplied = now;
        changed = true;
        continue;
      }
      const elapsed = monthsBetween(credit.lastApplied, now);
      if (elapsed > 0) {
        const total = credit.monthly * elapsed;
        credit.remaining = Math.max(0, +(credit.remaining - total).toFixed(2));
        credit.lastApplied = now;
        changed = true;
      }
    }

    // 3) On mémorise le dernier mois ouvert.
    if (state.lastOpened !== now) {
      state.lastOpened = now;
      changed = true;
    }

    if (changed) save();
    return changed;
  }

  /* ------------------------------------------------------------------ *
   * Accès à l'état
   * ------------------------------------------------------------------ */

  function getState() {
    return state;
  }

  function currentKey() {
    return monthKey();
  }

  // Enregistrement du mois courant (créé au besoin).
  function currentMonth() {
    return ensureMonth(currentKey());
  }

  /* ------------------------------------------------------------------ *
   * Calculs — charges & disponible
   * ------------------------------------------------------------------ */

  function totalCharges() {
    return state.charges.reduce((sum, c) => sum + c.amount, 0);
  }

  // Total des factures cochées « payées » pour le mois courant.
  function paidTotal() {
    const paid = currentMonth().paid;
    return state.charges.reduce((sum, c) => sum + (paid[c.id] ? c.amount : 0), 0);
  }

  function unpaidTotal() {
    return totalCharges() - paidTotal();
  }

  // Disponible après charges fixes = revenu − total des charges.
  function disponible() {
    return state.settings.income - totalCharges();
  }

  // Reste à vivre = ce qu'il reste vraiment une fois l'épargne mise de côté et
  // les sorties déduites : revenu − charges − épargne du mois − sorties du mois.
  function resteAVivre() {
    return disponible() - savingsMonth() - outingsMonth();
  }

  // Les factures triées par jour d'échéance, enrichies de leur état.
  function chargesSorted() {
    const paid = currentMonth().paid;
    const today = new Date().getDate();
    return [...state.charges]
      .sort((a, b) => a.dueDay - b.dueDay)
      .map((c) => ({
        ...c,
        paid: !!paid[c.id],
        late: !paid[c.id] && c.dueDay < today, // échéance passée et non réglée
      }));
  }

  // Nombre de factures en retard (échéance passée, non payées) ce mois-ci.
  function lateCount() {
    return chargesSorted().filter((c) => c.late).length;
  }

  /* ------------------------------------------------------------------ *
   * Calculs — épargne
   * ------------------------------------------------------------------ */

  function savingsMonth(key = currentKey()) {
    const m = state.months[key];
    return m ? m.savings.reduce((s, v) => s + v.amount, 0) : 0;
  }

  // Cumul de toute l'épargne, tous mois confondus.
  function savingsTotalAll() {
    return Object.values(state.months).reduce(
      (sum, m) => sum + m.savings.reduce((s, v) => s + v.amount, 0),
      0
    );
  }

  // Série cumulée mois par mois, triée chronologiquement.
  // Retourne [{ key, monthly, cumulative }] pour le graphique.
  function savingsSeries() {
    const keys = Object.keys(state.months).sort();
    let running = 0;
    return keys.map((key) => {
      const monthly = savingsMonth(key);
      running += monthly;
      return { key, monthly, cumulative: running };
    });
  }

  /* ------------------------------------------------------------------ *
   * Calculs — sorties
   * ------------------------------------------------------------------ */

  function outingsMonth(key = currentKey()) {
    const m = state.months[key];
    return m ? m.outings.reduce((s, v) => s + v.amount, 0) : 0;
  }

  // Ce qu'il reste dans l'enveloppe du mois courant (peut être négatif).
  function outingsRemaining() {
    return currentMonth().envelope - outingsMonth();
  }

  /* ------------------------------------------------------------------ *
   * Calculs — crédits
   * ------------------------------------------------------------------ */

  function creditsRemainingTotal() {
    return state.credits.reduce((s, c) => s + c.remaining, 0);
  }

  function creditsMonthlyTotal() {
    return state.credits.reduce((s, c) => s + c.monthly, 0);
  }

  // Nombre de mois restants pour solder un crédit (arrondi au supérieur).
  function creditMonthsLeft(credit) {
    if (credit.monthly <= 0) return 0;
    return Math.ceil(credit.remaining / credit.monthly);
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
    if (c) {
      c.name = name;
      c.amount = amount;
      c.dueDay = dueDay;
      save();
    }
  }

  function removeCharge(id) {
    state.charges = state.charges.filter((c) => c.id !== id);
    // On nettoie aussi les marques « payé » dans tous les mois.
    for (const m of Object.values(state.months)) delete m.paid[id];
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — épargne
   * ------------------------------------------------------------------ */

  function addSaving({ amount, note }) {
    currentMonth().savings.push({
      id: uid(),
      amount,
      note: note || '',
      date: new Date().toISOString(),
    });
    save();
  }

  function removeSaving(id) {
    const m = currentMonth();
    m.savings = m.savings.filter((s) => s.id !== id);
    save();
  }

  // Réinsère un versement supprimé à sa position d'origine (pour « Annuler »).
  function restoreSaving(item, index) {
    const m = currentMonth();
    const i = Math.max(0, Math.min(index, m.savings.length));
    m.savings.splice(i, 0, item);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — sorties
   * ------------------------------------------------------------------ */

  function addOuting({ amount, label }) {
    currentMonth().outings.push({
      id: uid(),
      amount,
      label: label || '',
      date: new Date().toISOString(),
    });
    save();
  }

  function removeOuting(id) {
    const m = currentMonth();
    m.outings = m.outings.filter((o) => o.id !== id);
    save();
  }

  // Réinsère une sortie supprimée à sa position d'origine (pour « Annuler »).
  function restoreOuting(item, index) {
    const m = currentMonth();
    const i = Math.max(0, Math.min(index, m.outings.length));
    m.outings.splice(i, 0, item);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — crédits
   * ------------------------------------------------------------------ */

  // Verser en plus : un remboursement anticipé qui réduit le solde.
  function addCreditPayment(id, extra) {
    const c = state.credits.find((x) => x.id === id);
    if (c) {
      c.remaining = Math.max(0, +(c.remaining - extra).toFixed(2));
      save();
    }
  }

  // Corriger : ajuster le restant dû et la mensualité.
  function updateCredit(id, { remaining, monthly }) {
    const c = state.credits.find((x) => x.id === id);
    if (c) {
      c.remaining = remaining;
      c.monthly = monthly;
      // On garde `initial` comme le maximum vu, pour que la barre de
      // progression reste cohérente si l'on corrige le solde vers le haut.
      if (remaining > c.initial) c.initial = remaining;
      save();
    }
  }

  function removeCredit(id) {
    state.credits = state.credits.filter((c) => c.id !== id);
    save();
  }

  /* ------------------------------------------------------------------ *
   * Mutations — réglages & données
   * ------------------------------------------------------------------ */

  function updateSettings({ income, savingsGoal, outingBudget }) {
    state.settings.income = income;
    state.settings.savingsGoal = savingsGoal;
    state.settings.outingBudget = outingBudget;
    // L'enveloppe du mois courant suit le nouveau réglage.
    currentMonth().envelope = outingBudget;
    save();
  }

  function resetAll() {
    state = seed();
    save();
  }

  // Mémorise le thème choisi : 'auto' | 'light' | 'dark'.
  function setTheme(theme) {
    ensureSettings();
    state.settings.theme = theme;
    save();
  }

  // Exporte l'état complet en chaîne JSON lisible.
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  // À appeler juste après un export réussi : mémorise la date.
  function markExported() {
    ensureMeta();
    state.meta.lastExport = new Date().toISOString();
    state.meta.backupSnooze = null; // on repart d'une ardoise propre
    save();
  }

  // Repousse le rappel de sauvegarde d'une semaine.
  function snoozeBackup() {
    ensureMeta();
    const in7days = new Date();
    in7days.setDate(in7days.getDate() + 7);
    state.meta.backupSnooze = in7days.toISOString();
    save();
  }

  // Vrai s'il existe des données qui valent la peine d'être sauvegardées.
  function hasMeaningfulData() {
    const months = Object.values(state.months);
    if (Object.keys(state.months).length > 1) return true;
    return months.some(
      (m) => m.savings.length || m.outings.length || Object.keys(m.paid).length
    );
  }

  // Statut du filet de sécurité : faut-il rappeler d'exporter ?
  // Retourne { needed, days } où `days` = jours depuis le dernier export (ou null).
  function backupStatus() {
    ensureMeta();
    const now = new Date();

    // Rappel mis en veille ?
    if (state.meta.backupSnooze && now < new Date(state.meta.backupSnooze)) {
      return { needed: false, days: null };
    }
    if (!hasMeaningfulData()) return { needed: false, days: null };

    if (!state.meta.lastExport) return { needed: true, days: null };

    const days = Math.floor((now - new Date(state.meta.lastExport)) / 86400000);
    return { needed: days >= 30, days };
  }

  // Importe un JSON (chaîne). Valide la structure ; lève une erreur claire sinon.
  function importJSON(text) {
    let data;
    // On retire un éventuel BOM UTF-8 en tête (fréquent quand un fichier est
    // réécrit par iOS/Fichiers ou un éditeur) et les espaces autour : sans ça,
    // JSON.parse échoue et la sauvegarde semble « ne pas revenir ».
    let clean = String(text).replace(/^\uFEFF/, '').trim();
    // Normalise les guillemets typographiques : le copier-coller mobile remplace
    // parfois " par \u201C \u201D et ' par \u2018 \u2019, ce qui fait \u00E9chouer JSON.parse \u00E0 tort.
    clean = clean
      .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
    try {
      data = JSON.parse(clean);
    } catch (e) {
      throw new Error('Fichier illisible : ce n’est pas du JSON valide.');
    }
    // Validation minimale mais suffisante pour éviter d'écraser avec n'importe quoi.
    if (
      !data ||
      typeof data !== 'object' ||
      !data.settings ||
      !Array.isArray(data.charges) ||
      !Array.isArray(data.credits) ||
      typeof data.months !== 'object'
    ) {
      throw new Error('Fichier invalide : structure de budget non reconnue.');
    }
    state = data;
    ensureMeta();
    rollover();
    save();
  }

  /* ------------------------------------------------------------------ *
   * Interface publique
   * ------------------------------------------------------------------ */

  return {
    // cycle de vie
    load,
    save,
    rollover,
    seed,
    resetAll,
    // dates
    monthKey,
    monthsBetween,
    daysInMonth,
    currentKey,
    currentMonth,
    // accès
    getState,
    // charges
    totalCharges,
    paidTotal,
    unpaidTotal,
    disponible,
    resteAVivre,
    chargesSorted,
    lateCount,
    togglePaid,
    addCharge,
    updateCharge,
    removeCharge,
    // épargne
    savingsMonth,
    savingsTotalAll,
    savingsSeries,
    addSaving,
    removeSaving,
    restoreSaving,
    // sorties
    outingsMonth,
    outingsRemaining,
    addOuting,
    removeOuting,
    restoreOuting,
    // crédits
    creditsRemainingTotal,
    creditsMonthlyTotal,
    creditMonthsLeft,
    addCreditPayment,
    updateCredit,
    removeCredit,
    // réglages / données
    updateSettings,
    setTheme,
    exportJSON,
    importJSON,
    markExported,
    snoozeBackup,
    backupStatus,
  };
})();

// Rendu disponible aussi pour un import Node éventuel (tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Store;
}
