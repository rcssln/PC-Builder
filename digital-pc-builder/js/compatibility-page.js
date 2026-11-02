/* ==========================================================================
   compatibility-page.js - Compatibility Checker page: full rule-by-rule
   report for a build, power breakdown, and a quick two-part checker.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var picker = null;
  var source = PCB.param('build') || 'current';

  // What each rule needs before it can run.
  var NEEDS = {
    socket: ['cpu', 'motherboard'],
    memory: ['ram', 'motherboard'],
    formfactor: ['motherboard', 'case'],
    gpu: ['gpu', 'case'],
    cooler: ['cooler', 'cpu', 'case'],
    power: ['psu'],
    storage: ['storage', 'motherboard']
  };

  function renderReport() {
    var build = picker ? picker.resolve(qs('#cc-source').value) : PCB.store.getBuild();
    if (!build) build = PCB.store.getBuild();
    var report = PCB.compat.check(build);

    var st = PCB.STATUS[report.status];
    var headline = {
      ok: 'No compatibility problems found',
      warn: 'Compatible, with warnings to review',
      error: 'Incompatible parts detected',
      empty: 'This build has no components yet'
    }[report.status];
    qs('#cc-summary').innerHTML =
      '<div class="row-between"><div><div class="eyebrow">' + esc(build.name) + '</div><h2 style="margin:0">' + esc(headline) + '</h2></div>' + PCB.badge(report.status, st.label) + '</div>' +
      '<div class="grid grid-4" style="margin-top:16px">' +
      stat('Passed', report.counts.ok, 'ok') + stat('Warnings', report.counts.warn, 'warn') +
      stat('Errors', report.counts.error, 'error') + stat('Parts selected', PCB.store.items(build).length + ' / 8', '') + '</div>' +
      (report.missing.length ? '<p class="notice notice-info" style="margin:14px 0 0">Still needed for a complete PC: <strong>' +
        report.missing.map(function (k) { return esc(PCB.category(k).label); }).join(', ') + '</strong>.</p>' : '');

    qs('#cc-rules').innerHTML = Object.keys(PCB.compat.RULES).map(function (key, i) {
      var rule = PCB.compat.RULES[key];
      var checks = report.byRule[key];
      var real = checks.filter(function (x) { return x.status !== 'info'; });
      var status = real.length ? PCB.compat.worst(real.map(function (x) { return x.status; })) : null;
      var missing = NEEDS[key].filter(function (k) {
        var v = build.parts[k];
        return !(Array.isArray(v) ? v.length : v);
      });
      var body = checks.length ? PCB.ui.checksHtml(checks)
        : '<p class="small muted">Not checked yet: select ' + missing.map(function (k) { return PCB.category(k).label; }).join(' and ') + ' to run this check.</p>';
      return '<section class="card"><div class="card-head"><h3>' + (i + 1) + '. ' + esc(rule.label) + '</h3>' +
        (status ? PCB.badge(status) : PCB.badge('empty', 'Pending')) + '</div>' + body + '</section>';
    }).join('');

    var pw = PCB.perf.power(build);
    var psu = PCB.store.part(build, 'psu');
    var labels = { cpu: 'CPU (peak)', gpu: 'Graphics card', motherboard: 'Motherboard', ram: 'Memory', storage: 'Storage', cooler: 'CPU cooler', other: 'Fans & misc.' };
    qs('#cc-power').innerHTML = '<table><thead><tr><th>Component</th><th class="num">Estimated watts</th></tr></thead><tbody>' +
      Object.keys(labels).map(function (k) { return '<tr><td>' + labels[k] + '</td><td class="num">' + pw.parts[k] + ' W</td></tr>'; }).join('') +
      '<tr class="total-row"><td>Estimated peak draw</td><td class="num">' + pw.total + ' W</td></tr>' +
      '<tr><td>Recommended PSU (peak × 1.3, rounded up)</td><td class="num">' + (pw.recommendedPsu || 0) + ' W</td></tr>' +
      '<tr><td>Selected PSU</td><td class="num">' + (psu ? psu.specs.wattage + ' W' : '–') + '</td></tr></tbody></table>';
  }

  function stat(label, value, tone) {
    var color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'error' ? 'var(--error)' : 'var(--text)';
    return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value" style="color:' + color + '">' + value + '</div></div>';
  }

  /* ---------- Quick pair checker ---------- */

  var PAIRS = {
    'cpu|motherboard': 'CPU + Motherboard (socket)',
    'motherboard|ram': 'Motherboard + RAM (DDR generation)',
    'motherboard|case': 'Motherboard + Case (form factor)',
    'gpu|case': 'GPU + Case (length clearance)',
    'cooler|cpu': 'Cooler + CPU (socket & capacity)',
    'cooler|case': 'Cooler + Case (height / radiator)',
    'storage|motherboard': 'Storage + Motherboard (interface)',
    'psu|gpu': 'PSU + GPU (wattage & connector)',
    'psu|case': 'PSU + Case (form factor)'
  };

  function itemOptions(cat) {
    return PCB.store.byCategory(cat).map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.brand + ' ' + c.name) + ' · ' + esc(PCB.keySpecs(c).slice(0, 2).join(', ')) + '</option>';
    }).join('');
  }

  function setupPairChecker() {
    var pairSel = qs('#qp-pair');
    pairSel.innerHTML = Object.keys(PAIRS).map(function (k) { return '<option value="' + k + '">' + PAIRS[k] + '</option>'; }).join('');
    function fillItems() {
      var cats = pairSel.value.split('|');
      qs('#qp-a-label').textContent = PCB.category(cats[0]).label;
      qs('#qp-b-label').textContent = PCB.category(cats[1]).label;
      qs('#qp-a').innerHTML = itemOptions(cats[0]);
      qs('#qp-b').innerHTML = itemOptions(cats[1]);
      runPair();
    }
    function runPair() {
      var cats = pairSel.value.split('|');
      var b = PCB.store.newBuild();
      [[cats[0], qs('#qp-a').value], [cats[1], qs('#qp-b').value]].forEach(function (p) {
        if (Array.isArray(b.parts[p[0]])) b.parts[p[0]] = [p[1]]; else b.parts[p[0]] = p[1];
      });
      var checks = PCB.compat.check(b).checks.filter(function (x) {
        return !x.pending && x.parts.indexOf(cats[0]) !== -1 && x.parts.indexOf(cats[1]) !== -1 ||
          (cats[0] === 'psu' && x.rule === 'power' && x.status !== 'info');
      });
      var status = checks.length ? PCB.compat.worst(checks.map(function (x) { return x.status; })) : 'info';
      qs('#qp-result').innerHTML = '<div style="margin-bottom:10px">' + PCB.badge(status, status === 'info' ? 'No direct rule for this pair' : null) + '</div>' +
        (checks.length ? PCB.ui.checksHtml(checks) : '<p class="small muted">These two parts do not interact directly.</p>') +
        (cats[0] === 'psu' && cats[1] === 'gpu' ? '<p class="tiny muted" style="margin-top:8px">PSU check assumes only the GPU plus a typical baseline; use the full report for your real build.</p>' : '');
    }
    pairSel.addEventListener('change', fillItems);
    qs('#qp-a').addEventListener('change', runPair);
    qs('#qp-b').addEventListener('change', runPair);
    fillItems();
  }

  /* ---------- Init ---------- */

  PCB.ui.buildPicker(qs('#cc-source')).then(function (p) {
    picker = p;
    var sel = qs('#cc-source');
    sel.value = source;
    if (!sel.value) sel.value = 'current';
    renderReport();
  });
  qs('#cc-source').addEventListener('change', renderReport);
  window.addEventListener('pcb:build-changed', function () {
    if (qs('#cc-source').value === 'current') renderReport();
  });
  setupPairChecker();
  renderReport();
});
