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

  // Construit un état neuf avec les charges et crédits d'exemple.
  function seed() {
    const now = monthKey();

    const charges = [
      { name: 'Loyer', amount: 450, dueDay: 5 },
      { name: 'Énergie', amount: 100, dueDay: 10 },
      { name: 'Téléphone / internet', amount: 180, dueDay: 12 },
      { name: 'Crèche', amount: 240, dueDay: 5 },
      { name: 'Crédit voiture', amount: 330, dueDay: 15 },
      { name: 'Crédit consommation', amount: 150, dueDay: 15 },
      { name: 'Assurance voiture', amount: 126, dueDay: 20 },
      { name: 'Assurance habitation', amount: 45, dueDay: 20 },
      { name: 'Syndicat', amount: 25, dueDay: 25 },
      { name: 'Salle de sport', amount: 35, dueDay: 28 },
    ].map((c) => ({ id: uid(), ...c }));

    const credits = [
      { name: 'Crédit consommation', remaining: 2500, initial: 2500, monthly: 150, lastApplied: now },
      { name: 'Crédit voiture', remaining: 17780, initial: 17780, monthly: 330, lastApplied: now },
    ].map((c) => ({ id: uid(), ...c }));

    return {
      version: 1,
      settings: { income: 2500, savingsGoal: 150, outingBudget: 200 },
      charges,
      credits,
      months: {
        [now]: { paid: {}, savings: [], outings: [], envelope: 200 },
      },
      lastOpened: now,
    };
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

  // Exporte l'état complet en chaîne JSON lisible.
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  // Importe un JSON (chaîne). Valide la structure ; lève une erreur claire sinon.
  function importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
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
    chargesSorted,
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
    // sorties
    outingsMonth,
    outingsRemaining,
    addOuting,
    removeOuting,
    // crédits
    creditsRemainingTotal,
    creditsMonthlyTotal,
    creditMonthsLeft,
    addCreditPayment,
    updateCredit,
    removeCredit,
    // réglages / données
    updateSettings,
    exportJSON,
    importJSON,
  };
})();

// Rendu disponible aussi pour un import Node éventuel (tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Store;
}
