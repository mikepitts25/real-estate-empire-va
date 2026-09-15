/* VA Home Loan Real Estate Empire — progress tracking, theme, and calculators. */
(function () {
  'use strict';

  var STORE_KEY = 'vaempire.progress.v1';
  var THEME_KEY = 'vaempire.theme.v1';

  /* ---------------- storage helpers (never throw) ---------------- */
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function save(state) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* private browsing — progress just won't persist */
    }
  }

  var state = load();
  if (!state.modules) state.modules = {};
  if (!state.checks) state.checks = {};

  /* ---------------- theme ---------------- */
  var themeBtn = document.getElementById('theme-toggle');
  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {}
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      if (!current) {
        current = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  }

  /* ---------------- mobile nav ---------------- */
  var navToggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------------- progress ---------------- */
  var page = document.body.getAttribute('data-page');

  function moduleLinks() {
    return Array.prototype.slice.call(document.querySelectorAll('.nav a[data-track-page]'));
  }

  function refreshProgress() {
    var links = moduleLinks();
    var total = 0;
    var done = 0;
    links.forEach(function (a) {
      var slug = a.getAttribute('data-track-page');
      if (!/^module-/.test(slug)) return;
      total++;
      if (state.modules[slug]) {
        done++;
        a.classList.add('is-done');
      } else {
        a.classList.remove('is-done');
      }
    });
    var pct = total ? Math.round((done / total) * 100) : 0;
    var bar = document.getElementById('progress-bar');
    var label = document.getElementById('progress-label');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '% complete (' + done + '/' + total + ')';
  }

  var moduleBox = document.getElementById('module-complete');
  if (moduleBox) {
    moduleBox.checked = !!state.modules[page];
    moduleBox.addEventListener('change', function () {
      state.modules[page] = moduleBox.checked;
      save(state);
      refreshProgress();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.checklist__box'), function (box) {
    var key = page + ':' + box.getAttribute('data-track');
    box.checked = !!state.checks[key];
    box.addEventListener('change', function () {
      state.checks[key] = box.checked;
      save(state);
    });
  });

  var reset = document.getElementById('reset-progress');
  if (reset) {
    reset.addEventListener('click', function () {
      if (!window.confirm('Clear all saved progress and checklist answers on this device?')) return;
      state = { modules: {}, checks: {} };
      save(state);
      if (moduleBox) moduleBox.checked = false;
      Array.prototype.forEach.call(document.querySelectorAll('.checklist__box'), function (b) { b.checked = false; });
      refreshProgress();
    });
  }

  refreshProgress();

  /* ---------------- calculator helpers ---------------- */
  var money = function (n) {
    if (!isFinite(n)) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  };
  var money2 = function (n) {
    if (!isFinite(n)) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var pct = function (n) { return (isFinite(n) ? n.toFixed(2) : '—') + '%'; };

  function val(scope, name) {
    var el = scope.querySelector('[data-field="' + name + '"]');
    if (!el) return 0;
    if (el.tagName === 'SELECT') return el.value;
    var n = parseFloat(String(el.value).replace(/[$,\s%]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function checked(scope, name) {
    var el = scope.querySelector('[data-field="' + name + '"]');
    return !!(el && el.checked);
  }
  function out(scope, name, text, tone) {
    var el = scope.querySelector('[data-out="' + name + '"]');
    if (!el) return;
    el.textContent = text;
    var box = el.closest('.calc__result');
    if (box) {
      box.classList.remove('is-good', 'is-bad');
      if (tone === 'good') box.classList.add('is-good');
      if (tone === 'bad') box.classList.add('is-bad');
    }
  }

  /** Monthly principal + interest. */
  function pAndI(principal, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var n = years * 12;
    if (n <= 0) return 0;
    if (r === 0) return principal / n;
    return (principal * r) / (1 - Math.pow(1 + r, -n));
  }

  /**
   * VA funding fee percentage. Rates follow the schedule in effect since
   * April 7, 2023 — always confirm current rates at va.gov before relying on them.
   */
  function fundingFeeRate(loanType, subsequentUse, downPct) {
    if (loanType === 'irrrl' || loanType === 'assumption') return 0.5;
    if (loanType === 'cashout') return subsequentUse ? 3.3 : 2.15;
    // purchase / construction
    if (downPct >= 10) return 1.25;
    if (downPct >= 5) return 1.5;
    return subsequentUse ? 3.3 : 2.15;
  }

  function bind(scope, fn) {
    Array.prototype.forEach.call(scope.querySelectorAll('input, select'), function (el) {
      el.addEventListener('input', fn);
      el.addEventListener('change', fn);
    });
    fn();
  }

  /* ---------------- calculator: VA funding fee ---------------- */
  var ffScope = document.querySelector('[data-calc="funding-fee"]');
  if (ffScope) {
    bind(ffScope, function () {
      var price = val(ffScope, 'price');
      var down = val(ffScope, 'down');
      var type = val(ffScope, 'type');
      var subsequent = val(ffScope, 'use') === 'subsequent';
      var exempt = checked(ffScope, 'exempt');

      var base = Math.max(price - down, 0);
      var downPct = price > 0 ? (down / price) * 100 : 0;
      var rate = exempt ? 0 : fundingFeeRate(type, subsequent, downPct);
      var fee = base * (rate / 100);

      out(ffScope, 'rate', exempt ? 'Exempt' : pct(rate));
      out(ffScope, 'fee', money(fee), exempt ? 'good' : null);
      out(ffScope, 'base', money(base));
      out(ffScope, 'financed', money(base + fee));
      out(ffScope, 'downpct', pct(downPct));
    });
  }

  /* ---------------- calculator: entitlement ---------------- */
  var entScope = document.querySelector('[data-calc="entitlement"]');
  if (entScope) {
    bind(entScope, function () {
      var limit = val(entScope, 'limit');
      var used = val(entScope, 'used');
      var price = val(entScope, 'price');
      var full = checked(entScope, 'full');

      var maxGuaranty = limit * 0.25;
      var available = Math.max(maxGuaranty - used, 0);
      var maxZeroDown = available * 4;
      var downNeeded = full ? 0 : Math.max((price - maxZeroDown) * 0.25, 0);

      out(entScope, 'maxguaranty', money(maxGuaranty));
      out(entScope, 'available', money(available));
      out(entScope, 'maxzero', full ? 'No limit*' : money(maxZeroDown));
      out(entScope, 'down', money(downNeeded), downNeeded === 0 ? 'good' : null);
      out(entScope, 'guarantypct', price > 0 ? pct(((available + downNeeded) / price) * 100) : '—');
    });
  }

  /* ---------------- calculator: house hack ---------------- */
  var hhScope = document.querySelector('[data-calc="house-hack"]');
  if (hhScope) {
    bind(hhScope, function () {
      var price = val(hhScope, 'price');
      var down = val(hhScope, 'down');
      var rate = val(hhScope, 'rate');
      var years = val(hhScope, 'term') || 30;
      var feeRate = val(hhScope, 'feerate');
      var taxes = val(hhScope, 'taxes');
      var ins = val(hhScope, 'insurance');
      var hoa = val(hhScope, 'hoa');
      var rentOther = val(hhScope, 'rentother');
      var rentYours = val(hhScope, 'rentyours');
      var vacancy = val(hhScope, 'vacancy');
      var maint = val(hhScope, 'maint');
      var capex = val(hhScope, 'capex');
      var mgmt = val(hhScope, 'mgmt');
      var closing = val(hhScope, 'closing');
      var credits = val(hhScope, 'credits');
      var currentRent = val(hhScope, 'currentrent');

      var baseLoan = Math.max(price - down, 0);
      var fee = baseLoan * (feeRate / 100);
      var loan = baseLoan + fee;
      var pi = pAndI(loan, rate, years);
      var piti = pi + taxes / 12 + ins / 12 + hoa;

      // While you live there: only the other units pay rent.
      var reservePctLive = (vacancy + maint + capex + mgmt) / 100;
      var netLive = rentOther * (1 - reservePctLive);
      var housingCost = piti - netLive;

      // After you move out and rent your unit too.
      var grossFull = rentOther + rentYours;
      var netFull = grossFull * (1 - reservePctLive);
      var cashFlow = netFull - piti;

      var cashToClose = Math.max(down + closing - credits, 0);
      var annualCF = cashFlow * 12;
      var coc = cashToClose > 0 ? (annualCF / cashToClose) * 100 : NaN;
      var savings = currentRent - housingCost;

      out(hhScope, 'loan', money(loan));
      out(hhScope, 'fee', money(fee));
      out(hhScope, 'piti', money2(piti));
      out(hhScope, 'housing', money2(housingCost), housingCost <= 0 ? 'good' : (savings > 0 ? 'good' : 'bad'));
      out(hhScope, 'savings', money2(savings), savings > 0 ? 'good' : 'bad');
      out(hhScope, 'cashflow', money2(cashFlow), cashFlow > 0 ? 'good' : 'bad');
      out(hhScope, 'cashtoclose', money(cashToClose));
      // With $0 down and seller-paid costs there is no denominator: the metric is undefined,
      // not zero. Say so rather than printing a misleading 0%.
      out(hhScope, 'coc', isFinite(coc) ? pct(coc) : 'n/a — no cash in', coc >= 8 ? 'good' : (coc < 0 ? 'bad' : null));
      out(hhScope, 'onepct', price > 0 ? pct((grossFull / price) * 100) : '—', grossFull / price >= 0.008 ? 'good' : null);
    });
  }

  /* ---------------- calculator: portfolio projection ---------------- */
  var pfScope = document.querySelector('[data-calc="portfolio"]');
  if (pfScope) {
    bind(pfScope, function () {
      var years = val(pfScope, 'years') || 10;
      var monthsBetween = val(pfScope, 'cadence') || 24;
      var doorsPer = val(pfScope, 'doors') || 2;
      var cfPerDoor = val(pfScope, 'cfdoor');
      var equityPer = val(pfScope, 'equity');
      var price = val(pfScope, 'price');
      var appreciation = val(pfScope, 'appreciation');

      var months = years * 12;
      var buys = Math.floor(months / monthsBetween) + 1;
      var doors = 0;
      var cashFlow = 0;
      var equity = 0;
      var value = 0;

      for (var b = 0; b < buys; b++) {
        var heldMonths = months - b * monthsBetween;
        if (heldMonths <= 0) break;
        var heldYears = heldMonths / 12;
        doors += doorsPer;
        // Your own unit only starts producing rent after you move on (next purchase).
        var rentingDoors = b === buys - 1 ? doorsPer - 1 : doorsPer;
        cashFlow += Math.max(rentingDoors, 0) * cfPerDoor;
        value += price * Math.pow(1 + appreciation / 100, heldYears);
        equity += equityPer * heldYears + price * (Math.pow(1 + appreciation / 100, heldYears) - 1);
      }

      out(pfScope, 'properties', String(buys));
      out(pfScope, 'doors', String(doors));
      out(pfScope, 'cashflow', money(cashFlow) + '/mo', cashFlow > 0 ? 'good' : null);
      out(pfScope, 'annual', money(cashFlow * 12));
      out(pfScope, 'value', money(value));
      out(pfScope, 'equity', money(equity), 'good');
    });
  }

  /* ---------------- calculator: residual income / DTI check ---------------- */
  var dtiScope = document.querySelector('[data-calc="dti"]');
  if (dtiScope) {
    bind(dtiScope, function () {
      var gross = val(dtiScope, 'gross');
      var rentalCredit = val(dtiScope, 'rental');
      var piti = val(dtiScope, 'piti');
      var debts = val(dtiScope, 'debts');
      var taxes = val(dtiScope, 'taxrate');
      var utilities = val(dtiScope, 'sqft') * 0.14;
      var required = val(dtiScope, 'required');

      var qualifyingIncome = gross + rentalCredit * 0.75;
      var dti = qualifyingIncome > 0 ? ((piti + debts) / qualifyingIncome) * 100 : 0;
      var netIncome = qualifyingIncome * (1 - taxes / 100);
      var residual = netIncome - piti - debts - utilities;

      out(dtiScope, 'income', money2(qualifyingIncome));
      out(dtiScope, 'dti', pct(dti), dti <= 41 ? 'good' : (dti > 50 ? 'bad' : null));
      out(dtiScope, 'utilities', money2(utilities));
      out(dtiScope, 'residual', money2(residual), residual >= required ? 'good' : 'bad');
      out(dtiScope, 'margin', money2(residual - required), residual - required >= 0 ? 'good' : 'bad');
    });
  }
})();
