/* ==========================================================================
   builder.js - Interactive PC Builder page.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var activeCat = PCB.category(PCB.param('cat')) ? PCB.param('cat') : 'cpu';
  var filters = {}; // per-category filter and page state
  var PICKER_PER_PAGE = 9;

  var el = {
    name: qs('#build-name'), usage: qs('#build-usage'), budget: qs('#build-budget'), resolution: qs('#build-resolution'),
    slots: qs('#slots'), grid: qs('#picker-grid'), title: qs('#picker-title'), count: qs('#result-count'),
    search: qs('#f-search'), brand: qs('#f-brand'), sort: qs('#f-sort'), compat: qs('#f-compat'),
    price: qs('#f-price'), priceOut: qs('#f-price-out'), pager: qs('#picker-pager')
  };

  el.usage.innerHTML = Object.keys(PCB.USAGES).map(function (k) { return '<option value="' + k + '">' + PCB.USAGES[k] + '</option>'; }).join('');
  el.resolution.innerHTML = Object.keys(PCB.RESOLUTIONS).map(function (k) { return '<option value="' + k + '">' + PCB.RESOLUTIONS[k] + '</option>'; }).join('');

  function maxPriceOf(cat) {
    return Math.ceil(Math.max.apply(null, PCB.store.byCategory(cat).map(function (c) { return c.price; })) / 100) * 100;
  }
  function getFilters(cat) {
    if (!filters[cat]) filters[cat] = { q: '', brand: '', sort: 'price-asc', compat: 'all', maxPrice: maxPriceOf(cat), page: 1 };
    return filters[cat];
  }

  /* ---------- Build settings bar ---------- */

  function renderBar(build) {
    if (document.activeElement !== el.name) el.name.value = build.name;
    if (document.activeElement !== el.budget) el.budget.value = build.budget;
    el.usage.value = build.usage;
    el.resolution.value = build.resolution;
    qs('#editing-note').innerHTML = build.savedId
      ? PCB.badge('info', 'Editing a saved build') + ' <span class="muted">Saving will update it.</span>' : '';
  }

  el.name.addEventListener('input', PCB.debounce(function () {
    PCB.store.updateBuild(function (b) { b.name = el.name.value.slice(0, 100); });
  }, 300));
  el.budget.addEventListener('input', PCB.debounce(function () {
    var v = Number(el.budget.value);
    if (isNaN(v) || v < 0 || v > 10000000) { el.budget.classList.add('invalid'); return; }
    el.budget.classList.remove('invalid');
    PCB.store.updateBuild(function (b) { b.budget = v; });
  }, 350));
  el.usage.addEventListener('change', function () { PCB.store.updateBuild(function (b) { b.usage = el.usage.value; }); });
  el.resolution.addEventListener('change', function () { PCB.store.updateBuild(function (b) { b.resolution = el.resolution.value; }); });

  /* ---------- Per-category status ---------- */

  function categoryStatus(report, cat) {
    var relevant = report.checks.filter(function (x) { return x.parts.indexOf(cat) !== -1 && x.status !== 'info' && !x.pending; });
    return relevant.length ? PCB.compat.worst(relevant.map(function (x) { return x.status; })) : 'ok';
  }

  /* ---------- Slots ---------- */

  function renderSlots(build, report) {
    var filled = 0;
    el.slots.innerHTML = PCB.CATEGORIES.map(function (c) {
      var part = PCB.store.part(build, c.key);
      var has = Array.isArray(part) ? part.length > 0 : !!part;
      if (has) filled++;
      var st = has ? categoryStatus(report, c.key) : 'none';
      var optional = (c.key === 'cooler' || c.key === 'gpu') && report.missing.indexOf(c.key) === -1;
      var name, price = '';
      if (Array.isArray(part)) {
        name = has ? part.length + ' drive' + (part.length > 1 ? 's' : '') + ' · ' + PCB.capacity(part.reduce(function (s, d) { return s + d.specs.capacityGB; }, 0)) : 'Add storage drive(s)';
        price = has ? PCB.money(part.reduce(function (s, d) { return s + d.price; }, 0)) : '';
      } else {
        name = has ? part.brand + ' ' + part.name : (optional ? 'Optional' : 'Not selected');
        price = has ? PCB.money(part.price) : '';
      }
      var img = has ? (Array.isArray(part) ? part[0] : part).image : 'assets/images/' + c.key + '.svg';
      var drives = Array.isArray(part) && has ? '<div class="slot-drives">' + part.map(function (d, i) {
        return '<div class="drive-row"><span>' + esc(d.brand + ' ' + d.name) + '</span><button class="icon-btn icon-btn-sm" data-remove-drive="' + i + '" aria-label="Remove ' + esc(d.name) + '">' + PCB.icon('x') + '</button></div>';
      }).join('') + '</div>' : '';
      return '<div class="slot' + (has ? '' : ' empty') + (c.key === activeCat ? ' active' : '') + '" data-cat="' + c.key + '" tabindex="0" role="button" aria-label="' + esc(c.full) + '">' +
        '<div class="slot-img"><img src="' + esc(PCB.url(img)) + '" alt=""></div>' +
        '<div style="min-width:0"><div class="slot-label"><span class="status-dot ' + st + '"></span>' + esc(c.label) + '</div><div class="slot-name">' + esc(name) + '</div></div>' +
        '<div class="slot-meta"><span class="slot-price">' + price + '</span>' +
        (has && !Array.isArray(part) ? '<button class="icon-btn icon-btn-sm" data-remove="' + c.key + '" aria-label="Remove ' + esc(c.label) + '">' + PCB.icon('x') + '</button>' : '') +
        '</div>' + drives + '</div>';
    }).join('');
    qs('#slot-count').textContent = filled + ' / ' + PCB.CATEGORIES.length + ' categories';
  }

  el.slots.addEventListener('click', function (e) {
    var rm = e.target.closest('[data-remove]');
    if (rm) {
      e.stopPropagation();
      PCB.store.removePart(rm.getAttribute('data-remove'));
      PCB.toast(PCB.category(rm.getAttribute('data-remove')).label + ' removed.');
      return;
    }
    var rd = e.target.closest('[data-remove-drive]');
    if (rd) {
      e.stopPropagation();
      PCB.store.removePart('storage', Number(rd.getAttribute('data-remove-drive')));
      PCB.toast('Drive removed.');
      return;
    }
    var slot = e.target.closest('.slot');
    if (slot) setActive(slot.getAttribute('data-cat'));
  });
  el.slots.addEventListener('keydown', function (e) {
    var slot = e.target.closest('.slot');
    if (slot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActive(slot.getAttribute('data-cat')); }
  });

  function setActive(cat) {
    activeCat = cat;
    history.replaceState(null, '', '?cat=' + cat);
    syncFilterInputs();
    render();
    if (window.innerWidth < 900) qs('#picker-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Picker ---------- */

  function syncFilterInputs() {
    var f = getFilters(activeCat);
    el.search.value = f.q;
    el.brand.innerHTML = PCB.ui.brandOptions(activeCat, f.brand);
    el.sort.innerHTML = PCB.ui.sortOptions(f.sort);
    el.compat.value = f.compat;
    var max = maxPriceOf(activeCat);
    el.price.max = max;
    el.price.value = f.maxPrice;
    el.priceOut.textContent = '≤ ' + PCB.money(f.maxPrice);
  }

  function renderPicker(build) {
    var cat = PCB.category(activeCat);
    var f = getFilters(activeCat);
    var current = PCB.store.part(build, activeCat);
    el.title.textContent = 'Choose ' + (cat.multi ? 'storage drives' : (/^[aeiou]/i.test(cat.full) ? 'an ' : 'a ') + cat.full);

    var items = PCB.ui.filterSort(PCB.store.byCategory(activeCat), { q: f.q, brand: f.brand, sort: f.sort, maxPrice: f.maxPrice });
    var matches = [];
    items.forEach(function (item) {
      var cc = PCB.compat.checkCandidate(build, activeCat, item.id);
      if (f.compat === 'compatible' && cc.status === 'error') return;
      if (f.compat === 'ok' && cc.status !== 'ok') return;
      var selected = Array.isArray(current) ? current.some(function (d) { return d.id === item.id; }) : !!(current && current.id === item.id);
      var label = cat.multi ? 'Add drive' : selected ? 'Remove' : current ? 'Replace' : 'Add';
      matches.push(PCB.ui.partCard(item, { compat: cc, selected: selected, actionLabel: label }));
    });
    var pg = PCB.ui.paginate(matches, f.page, PICKER_PER_PAGE);
    f.page = pg.page;
    el.count.textContent = matches.length + ' of ' + PCB.store.byCategory(activeCat).length + ' match';
    el.pager.innerHTML = PCB.ui.pagerHtml(pg);
    el.grid.innerHTML = matches.length ? pg.items.join('')
      : '<div class="empty-state" style="grid-column:1/-1"><h3>No matching components</h3><p>Try clearing the search or relaxing the filters.</p></div>';
  }

  function addPart(item) {
    var build = PCB.store.getBuild();
    var cat = PCB.category(item.category);
    var current = PCB.store.part(build, item.category);
    var wasEmpty = Array.isArray(current) ? !current.length : !current;
    if (!cat.multi && current && current.id === item.id) {
      PCB.store.removePart(item.category);
      PCB.toast(item.name + ' removed.');
      return;
    }
    var cc = PCB.compat.checkCandidate(build, item.category, item.id);
    var res = PCB.store.setPart(item.category, item.id);
    if (!res.ok) { PCB.toast(res.message, 'warn'); return; }
    if (cc.status === 'error') PCB.toast('Added, but incompatible: ' + cc.messages[0], 'error');
    else if (cc.status === 'warn') PCB.toast('Added with a warning: ' + cc.messages[0], 'warn');
    else PCB.toast(item.name + (wasEmpty ? ' added.' : ' swapped in.'), 'success');

    // Guide the user to the next empty slot after filling one.
    if (wasEmpty && !cat.multi) {
      var b = PCB.store.getBuild();
      var next = PCB.CATEGORIES.find(function (c) {
        var v = b.parts[c.key];
        return !(Array.isArray(v) ? v.length : v);
      });
      if (next) setActive(next.key);
    }
  }

  el.grid.addEventListener('click', function (e) {
    var card = e.target.closest('.part-card');
    if (!card) return;
    var item = PCB.store.byId(card.getAttribute('data-id'));
    var action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.getAttribute('data-action') === 'add') addPart(item);
    if (action.getAttribute('data-action') === 'details') {
      PCB.ui.showDetails(item, { onAdd: addPart, addLabel: PCB.category(item.category).multi ? 'Add drive' : 'Add to build' });
    }
  });

  function onFilterChange() {
    var f = getFilters(activeCat);
    f.q = el.search.value;
    f.brand = el.brand.value;
    f.sort = el.sort.value;
    f.compat = el.compat.value;
    f.maxPrice = Number(el.price.value);
    f.page = 1;
    el.priceOut.textContent = '≤ ' + PCB.money(f.maxPrice);
    renderPicker(PCB.store.getBuild());
  }
  el.search.addEventListener('input', PCB.debounce(onFilterChange, 150));
  [el.brand, el.sort, el.compat].forEach(function (x) { x.addEventListener('change', onFilterChange); });
  el.price.addEventListener('input', onFilterChange);
  PCB.ui.bindPager(el.pager, function (n) {
    getFilters(activeCat).page = n;
    renderPicker(PCB.store.getBuild());
    qs('#picker-title').scrollIntoView({ block: 'start' });
  });

  qs('#f-reset').addEventListener('click', function () {
    delete filters[activeCat];
    syncFilterInputs();
    renderPicker(PCB.store.getBuild());
  });

  /* ---------- Virtual PC (schematic of the case interior) ---------- */

  var VPC_SHAPES = {
    case: '<rect class="vp" x="6" y="6" width="248" height="288" rx="10"/><text class="vp-label" x="236" y="22" text-anchor="end">CASE</text>',
    motherboard: '<rect class="vp" x="26" y="30" width="160" height="176" rx="4"/><text class="vp-label" x="32" y="200">MOTHERBOARD</text>',
    cpu: '<rect class="vp" x="62" y="52" width="44" height="44" rx="3"/><text class="vp-label" x="84" y="77" text-anchor="middle">CPU</text>',
    cooler: '<rect class="vp" x="54" y="44" width="60" height="60" rx="8" style="fill-opacity:.35"/><text class="vp-label" x="84" y="40" text-anchor="middle">COOLER</text>',
    ram: '<rect class="vp" x="130" y="42" width="8" height="66" rx="2"/><rect class="vp" x="144" y="42" width="8" height="66" rx="2"/><text class="vp-label" x="141" y="120" text-anchor="middle">RAM</text>',
    gpu: '<rect class="vp" x="26" y="132" width="186" height="30" rx="4"/><text class="vp-label" x="119" y="151" text-anchor="middle">GRAPHICS CARD</text>',
    storage: '<rect class="vp" x="50" y="172" width="70" height="12" rx="2"/><rect class="vp" x="200" y="34" width="42" height="70" rx="3"/><text class="vp-label" x="221" y="118" text-anchor="middle">DRIVES</text>',
    psu: '<rect class="vp" x="22" y="226" width="130" height="54" rx="4"/><text class="vp-label" x="87" y="257" text-anchor="middle">POWER SUPPLY</text>'
  };
  var VPC_ORDER = ['case', 'motherboard', 'gpu', 'cooler', 'cpu', 'ram', 'storage', 'psu'];

  function renderVpc(build, report) {
    var groups = VPC_ORDER.map(function (k) {
      var part = PCB.store.part(build, k);
      var has = Array.isArray(part) ? part.length > 0 : !!part;
      var st = has ? categoryStatus(report, k) : '';
      var title = has ? (Array.isArray(part) ? part.map(function (d) { return d.name; }).join(', ') : part.brand + ' ' + part.name) : PCB.category(k).label + ' (empty)';
      return '<g data-cat="' + k + '" class="' + (has ? 'filled ' + st : '') + '"><title>' + esc(title) + '</title>' + VPC_SHAPES[k] + '</g>';
    }).join('');
    var fans = '<circle class="fan" cx="221" cy="150" r="14"/><circle class="fan" cx="221" cy="190" r="14"/><circle class="fan" cx="221" cy="250" r="14"/>';
    qs('#vpc').innerHTML = '<svg class="vpc" viewBox="0 0 260 300" role="img" aria-label="Virtual PC showing installed components">' + groups + fans + '</svg>';
  }
  qs('#vpc').addEventListener('click', function (e) {
    var g = e.target.closest('g[data-cat]');
    if (g) setActive(g.getAttribute('data-cat'));
  });

  /* ---------- Sidebar ---------- */

  function renderSidebar(build, report) {
    var total = PCB.store.total(build);
    qs('#sb-total').textContent = PCB.money(total);
    if (build.budget) {
      var ratio = total / build.budget;
      qs('#sb-budget').innerHTML = PCB.meter('Budget used', ratio * 100, {
        tone: ratio > 1 ? 'error' : ratio > 0.9 ? 'warn' : 'ok',
        text: Math.round(ratio * 100) + '% of ' + PCB.money(build.budget)
      }) + '<div class="budget-line"><span>' + (ratio > 1 ? 'Over by' : 'Remaining') + '</span><strong>' + PCB.money(Math.abs(build.budget - total)) + '</strong></div>';
    } else {
      qs('#sb-budget').innerHTML = '<p class="small muted">No budget set.</p>';
    }

    var pw = PCB.perf.power(build);
    var psu = PCB.store.part(build, 'psu');
    qs('#sb-power').innerHTML =
      '<dt>Est. peak power</dt><dd>' + pw.total + ' W</dd>' +
      '<dt>Recommended PSU</dt><dd>' + (pw.recommendedPsu ? pw.recommendedPsu + ' W' : '–') + '</dd>' +
      '<dt>Selected PSU</dt><dd>' + (psu ? psu.specs.wattage + ' W' : '–') + '</dd>';

    qs('#sb-compat-badge').innerHTML = PCB.badge(report.status);
    var issues = report.checks.filter(function (x) { return x.status === 'error' || x.status === 'warn'; });
    var html = issues.slice(0, 5).map(function (x) {
      return '<div class="issue"><span class="status-dot ' + x.status + '"></span><span>' + esc(x.title) + '</span></div>';
    }).join('');
    if (issues.length > 5) html += '<div class="small muted">+' + (issues.length - 5) + ' more…</div>';
    if (!issues.length) html = report.status === 'empty' ? '<p class="small muted">Add components to start checking.</p>'
      : '<div class="issue"><span class="status-dot ok"></span><span>All ' + report.counts.ok + ' checks passed so far.</span></div>';
    if (report.missing.length) html += '<div class="small muted" style="margin-top:6px">Still needed: ' + report.missing.map(function (k) { return PCB.category(k).label; }).join(', ') + '</div>';
    qs('#sb-issues').innerHTML = html;

    qs('#sb-rec-title').textContent = 'Recommended ' + PCB.category(activeCat).label.toLowerCase() + ' for ' + PCB.USAGES[build.usage].toLowerCase();
    qs('#sb-recs').innerHTML = PCB.ui.recsHtml(PCB.recommend.forCategory(build, activeCat, 3));
    qs('#sb-insights').innerHTML = PCB.ui.insightsHtml(PCB.recommend.insights(build));
  }

  qs('#sb-recs').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-rec-id]');
    if (btn) addPart(PCB.store.byId(btn.getAttribute('data-rec-id')));
  });

  /* ---------- Toolbar actions ---------- */

  qs('#btn-save').addEventListener('click', function () {
    PCB.ui.saveBuildDialog(PCB.store.getBuild());
  });

  qs('#btn-clear').addEventListener('click', function () {
    PCB.confirm('Remove all components from the current build? Saved builds are not affected.', 'Clear build').then(function (ok) {
      if (!ok) return;
      PCB.store.clearBuild();
      setActive('cpu');
      PCB.toast('Build cleared.');
    });
  });

  qs('#btn-autofill').addEventListener('click', function () {
    var build = PCB.store.getBuild();
    var result = PCB.recommend.autoComplete(build);
    if (!result.log.length) {
      PCB.toast('Every slot is already filled (or no compatible parts were found). Remove parts to get new suggestions.', 'warn');
      return;
    }
    var report = PCB.compat.check(result.build);
    var body = '<p class="small muted">Empty slots are filled one by one in dependency order (CPU, motherboard, RAM, GPU, cooler, storage, case, then PSU), ' +
      'each time choosing the top-scored compatible part for <strong>' + esc(PCB.USAGES[build.usage]) + '</strong>' +
      (build.budget ? ' within a <strong>' + PCB.money(build.budget) + '</strong> budget' : '') + '.</p>' +
      '<ul class="autofill-log">' + result.log.map(function (l) {
        return '<li><strong>' + esc(PCB.category(l.category).label) + ':</strong> ' + esc(l.item.brand + ' ' + l.item.name) +
          ' <span class="mono">(' + PCB.money(l.item.price) + ')</span><br><span class="small muted">' + esc(l.reason) + '</span></li>';
      }).join('') + '</ul><hr><div class="row-between"><span>New total: <strong>' + PCB.money(PCB.store.total(result.build)) + '</strong></span>' + PCB.badge(report.status) + '</div>';
    PCB.modal({
      title: 'Auto-complete suggestions',
      body: body,
      wide: true,
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: 'Apply ' + result.log.length + ' part' + (result.log.length > 1 ? 's' : ''), cls: 'btn-primary', onClick: function () {
          PCB.store.setBuild(result.build);
          PCB.toast('Build auto-completed.', 'success');
        } }
      ]
    });
  });

  /* ---------- Render ---------- */

  function render() {
    var build = PCB.store.getBuild();
    var report = PCB.compat.check(build);
    renderBar(build);
    renderSlots(build, report);
    renderPicker(build);
    renderVpc(build, report);
    renderSidebar(build, report);
  }

  window.addEventListener('pcb:build-changed', render);
  syncFilterInputs();
  render();
});
