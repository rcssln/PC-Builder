/* ==========================================================================
   components.js - Reusable UI building blocks shared by several pages:
   component cards, filtering/sorting, detail modal, compatibility check
   lists, insights and recommendation lists.
   ========================================================================== */
(function (PCB) {
  'use strict';

  var ui = {};

  /* ---------- Filtering & sorting ---------- */

  ui.SORTS = {
    'price-asc': 'Price: low to high',
    'price-desc': 'Price: high to low',
    'perf-desc': 'Performance: high to low',
    'value-desc': 'Best value (perf / $)',
    'name-asc': 'Name: A to Z',
    'newest': 'Newest first'
  };

  /**
   * opts: { q, brand, sort, maxPrice, minPrice }
   */
  ui.filterSort = function (items, opts) {
    var q = (opts.q || '').trim().toLowerCase();
    var out = items.filter(function (it) {
      if (opts.brand && it.brand !== opts.brand) return false;
      if (opts.maxPrice && it.price > opts.maxPrice) return false;
      if (opts.minPrice && it.price < opts.minPrice) return false;
      if (q) {
        var hay = (it.brand + ' ' + it.name + ' ' + PCB.keySpecs(it).join(' ') + ' ' +
          Object.keys(it.specs).map(function (k) { return it.specs[k]; }).join(' ')).toLowerCase();
        return q.split(/\s+/).every(function (term) { return hay.indexOf(term) !== -1; });
      }
      return true;
    });
    var score = PCB.perf.componentScore;
    var sorters = {
      'price-asc': function (a, b) { return a.price - b.price; },
      'price-desc': function (a, b) { return b.price - a.price; },
      'perf-desc': function (a, b) { return score(b) - score(a); },
      'value-desc': function (a, b) { return score(b) / b.price - score(a) / a.price; },
      'name-asc': function (a, b) { return (a.brand + a.name).localeCompare(b.brand + b.name); },
      'newest': function (a, b) { return (b.release || 0) - (a.release || 0) || a.price - b.price; }
    };
    return out.sort(sorters[opts.sort] || sorters['price-asc']);
  };

  ui.sortOptions = function (selected) {
    return Object.keys(ui.SORTS).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + ui.SORTS[k] + '</option>';
    }).join('');
  };

  ui.brandOptions = function (category, selected) {
    return '<option value="">All brands</option>' + PCB.store.brands(category).map(function (b) {
      return '<option' + (b === selected ? ' selected' : '') + '>' + PCB.esc(b) + '</option>';
    }).join('');
  };

  /* ---------- Pagination ---------- */

  /**
   * Returns the slice of items for a page, with the page number clamped.
   * Result: { items, page, pages, total, start, end }
   */
  ui.paginate = function (items, page, perPage) {
    var pages = Math.max(1, Math.ceil(items.length / perPage));
    var p = PCB.clamp(page || 1, 1, pages);
    var start = (p - 1) * perPage;
    return { items: items.slice(start, start + perPage), page: p, pages: pages, total: items.length, start: start + 1, end: Math.min(start + perPage, items.length) };
  };

  /**
   * Pager markup: "Showing 1-12 of 40", page buttons with gaps, and an
   * optional per-page selector. Buttons carry data-page.
   */
  ui.pagerHtml = function (pg, opts) {
    opts = opts || {};
    if (!pg.total) return '';
    var nums = [];
    for (var i = 1; i <= pg.pages; i++) {
      if (i === 1 || i === pg.pages || Math.abs(i - pg.page) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== '...') nums.push('...');
    }
    var perPage = opts.perPageOptions ? '<label class="row" style="gap:6px">Per page <select data-per-page aria-label="Items per page">' +
      opts.perPageOptions.map(function (n) { return '<option' + (n === opts.perPage ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select></label>' : '';
    return '<div class="pager"><span class="muted">Showing ' + pg.start + '-' + pg.end + ' of ' + pg.total + '</span>' +
      (pg.pages > 1 ? '<div class="pager-pages" role="navigation" aria-label="Pagination">' +
        '<button class="pager-btn" data-page="' + (pg.page - 1) + '"' + (pg.page === 1 ? ' disabled' : '') + '>Previous</button>' +
        nums.map(function (n) {
          return n === '...' ? '<span class="pager-gap">...</span>'
            : '<button class="pager-btn' + (n === pg.page ? ' current" aria-current="page' : '') + '" data-page="' + n + '">' + n + '</button>';
        }).join('') +
        '<button class="pager-btn" data-page="' + (pg.page + 1) + '"' + (pg.page === pg.pages ? ' disabled' : '') + '>Next</button></div>' : '') +
      perPage + '</div>';
  };

  /**
   * Wires a pager container: calls onPage(n) for page buttons and
   * onPerPage(n) for the per-page select.
   */
  ui.bindPager = function (container, onPage, onPerPage) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (b && !b.disabled) onPage(Number(b.getAttribute('data-page')));
    });
    if (onPerPage) {
      container.addEventListener('change', function (e) {
        if (e.target.hasAttribute('data-per-page')) onPerPage(Number(e.target.value));
      });
    }
  };

  /* ---------- Price source ---------- */

  /** Short label for where a price came from, e.g. "In stock at DynaQuest PC". */
  ui.priceStatus = function (item) {
    var src = item.priceSource;
    if (!src) return 'Price source unknown';
    if (src.status === 'in-stock') return 'In stock at ' + src.store;
    if (src.status === 'out-of-stock') return 'Out of stock at ' + src.store;
    return 'Estimated price';
  };

  /** Full explanation of a price for the detail view. */
  ui.priceSourceHtml = function (item) {
    var src = item.priceSource;
    if (!src) return '';
    var date = new Date(src.checked + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    if (src.status === 'estimate') {
      return '<p class="small muted" style="margin:0">Estimated on ' + PCB.esc(date) + '. This exact model was not listed with a current price. ' + PCB.esc(src.basis || '') + '</p>';
    }
    return '<p class="small muted" style="margin:0">Checked on ' + PCB.esc(date) + '.<br>Listing: ' + PCB.esc(src.listing) +
      (src.url ? '<br><a href="' + PCB.esc(src.url) + '" target="_blank" rel="noopener">View store listing</a>' : '') + '</p>';
  };

  /* ---------- Component card ---------- */

  /**
   * opts: {
   *   compat: { status, messages } | null   - compatibility against the current build
   *   selected: bool, actionLabel: string, compareChecked: bool|undefined
   * }
   */
  ui.partCard = function (item, opts) {
    opts = opts || {};
    var cc = opts.compat;
    var badge = cc ? PCB.badge(cc.status) : '';
    var note = cc && cc.messages.length
      ? '<div class="compat-note ' + cc.status + '">' + PCB.esc(cc.messages[0]) + (cc.messages.length > 1 ? ' (+' + (cc.messages.length - 1) + ' more)' : '') + '</div>'
      : '';
    var compare = opts.compareChecked === undefined ? '' :
      '<label class="check tiny" title="Add to comparison"><input type="checkbox" data-action="compare"' + (opts.compareChecked ? ' checked' : '') + '> Compare</label>';
    return '<article class="part-card' + (opts.selected ? ' is-selected' : '') + (cc && cc.status === 'error' ? ' is-incompatible' : '') + '" data-id="' + PCB.esc(item.id) + '">' +
      '<div class="part-media" data-action="details">' + badge + '<span class="part-brand">' + PCB.esc(item.brand) + '</span>' + PCB.imageTag(item, '') + '</div>' +
      '<div class="part-body">' +
      '<h4 class="part-name" data-action="details">' + PCB.esc(item.name) + '</h4>' +
      '<div class="chips">' + PCB.keySpecs(item).map(function (s) { return '<span class="chip">' + PCB.esc(s) + '</span>'; }).join('') + '</div>' +
      note +
      '<div class="part-foot"><div><div class="price">' + PCB.money(item.price) + '</div><div class="price-note">' + PCB.esc(ui.priceStatus(item)) + '</div></div>' +
      '<div class="row" style="gap:6px">' + compare +
      (opts.actionLabel ? '<button class="btn btn-sm ' + (opts.selected ? 'btn-ghost' : 'btn-primary') + '" data-action="add">' + PCB.esc(opts.actionLabel) + '</button>' : '') +
      '</div></div></div></article>';
  };

  /* ---------- Detail modal ---------- */

  /**
   * Shows full specifications for a component.
   * opts: { onAdd(item), addLabel, build }
   */
  ui.showDetails = function (item, opts) {
    opts = opts || {};
    var build = opts.build || PCB.store.getBuild();
    var cc = PCB.compat.checkCandidate(build, item.category, item.id);
    var trial = JSON.parse(JSON.stringify(build));
    if (Array.isArray(trial.parts[item.category])) { if (trial.parts[item.category].indexOf(item.id) === -1) trial.parts[item.category].push(item.id); }
    else trial.parts[item.category] = item.id;
    var checks = PCB.compat.check(trial).checks.filter(function (x) { return x.parts.indexOf(item.category) !== -1; });

    var body = '<div class="detail"><div><div class="detail-media">' + PCB.imageTag(item, '') + '</div>' +
      '<div class="stack" style="margin-top:14px"><div><div class="price" style="font-size:1.5rem">' + PCB.money(item.price) + '</div>' +
      '<div class="price-note">' + PCB.esc(ui.priceStatus(item)) + '</div></div>' + ui.priceSourceHtml(item) +
      '<div>' + PCB.badge(cc.status, cc.status === 'ok' ? 'Fits current build' : null) + '</div>' +
      '<div class="small muted">Performance points: <strong class="mono">' + PCB.perf.componentScore(item) + '</strong></div></div></div>' +
      '<div><div class="eyebrow">' + PCB.esc(PCB.category(item.category).full) + ' · ' + PCB.esc(item.brand) + (item.release ? ' · ' + item.release : '') + '</div>' +
      '<h4 style="margin:6px 0 4px">What it is</h4><p class="small" style="margin:0 0 12px">' + PCB.esc(PCB.describe(item)) + '</p>' +
      '<table class="spec-table"><tbody>' + PCB.specRows(item).map(function (r) {
        return '<tr><th>' + PCB.esc(r[0]) + '</th><td>' + PCB.esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="tiny muted" style="margin-top:8px">* Relative indices are normalized estimates used by the simulation model, not measured benchmark results.</p>' +
      '<h4 style="margin-top:16px">Compatibility with your current build</h4>' +
      (checks.length ? ui.checksHtml(checks) : '<p class="small muted">No related parts selected yet, so there is nothing to check against.</p>') +
      '</div></div>';

    var actions = opts.actions || [{ label: 'Close', cls: 'btn-ghost' }];
    if (!opts.actions && opts.onAdd) {
      actions.push({ label: opts.addLabel || 'Add to build', cls: 'btn-primary', onClick: function () { opts.onAdd(item); } });
    }
    PCB.modal({ title: item.brand + ' ' + item.name, body: body, wide: true, actions: actions });
  };

  /* ---------- Compatibility check list ---------- */

  ui.checksHtml = function (checks) {
    return checks.map(function (x) {
      var st = PCB.STATUS[x.status];
      return '<div class="check-item check-' + x.status + '"><span class="ci-icon">' + PCB.icon(st.icon) + '</span><div>' +
        '<h4>' + PCB.esc(x.title) + '</h4><p>' + PCB.esc(x.detail) + '</p></div></div>';
    }).join('');
  };

  /* ---------- Insights ---------- */

  var INSIGHT_ICON = { error: 'x', warn: 'alert', ok: 'check', info: 'info', tip: 'up' };
  ui.insightsHtml = function (list) {
    if (!list.length) return '<p class="small muted">No insights yet.</p>';
    return list.map(function (i) {
      return '<div class="insight insight-' + i.level + '"><span class="insight-icon">' + PCB.icon(INSIGHT_ICON[i.level]) + '</span><div>' + PCB.esc(i.text) + '</div></div>';
    }).join('');
  };

  /* ---------- Recommendations ---------- */

  /**
   * Renders the result of PCB.recommend.forCategory.
   * Buttons carry data-rec-id / data-rec-cat for the page to handle.
   */
  ui.recsHtml = function (r) {
    var cat = PCB.category(r.category);
    var head = isFinite(r.target)
      ? '<p class="tiny muted">Budget share for ' + PCB.esc(cat.label.toLowerCase()) + ': ~' + PCB.money(Math.round(r.target)) + '</p>' : '';
    if (!r.picks.length) return head + '<p class="small muted">' + PCB.esc(r.note || 'No recommendations available.') + '</p>';
    return head + r.picks.map(function (p, i) {
      return '<div class="rec-item' + (i === 0 ? ' top' : '') + '">' + (i === 0 ? '<div class="rec-top">Top pick</div>' : '') +
        '<div class="rec-head"><div class="rec-name">' + PCB.esc(p.item.brand + ' ' + p.item.name) + '</div>' +
        '<div class="rec-score" title="Recommendation score: usage fit 50%, budget fit 30%, value 20%">' + p.score + ' pts</div></div>' +
        (p.delta ? '<div class="rec-delta">' + PCB.esc(p.delta) + '</div>' : '') +
        '<ul class="rec-reasons">' + p.reasons.slice(0, 4).map(function (t) { return '<li>' + PCB.esc(t) + '</li>'; }).join('') +
        p.warnings.map(function (w) { return '<li class="rec-warning">Warning: ' + PCB.esc(w) + '</li>'; }).join('') + '</ul>' +
        '<div class="row-between"><span class="price" style="font-size:.95rem">' + PCB.money(p.item.price) + '</span>' +
        (p.isCurrent ? PCB.badge('ok', 'In your build')
          : '<button class="btn btn-sm btn-secondary" data-rec-cat="' + r.category + '" data-rec-id="' + PCB.esc(p.item.id) + '">' +
            (r.current && !Array.isArray(r.current) ? 'Swap in' : 'Add') + '</button>') +
        '</div></div>';
    }).join('');
  };

  /* ---------- Build source picker (current build or a saved build) ---------- */

  /**
   * Fills a <select> with "Current build" plus every saved build.
   * Resolves with { list, resolve(value) } where resolve returns a build object.
   * opts: { includeNone: label } adds an empty option first.
   */
  ui.buildPicker = function (select, opts) {
    opts = opts || {};
    return PCB.store.listBuilds().catch(function (err) {
      PCB.toast('Could not load saved builds: ' + err.message, 'error');
      return [];
    }).then(function (list) {
      var cur = PCB.store.getBuild();
      var html = opts.includeNone ? '<option value="">' + PCB.esc(opts.includeNone) + '</option>' : '';
      html += '<option value="current">Current build: ' + PCB.esc(cur.name) + '</option>';
      if (list.length) {
        html += '<optgroup label="Saved builds">' + list.map(function (b) {
          return '<option value="saved:' + PCB.esc(b.savedId) + '">' + PCB.esc(b.name) + ' (' + PCB.money(PCB.store.total(b)) + ')</option>';
        }).join('') + '</optgroup>';
      }
      select.innerHTML = html;
      return {
        list: list,
        resolve: function (value) {
          if (value === 'current') return PCB.store.getBuild();
          if (value && value.indexOf('saved:') === 0) {
            var id = value.slice(6);
            return list.find(function (b) { return b.savedId === id; }) || null;
          }
          return null;
        }
      };
    });
  };

  /* ---------- Save dialog (builder & summary pages) ---------- */

  /**
   * Asks for a name/notes and saves the build. When the build was loaded from
   * a saved record, the user can update it or save a copy.
   * Resolves with the saved build or null.
   */
  ui.saveBuildDialog = function (build) {
    if (!PCB.store.items(build).length) {
      PCB.toast('Add at least one component before saving.', 'warn');
      return Promise.resolve(null);
    }
    var fields = [
      { name: 'name', label: 'Build name', value: build.name, required: true, maxlength: 100 },
      { name: 'notes', label: 'Notes (optional)', type: 'textarea', value: build.notes, maxlength: 500 }
    ];
    if (build.savedId) {
      fields.unshift({ name: 'mode', label: 'Save mode', type: 'select', value: 'update', options: { update: 'Update the saved build', copy: 'Save as a new build' } });
    }
    return PCB.form({
      title: build.savedId ? 'Save changes' : 'Save build',
      fields: fields,
      submitLabel: 'Save',
      note: PCB.store.mode === 'server' ? 'The build will be stored in the MySQL database.' : 'The build will be stored in this browser (localStorage).'
    }).then(function (values) {
      if (!values) return null;
      build.name = values.name;
      build.notes = values.notes;
      return PCB.store.saveBuild(build, values.mode === 'copy').then(function (saved) {
        var cur = PCB.store.getBuild();
        cur.savedId = saved.savedId;
        cur.name = saved.name;
        cur.notes = saved.notes;
        PCB.store.setBuild(cur);
        PCB.toast('"' + saved.name + '" saved.', 'success');
        return saved;
      });
    }).catch(function (err) {
      PCB.toast(err.message, 'error');
      return null;
    });
  };

  PCB.ui = ui;
})(window.PCB);
