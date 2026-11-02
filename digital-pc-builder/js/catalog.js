/* ==========================================================================
   catalog.js - Component Catalog page: browse, search, filter, view
   details, add to build and pick components for comparison.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var state = {
    cat: PCB.category(PCB.param('cat')) ? PCB.param('cat') : 'all',
    q: '', brand: '', sort: 'price-asc', minPrice: '', maxPrice: '', showFit: true,
    page: 1, perPage: 12
  };
  var lastFilterKey = '';

  var el = {
    pager: qs('#catalog-pager'),
    tabs: qs('#cat-tabs'), grid: qs('#catalog-grid'), count: qs('#catalog-count'),
    search: qs('#c-search'), brand: qs('#c-brand'), sort: qs('#c-sort'),
    min: qs('#c-min'), max: qs('#c-max'), fit: qs('#c-fit'), bar: qs('#compare-bar')
  };

  function itemsForTab() {
    return state.cat === 'all' ? PCB.store.components.slice() : PCB.store.byCategory(state.cat);
  }

  function renderTabs() {
    var tabs = [{ key: 'all', label: 'All', n: PCB.store.components.length }].concat(PCB.CATEGORIES.map(function (c) {
      return { key: c.key, label: c.label, n: PCB.store.byCategory(c.key).length };
    }));
    el.tabs.innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (t.key === state.cat ? ' active' : '') + '" data-cat="' + t.key + '" role="tab" aria-selected="' + (t.key === state.cat) + '">' +
        esc(t.label) + '<span class="count">' + t.n + '</span></button>';
    }).join('');
  }

  function renderBrandOptions() {
    var brands = {};
    itemsForTab().forEach(function (c) { brands[c.brand] = true; });
    if (state.brand && !brands[state.brand]) state.brand = '';
    el.brand.innerHTML = '<option value="">All brands</option>' + Object.keys(brands).sort().map(function (b) {
      return '<option' + (b === state.brand ? ' selected' : '') + '>' + esc(b) + '</option>';
    }).join('');
  }

  function render() {
    var build = PCB.store.getBuild();
    var compare = PCB.store.getCompare();
    var min = Number(state.minPrice) || 0, max = Number(state.maxPrice) || 0;
    if (min && max && min > max) {
      el.min.classList.add('invalid'); el.max.classList.add('invalid');
      el.grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Invalid price range</h3><p>The minimum price must be lower than the maximum.</p></div>';
      el.count.textContent = '';
      el.pager.innerHTML = '';
      return;
    }
    el.min.classList.remove('invalid'); el.max.classList.remove('invalid');
    var items = PCB.ui.filterSort(itemsForTab(), { q: state.q, brand: state.brand, sort: state.sort, minPrice: min, maxPrice: max });
    el.count.textContent = items.length + ' component' + (items.length === 1 ? '' : 's');
    // Any change to the filters returns to the first page.
    var key = [state.cat, state.q, state.brand, state.sort, min, max].join('|');
    if (key !== lastFilterKey) { state.page = 1; lastFilterKey = key; }
    var pg = PCB.ui.paginate(items, state.page, state.perPage);
    state.page = pg.page;
    el.pager.innerHTML = PCB.ui.pagerHtml(pg, { perPage: state.perPage, perPageOptions: [12, 24, 48] });
    el.grid.innerHTML = items.length ? pg.items.map(function (item) {
      var current = PCB.store.part(build, item.category);
      var inBuild = Array.isArray(current) ? current.some(function (d) { return d.id === item.id; }) : !!(current && current.id === item.id);
      return PCB.ui.partCard(item, {
        compat: state.showFit && PCB.store.items(build).length ? PCB.compat.checkCandidate(build, item.category, item.id) : null,
        selected: inBuild,
        actionLabel: inBuild && !Array.isArray(current) ? 'In build' : 'Add to build',
        compareChecked: compare.category === item.category && compare.ids.indexOf(item.id) !== -1
      });
    }).join('') : '<div class="empty-state" style="grid-column:1/-1"><h3>No components match</h3><p>Try a different search term or clear the filters.</p></div>';
    renderCompareBar();
  }

  function renderCompareBar() {
    var c = PCB.store.getCompare();
    if (!c.ids.length) { el.bar.classList.add('hidden'); return; }
    el.bar.classList.remove('hidden');
    qs('#compare-text').innerHTML = '<strong>' + c.ids.length + '</strong> ' + esc(PCB.category(c.category).label) +
      (c.ids.length === 1 ? ' selected: pick at least one more to compare.' : ' selected for comparison.');
    qs('#compare-go').disabled = c.ids.length < 2;
  }

  /* ---------- Events ---------- */

  el.tabs.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cat]');
    if (!t) return;
    state.cat = t.getAttribute('data-cat');
    history.replaceState(null, '', '?cat=' + state.cat);
    renderTabs();
    renderBrandOptions();
    render();
  });

  el.search.addEventListener('input', PCB.debounce(function () { state.q = el.search.value; render(); }, 150));
  el.brand.addEventListener('change', function () { state.brand = el.brand.value; render(); });
  el.sort.addEventListener('change', function () { state.sort = el.sort.value; render(); });
  el.min.addEventListener('input', PCB.debounce(function () { state.minPrice = el.min.value; render(); }, 250));
  el.max.addEventListener('input', PCB.debounce(function () { state.maxPrice = el.max.value; render(); }, 250));
  el.fit.addEventListener('change', function () { state.showFit = el.fit.checked; render(); });
  qs('#c-reset').addEventListener('click', function () {
    state.q = ''; state.brand = ''; state.sort = 'price-asc'; state.minPrice = ''; state.maxPrice = '';
    el.search.value = ''; el.min.value = ''; el.max.value = ''; el.sort.value = 'price-asc';
    renderBrandOptions();
    render();
  });

  function addToBuild(item) {
    var cc = PCB.compat.checkCandidate(PCB.store.getBuild(), item.category, item.id);
    var res = PCB.store.setPart(item.category, item.id);
    if (!res.ok) { PCB.toast(res.message, 'warn'); return; }
    if (cc.status === 'error') PCB.toast('Added to build, but incompatible: ' + cc.messages[0], 'error');
    else PCB.toast(item.name + ' added to your build.', 'success');
  }

  el.grid.addEventListener('click', function (e) {
    var card = e.target.closest('.part-card');
    var action = e.target.closest('[data-action]');
    if (!card || !action) return;
    var item = PCB.store.byId(card.getAttribute('data-id'));
    var kind = action.getAttribute('data-action');
    if (kind === 'details') PCB.ui.showDetails(item, { onAdd: addToBuild });
    if (kind === 'add') {
      var current = PCB.store.part(PCB.store.getBuild(), item.category);
      if (current && !Array.isArray(current) && current.id === item.id) {
        PCB.toast('Already in your build. Open the PC Builder to change it.');
        return;
      }
      addToBuild(item);
    }
  });
  el.grid.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-action') !== 'compare') return;
    var item = PCB.store.byId(e.target.closest('.part-card').getAttribute('data-id'));
    var before = PCB.store.getCompare();
    var res = PCB.store.toggleCompare(item);
    if (!res.ok) { e.target.checked = false; PCB.toast(res.message, 'warn'); return; }
    if (before.category && before.category !== item.category && before.ids.length) {
      PCB.toast('Comparison list switched to ' + PCB.category(item.category).label + ' (you can only compare one category at a time).', 'warn');
      render();
    }
    renderCompareBar();
  });

  qs('#compare-go').addEventListener('click', function () { location.href = 'comparison.html?tab=components'; });
  qs('#compare-clear').addEventListener('click', function () { PCB.store.setCompare(null, []); render(); });

  PCB.ui.bindPager(el.pager, function (n) {
    state.page = n;
    render();
    el.tabs.scrollIntoView({ block: 'start' });
  }, function (n) {
    state.perPage = n;
    state.page = 1;
    render();
  });

  window.addEventListener('pcb:build-changed', render);

  el.sort.innerHTML = PCB.ui.sortOptions(state.sort);
  renderTabs();
  renderBrandOptions();
  render();
});
