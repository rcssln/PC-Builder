/* ==========================================================================
   summary.js - Build Summary page: full parts list, cost, compatibility,
   power, performance overview, and save / edit / delete / print / export.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var savedId = PCB.param('id');
  var build = null;

  function load() {
    if (!savedId) {
      build = PCB.store.getBuild();
      render();
      return;
    }
    PCB.store.getSaved(savedId).then(function (b) {
      build = b;
      render();
    }).catch(function (err) {
      qs('#summary').innerHTML = '<div class="empty-state error-state"><h2>Saved build not found</h2><p>' + esc(err.message) +
        '</p><a class="btn btn-primary" href="saved-builds.html">Back to saved builds</a></div>';
      qs('#summary-actions').classList.add('hidden');
    });
  }

  function render() {
    var items = PCB.store.items(build);
    var total = PCB.store.total(build);
    var report = PCB.compat.check(build);
    var pw = PCB.perf.power(build);
    var psu = PCB.store.part(build, 'psu');
    var overview = PCB.perf.overview(build);
    var gaming = PCB.perf.gaming(build, build.resolution);
    var isSaved = !!savedId;

    qs('#btn-sum-save').classList.toggle('hidden', isSaved);
    qs('#btn-sum-delete').classList.toggle('hidden', !isSaved && !build.savedId);
    qs('#btn-sum-edit').textContent = isSaved ? 'Load into builder' : 'Edit in builder';

    if (!items.length) {
      qs('#summary').innerHTML = '<div class="empty-state"><h2>Your build is empty</h2><p>Add components in the PC Builder to generate a summary.</p>' +
        '<a class="btn btn-primary" href="builder.html">Open PC Builder</a></div>';
      return;
    }

    var header = '<div class="card"><div class="row-between"><div><div class="eyebrow">' + (isSaved ? 'Saved build' : 'Current build') + '</div>' +
      '<h2 style="margin:0">' + esc(build.name) + '</h2>' +
      '<div class="small muted">' + esc(PCB.USAGES[build.usage]) + ' · ' + esc(PCB.RESOLUTIONS[build.resolution]) +
      (build.budget ? ' · Budget ' + PCB.money(build.budget) : '') + (build.updatedAt ? ' · Updated ' + esc(PCB.date(build.updatedAt)) : '') +
      ' · Generated ' + esc(PCB.date(new Date().toISOString())) + '</div>' +
      (build.notes ? '<p class="small" style="margin:8px 0 0">' + esc(build.notes) + '</p>' : '') + '</div>' +
      '<div class="right"><div class="total-big">' + PCB.money(total) + '</div>' + PCB.badge(report.status) + '</div></div></div>';

    var rows = items.map(function (x) {
      return '<tr><td>' + PCB.imageTag(x.item) + '</td><td><div class="tiny muted">' + esc(PCB.category(x.category).label) + '</div>' +
        '<strong>' + esc(x.item.brand + ' ' + x.item.name) + '</strong></td>' +
        '<td><div class="chips">' + PCB.keySpecs(x.item).map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div></td>' +
        '<td class="num">' + PCB.money(x.item.price) + '</td></tr>';
    }).join('');
    var budgetRow = build.budget ? '<tr><td></td><td colspan="2">Budget ' + PCB.money(build.budget) + '</td><td class="num">' +
      (total > build.budget ? '<span class="worst-cell">' + PCB.money(total - build.budget) + ' over</span>' : PCB.money(build.budget - total) + ' left') + '</td></tr>' : '';
    var table = '<div class="table-wrap"><table class="summary-table"><thead><tr><th></th><th>Component</th><th>Key specifications</th><th class="num">Price</th></tr></thead><tbody>' +
      rows + '<tr class="total-row"><td></td><td colspan="2">Total estimated cost</td><td class="num">' + PCB.money(total) + '</td></tr>' + budgetRow +
      '</tbody></table></div><p class="tiny muted" style="margin-top:6px">Prices in Philippine pesos, checked at Philippine stores on 2 November 2026. Open a part in the catalog to see its store listing. Prices change often, so confirm with the store before buying.</p>';

    var missing = report.missing.length ? '<p class="notice" style="margin:0 0 10px">Missing for a complete PC: ' +
      report.missing.map(function (k) { return esc(PCB.category(k).label); }).join(', ') + '</p>' : '';
    var compat = '<div class="card"><div class="card-head"><h3>Compatibility</h3>' + PCB.badge(report.status) + '</div>' + missing +
      '<p class="small muted">' + report.counts.ok + ' passed · ' + report.counts.warn + ' warnings · ' + report.counts.error + ' errors</p>' +
      PCB.ui.checksHtml(report.checks.filter(function (x) { return x.status !== 'ok'; })) +
      (report.counts.ok ? '<details style="margin-top:10px"><summary class="small">Show ' + report.counts.ok + ' passed checks</summary><div style="margin-top:8px">' +
        PCB.ui.checksHtml(report.checks.filter(function (x) { return x.status === 'ok'; })) + '</div></details>' : '') + '</div>';

    var power = '<div class="card"><div class="card-head"><h3>Power</h3><span class="tag-estimate">Estimate</span></div><dl class="kv">' +
      '<dt>Estimated peak draw</dt><dd>' + pw.total + ' W</dd><dt>Recommended PSU</dt><dd>' + pw.recommendedPsu + ' W</dd>' +
      '<dt>Selected PSU</dt><dd>' + (psu ? psu.specs.wattage + ' W ' + esc(psu.specs.efficiency) : 'none') + '</dd>' +
      '<dt>Gaming load</dt><dd>~' + PCB.perf.workloadPower(build, 'gaming') + ' W</dd><dt>Idle</dt><dd>~' + PCB.perf.workloadPower(build, 'idle') + ' W</dd></dl></div>';

    var perfRows = Object.keys(PCB.perf.WORKLOADS).map(function (k) {
      var v = overview[k];
      return v === null ? '<div class="small muted">' + esc(PCB.perf.WORKLOADS[k].label) + ': needs a CPU' + (k === 'gaming' ? ' and graphics' : '') + '</div>'
        : PCB.meter(PCB.perf.WORKLOADS[k].label + ' · ' + PCB.perf.tier(v), v, { max: 250, unit: ' pts', tone: k === build.usage ? 'warm' : 'cool' });
    }).join('');
    var perf = '<div class="card"><div class="card-head"><h3>Performance overview</h3><span class="tag-estimate">Estimate</span></div>' + perfRows +
      (gaming ? '<p class="small" style="margin:12px 0 0">Gaming at ' + esc(PCB.RESOLUTIONS[build.resolution]) + ': ~<strong>' + gaming.presets[1].low + '–' + gaming.presets[1].high +
        ' FPS</strong> in modern AAA titles at high settings. ' + esc(gaming.bottleneck.text) + '</p>' : '') +
      '<p class="tiny muted" style="margin:8px 0 0">100 pts = reference build (' + esc(PCB.perf.REFERENCE_LABEL) + ').</p></div>';

    var insights = '<div class="card"><h3>Recommendations &amp; insights</h3>' + PCB.ui.insightsHtml(PCB.recommend.insights(build)) + '</div>';

    qs('#summary').innerHTML = header + '<div class="stack" style="margin-top:18px">' + table + '</div>' +
      '<div class="grid grid-2" style="margin-top:18px;align-items:start">' + compat + '<div class="stack">' + power + perf + '</div></div>' +
      '<div style="margin-top:18px">' + insights + '</div>';
  }

  /* ---------- Export ---------- */

  function fileBase() { return (build.name || 'pc-build').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pc-build'; }

  function exportJson() {
    var data = {
      format: 'digital-pc-builder/build@1',
      exportedAt: new Date().toISOString(),
      build: { name: build.name, usage: build.usage, budget: build.budget, resolution: build.resolution, notes: build.notes, parts: build.parts },
      totalPrice: PCB.store.total(build),
      compatibility: PCB.compat.check(build).status,
      estimatedPeakWatts: PCB.perf.power(build).total,
      components: PCB.store.items(build).map(function (x) { return { category: x.category, id: x.item.id, brand: x.item.brand, name: x.item.name, price: x.item.price, specs: x.item.specs }; })
    };
    PCB.download(fileBase() + '.json', JSON.stringify(data, null, 2), 'application/json');
  }

  function csvCell(v) { var s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportCsv() {
    var lines = [['Category', 'Brand', 'Name', 'Key specifications', 'Price (PHP)', 'Price source']];
    PCB.store.items(build).forEach(function (x) {
      lines.push([PCB.category(x.category).label, x.item.brand, x.item.name, PCB.keySpecs(x.item).join(' | '), x.item.price, PCB.ui.priceStatus(x.item)]);
    });
    lines.push(['', '', '', 'Total', PCB.store.total(build)]);
    lines.push(['', '', '', 'Estimated peak power (W)', PCB.perf.power(build).total]);
    lines.push(['', '', '', 'Recommended PSU (W)', PCB.perf.power(build).recommendedPsu]);
    lines.push(['', '', '', 'Compatibility', PCB.STATUS[PCB.compat.check(build).status].label]);
    PCB.download(fileBase() + '.csv', '﻿' + lines.map(function (l) { return l.map(csvCell).join(','); }).join('\r\n'), 'text/csv');
  }

  function textSummary() {
    var r = PCB.compat.check(build);
    return [build.name + ' (' + PCB.USAGES[build.usage] + ')', ''].concat(
      PCB.store.items(build).map(function (x) { return PCB.category(x.category).label + ': ' + x.item.brand + ' ' + x.item.name + ' - ' + PCB.money(x.item.price); }),
      ['', 'Total: ' + PCB.money(PCB.store.total(build)) + ' (prices checked 2 Nov 2026)',
        'Compatibility: ' + PCB.STATUS[r.status].label + ' (' + r.counts.error + ' errors, ' + r.counts.warn + ' warnings)',
        'Estimated peak power: ' + PCB.perf.power(build).total + ' W, recommended PSU ' + PCB.perf.power(build).recommendedPsu + ' W']
    ).join('\n');
  }

  /* ---------- Actions ---------- */

  qs('#btn-sum-print').addEventListener('click', function () { window.print(); });
  qs('#btn-sum-json').addEventListener('click', function () { if (PCB.store.items(build).length) exportJson(); else PCB.toast('Nothing to export yet.', 'warn'); });
  qs('#btn-sum-csv').addEventListener('click', function () { if (PCB.store.items(build).length) exportCsv(); else PCB.toast('Nothing to export yet.', 'warn'); });
  qs('#btn-sum-copy').addEventListener('click', function () {
    if (!PCB.store.items(build).length) { PCB.toast('Nothing to copy yet.', 'warn'); return; }
    var text = textSummary();
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      PCB.toast('Summary copied to clipboard.', 'success');
    }).catch(function () {
      PCB.modal({ title: 'Copy summary', body: '<textarea rows="12" readonly style="font-family:var(--font-mono)">' + esc(text) + '</textarea>' });
    });
  });
  qs('#btn-sum-save').addEventListener('click', function () {
    PCB.ui.saveBuildDialog(PCB.store.getBuild()).then(function (saved) { if (saved) { build = PCB.store.getBuild(); render(); } });
  });
  qs('#btn-sum-edit').addEventListener('click', function () {
    if (savedId) {
      PCB.store.setBuild(build);
      PCB.toast('Loaded into the builder.', 'success');
    }
    location.href = 'builder.html';
  });
  qs('#btn-sum-delete').addEventListener('click', function () {
    var id = savedId || build.savedId;
    PCB.confirm('Permanently delete the saved build "' + build.name + '"?', 'Delete').then(function (ok) {
      if (!ok) return;
      PCB.store.deleteBuild(id).then(function () {
        PCB.toast('Saved build deleted.', 'success');
        if (savedId) location.href = 'saved-builds.html';
        else { build = PCB.store.getBuild(); render(); }
      }).catch(function (err) { PCB.toast(err.message, 'error'); });
    });
  });

  window.addEventListener('pcb:build-changed', function () {
    if (!savedId) { build = PCB.store.getBuild(); render(); }
  });
  load();
});
