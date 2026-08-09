/*
 * app.js — Le chef d'orchestre.
 *   - démarre l'application (chargement, bascule de mois, service worker),
 *   - gère la navigation entre les vues,
 *   - contient une fonction de rendu par vue,
 *   - branche les formulaires (feuilles modales) et les actions.
 *
 * S'appuie sur Store (données) et UI (affichage).
 */

const App = (() => {
  // Vue affichée par défaut au lancement.
  let currentView = 'accueil';

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  function show(view) {
    currentView = view;

    // Bascule des sections visibles.
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('active', el.id === `view-${view}`);
    });

    // État actif des onglets du bas.
    document.querySelectorAll('.tab').forEach((el) => {
      const isActive = el.dataset.view === view;
      el.classList.toggle('active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    // Historique & Réglages masquent la barre d'onglets (vues « en pleine page »).
    const isSub = view === 'historique' || view === 'reglages';
    document.body.classList.toggle('subview', isSub);

    // On remonte en haut et on rend.
    window.scrollTo(0, 0);
    render();
  }

  /* ------------------------------------------------------------------ *
   * Rendu — aiguille vers la bonne fonction selon la vue courante
   * ------------------------------------------------------------------ */

  function render() {
    switch (currentView) {
      case 'accueil': renderAccueil(); break;
      case 'factures': renderFactures(); break;
      case 'epargne': renderEpargne(); break;
      case 'sorties': renderSorties(); break;
      case 'credits': renderCredits(); break;
      case 'historique': renderHistorique(); break;
      case 'reglages': renderReglages(); break;
    }
    updateBadge();
  }

  // Pastille sur l'icône de l'app (nombre de factures en retard).
  // Ne fonctionne que sur les PWA installées qui supportent l'API Badging.
  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
      const late = Store.lateCount();
      if (late > 0) navigator.setAppBadge(late);
      else if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    } catch (e) {
      /* silencieux : l'API peut échouer selon la plateforme */
    }
  }

  // Rafraîchit tout (utile après une action qui touche plusieurs vues).
  function refresh() {
    render();
  }

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ *
   * Vue Accueil
   * ------------------------------------------------------------------ */

  function renderAccueil() {
    const s = Store.getState();
    const paid = Store.paidTotal();
    const unpaid = Store.unpaidTotal();
    const income = s.settings.income;
    const free = Math.max(0, income - Store.totalCharges());

    // Position du jour courant dans le mois (pour le curseur du ruban).
    const now = new Date();
    const dayRatio = (now.getDate() - 0.5) / Store.daysInMonth(Store.currentKey());

    // Épargne du mois vers l'objectif.
    const saved = Store.savingsMonth();
    const goal = s.settings.savingsGoal || 0;
    const goalRatio = goal > 0 ? saved / goal : 0;

    // Sorties : reste dans l'enveloppe.
    const spent = Store.outingsMonth();
    const envelope = Store.currentMonth().envelope;
    const remaining = envelope - spent;
    const spentRatio = envelope > 0 ? spent / envelope : 0;

    // Prochaines échéances : 4 factures non payées, triées par jour.
    const upcoming = Store.chargesSorted().filter((c) => !c.paid).slice(0, 4);

    // Rappels : factures en retard + filet de sécurité des données.
    const late = Store.lateCount();
    const backup = Store.backupStatus();

    // Première utilisation (app vierge) : on accueille et on oriente.
    const firstRun =
      s.settings.income === 0 && s.charges.length === 0 && s.credits.length === 0;

    // Aperçu des crédits.
    const creditsHtml = s.credits
      .map((c) => {
        const months = Store.creditMonthsLeft(c);
        return `
          <div class="mini-credit">
            <span class="mini-credit-name">${UI.esc(c.name)}</span>
            <span class="mini-credit-info">${UI.money(c.remaining)} · ${months} mois</span>
          </div>`;
      })
      .join('');

    $('view-accueil').innerHTML = `
      <header class="home-header">
        <div>
          <p class="eyebrow">Ce mois-ci</p>
          <h1 class="home-month">${capitalize(UI.monthLabel(Store.currentKey()))} ${Store.currentKey().split('-')[0]}</h1>
        </div>
        <div class="home-actions">
          <button class="icon-btn" data-nav="historique" aria-label="Historique" title="Historique">${icon('history')}</button>
          <button class="icon-btn" data-nav="reglages" aria-label="Réglages" title="Réglages">${icon('gear')}</button>
        </div>
      </header>

      <!-- Première utilisation : bienvenue et premiers pas -->
      ${firstRun
        ? `<div class="alert welcome">
             <span>Bienvenue sur Oboli 👋 Commence par indiquer ton revenu, puis ajoute tes factures.</span>
             <span class="alert-actions">
               <button class="link" data-nav="reglages">Réglages</button>
               <button class="link" data-nav="factures">Factures</button>
             </span>
           </div>`
        : ''}

      <!-- Rappels : en retard (corail) puis sauvegarde (ambre) -->
      ${late > 0
        ? `<button class="alert late" data-nav="factures">
             <span>${late} facture${late > 1 ? 's' : ''} en retard</span>
             <span class="alert-cta">Voir →</span>
           </button>`
        : ''}
      ${backup.needed
        ? `<div class="alert backup">
             <span>${backup.days == null
               ? 'Pense à sauvegarder tes données.'
               : `Dernière sauvegarde il y a ${backup.days} jours.`}</span>
             <span class="alert-actions">
               <button class="link" data-action="do-backup">Exporter</button>
               <button class="link muted" data-action="snooze-backup">Plus tard</button>
             </span>
           </div>`
        : ''}

      <!-- Le ruban du mois : la première chose à regarder -->
      <section class="card ribbon-card">
        ${UI.ribbon({ paid, unpaid, free, income, dayRatio })}
        <div class="ribbon-legend">
          <span><i class="dot mint"></i>Payé <b>${UI.money(paid)}</b></span>
          <span><i class="dot amber"></i>À payer <b>${UI.money(unpaid)}</b></span>
          <span><i class="dot free"></i>Libre <b>${UI.money(free)}</b></span>
        </div>
      </section>

      <!-- Grand chiffre : disponible après charges fixes -->
      <section class="card big-figure">
        <p class="eyebrow">Disponible après charges fixes</p>
        <p class="figure ${Store.disponible() < 0 ? 'neg' : ''}">${UI.money(Store.disponible())}</p>
        <p class="subtle">${UI.money(income)} de revenu − ${UI.money(Store.totalCharges())} de charges</p>
      </section>

      <!-- Deux cartes : épargne du mois & sorties -->
      <div class="grid-2">
        <section class="card">
          <p class="eyebrow">Épargne du mois</p>
          <p class="figure-sm mint">${UI.money(saved)}</p>
          <p class="subtle">Objectif ${UI.money(goal)}</p>
          ${UI.bar(goalRatio)}
        </section>
        <section class="card">
          <p class="eyebrow">Sorties</p>
          <p class="figure-sm ${remaining < 0 ? 'coral' : ''}">${UI.money(remaining)}</p>
          <p class="subtle">restant sur ${UI.money(envelope)}</p>
          ${UI.bar(spentRatio, spentRatio > 0.85)}
        </section>
      </div>

      <!-- Prochaines échéances -->
      <section class="card">
        <div class="card-head">
          <h2>Prochaines échéances</h2>
          <button class="link" data-nav="factures">Tout voir</button>
        </div>
        ${upcoming.length
          ? `<ul class="list compact">${upcoming.map(homeChargeRow).join('')}</ul>`
          : s.charges.length === 0
            ? `<p class="empty">Aucune facture enregistrée pour l’instant.</p>`
            : `<p class="empty">Tout est payé — aucune échéance en attente ce mois-ci.</p>`}
      </section>

      <!-- Aperçu des crédits -->
      <section class="card">
        <div class="card-head">
          <h2>Crédits</h2>
          <button class="link" data-nav="credits">Détail</button>
        </div>
        ${s.credits.length
          ? `<div class="mini-credits">${creditsHtml}</div>`
          : `<p class="empty">Aucun crédit en cours. Rien à rembourser, c’est déjà ça.</p>`}
      </section>
    `;
  }

  function homeChargeRow(c) {
    return `
      <li class="row">
        <span class="row-main">
          <span class="row-name">${UI.esc(c.name)}</span>
          <span class="row-sub">le ${c.dueDay}${c.late ? ' <span class="badge late">En retard</span>' : ''}</span>
        </span>
        <span class="row-amount">${UI.money(c.amount)}</span>
      </li>`;
  }

  /* ------------------------------------------------------------------ *
   * Vue Factures
   * ------------------------------------------------------------------ */

  function renderFactures() {
    const charges = Store.chargesSorted();
    const total = Store.totalCharges();
    const paid = Store.paidTotal();
    const reste = total - paid;

    const rows = charges.map((c) => `
      <li class="row charge ${c.paid ? 'done' : ''}" data-id="${c.id}">
        <button class="check ${c.paid ? 'on' : ''}" data-action="toggle" data-id="${c.id}"
                aria-label="${c.paid ? 'Marquer comme non payé' : 'Marquer comme payé'}">
          ${c.paid ? icon('check') : ''}
        </button>
        <button class="row-main tap" data-action="edit-charge" data-id="${c.id}">
          <span class="row-name">${UI.esc(c.name)}</span>
          <span class="row-sub">le ${c.dueDay}${c.late ? ' <span class="badge late">En retard</span>' : ''}</span>
        </button>
        <span class="row-amount">${UI.money(c.amount)}</span>
        <button class="trash" data-action="del-charge" data-id="${c.id}" aria-label="Supprimer">${icon('trash')}</button>
      </li>`).join('');

    $('view-factures').innerHTML = `
      ${subHeader('Factures', `<button class="btn small" data-action="add-charge">+ Ajouter</button>`)}
      <section class="card summary-3">
        <div><p class="eyebrow">Total</p><p class="figure-xs">${UI.money(total)}</p></div>
        <div><p class="eyebrow">Payé</p><p class="figure-xs mint">${UI.money(paid)}</p></div>
        <div><p class="eyebrow">Reste</p><p class="figure-xs ${reste > 0 ? 'amber' : ''}">${UI.money(reste)}</p></div>
      </section>
      ${charges.length
        ? `<ul class="list">${rows}</ul>`
        : `<p class="empty card">Aucune facture pour l’instant. Ajoute ta première avec le bouton « + Ajouter » en haut.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Épargne
   * ------------------------------------------------------------------ */

  function renderEpargne() {
    const totalAll = Store.savingsTotalAll();
    const series = Store.savingsSeries();
    const month = Store.currentMonth();

    const rows = [...month.savings]
      .reverse()
      .map((v) => `
        <li class="row" data-id="${v.id}">
          <span class="row-main">
            <span class="row-name">${v.note ? UI.esc(v.note) : 'Versement'}</span>
            <span class="row-sub">${UI.shortDate(v.date)}</span>
          </span>
          <span class="row-amount mint">+${UI.money(v.amount)}</span>
          <button class="trash" data-action="del-saving" data-id="${v.id}" aria-label="Supprimer">${icon('trash')}</button>
        </li>`).join('');

    $('view-epargne').innerHTML = `
      ${subHeader('Épargne', `<button class="btn small" data-action="add-saving">+ Ajouter</button>`)}
      <section class="card savings-hero">
        <p class="eyebrow">Total mis de côté</p>
        <p class="figure">${UI.money(totalAll)}</p>
      </section>
      <section class="card">
        <h2>Évolution</h2>
        ${UI.savingsChart(series)}
      </section>
      <section class="card">
        <h2>Versements du mois</h2>
        ${month.savings.length
          ? `<ul class="list">${rows}</ul>`
          : `<p class="empty">Rien mis de côté ce mois-ci pour l’instant. Chaque euro compte.</p>`}
      </section>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Sorties
   * ------------------------------------------------------------------ */

  function renderSorties() {
    const month = Store.currentMonth();
    const spent = Store.outingsMonth();
    const remaining = month.envelope - spent;
    const over = remaining < 0;

    // Rythme conseillé : ce qu'il reste réparti sur les jours restants du mois.
    const now = new Date();
    const daysLeft = Store.daysInMonth(Store.currentKey()) - now.getDate() + 1;
    const perDay = !over && daysLeft > 0 ? remaining / daysLeft : null;

    const rows = [...month.outings]
      .reverse()
      .map((o) => `
        <li class="row" data-id="${o.id}">
          <span class="row-main">
            <span class="row-name">${o.label ? UI.esc(o.label) : 'Sortie'}</span>
            <span class="row-sub">${UI.shortDate(o.date)}</span>
          </span>
          <span class="row-amount">${UI.money(o.amount)}</span>
          <button class="trash" data-action="del-outing" data-id="${o.id}" aria-label="Supprimer">${icon('trash')}</button>
        </li>`).join('');

    $('view-sorties').innerHTML = `
      ${subHeader('Sorties', `<button class="btn small" data-action="add-outing">+ Ajouter</button>`)}
      <section class="card outings-hero ${over ? 'over' : ''}">
        <p class="eyebrow">Reste dans l’enveloppe</p>
        <p class="figure ${over ? 'coral' : ''}">${UI.money(remaining)}</p>
        ${over
          ? `<p class="subtle warn">Enveloppe dépassée. Ça se rattrape le mois prochain.</p>`
          : `<p class="subtle">sur ${UI.money(month.envelope)} ce mois-ci</p>
             ${perDay != null
               ? `<p class="subtle tiny">≈ ${UI.money(perDay)} par jour d’ici la fin du mois (${daysLeft} j)</p>`
               : ''}`}
      </section>
      <section class="card">
        <h2>Dépenses du mois</h2>
        ${month.outings.length
          ? `<ul class="list">${rows}</ul>`
          : `<p class="empty">L’enveloppe est intacte pour l’instant.</p>`}
      </section>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Crédits
   * ------------------------------------------------------------------ */

  function renderCredits() {
    const s = Store.getState();
    const totalRemaining = Store.creditsRemainingTotal();
    const totalMonthly = Store.creditsMonthlyTotal();

    const cards = s.credits.map((c) => {
      const months = Store.creditMonthsLeft(c);
      const repaid = Math.max(0, c.initial - c.remaining);
      const ratio = c.initial > 0 ? repaid / c.initial : 0;
      return `
        <section class="card credit" data-id="${c.id}">
          <div class="card-head">
            <h2>${UI.esc(c.name)}</h2>
            <span class="subtle">${UI.money(c.monthly)}/mois</span>
          </div>
          <p class="credit-remaining">${UI.money(c.remaining)}<span class="subtle"> restants</span></p>
          <p class="subtle">${formatMonths(months)}</p>
          ${UI.bar(ratio)}
          <p class="subtle tiny">${Math.round(ratio * 100)} % remboursé</p>
          <div class="credit-actions">
            <button class="btn small" data-action="credit-pay" data-id="${c.id}">Verser en plus</button>
            <button class="btn small ghost" data-action="credit-edit" data-id="${c.id}">Corriger</button>
            <button class="btn small ghost danger" data-action="credit-del" data-id="${c.id}">Supprimer</button>
          </div>
        </section>`;
    }).join('');

    $('view-credits').innerHTML = `
      ${subHeader('Crédits', `<button class="btn small" data-action="add-credit">+ Ajouter</button>`)}
      <section class="card summary-2">
        <div><p class="eyebrow">Restant à rembourser</p><p class="figure-xs">${UI.money(totalRemaining)}</p></div>
        <div><p class="eyebrow">Mensualités</p><p class="figure-xs">${UI.money(totalMonthly)}</p></div>
      </section>
      ${s.credits.length ? cards : `<p class="empty card">Aucun crédit. Profite de cette tranquillité.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Historique
   * ------------------------------------------------------------------ */

  function renderHistorique() {
    const s = Store.getState();
    const current = Store.currentKey();
    // Tous les mois sauf le mois courant, du plus récent au plus ancien.
    const keys = Object.keys(s.months).filter((k) => k !== current).sort().reverse();

    const cards = keys.map((k) => {
      const m = s.months[k];
      const paidCount = Object.keys(m.paid).length;
      const allPaid = s.charges.length > 0 && paidCount >= s.charges.length;
      const savings = m.savings.reduce((sum, v) => sum + v.amount, 0);
      const outings = m.outings.reduce((sum, v) => sum + v.amount, 0);
      const over = outings > m.envelope;
      return `
        <section class="card history">
          <div class="card-head">
            <h2>${capitalize(UI.monthLabel(k))} ${k.split('-')[0]}</h2>
            ${allPaid ? `<span class="badge ok">Tout payé</span>` : ''}
          </div>
          <div class="history-grid">
            <div><p class="eyebrow">Charges payées</p><p class="figure-xs">${paidCount}/${s.charges.length}</p></div>
            <div><p class="eyebrow">Épargne</p><p class="figure-xs mint">${UI.money(savings)}</p></div>
            <div><p class="eyebrow">Sorties</p><p class="figure-xs ${over ? 'coral' : ''}">${UI.money(outings)}</p></div>
            <div><p class="eyebrow">Enveloppe</p><p class="figure-xs">${UI.money(m.envelope)}</p></div>
          </div>
        </section>`;
    }).join('');

    $('view-historique').innerHTML = `
      ${backHeader('Historique')}
      ${keys.length
        ? cards
        : `<p class="empty card">Pas encore d’historique. Reviens le mois prochain : chaque mois clôturé s’ajoutera ici.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Réglages
   * ------------------------------------------------------------------ */

  function renderReglages() {
    const s = Store.getState();
    $('view-reglages').innerHTML = `
      ${backHeader('Réglages')}
      <section class="card">
        <h2>Ton budget</h2>
        <label class="field">
          <span>Revenu mensuel</span>
          <input type="number" inputmode="decimal" id="set-income" value="${s.settings.income}" step="1" min="0">
        </label>
        <label class="field">
          <span>Objectif d’épargne / mois</span>
          <input type="number" inputmode="decimal" id="set-goal" value="${s.settings.savingsGoal}" step="1" min="0">
        </label>
        <label class="field">
          <span>Enveloppe sorties / mois</span>
          <input type="number" inputmode="decimal" id="set-envelope" value="${s.settings.outingBudget}" step="1" min="0">
        </label>
        <button class="btn" data-action="save-settings">Enregistrer</button>
      </section>

      <section class="card">
        <h2>Sauvegarde</h2>
        <p class="subtle">Tes données ne quittent jamais ce téléphone. Exporte-les de temps en temps pour ne rien perdre.</p>
        <div class="btn-row">
          <button class="btn" data-action="export">Exporter (.json)</button>
          <button class="btn ghost" data-action="import">Importer un fichier</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>

      <section class="card danger-zone">
        <h2>Repartir de zéro</h2>
        <p class="subtle">Efface tout et repart d’une app vierge. Sans retour en arrière.</p>
        <button class="btn danger" data-action="reset">Tout effacer</button>
      </section>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Fragments d'en-tête réutilisables
   * ------------------------------------------------------------------ */

  function subHeader(title, actions = '') {
    return `<header class="sub-header"><h1>${title}</h1><div>${actions}</div></header>`;
  }

  function backHeader(title) {
    return `<header class="sub-header">
      <button class="icon-btn" data-nav="accueil" aria-label="Retour">${icon('back')}</button>
      <h1>${title}</h1><div></div>
    </header>`;
  }

  /* ------------------------------------------------------------------ *
   * Formulaires — feuilles modales
   * ------------------------------------------------------------------ */

  function chargeSheet(existing) {
    const c = existing || { name: '', amount: '', dueDay: '' };
    const body = `
      <label class="field"><span>Nom</span>
        <input id="f-name" type="text" value="${UI.esc(c.name)}" placeholder="Loyer, énergie…"></label>
      <label class="field"><span>Montant (€)</span>
        <input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${c.amount}"></label>
      <label class="field"><span>Jour d’échéance</span>
        <input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${c.dueDay}"></label>
      <button class="btn" id="f-save">${existing ? 'Enregistrer' : 'Ajouter la facture'}</button>
    `;
    UI.openSheet(existing ? 'Modifier la facture' : 'Nouvelle facture', body, (sheet) => {
      sheet.querySelector('#f-save').addEventListener('click', () => {
        const name = sheet.querySelector('#f-name').value.trim();
        const amount = parseFloat(sheet.querySelector('#f-amount').value);
        const dueDay = parseInt(sheet.querySelector('#f-day').value, 10);
        if (!name || !(amount >= 0) || !(dueDay >= 1 && dueDay <= 31)) {
          UI.toast('Vérifie le nom, le montant et le jour.');
          return;
        }
        if (existing) {
          Store.updateCharge(existing.id, { name, amount, dueDay });
          UI.toast('Facture modifiée.');
        } else {
          Store.addCharge({ name, amount, dueDay });
          UI.toast('Facture ajoutée.');
        }
        UI.closeSheet();
        refresh();
      });
    });
  }

  function savingSheet() {
    const body = `
      <label class="field"><span>Montant (€)</span>
        <input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="50"></label>
      <label class="field"><span>Note (facultatif)</span>
        <input id="f-note" type="text" placeholder="Prime, économie du mois…"></label>
      <button class="btn" id="f-save">Mettre de côté</button>
    `;
    UI.openSheet('Nouveau versement', body, (sheet) => {
      sheet.querySelector('#f-save').addEventListener('click', () => {
        const amount = parseFloat(sheet.querySelector('#f-amount').value);
        const note = sheet.querySelector('#f-note').value.trim();
        if (!(amount > 0)) { UI.toast('Indique un montant.'); return; }
        Store.addSaving({ amount, note });
        UI.closeSheet();
        UI.toast('Épargne enregistrée.');
        refresh();
      });
    });
  }

  function outingSheet() {
    const body = `
      <label class="field"><span>Montant (€)</span>
        <input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="25"></label>
      <label class="field"><span>Intitulé</span>
        <input id="f-label" type="text" placeholder="Restaurant, cinéma…"></label>
      <button class="btn" id="f-save">Ajouter la dépense</button>
    `;
    UI.openSheet('Nouvelle sortie', body, (sheet) => {
      sheet.querySelector('#f-save').addEventListener('click', () => {
        const amount = parseFloat(sheet.querySelector('#f-amount').value);
        const label = sheet.querySelector('#f-label').value.trim();
        if (!(amount > 0)) { UI.toast('Indique un montant.'); return; }
        Store.addOuting({ amount, label });
        UI.closeSheet();
        UI.toast('Sortie enregistrée.');
        refresh();
      });
    });
  }

  function creditPaySheet(credit) {
    const body = `
      <p class="subtle">Solde actuel : ${UI.money(credit.remaining)}</p>
      <label class="field"><span>Montant versé en plus (€)</span>
        <input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="500"></label>
      <button class="btn" id="f-save">Verser en plus</button>
    `;
    UI.openSheet('Remboursement anticipé', body, (sheet) => {
      sheet.querySelector('#f-save').addEventListener('click', () => {
        const amount = parseFloat(sheet.querySelector('#f-amount').value);
        if (!(amount > 0)) { UI.toast('Indique un montant.'); return; }
        Store.addCreditPayment(credit.id, amount);
        UI.closeSheet();
        UI.toast('Versement déduit du solde.');
        refresh();
      });
    });
  }

  function creditEditSheet(existing) {
    const c = existing || { name: '', remaining: '', monthly: '' };
    const isNew = !existing;
    const body = `
      ${isNew ? `<label class="field"><span>Nom</span>
        <input id="f-name" type="text" placeholder="Crédit auto…"></label>` : ''}
      <label class="field"><span>Restant dû (€)</span>
        <input id="f-remaining" type="number" inputmode="decimal" step="0.01" min="0" value="${c.remaining}"></label>
      <label class="field"><span>Mensualité (€)</span>
        <input id="f-monthly" type="number" inputmode="decimal" step="0.01" min="0" value="${c.monthly}"></label>
      <button class="btn" id="f-save">${isNew ? 'Ajouter le crédit' : 'Enregistrer'}</button>
    `;
    UI.openSheet(isNew ? 'Nouveau crédit' : 'Corriger le crédit', body, (sheet) => {
      sheet.querySelector('#f-save').addEventListener('click', () => {
        const remaining = parseFloat(sheet.querySelector('#f-remaining').value);
        const monthly = parseFloat(sheet.querySelector('#f-monthly').value);
        if (!(remaining >= 0) || !(monthly >= 0)) { UI.toast('Vérifie les montants.'); return; }
        if (isNew) {
          const name = sheet.querySelector('#f-name').value.trim();
          if (!name) { UI.toast('Donne un nom au crédit.'); return; }
          const s = Store.getState();
          s.credits.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name, remaining, initial: remaining, monthly,
            lastApplied: Store.currentKey(),
          });
          Store.save();
          UI.toast('Crédit ajouté.');
        } else {
          Store.updateCredit(existing.id, { remaining, monthly });
          UI.toast('Crédit corrigé.');
        }
        UI.closeSheet();
        refresh();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Confirmation générique (feuille modale)
   * ------------------------------------------------------------------ */

  function confirmSheet(title, message, confirmLabel, onConfirm, danger = true) {
    const body = `
      <p class="subtle">${message}</p>
      <div class="btn-row">
        <button class="btn ghost" id="c-cancel">Annuler</button>
        <button class="btn ${danger ? 'danger' : ''}" id="c-ok">${confirmLabel}</button>
      </div>
    `;
    UI.openSheet(title, body, (sheet) => {
      sheet.querySelector('#c-cancel').addEventListener('click', UI.closeSheet);
      sheet.querySelector('#c-ok').addEventListener('click', () => {
        UI.closeSheet();
        onConfirm();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Export / Import
   * ------------------------------------------------------------------ */

  function doExport() {
    const data = Store.exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oboli-${Store.currentKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Store.markExported(); // met à jour le filet de sécurité des données
    UI.toast('Export téléchargé.');
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importJSON(reader.result);
        UI.toast('Données importées.');
        refresh();
      } catch (e) {
        UI.toast(e.message || 'Import impossible.');
      }
    };
    reader.onerror = () => UI.toast('Lecture du fichier impossible.');
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Gestion centralisée des clics (délégation d'événements)
   * ------------------------------------------------------------------ */

  function onClick(e) {
    // Navigation par boutons icônes / liens.
    const nav = e.target.closest('[data-nav]');
    if (nav) { show(nav.dataset.nav); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const s = Store.getState();

    switch (action) {
      case 'toggle':
        Store.togglePaid(id);
        refresh();
        break;

      case 'add-charge': chargeSheet(); break;
      case 'edit-charge':
        chargeSheet(s.charges.find((c) => c.id === id));
        break;
      case 'del-charge': {
        const c = s.charges.find((x) => x.id === id);
        confirmSheet('Supprimer la facture', `Supprimer « ${c ? UI.esc(c.name) : ''} » ?`, 'Supprimer', () => {
          Store.removeCharge(id); UI.toast('Facture supprimée.'); refresh();
        });
        break;
      }

      case 'add-saving': savingSheet(); break;
      case 'del-saving': {
        const list = Store.currentMonth().savings;
        const idx = list.findIndex((x) => x.id === id);
        const item = list[idx];
        Store.removeSaving(id);
        refresh();
        UI.toast('Versement supprimé.', {
          actionLabel: 'Annuler',
          onAction: () => { Store.restoreSaving(item, idx); refresh(); UI.toast('Versement restauré.'); },
        });
        break;
      }

      case 'add-outing': outingSheet(); break;
      case 'del-outing': {
        const list = Store.currentMonth().outings;
        const idx = list.findIndex((x) => x.id === id);
        const item = list[idx];
        Store.removeOuting(id);
        refresh();
        UI.toast('Sortie supprimée.', {
          actionLabel: 'Annuler',
          onAction: () => { Store.restoreOuting(item, idx); refresh(); UI.toast('Sortie restaurée.'); },
        });
        break;
      }

      case 'add-credit': creditEditSheet(); break;
      case 'credit-pay': creditPaySheet(s.credits.find((c) => c.id === id)); break;
      case 'credit-edit': creditEditSheet(s.credits.find((c) => c.id === id)); break;
      case 'credit-del': {
        const c = s.credits.find((x) => x.id === id);
        confirmSheet('Supprimer le crédit', `Supprimer « ${c ? UI.esc(c.name) : ''} » ?`, 'Supprimer', () => {
          Store.removeCredit(id); UI.toast('Crédit supprimé.'); refresh();
        });
        break;
      }

      case 'save-settings': {
        const income = parseFloat($('set-income').value) || 0;
        const goal = parseFloat($('set-goal').value) || 0;
        const envelope = parseFloat($('set-envelope').value) || 0;
        Store.updateSettings({ income, savingsGoal: goal, outingBudget: envelope });
        UI.toast('Réglages enregistrés.');
        break;
      }

      case 'export': doExport(); break;
      case 'import': $('import-file').click(); break;

      case 'do-backup': doExport(); refresh(); break;
      case 'snooze-backup':
        Store.snoozeBackup(); refresh(); UI.toast('Rappel repoussé d’une semaine.');
        break;

      case 'reset':
        confirmSheet(
          'Repartir de zéro',
          'Tout sera effacé et l’app repartira vierge. Cette action est définitive.',
          'Tout effacer',
          () => { Store.resetAll(); UI.toast('Données réinitialisées.'); show('accueil'); }
        );
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Icônes SVG en ligne (pas d'images externes)
   * ------------------------------------------------------------------ */

  function icon(name) {
    const paths = {
      history: '<path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 5v4h4" />',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
      check: '<path d="M20 6L9 17l-5-5"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
      home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
      bill: '<path d="M4 2h16v20l-3-2-3 2-2-2-2 2-3-2V2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
      piggy: '<path d="M4 12a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3a2 2 0 0 1-2 2h-1l-1 2h-3l-1-2H9l-1 2H5a2 2 0 0 1-2-2z"/><circle cx="15" cy="11" r="1"/>',
      cup: '<path d="M5 8h14v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z"/><path d="M19 9h1a2 2 0 0 1 0 4h-1"/><path d="M8 3v2M12 3v2M16 3v2"/>',
      card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  /* ------------------------------------------------------------------ *
   * Utilitaires divers
   * ------------------------------------------------------------------ */

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }


  // Nombre de mois → « 1 an et 2 mois » si ≥ 12, sinon « 8 mois ».
  function formatMonths(n) {
    if (n <= 0) return 'Soldé';
    if (n < 12) return `${n} mois restants`;
    const years = Math.floor(n / 12);
    const rest = n % 12;
    const y = `${years} an${years > 1 ? 's' : ''}`;
    const m = rest ? ` et ${rest} mois` : '';
    return `${y}${m} restants`;
  }

  /* ------------------------------------------------------------------ *
   * Démarrage
   * ------------------------------------------------------------------ */

  function init() {
    Store.load();

    // Onglets du bas.
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => show(tab.dataset.view));
    });

    // Un seul écouteur de clic pour toute l'app (délégation).
    document.body.addEventListener('click', onClick);

    // Import de fichier (l'input est recréé à chaque rendu des réglages).
    document.body.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'import-file' && e.target.files[0]) {
        doImport(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Retour au premier plan : on rebascule le mois si besoin, puis on rerend.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        Store.rollover();
        render();
      }
    });

    // On demande un stockage « persistant » : le navigateur évite alors
    // d'effacer nos données pour faire de la place. Filet de sécurité.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Enregistrement du service worker avec mise à jour automatique.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) =>
          console.warn('Service worker non enregistré :', err));

        // Si l'app était déjà contrôlée par un worker, un changement de
        // contrôleur = une nouvelle version vient de s'activer → on recharge
        // une seule fois pour servir les fichiers à jour. (Pas de rechargement
        // au tout premier lancement, où il n'y a pas encore de contrôleur.)
        if (navigator.serviceWorker.controller) {
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          });
        }
      });
    }

    show('accueil');
  }

  return { init, show, refresh };
})();

document.addEventListener('DOMContentLoaded', App.init);
