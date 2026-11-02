/* ==========================================================================
   comparison.js - Compare 2-4 components of one category, or 2-4 complete
   builds, with best/worst highlighting and charts.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var tab = PCB.param('tab') === 'builds' ? 'builds' : 'components';
  var saved = [];

  /* ---------- Tabs ---------- */

  function showTab(t) {
    tab = t;
    PCB.qsa('#cmp-tabs .tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
    qs('#panel-components').classList.toggle('hidden', t !== 'components');
    qs('#panel-builds').classList.toggle('hidden', t !== 'builds');
    history.replaceState(null, '', '?tab=' + t);
    if (t === 'components') renderComponents(); else renderBuilds();
  }
  qs('#cmp-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (b) showTab(b.getAttribute('data-tab'));
  });

  /** Marks best (and worst) values in a numeric row. dir: 1 = higher is better, -1 = lower is better. */
  function cells(values, dir, fmt) {
    var nums = values.filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    var best = nums.length > 1 ? (dir > 0 ? Math.max.apply(null, nums) : Math.min.apply(null, nums)) : null;
    var worst = nums.length > 1 ? (dir > 0 ? Math.min.apply(null, nums) : Math.max.apply(null, nums)) : null;
    return values.map(function (v) {
      var cls = best !== null && best !== worst ? (v === best ? 'best-cell' : v === worst ? 'worst-cell' : '') : '';
      return '<td class="num ' + cls + '">' + (v === null || v === undefined ? '–' : fmt ? fmt(v) : esc(v)) + '</td>';
    }).join('');
  }
  function textCells(values) { return values.map(function (v) { return '<td>' + v + '</td>'; }).join(''); }

  /* ---------- Component comparison ---------- */

  // Spec-table rows that are numeric: label -> [spec key, 1 = higher is better / -1 = lower is better].
  var HIGHLIGHT = {
    'Cores / Threads': ['threads', 1], 'Base / Boost clock': ['boostClockGHz', 1], 'TDP': ['tdp', -1], 'Max power (est.)': ['maxPower', -1],
    'Single-core index*': ['singleCoreIndex', 1], 'Multi-core index*': ['multiCoreIndex', 1], 'Gaming index*': ['gamingIndex', 1],
    'VRAM': ['vramGB', 1], 'Length': ['lengthMm', -1], 'Board power': ['tdp', -1], 'Recommended PSU': ['recommendedPsu', -1],
    'Raster performance index*': ['performanceIndex', 1], 'Ray tracing index*': ['rayTracingIndex', 1],
    'Memory': ['maxMemoryGB', 1], 'Max memory speed': ['maxMemorySpeed', 1], 'M.2 slots': ['m2Slots', 1], 'SATA ports': ['sataPorts', 1],
    'Capacity': ['capacityGB', 1], 'Speed': ['speedMHz', 1], 'CAS latency': ['casLatency', -1],
    'Sequential read': ['readMBs', 1], 'Sequential write': ['writeMBs', 1], 'Wattage': ['wattage', 1],
    'Max GPU length': ['maxGpuLengthMm', 1], 'Max air cooler height': ['maxCoolerHeightMm', 1], 'Included fans': ['includedFans', 1],
    'Rated cooling capacity': ['tdpRating', 1], 'Noise (max)': ['noiseDb', -1]
  };

  function populateCategory() {
    var sel = qs('#cc-cat');
    sel.innerHTML = PCB.CATEGORIES.map(function (c) { return '<option value="' + c.key + '">' + c.full + '</option>'; }).join('');
    var list = PCB.store.getCompare();
    sel.value = list.category || 'cpu';
  }

  function slotSelects() {
    var cat = qs('#cc-cat').value;
    var list = PCB.store.getCompare();
    var ids = list.category === cat ? list.ids.slice() : [];
    if (ids.length < 2) {
      // Sensible defaults: two popular mid-range parts.
      var byPrice = PCB.store.byCategory(cat).slice().sort(function (a, b) { return a.price - b.price; });
      var mid = Math.floor(byPrice.length / 2);
      [byPrice[mid - 1], byPrice[mid]].forEach(function (x) { if (x && ids.indexOf(x.id) === -1 && ids.length < 2) ids.push(x.id); });
    }
    var opts = PCB.store.byCategory(cat).slice().sort(function (a, b) { return (a.brand + a.name).localeCompare(b.brand + b.name); });
    var html = '';
    for (var i = 0; i < 4; i++) {
      html += '<label class="field"><span>Component ' + (i + 1) + (i > 1 ? ' (optional)' : '') + '</span><select data-slot="' + i + '">' +
        (i > 1 ? '<option value="">None</option>' : '') +
        opts.map(function (c) { return '<option value="' + esc(c.id) + '"' + (ids[i] === c.id ? ' selected' : '') + '>' + esc(c.brand + ' ' + c.name) + ' (' + PCB.money(c.price) + ')</option>'; }).join('') +
        '</select></label>';
    }
    qs('#cc-slots').innerHTML = html;
    PCB.store.setCompare(cat, selectedIds());
  }

  function selectedIds() {
    var ids = [];
    PCB.qsa('#cc-slots select').forEach(function (s) { if (s.value && ids.indexOf(s.value) === -1) ids.push(s.value); });
    return ids;
  }

  function renderComponents() {
    var cat = qs('#cc-cat').value;
    var items = selectedIds().map(PCB.store.byId).filter(Boolean);
    PCB.store.setCompare(cat, items.map(function (x) { return x.id; }));
    var out = qs('#cc-result');
    if (items.length < 2) {
      out.innerHTML = '<div class="empty-state"><h3>Select at least two different components</h3></div>';
      return;
    }
    var build = PCB.store.getBuild();
    var score = items.map(PCB.perf.componentScore);
    var head = '<tr><th>Attribute</th>' + items.map(function (x) {
      return '<th style="min-width:180px;text-transform:none;letter-spacing:0">' + PCB.imageTag(x) + '<div style="margin-top:6px;color:var(--text);font-size:.85rem">' + esc(x.brand + ' ' + x.name) + '</div></th>';
    }).join('') + '</tr>';

    var rows = '';
    rows += '<tr><th>Price</th>' + cells(items.map(function (x) { return x.price; }), -1, PCB.money) + '</tr>';
    rows += '<tr><th>Performance points*</th>' + cells(score, 1) + '</tr>';
    rows += '<tr><th>Price per performance point</th>' + cells(items.map(function (x, i) { return Math.round(x.price / Math.max(score[i], 1) * 100) / 100; }), -1, PCB.money) + '</tr>';
    rows += '<tr><th>Points per \u20B110,000</th>' + cells(items.map(function (x, i) { return Math.round(score[i] / x.price * 100000) / 10; }), 1, function (v) { return PCB.num(v, 1); }) + '</tr>';
    if (cat === 'cpu' || cat === 'gpu') {
      rows += '<tr><th>Power draw (est. peak)</th>' + cells(items.map(function (x) { return cat === 'cpu' ? x.specs.maxPower : x.specs.tdp; }), -1, function (v) { return v + ' W'; }) + '</tr>';
    }
    rows += '<tr><th>Fit with your current build</th>' + textCells(items.map(function (x) {
      var cc = PCB.compat.checkCandidate(build, cat, x.id);
      return PCB.badge(cc.status) + (cc.messages.length ? '<div class="tiny muted" style="margin-top:4px">' + esc(cc.messages[0]) + '</div>' : '');
    })) + '</tr>';

    // Every specification row; numeric rows get best/worst highlighting.
    var specTables = items.map(PCB.specRows);
    specTables[0].forEach(function (row, idx) {
      var label = row[0];
      var shown = specTables.map(function (t) { return t[idx] ? t[idx][1] : '–'; });
      var hl = HIGHLIGHT[label];
      var classes = hl ? cells(items.map(function (x) { return x.specs[hl[0]]; }), hl[1]).match(/class="[^"]*"/g) : null;
      rows += '<tr><th>' + esc(label) + '</th>' + shown.map(function (v, i) {
        return '<td ' + (classes ? classes[i] : '') + '>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });

    out.innerHTML = '<div class="table-wrap"><table class="spec-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:6px">Highlighted green = best value in that row. * Performance points and indices are relative estimates from the simulation model, not measured benchmarks. Prices were checked at Philippine stores on 2 November 2026.</p>' +
      '<div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>Performance points</h3><div class="chart-box" id="cc-chart-perf"></div></div>' +
      '<div class="card"><h3>Performance per \u20B110,000</h3><div class="chart-box" id="cc-chart-value"></div></div></div>';
    var labels = items.map(function (x) { return x.name; });
    PCB.barChart(qs('#cc-chart-perf'), { labels: labels, datasets: [{ label: 'Performance points', data: score }], horizontal: true });
    PCB.barChart(qs('#cc-chart-value'), { labels: labels, datasets: [{ label: 'Points per \u20B110,000', data: items.map(function (x, i) { return Math.round(score[i] / x.price * 100000) / 10; }) }], horizontal: true });
  }

  qs('#cc-cat').addEventListener('change', function () { slotSelects(); renderComponents(); });
  qs('#cc-slots').addEventListener('change', renderComponents);

  /* ---------- Build comparison ---------- */

  function buildOptions() {
    var cur = PCB.store.getBuild();
    return [{ key: 'current', build: cur, label: 'Current build: ' + cur.name }].concat(saved.map(function (b) {
      return { key: 'saved:' + b.savedId, build: b, label: b.name };
    }));
  }

  function renderBuildPicker() {
    var pre = (PCB.param('builds') || '').split(',').filter(Boolean).map(function (id) { return 'saved:' + id; });
    var opts = buildOptions();
    var checked = pre.length ? pre : opts.slice(0, 2).map(function (o) { return o.key; });
    qs('#cb-list').innerHTML = opts.map(function (o) {
      return '<label class="check card card-tight" style="display:flex"><input type="checkbox" value="' + esc(o.key) + '"' + (checked.indexOf(o.key) !== -1 ? ' checked' : '') + '>' +
        '<span><strong>' + esc(o.label) + '</strong><br><span class="small muted">' + PCB.money(PCB.store.total(o.build)) + ' · ' + esc(PCB.USAGES[o.build.usage]) + '</span></span></label>';
    }).join('');
    if (opts.length < 2) qs('#cb-list').insertAdjacentHTML('beforeend', '<p class="small muted">Save more builds on the <a href="saved-builds.html">Saved Builds</a> page or from the builder to compare them.</p>');
  }

  function renderBuilds() {
    var boxes = PCB.qsa('#cb-list input:checked');
    if (boxes.length > 4) {
      PCB.toast('Compare up to 4 builds at a time.', 'warn');
      boxes[boxes.length - 1].checked = false;
      boxes.pop();
    }
    var opts = buildOptions();
    var builds = boxes.map(function (b) { return opts.find(function (o) { return o.key === b.value; }); }).filter(Boolean).map(function (o) { return o.build; });
    var out = qs('#cb-result');
    if (builds.length < 2) {
      out.innerHTML = '<div class="empty-state"><h3>Select at least two builds</h3><p>Tick two to four builds above.</p></div>';
      return;
    }
    var totals = builds.map(PCB.store.total);
    var reports = builds.map(PCB.compat.check);
    var powers = builds.map(PCB.perf.power);
    var overviews = builds.map(PCB.perf.overview);
    var gaming = builds.map(function (b) { return PCB.perf.gaming(b, qs('#cb-res').value); });

    var head = '<tr><th>Attribute</th>' + builds.map(function (b) { return '<th style="text-transform:none;letter-spacing:0;color:var(--text);min-width:180px">' + esc(b.name) + '</th>'; }).join('') + '</tr>';
    var rows = '';
    rows += '<tr><th>Total price</th>' + cells(totals, -1, PCB.money) + '</tr>';
    rows += '<tr><th>Compatibility</th>' + textCells(reports.map(function (r) {
      return PCB.badge(r.status) + '<div class="tiny muted" style="margin-top:4px">' + r.counts.error + ' errors · ' + r.counts.warn + ' warnings' + (r.missing.length ? ' · incomplete' : '') + '</div>';
    })) + '</tr>';
    PCB.CATEGORIES.forEach(function (c) {
      rows += '<tr><th>' + esc(c.label) + '</th>' + textCells(builds.map(function (b) {
        var p = PCB.store.part(b, c.key);
        if (Array.isArray(p)) return p.length ? p.map(function (d) { return esc(d.name); }).join('<br>') : '<span class="muted">–</span>';
        return p ? esc(p.brand + ' ' + p.name) + '<div class="tiny muted">' + PCB.money(p.price) + '</div>' : '<span class="muted">–</span>';
      })) + '</tr>';
    });
    Object.keys(PCB.perf.WORKLOADS).forEach(function (w) {
      rows += '<tr><th>' + esc(PCB.perf.WORKLOADS[w].label) + ' score*</th>' + cells(overviews.map(function (o) { return o[w]; }), 1) + '</tr>';
    });
    rows += '<tr><th>AAA FPS @ ' + esc(qs('#cb-res').value) + '*</th>' + cells(gaming.map(function (g) { return g ? g.fps : null; }), 1, function (v) { return '~' + v; }) + '</tr>';
    rows += '<tr><th>Bottleneck @ ' + esc(qs('#cb-res').value) + '</th>' + textCells(gaming.map(function (g) {
      return g ? esc(g.bottleneck.severity === 'balanced' ? 'Balanced' : g.bottleneck.component.toUpperCase() + '-limited (' + g.bottleneck.percent + '%)') : '–';
    })) + '</tr>';
    rows += '<tr><th>Est. peak power</th>' + cells(powers.map(function (p) { return p.total; }), -1, function (v) { return v + ' W'; }) + '</tr>';
    rows += '<tr><th>Recommended PSU</th>' + textCells(powers.map(function (p) { return p.recommendedPsu + ' W'; })) + '</tr>';
    rows += '<tr><th>Value (own-usage score per \u20B110,000)</th>' + cells(builds.map(function (b, i) {
      var s = overviews[i][b.usage];
      return s && totals[i] ? Math.round(s / totals[i] * 100000) / 10 : null;
    }), 1) + '</tr>';

    out.innerHTML = '<div class="table-wrap"><table class="spec-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:6px">Highlighted green = best in that row. * Scores are model estimates (100 = reference build); FPS values are approximations, not measured benchmarks.</p>' +
      '<div class="card" style="margin-top:18px"><h3>Workload scores</h3><div class="chart-box tall" id="cb-chart"></div></div>';
    PCB.barChart(qs('#cb-chart'), {
      labels: Object.keys(PCB.perf.WORKLOADS).map(function (k) { return PCB.perf.WORKLOADS[k].label; }),
      datasets: builds.map(function (b, i) { return { label: b.name, data: Object.keys(PCB.perf.WORKLOADS).map(function (k) { return overviews[i][k] || 0; }) }; }),
      unit: ' pts'
    });
  }

  qs('#cb-list').addEventListener('change', renderBuilds);
  qs('#cb-res').innerHTML = Object.keys(PCB.RESOLUTIONS).map(function (k) { return '<option value="' + k + '">' + PCB.RESOLUTIONS[k] + '</option>'; }).join('');
  qs('#cb-res').value = '1440p';
  qs('#cb-res').addEventListener('change', renderBuilds);

  /* ---------- Init ---------- */

  populateCategory();
  slotSelects();
  PCB.store.listBuilds().catch(function (err) {
    PCB.toast('Could not load saved builds: ' + err.message, 'error');
    return [];
  }).then(function (list) {
    saved = list;
    renderBuildPicker();
    showTab(tab);
  });
});
