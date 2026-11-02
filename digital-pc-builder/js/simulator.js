/* ==========================================================================
   simulator.js - Performance Simulator page: workload simulation,
   utilization, bottleneck, FPS ranges, power, and A/B comparison.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;
  var workload = PCB.perf.WORKLOADS[PCB.param('workload')] ? PCB.param('workload') : null;
  var pickA = null, pickB = null;

  var el = { a: qs('#sim-a'), b: qs('#sim-b'), res: qs('#sim-res'), seg: qs('#sim-workload') };

  el.seg.innerHTML = Object.keys(PCB.perf.WORKLOADS).map(function (k) {
    return '<button type="button" data-w="' + k + '">' + PCB.perf.WORKLOADS[k].label + '</button>';
  }).join('');
  el.res.innerHTML = Object.keys(PCB.RESOLUTIONS).map(function (k) { return '<option value="' + k + '">' + PCB.RESOLUTIONS[k] + '</option>'; }).join('');

  function buildA() { return (pickA && pickA.resolve(el.a.value)) || PCB.store.getBuild(); }
  function buildB() { return pickB ? pickB.resolve(el.b.value) : null; }

  function render() {
    var a = buildA();
    if (!workload) workload = a.usage;
    PCB.qsa('button', el.seg).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-w') === workload); });
    qs('#sim-res-field').classList.toggle('hidden', workload !== 'gaming');
    qs('#sim-desc').textContent = PCB.perf.WORKLOADS[workload].desc;

    var res = el.res.value;
    var sim = PCB.perf.simulate(a, workload, res);
    var out = qs('#sim-results');
    if (sim.error) {
      out.innerHTML = '<div class="empty-state"><h3>Simulation unavailable</h3><p>' + esc(sim.error) + '</p><a class="btn btn-primary" href="builder.html">Open PC Builder</a></div>';
      renderCompare(a, null, res);
      return;
    }

    var b = buildB();
    var simB = b ? PCB.perf.simulate(b, workload, res) : null;

    var scoreCard = '<div class="card"><div class="row" style="gap:20px;align-items:center">' +
      '<div class="score-box"><strong>' + sim.score + '</strong><span>points</span></div>' +
      '<div class="grow"><div class="eyebrow">' + esc(PCB.perf.WORKLOADS[workload].label) + (workload === 'gaming' ? ' · ' + esc(PCB.RESOLUTIONS[res]) : '') + '</div>' +
      '<h3 style="margin-bottom:4px">' + esc(sim.tier) + '</h3>' +
      '<p class="small muted" style="margin:0">100 = reference build (' + esc(PCB.perf.REFERENCE_LABEL) + '). ' +
      (sim.valuePer10k ? 'Value: <strong class="mono">' + sim.valuePer10k + '</strong> points per \u20B110,000.' : '') + '</p>' +
      (simB && !simB.error ? '<p class="small" style="margin:6px 0 0">vs <strong>' + esc(b.name) + '</strong>: ' + diffText(sim.score, simB.score) + '</p>' : '') +
      '</div></div></div>';

    var utilCard = '<div class="card"><div class="card-head"><h3>Utilization estimate</h3><span class="tag-estimate">Estimate</span></div>' +
      PCB.meter('CPU', sim.utilization.cpu) + PCB.meter('GPU', sim.utilization.gpu) +
      '<p class="tiny muted" style="margin:10px 0 0">' + (workload === 'gaming'
        ? 'Share of each component\'s capacity used at the estimated frame rate. CPU figure is the overall load across all threads.'
        : 'Typical load pattern while the workload is running (rendering depends on whether a CPU or GPU render engine is used).') + '</p></div>';

    var bn = sim.bottleneck;
    var bnTone = bn.severity === 'balanced' ? 'ok' : bn.severity === 'gpu-bound' || bn.severity === 'mild' ? 'info' : 'warn';
    var bnLabel = { balanced: 'Balanced', 'gpu-bound': 'GPU-bound', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' }[bn.severity];
    var bottleCard = '<div class="card"><div class="card-head"><h3>Bottleneck analysis</h3>' + PCB.badge(bnTone, bnLabel) + '</div>' +
      (bn.component !== 'none' ? PCB.meter('Limiting component: ' + bn.component.toUpperCase(), bn.percent, { tone: bnTone === 'warn' ? 'warn' : 'cool', text: bn.percent + '%' }) : '') +
      '<p class="small" style="margin:10px 0 0">' + esc(bn.text) + '</p></div>';

    var psu = PCB.store.part(a, 'psu');
    var rec = PCB.perf.power(a).recommendedPsu;
    var powerCard = '<div class="card"><div class="card-head"><h3>Power consumption</h3><span class="tag-estimate">Estimate</span></div>' +
      '<dl class="kv"><dt>Idle / desktop</dt><dd>~' + sim.power.idle + ' W</dd><dt>During ' + esc(PCB.perf.WORKLOADS[workload].label.toLowerCase()) + '</dt><dd>~' + sim.power.load + ' W</dd>' +
      '<dt>Worst-case peak</dt><dd>~' + sim.power.peak + ' W</dd><dt>Recommended PSU</dt><dd>' + rec + ' W</dd>' +
      '<dt>Selected PSU</dt><dd>' + (psu ? psu.specs.wattage + ' W (' + Math.round(sim.power.load / psu.specs.wattage * 100) + '% load)' : 'none') + '</dd>' +
      '<dt>Energy, 4 h/day</dt><dd>~' + PCB.num(sim.power.load * 4 * 365 / 1000) + ' kWh / year</dd></dl></div>';

    var fpsCard = '';
    if (sim.gaming) {
      var gB = simB && !simB.error ? simB.gaming : null;
      fpsCard = '<div class="card" style="grid-column:1/-1"><div class="card-head"><h3>Estimated gaming frame rates · ' + esc(PCB.RESOLUTIONS[res]) + '</h3><span class="tag-estimate">Model estimate, not measured</span></div>' +
        '<div class="row" style="gap:28px;margin-bottom:14px"><div><div class="fps-big">' + sim.gaming.fps + ' <small>FPS</small></div><div class="small muted">Typical AAA, high settings</div></div>' +
        '<div class="small muted" style="max-width:520px">CPU can prepare ~' + sim.gaming.cpuFps + ' frames/s; GPU can render ~' + sim.gaming.gpuFps +
        ' frames/s at this resolution. The lower value sets the frame rate.' + (sim.gaming.integrated ? ' <strong>Integrated graphics in use.</strong>' : '') + '</div></div>' +
        '<div class="table-wrap"><table class="fps-table"><thead><tr><th>Game type</th><th class="num">Estimated range</th><th>Limited by</th>' +
        (gB ? '<th class="num">' + esc(b.name) + '</th>' : '') + '</tr></thead><tbody>' +
        sim.gaming.presets.map(function (p, i) {
          var other = gB ? gB.presets[i] : null;
          return '<tr><td>' + esc(p.label) + (p.notes && p.notes.length ? '<div class="tiny muted">' + esc(p.notes.join(' ')) + '</div>' : '') + '</td>' +
            (p.unavailable ? '<td class="num">n/a</td><td class="muted">Needs a ray-tracing GPU</td>' : '<td class="num">' + p.low + '–' + p.high + ' FPS</td><td>' + p.limitedBy + '</td>') +
            (gB ? '<td class="num">' + (other.unavailable ? 'n/a' : other.low + '–' + other.high) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin:10px 0 0">Ranges come from the transparent model on the About page (relative GPU/CPU indices × resolution and preset factors, ±12–15%). ' +
        'Real results vary by game, settings, drivers and upscaling. No measured benchmark data is included in this project.</p></div>';
    }

    var notes = sim.notes.length ? '<div class="card" style="grid-column:1/-1"><h3>Notes</h3><ul class="small">' + sim.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '';

    out.innerHTML = '<div class="grid grid-2">' + scoreCard + utilCard + bottleCard + powerCard + fpsCard + notes + '</div>';
    renderCompare(a, b && simB && !simB.error ? b : null, res);
  }

  function diffText(a, b) {
    if (!b) return 'n/a';
    var d = Math.round((a - b) / b * 100);
    return d === 0 ? 'about the same' : '<strong class="' + (d > 0 ? 'best-cell' : 'worst-cell') + '" style="font-weight:700">' + (d > 0 ? '+' : '') + d + '%</strong> ' + (d > 0 ? 'faster' : 'slower') + ' (estimated)';
  }

  /** Charts: all workload scores, and FPS at each resolution, for A (and B). */
  function renderCompare(a, b, res) {
    var labels = Object.keys(PCB.perf.WORKLOADS).map(function (k) { return PCB.perf.WORKLOADS[k].label; });
    var oa = PCB.perf.overview(Object.assign({}, a, { resolution: res }));
    var datasets = [{ label: a.name, data: Object.keys(PCB.perf.WORKLOADS).map(function (k) { return oa[k] || 0; }) }];
    if (b) {
      var ob = PCB.perf.overview(Object.assign({}, b, { resolution: res }));
      datasets.push({ label: b.name, data: Object.keys(PCB.perf.WORKLOADS).map(function (k) { return ob[k] || 0; }) });
    }
    PCB.barChart(qs('#chart-workloads'), { labels: labels, datasets: datasets, unit: ' pts' });

    var resKeys = Object.keys(PCB.RESOLUTIONS);
    var fpsSets = [a].concat(b ? [b] : []).map(function (x) {
      return { label: x.name, data: resKeys.map(function (r) { var g = PCB.perf.gaming(x, r); return g ? g.fps : 0; }) };
    });
    PCB.barChart(qs('#chart-fps'), { labels: resKeys.map(function (r) { return r.toUpperCase(); }), datasets: fpsSets, unit: ' FPS' });
  }

  /* ---------- Events & init ---------- */

  el.seg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-w]');
    if (!b) return;
    workload = b.getAttribute('data-w');
    history.replaceState(null, '', '?workload=' + workload);
    render();
  });
  [el.a, el.b, el.res].forEach(function (s) { s.addEventListener('change', render); });
  window.addEventListener('pcb:build-changed', render);

  el.res.value = PCB.store.getBuild().resolution;
  Promise.all([PCB.ui.buildPicker(el.a), PCB.ui.buildPicker(el.b, { includeNone: 'No comparison' })]).then(function (p) {
    pickA = p[0];
    pickB = p[1];
    el.b.value = '';
    render();
  });
  render();
});
