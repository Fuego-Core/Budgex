/*
 * app.js — Le chef d'orchestre (thème Nocturne).
 *   - démarre l'app (chargement, bascule de mois, service worker),
 *   - navigation entre les vues,
 *   - une fonction de rendu par vue,
 *   - feuilles modales et actions.
 *
 * S'appuie sur Store (données) et UI (affichage + animations).
 */

const App = (() => {
  let currentView = 'accueil';

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  function show(view) {
    currentView = view;

    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('active', el.id === `view-${view}`);
    });

    document.querySelectorAll('.tab').forEach((el) => {
      const isActive = el.dataset.view === view;
      el.classList.toggle('active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    const isSub = view === 'historique' || view === 'reglages';
    document.body.classList.toggle('subview', isSub);

    window.scrollTo(0, 0);
    render();
  }

  /* ------------------------------------------------------------------ *
   * Rendu
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
    UI.activate($(`view-${currentView}`));
    updateBadge();
  }

  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
      const late = Store.lateCount();
      if (late > 0) navigator.setAppBadge(late);
      else if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    } catch (e) { /* silencieux */ }
  }

  function refresh() { render(); }

  /* ------------------------------------------------------------------ *
   * Vue Accueil
   * ------------------------------------------------------------------ */

  function renderAccueil() {
    const s = Store.getState();
    const paid = Store.paidTotal();
    const unpaid = Store.unpaidTotal();
    const income = s.settings.income;

    const saved = Store.savingsMonth();
    const goal = s.settings.savingsGoal || 0;
    const goalRatio = goal > 0 ? saved / goal : 0;

    const spent = Store.outingsMonth();
    const envelope = Store.currentMonth().envelope;
    const remaining = envelope - spent;
    const spentRatio = envelope > 0 ? spent / envelope : 0;

    const f = Store.forecast();
    const upcoming = Store.chargesSorted().filter((c) => !c.paid).slice(0, 3);
    const late = Store.lateCount();
    const backup = Store.backupStatus();

    const firstRun = income === 0 && s.charges.length === 0 && s.credits.length === 0;

    const creditsHtml = s.credits.map((c) => `
      <div class="mini-credit">
        <span>${UI.esc(c.name)}</span>
        <span class="mini-credit-info">${UI.money(c.remaining)} · ${Store.creditMonthsLeft(c)} mois</span>
      </div>`).join('');

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

      ${firstRun ? `
        <div class="alert welcome">
          <span>Bienvenue sur Oboli. Commence par indiquer ton revenu, puis ajoute tes factures.</span>
          <span class="alert-actions">
            <button class="link" data-nav="reglages">Réglages</button>
            <button class="link" data-nav="factures">Factures</button>
          </span>
        </div>` : ''}

      ${late > 0 ? `
        <button class="alert late" data-nav="factures">
          <span><i class="dot-live"></i>${late} facture${late > 1 ? 's' : ''} en retard</span>
          <span class="alert-cta">Voir →</span>
        </button>` : ''}

      ${backup.needed ? `
        <div class="alert backup">
          <span>${backup.days == null ? 'Pense à sauvegarder tes données.' : `Dernière sauvegarde il y a ${backup.days} jours.`}</span>
          <span class="alert-actions">
            <button class="link" data-action="do-backup">Exporter</button>
            <button class="link muted" data-action="snooze-backup">Plus tard</button>
          </span>
        </div>` : ''}

      <section class="card dial-card">
        ${UI.dial({
          paid, unpaid, income,
          centerLabel: 'Disponible',
          centerValue: Store.disponible(),
          centerSub: `sur ${UI.money(income)} de revenu`,
        })}
        <div class="legend">
          <span><i class="dot mint"></i>Payé <b>${UI.money(paid)}</b></span>
          <span><i class="dot amber"></i>À payer <b>${UI.money(unpaid)}</b></span>
        </div>
      </section>

      <div class="quick">
        <button data-action="add-outing">${icon('plus')}Sortie</button>
        <button data-action="add-saving">${icon('up')}Épargner</button>
        <button data-nav="factures">${icon('check')}Pointer</button>
      </div>

      <div class="grid-2">
        <section class="card">
          <p class="eyebrow">Épargne</p>
          <p class="figure-sm mint-t">${UI.money(saved)}</p>
          ${UI.bar(goalRatio)}
          <p class="subtle tiny">${goal > 0 ? `${Math.round(goalRatio * 100)} % de l’objectif` : 'Pas d’objectif fixé'}</p>
        </section>
        <section class="card">
          <p class="eyebrow">Sorties</p>
          <p class="figure-sm${remaining < 0 ? ' coral-t' : ''}">${UI.money(remaining)}</p>
          ${UI.bar(spentRatio, spentRatio > 0.85)}
          <p class="subtle tiny">restant sur ${UI.money(envelope)}</p>
        </section>
      </div>

      ${envelope > 0 && spent > 0 ? `
        <section class="card">
          <div class="card-head">
            <h2>Fin de mois estimée</h2>
            <span class="badge ${f.over ? 'warn' : 'ok'}">${f.over ? 'Dépassement' : 'Dans les clous'}</span>
          </div>
          <p class="subtle" style="margin-top:2px">
            À ce rythme : <b class="${f.over ? 'amber-t' : 'mint-t'}">${UI.money(f.projected)}</b> de sorties sur ${UI.money(f.envelope)}.
            ${f.over ? '' : `Il reste ${UI.money(f.perDay)} par jour sur ${f.daysLeft} j.`}
          </p>
        </section>` : ''}

      <section class="card">
        <div class="card-head">
          <h2>Prochaines échéances</h2>
          <button class="link" data-nav="factures">Tout voir</button>
        </div>
        ${upcoming.length
          ? `<ul class="list stagger">${upcoming.map(homeChargeRow).join('')}</ul>`
          : s.charges.length === 0
            ? `<p class="empty">Aucune facture enregistrée pour l’instant.</p>`
            : `<p class="empty">Tout est payé — aucune échéance en attente ce mois-ci.</p>`}
      </section>

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

  // Pastille de jour : en retard (corail), sous 7 jours (ambre), sinon neutre.
  function dayChipClass(c) {
    if (c.late) return 'day-chip late';
    if (c.daysLeft >= 0 && c.daysLeft <= 7) return 'day-chip soon';
    return 'day-chip';
  }

  function dueLabel(c) {
    if (c.late) return 'En retard';
    if (c.daysLeft === 0) return 'Aujourd’hui';
    if (c.daysLeft === 1) return 'Demain';
    if (c.daysLeft > 0) return `dans ${c.daysLeft} jours`;
    return `le ${c.dueDay}`;
  }

  function homeChargeRow(c) {
    return `
      <li class="row${c.late ? ' warn' : ''}">
        <span class="${dayChipClass(c)}">${String(c.dueDay).padStart(2, '0')}</span>
        <span class="row-main">
          <span class="row-name">${UI.esc(c.name)}</span>
          <span class="row-sub">${dueLabel(c)}</span>
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
    const done = charges.filter((c) => c.paid).length;

    const rows = charges.map((c) => `
      <li class="row charge ${c.paid ? 'done' : ''}${c.late ? ' warn' : ''}" data-id="${c.id}">
        <button class="check ${c.paid ? 'on' : ''}" data-action="toggle" data-id="${c.id}"
                aria-label="${c.paid ? 'Marquer comme non payé' : 'Marquer comme payé'}">
          ${c.paid ? icon('check') : ''}
        </button>
        <button class="row-main tap" data-action="edit-charge" data-id="${c.id}">
          <span class="row-name">${UI.esc(c.name)}</span>
          <span class="row-sub">${c.paid ? `payé · le ${c.dueDay}` : dueLabel(c)}</span>
        </button>
        <span class="row-amount">${UI.money(c.amount)}</span>
        <button class="trash" data-action="del-charge" data-id="${c.id}" aria-label="Supprimer">${icon('trash')}</button>
      </li>`).join('');

    $('view-factures').innerHTML = `
      ${subHeader('Factures', `<button class="btn small" data-action="add-charge">+ Ajouter</button>`)}
      <section class="card raised">
        <div class="card-head" style="align-items:flex-start">
          <div>
            <p class="eyebrow">Reste à payer</p>
            <p class="figure${reste > 0 ? ' amber-t' : ' mint-t'}" data-count="${reste}">${UI.money(reste)}</p>
          </div>
          <p class="subtle" style="text-align:right;margin:0">${done} sur ${charges.length}<br>pointées</p>
        </div>
        <div class="split">
          <i class="paid" style="flex-grow:${Math.max(paid, 0.001)}"></i>
          <i class="unpaid" style="flex-grow:${Math.max(reste, 0.001)}"></i>
        </div>
        <p class="subtle tiny">${UI.money(total)} de charges fixes ce mois-ci</p>
      </section>
      ${charges.length
        ? `<ul class="list stagger">${rows}</ul>`
        : `<p class="empty card">Aucune facture pour l’instant. Ajoute ta première avec « + Ajouter » en haut.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Épargne
   * ------------------------------------------------------------------ */

  function renderEpargne() {
    const totalAll = Store.savingsTotalAll();
    const series = Store.savingsSeries();
    const month = Store.currentMonth();
    const goal = Store.getState().settings.savingsGoal || 0;
    const saved = Store.savingsMonth();
    const streak = Store.savingsStreak();

    const rows = [...month.savings].reverse().map((v) => `
      <li class="row" data-id="${v.id}">
        <span class="day-chip">${icon('up')}</span>
        <span class="row-main">
          <span class="row-name">${v.note ? UI.esc(v.note) : 'Versement'}</span>
          <span class="row-sub">${UI.shortDate(v.date)}</span>
        </span>
        <span class="row-amount mint-t">+${UI.money(v.amount)}</span>
        <button class="trash" data-action="del-saving" data-id="${v.id}" aria-label="Supprimer">${icon('trash')}</button>
      </li>`).join('');

    $('view-epargne').innerHTML = `
      ${subHeader('Épargne', `<button class="btn small" data-action="add-saving">+ Ajouter</button>`)}
      <section class="card mint">
        <p class="eyebrow">Total mis de côté</p>
        <p class="figure" data-count="${totalAll}">${UI.money(totalAll)}</p>
        <p class="subtle">+${UI.money(saved)} ce mois-ci${streak > 1 ? ` · ${streak} mois d’affilée` : ''}</p>
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Évolution</h2>
          <span class="subtle" style="margin:0">${series.length} mois</span>
        </div>
        ${UI.savingsChart(series)}
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Versements du mois</h2>
          <span class="subtle" style="margin:0">${UI.money(saved)}${goal ? ` / ${UI.money(goal)}` : ''}</span>
        </div>
        ${month.savings.length
          ? `<ul class="list stagger">${rows}</ul>`
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
    const f = Store.forecast();
    const cats = Store.outingsByCategory();

    const rows = [...month.outings].reverse().map((o) => `
      <li class="row" data-id="${o.id}">
        <span class="day-chip">${String(new Date(o.date).getDate()).padStart(2, '0')}</span>
        <span class="row-main">
          <span class="row-name">${o.label ? UI.esc(o.label) : 'Sortie'}</span>
          <span class="row-sub">${UI.esc(o.category || 'Divers')} · ${UI.shortDate(o.date)}</span>
        </span>
        <span class="row-amount">${UI.money(o.amount)}</span>
        <button class="trash" data-action="del-outing" data-id="${o.id}" aria-label="Supprimer">${icon('trash')}</button>
      </li>`).join('');

    const catsHtml = cats.map((c) => `
      <div class="cat-row">
        <span class="cat-name">${UI.esc(c.name)}</span>
        <span class="cat-bar"><span data-width="${(c.ratio * 100).toFixed(1)}%"></span></span>
        <span class="cat-amount">${UI.money(c.total)}</span>
      </div>`).join('');

    $('view-sorties').innerHTML = `
      ${subHeader('Sorties', `<button class="btn small" data-action="add-outing">+ Ajouter</button>`)}
      <section class="card">
        ${UI.gauge({
          ratio: month.envelope > 0 ? spent / month.envelope : 0,
          label: over ? 'Dépassement' : 'Reste',
          value: Math.abs(remaining),
          sub: over ? 'Ça se rattrape le mois prochain.' : `sur ${UI.money(month.envelope)} · ${f.daysLeft} jours`,
          over,
        })}
      </section>

      <div class="grid-2">
        <section class="card">
          <p class="eyebrow">Rythme</p>
          <p class="figure-sm">${UI.money(f.perDay)}<span class="subtle" style="display:inline;margin-left:4px">/ jour</span></p>
        </section>
        <section class="card">
          <p class="eyebrow">Dépensé</p>
          <p class="figure-sm amber-t">${UI.money(spent)}</p>
        </section>
      </div>

      ${cats.length ? `
        <section class="card">
          <div class="card-head">
            <h2>Par catégorie</h2>
            <span class="subtle" style="margin:0">${UI.money(spent)} / ${UI.money(month.envelope)}</span>
          </div>
          <div class="cats">${catsHtml}</div>
        </section>` : ''}

      <section class="card">
        <div class="card-head">
          <h2>Dépenses du mois</h2>
          <span class="subtle" style="margin:0">${month.outings.length}</span>
        </div>
        ${month.outings.length
          ? `<ul class="list stagger">${rows}</ul>`
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
    const totalInitial = s.credits.reduce((sum, c) => sum + c.initial, 0);
    const repaidAll = Math.max(0, totalInitial - totalRemaining);
    const payoff = Store.creditsPayoffKey();

    const cards = s.credits.map((c) => {
      const months = Store.creditMonthsLeft(c);
      const repaid = Math.max(0, c.initial - c.remaining);
      const ratio = c.initial > 0 ? repaid / c.initial : 0;
      return `
        <section class="card credit" data-id="${c.id}">
          <div class="card-head">
            <h2>${UI.esc(c.name)}</h2>
            <span class="subtle" style="margin:0">${UI.money(c.monthly)}/mois</span>
          </div>
          <p class="credit-remaining">${UI.money(c.remaining)}<span class="subtle"> restants</span></p>
          ${UI.bar(ratio)}
          <div class="credit-meta">
            <span>${Math.round(ratio * 100)} % remboursé</span>
            <span>${formatMonths(months)}</span>
          </div>
          <div class="credit-actions">
            <button class="btn small" data-action="credit-pay" data-id="${c.id}">Verser en plus</button>
            <button class="btn small ghost" data-action="credit-edit" data-id="${c.id}">Corriger</button>
            <button class="btn small ghost" data-action="credit-del" data-id="${c.id}" aria-label="Supprimer">${icon('trash')}</button>
          </div>
        </section>`;
    }).join('');

    $('view-credits').innerHTML = `
      ${subHeader('Crédits', `<button class="btn small" data-action="add-credit">+ Ajouter</button>`)}
      ${s.credits.length ? `
        <section class="card raised">
          <div class="card-head" style="align-items:flex-start">
            <div>
              <p class="eyebrow">Restant à rembourser</p>
              <p class="figure" data-count="${totalRemaining}">${UI.money(totalRemaining)}</p>
            </div>
            <div style="text-align:right">
              <p class="eyebrow">Par mois</p>
              <p class="figure-xs">${UI.money(totalMonthly)}</p>
            </div>
          </div>
          <div class="split">
            <i class="paid" style="flex-grow:${Math.max(repaidAll, 0.001)}"></i>
            <i class="rest" style="flex-grow:${Math.max(totalRemaining, 0.001)}"></i>
          </div>
          <p class="subtle tiny">${payoff ? `Dernière échéance estimée : <b>${capitalize(UI.monthLabel(payoff))} ${payoff.split('-')[0]}</b>` : ''}</p>
        </section>` : ''}
      ${s.credits.length ? cards : `<p class="empty card">Aucun crédit. Profite de cette tranquillité.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Historique
   * ------------------------------------------------------------------ */

  function renderHistorique() {
    const s = Store.getState();
    const current = Store.currentKey();
    const keys = Object.keys(s.months).sort();
    const past = keys.filter((k) => k !== current).sort().reverse();

    // Barres : épargne des 6 derniers mois, mois courant inclus.
    const lastKeys = keys.slice(-6);
    const maxSaving = Math.max(...lastKeys.map((k) => Store.savingsMonth(k)), 1);
    const bars = lastKeys.map((k) => {
      const v = Store.savingsMonth(k);
      const h = Math.max(6, Math.round((v / maxSaving) * 88));
      const now = k === current;
      return `<div><i class="${now ? 'now' : ''}" style="height:${h}px"></i><small class="${now ? 'now' : ''}">${UI.monthLabel(k)}</small></div>`;
    }).join('');

    const cards = past.map((k) => {
      const m = s.months[k];
      const paidCount = Object.keys(m.paid).length;
      const allPaid = s.charges.length > 0 && paidCount >= s.charges.length;
      const savings = m.savings.reduce((sum, v) => sum + v.amount, 0);
      const outings = m.outings.reduce((sum, v) => sum + v.amount, 0);
      const over = outings > m.envelope;
      return `
        <section class="card">
          <div class="card-head">
            <h2>${capitalize(UI.monthLabel(k))} ${k.split('-')[0]}</h2>
            <span class="badge ${allPaid ? 'ok' : 'warn'}">${allPaid ? 'Tout payé' : `${paidCount}/${s.charges.length} payées`}</span>
          </div>
          <div style="display:flex;gap:22px">
            <div><p class="eyebrow">Épargne</p><p class="figure-xs mint-t">${UI.money(savings)}</p></div>
            <div><p class="eyebrow">Sorties</p><p class="figure-xs${over ? ' coral-t' : ''}">${UI.money(outings)}</p></div>
            <div><p class="eyebrow">Enveloppe</p><p class="figure-xs">${UI.money(m.envelope)}</p></div>
          </div>
        </section>`;
    }).join('');

    $('view-historique').innerHTML = `
      ${backHeader('Historique')}
      ${lastKeys.length > 1 ? `
        <section class="card raised">
          <p class="eyebrow">Épargne par mois</p>
          <div class="month-bars">${bars}</div>
        </section>` : ''}
      ${past.length
        ? `<div class="stagger">${cards}</div>`
        : `<p class="empty card">Pas encore d’historique. Reviens le mois prochain : chaque mois clôturé s’ajoutera ici.</p>`}
    `;
  }

  /* ------------------------------------------------------------------ *
   * Vue Réglages
   * ------------------------------------------------------------------ */

  function renderReglages() {
    const s = Store.getState();
    const backup = Store.backupStatus();
    $('view-reglages').innerHTML = `
      ${backHeader('Réglages')}
      <section class="card">
        <h2>Ton budget</h2>
        <label class="field">
          <span>Revenu mensuel</span>
          <span class="wrap"><input type="number" inputmode="decimal" id="set-income" value="${s.settings.income}" step="1" min="0"><span class="unit">€</span></span>
        </label>
        <label class="field">
          <span>Objectif d’épargne / mois</span>
          <span class="wrap"><input type="number" inputmode="decimal" id="set-goal" value="${s.settings.savingsGoal}" step="1" min="0"><span class="unit">€</span></span>
        </label>
        <label class="field">
          <span>Enveloppe sorties / mois</span>
          <span class="wrap"><input type="number" inputmode="decimal" id="set-envelope" value="${s.settings.outingBudget}" step="1" min="0"><span class="unit">€</span></span>
        </label>
        <button class="btn" data-action="save-settings">Enregistrer</button>
      </section>

      <section class="card">
        <h2>Sauvegarde</h2>
        <p class="subtle">Tes données ne quittent jamais ce téléphone.${
          backup.days != null ? ` Dernière sauvegarde il y a ${backup.days} jours.` : ' Aucune sauvegarde pour l’instant.'}</p>
        <div class="btn-row">
          <button class="btn soft" data-action="export">Exporter (.json)</button>
          <button class="btn ghost" data-action="import">Importer</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>

      <section class="card danger-zone">
        <h2>Repartir de zéro</h2>
        <p class="subtle">Efface tout et repart d’une app vierge. Sans retour en arrière.</p>
        <div style="margin-top:14px"><button class="btn danger" data-action="reset">Tout effacer</button></div>
      </section>
    `;
  }

  /* ------------------------------------------------------------------ *
   * Fragments d'en-tête
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
   * Feuilles modales
   * ------------------------------------------------------------------ */

  // Pastilles de montants : ajoutent au champ au lieu de le remplacer.
  function quickAmounts(values) {
    return `<div class="chips" data-quick>${values.map((v) => `<button type="button" class="chip" data-plus="${v}">+${v} €</button>`).join('')}</div>`;
  }

  function bindQuickAmounts(sheet) {
    const input = sheet.querySelector('#f-amount');
    sheet.querySelectorAll('[data-plus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = parseFloat(input.value) || 0;
        input.value = +(cur + parseFloat(btn.dataset.plus)).toFixed(2);
        input.dispatchEvent(new Event('input'));
      });
    });
  }

  function chargeSheet(existing) {
    const c = existing || { name: '', amount: '', dueDay: '' };
    const body = `
      <label class="field"><span>Nom</span>
        <span class="wrap"><input id="f-name" type="text" value="${UI.esc(c.name)}" placeholder="Loyer, énergie…"></span></label>
      <label class="field"><span>Montant</span>
        <span class="wrap"><input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${c.amount}"><span class="unit">€</span></span></label>
      <label class="field"><span>Jour d’échéance</span>
        <span class="wrap"><input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${c.dueDay}"><span class="unit">du mois</span></span></label>
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
        if (existing) { Store.updateCharge(existing.id, { name, amount, dueDay }); UI.toast('Facture modifiée.'); }
        else { Store.addCharge({ name, amount, dueDay }); UI.toast('Facture ajoutée.'); }
        UI.closeSheet();
        refresh();
      });
    });
  }

  function savingSheet() {
    const goal = Store.getState().settings.savingsGoal || 0;
    const saved = Store.savingsMonth();
    const body = `
      <label class="field big"><span>Montant</span>
        <span class="wrap"><input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="50"><span class="unit">€</span></span></label>
      ${quickAmounts([10, 20, 50, 100])}
      <label class="field"><span>Note (facultatif)</span>
        <span class="wrap"><input id="f-note" type="text" placeholder="Prime, économie du mois…"></span></label>
      <button class="btn" id="f-save">Mettre de côté</button>
      ${goal > 0 ? `<p class="sheet-hint">Objectif du mois : ${UI.money(saved)} / ${UI.money(goal)}</p>` : ''}
    `;
    UI.openSheet('Nouveau versement', body, (sheet) => {
      bindQuickAmounts(sheet);
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
    const remaining = Store.outingsRemaining();
    const body = `
      <label class="field big"><span>Montant</span>
        <span class="wrap"><input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="25"><span class="unit">€</span></span></label>
      ${quickAmounts([5, 10, 20, 50])}
      <label class="field"><span>Intitulé</span>
        <span class="wrap"><input id="f-label" type="text" placeholder="Restaurant, cinéma…"></span></label>
      <span class="field"><span>Catégorie</span></span>
      <div class="chips" data-cats>
        ${Store.CATEGORIES.map((c, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('')}
      </div>
      <button class="btn" id="f-save">Ajouter la dépense</button>
      <p class="sheet-hint" id="f-hint">Il reste ${UI.money(remaining)} dans l’enveloppe</p>
    `;
    UI.openSheet('Nouvelle sortie', body, (sheet) => {
      bindQuickAmounts(sheet);

      let category = Store.CATEGORIES[0];
      sheet.querySelectorAll('[data-cat]').forEach((chip) => {
        chip.addEventListener('click', () => {
          sheet.querySelectorAll('[data-cat]').forEach((c) => c.classList.remove('on'));
          chip.classList.add('on');
          category = chip.dataset.cat;
        });
      });

      // Aperçu vivant du reste d'enveloppe pendant la saisie.
      const input = sheet.querySelector('#f-amount');
      const hint = sheet.querySelector('#f-hint');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value) || 0;
        const left = remaining - v;
        hint.textContent = left >= 0
          ? `Il restera ${UI.money(left)} dans l’enveloppe`
          : `Enveloppe dépassée de ${UI.money(-left)}`;
        hint.style.color = left >= 0 ? '' : '#FF6F5E';
      });

      sheet.querySelector('#f-save').addEventListener('click', () => {
        const amount = parseFloat(input.value);
        const label = sheet.querySelector('#f-label').value.trim();
        if (!(amount > 0)) { UI.toast('Indique un montant.'); return; }
        Store.addOuting({ amount, label, category });
        UI.closeSheet();
        UI.toast('Sortie enregistrée.');
        refresh();
      });
    });
  }

  function creditPaySheet(credit) {
    const body = `
      <p class="subtle" style="margin-top:0">Solde actuel : ${UI.money(credit.remaining)}</p>
      <label class="field big"><span>Montant versé en plus</span>
        <span class="wrap"><input id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="500"><span class="unit">€</span></span></label>
      ${quickAmounts([100, 250, 500])}
      <button class="btn" id="f-save">Verser en plus</button>
    `;
    UI.openSheet('Remboursement anticipé', body, (sheet) => {
      bindQuickAmounts(sheet);
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
        <span class="wrap"><input id="f-name" type="text" placeholder="Crédit auto…"></span></label>` : ''}
      <label class="field"><span>Restant dû</span>
        <span class="wrap"><input id="f-remaining" type="number" inputmode="decimal" step="0.01" min="0" value="${c.remaining}"><span class="unit">€</span></span></label>
      <label class="field"><span>Mensualité</span>
        <span class="wrap"><input id="f-monthly" type="number" inputmode="decimal" step="0.01" min="0" value="${c.monthly}"><span class="unit">€</span></span></label>
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
          Store.addCredit({ name, remaining, monthly });
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

  function confirmSheet(title, message, confirmLabel, onConfirm) {
    const body = `
      <p class="subtle" style="margin-top:0">${message}</p>
      <div class="btn-row">
        <button class="btn ghost" id="c-cancel">Annuler</button>
        <button class="btn danger" id="c-ok">${confirmLabel}</button>
      </div>
    `;
    UI.openSheet(title, body, (sheet) => {
      sheet.querySelector('#c-cancel').addEventListener('click', UI.closeSheet);
      sheet.querySelector('#c-ok').addEventListener('click', () => { UI.closeSheet(); onConfirm(); });
    });
  }

  /* ------------------------------------------------------------------ *
   * Export / Import
   * ------------------------------------------------------------------ */

  function doExport() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oboli-${Store.currentKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Store.markExported();
    UI.toast('Export téléchargé.');
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try { Store.importJSON(reader.result); UI.toast('Données importées.'); refresh(); }
      catch (e) { UI.toast(e.message || 'Import impossible.'); }
    };
    reader.onerror = () => UI.toast('Lecture du fichier impossible.');
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Clics (délégation)
   * ------------------------------------------------------------------ */

  function onClick(e) {
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
      case 'edit-charge': chargeSheet(s.charges.find((c) => c.id === id)); break;
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
      case 'snooze-backup': Store.snoozeBackup(); refresh(); UI.toast('Rappel repoussé d’une semaine.'); break;

      case 'reset':
        confirmSheet('Repartir de zéro',
          'Tout sera effacé et l’app repartira vierge. Cette action est définitive.',
          'Oui, tout effacer',
          () => { Store.resetAll(); show('accueil'); UI.toast('Tout est effacé. On repart à neuf.'); });
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Icônes SVG en ligne
   * ------------------------------------------------------------------ */

  function icon(name) {
    const paths = {
      history: '<path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 5v4h4" />',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
      check: '<path d="M20 6L9 17l-5-5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      up: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  /* ------------------------------------------------------------------ *
   * Utilitaires
   * ------------------------------------------------------------------ */

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  function formatMonths(n) {
    if (n <= 0) return 'Soldé';
    if (n < 12) return `${n} mois restants`;
    const years = Math.floor(n / 12);
    const rest = n % 12;
    return `${years} an${years > 1 ? 's' : ''}${rest ? ` et ${rest} mois` : ''} restants`;
  }

  /* ------------------------------------------------------------------ *
   * Démarrage
   * ------------------------------------------------------------------ */

  function init() {
    Store.load();

    // Jeu de démonstration : ?demo dans l'URL (pour les captures / l'essai).
    if (location.search.includes('demo')) Store.seedDemo();

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => show(tab.dataset.view));
    });

    document.body.addEventListener('click', onClick);

    document.body.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'import-file' && e.target.files[0]) {
        doImport(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { Store.rollover(); render(); }
    });

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) =>
          console.warn('Service worker non enregistré :', err));

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
