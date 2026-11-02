/* ==========================================================================
   saved-builds.js - Saved Builds page: list, search, load/edit, view
   summary, duplicate, rename, export, import, delete and compare.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var builds = [];
  var selected = {};
  var PER_PAGE = 9;
  var page = 1;
  var lastFilterKey = '';

  function load() {
    qs('#sb-list').innerHTML = '<p class="muted">Loading saved builds…</p>';
    PCB.store.listBuilds().then(function (list) {
      builds = list;
      render();
    }).catch(function (err) {
      qs('#sb-list').innerHTML = '<div class="empty-state error-state"><h3>Could not load saved builds</h3><p>' + esc(err.message) + '</p></div>';
    });
    renderMigration();
  }

  function renderMigration() {
    var box = qs('#sb-migrate');
    var n = PCB.store.localSavedCount();
    if (PCB.store.mode === 'server' && n) {
      box.classList.remove('hidden');
      box.innerHTML = '<div class="row-between"><span>' + n + ' build' + (n > 1 ? 's were' : ' was') + ' saved in this browser before the database was connected.</span>' +
        '<button class="btn btn-sm btn-primary" id="btn-migrate">Import into database</button></div>';
    } else {
      box.classList.add('hidden');
    }
  }

  function render() {
    var q = qs('#sb-search').value.trim().toLowerCase();
    var sort = qs('#sb-sort').value;
    var current = PCB.store.getBuild();
    var list = builds.filter(function (b) {
      return !q || (b.name + ' ' + b.notes + ' ' + PCB.USAGES[b.usage]).toLowerCase().indexOf(q) !== -1;
    });
    list.sort({
      recent: function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
      'price-asc': function (a, b) { return PCB.store.total(a) - PCB.store.total(b); },
      'price-desc': function (a, b) { return PCB.store.total(b) - PCB.store.total(a); }
    }[sort]);

    qs('#sb-count').textContent = builds.length + ' saved build' + (builds.length === 1 ? '' : 's') +
      ' · stored in ' + (PCB.store.mode === 'server' ? 'MySQL' : 'this browser');

    if (!builds.length) {
      qs('#sb-list').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No saved builds yet</h3><p>Create a build in the PC Builder and press <strong>Save build</strong>, or import a JSON file exported from the Summary page.</p>' +
        '<a class="btn btn-primary" href="builder.html">Open PC Builder</a></div>';
      qs('#sb-pager').innerHTML = '';
      updateCompareBtn();
      return;
    }
    if (!list.length) {
      qs('#sb-list').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No builds match "' + esc(q) + '"</h3></div>';
      qs('#sb-pager').innerHTML = '';
      updateCompareBtn();
      return;
    }

    var key = q + '|' + sort;
    if (key !== lastFilterKey) { page = 1; lastFilterKey = key; }
    var pg = PCB.ui.paginate(list, page, PER_PAGE);
    page = pg.page;
    qs('#sb-pager').innerHTML = PCB.ui.pagerHtml(pg);
    qs('#sb-list').innerHTML = pg.items.map(function (b) {
      var report = PCB.compat.check(b);
      var active = current.savedId && current.savedId === b.savedId;
      var parts = PCB.store.items(b);
      var score = PCB.perf.score(b, b.usage);
      return '<article class="card build-card' + (active ? ' is-active' : '') + '" data-id="' + esc(b.savedId) + '">' +
        '<div class="row-between"><label class="check"><input type="checkbox" data-select' + (selected[b.savedId] ? ' checked' : '') + '> <span class="small muted">Compare</span></label>' +
        PCB.badge(report.status) + '</div>' +
        '<div><h3 style="margin:0">' + esc(b.name) + '</h3><div class="small muted">' + esc(PCB.USAGES[b.usage]) + ' · ' + esc(b.resolution) +
        (b.updatedAt ? ' · ' + esc(PCB.date(b.updatedAt)) : '') + '</div>' +
        (active ? '<div style="margin-top:6px">' + PCB.badge('info', 'Open in builder') + '</div>' : '') + '</div>' +
        '<div class="row-between"><div><div class="price" style="font-size:1.4rem">' + PCB.money(PCB.store.total(b)) + '</div>' +
        (b.budget ? '<div class="tiny muted">Budget ' + PCB.money(b.budget) + '</div>' : '') + '</div>' +
        (score ? '<div class="right"><div class="mono" style="font-size:1.1rem">' + score + ' pts</div><div class="tiny muted">' + esc(PCB.USAGES[b.usage]) + ' score</div></div>' : '') + '</div>' +
        '<div class="parts-mini">' + parts.map(function (x) { return '<span class="chip" title="' + esc(x.item.brand + ' ' + x.item.name) + '">' + esc(PCB.category(x.category).label) + ': ' + esc(x.item.name.split(' ').slice(0, 3).join(' ')) + '</span>'; }).join('') + '</div>' +
        (b.notes ? '<p class="small muted" style="margin:0">' + esc(b.notes) + '</p>' : '') +
        '<div class="actions">' +
        '<button class="btn btn-sm btn-primary" data-act="edit">Load &amp; edit</button>' +
        '<a class="btn btn-sm" href="summary.html?id=' + encodeURIComponent(b.savedId) + '">Summary</a>' +
        '<a class="btn btn-sm" href="simulator.html">Simulate</a>' +
        '<button class="btn btn-sm" data-act="rename">Rename</button>' +
        '<button class="btn btn-sm" data-act="duplicate">Duplicate</button>' +
        '<button class="btn btn-sm" data-act="export">Export</button>' +
        '<button class="btn btn-sm btn-danger" data-act="delete">Delete</button>' +
        '</div></article>';
    }).join('');
    updateCompareBtn();
  }

  function updateCompareBtn() {
    var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
    var btn = qs('#btn-compare');
    btn.disabled = ids.length < 2;
    btn.textContent = ids.length ? 'Compare selected (' + ids.length + ')' : 'Compare selected';
  }

  function find(id) { return builds.find(function (b) { return b.savedId === id; }); }

  /* ---------- Card actions ---------- */

  qs('#sb-list').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-select')) return;
    var id = e.target.closest('[data-id]').getAttribute('data-id');
    var count = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    if (e.target.checked && count >= 4) { e.target.checked = false; PCB.toast('Compare up to 4 builds at a time.', 'warn'); return; }
    selected[id] = e.target.checked;
    updateCompareBtn();
  });

  qs('#sb-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var b = find(btn.closest('[data-id]').getAttribute('data-id'));
    if (!b) return;
    var act = btn.getAttribute('data-act');

    if (act === 'edit') {
      var cur = PCB.store.getBuild();
      var go = function () {
        PCB.store.setBuild(b);
        location.href = 'builder.html';
      };
      if (PCB.store.items(cur).length && !cur.savedId) {
        PCB.confirm('Your current unsaved build will be replaced by "' + b.name + '". Continue?', 'Load build').then(function (ok) { if (ok) go(); });
      } else go();
    }

    if (act === 'rename') {
      PCB.form({
        title: 'Rename build',
        fields: [{ name: 'name', label: 'Build name', value: b.name, required: true, maxlength: 100 }, { name: 'notes', label: 'Notes', type: 'textarea', value: b.notes, maxlength: 500 }]
      }).then(function (v) {
        if (!v) return;
        var copy = Object.assign({}, b, { name: v.name, notes: v.notes });
        return PCB.store.saveBuild(copy, false).then(function (saved) {
          var cur = PCB.store.getBuild();
          if (cur.savedId === saved.savedId) { cur.name = saved.name; cur.notes = saved.notes; PCB.store.setBuild(cur); }
          PCB.toast('Build renamed.', 'success');
          load();
        });
      }).catch(function (err) { PCB.toast(err.message, 'error'); });
    }

    if (act === 'duplicate') {
      var dup = Object.assign({}, b, { name: (b.name + ' (copy)').slice(0, 100), savedId: null });
      PCB.store.saveBuild(dup, true).then(function () { PCB.toast('Build duplicated.', 'success'); load(); })
        .catch(function (err) { PCB.toast(err.message, 'error'); });
    }

    if (act === 'export') {
      var data = { format: 'digital-pc-builder/build@1', exportedAt: new Date().toISOString(),
        build: { name: b.name, usage: b.usage, budget: b.budget, resolution: b.resolution, notes: b.notes, parts: b.parts } };
      PCB.download(b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json', JSON.stringify(data, null, 2), 'application/json');
    }

    if (act === 'delete') {
      PCB.confirm('Permanently delete "' + b.name + '"? This cannot be undone.', 'Delete').then(function (ok) {
        if (!ok) return;
        PCB.store.deleteBuild(b.savedId).then(function () {
          delete selected[b.savedId];
          PCB.toast('"' + b.name + '" deleted.', 'success');
          load();
        }).catch(function (err) { PCB.toast(err.message, 'error'); });
      });
    }
  });

  /* ---------- Toolbar ---------- */

  PCB.ui.bindPager(qs('#sb-pager'), function (n) {
    page = n;
    render();
    qs('#sb-list').scrollIntoView({ block: 'start' });
  });

  qs('#sb-search').addEventListener('input', PCB.debounce(render, 150));
  qs('#sb-sort').addEventListener('change', render);

  qs('#btn-new').addEventListener('click', function () {
    var cur = PCB.store.getBuild();
    var go = function () {
      PCB.store.setBuild(PCB.store.newBuild());
      location.href = 'builder.html';
    };
    if (PCB.store.items(cur).length && !cur.savedId) {
      PCB.confirm('Start a new build? Your current unsaved build will be cleared.', 'Start new').then(function (ok) { if (ok) go(); });
    } else go();
  });

  qs('#btn-compare').addEventListener('click', function () {
    var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
    location.href = 'comparison.html?tab=builds&builds=' + ids.map(encodeURIComponent).join(',');
  });

  qs('#btn-import').addEventListener('click', function () { qs('#import-file').click(); });
  qs('#import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { PCB.toast('That file is too large to be a build export.', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); } catch (err) { PCB.toast('The file is not valid JSON.', 'error'); return; }
      PCB.store.importBuild(obj).then(function (saved) {
        PCB.toast('Imported "' + saved.name + '".', 'success');
        load();
      }).catch(function (err) { PCB.toast(err.message, 'error'); });
    };
    reader.readAsText(file);
  });

  qs('#sb-migrate').addEventListener('click', function (e) {
    if (!e.target.closest('#btn-migrate')) return;
    PCB.store.importLocalToServer().then(function (n) {
      PCB.toast(n + ' build' + (n === 1 ? '' : 's') + ' imported into the database.', 'success');
      load();
    }).catch(function (err) { PCB.toast(err.message, 'error'); });
  });

  load();
});
