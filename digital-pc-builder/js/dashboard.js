/* ==========================================================================
   dashboard.js - Dashboard: current build at a glance, quick-start presets,
   recent saved builds and catalog statistics.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;

  var PRESETS = [
    { usage: 'general', budget: 60000, resolution: '1080p', name: 'Home & Office PC', desc: 'Quiet everyday machine for web, office and media.' },
    { usage: 'gaming', budget: 85000, resolution: '1080p', name: 'Budget 1080p Gaming', desc: 'High frame rates at Full HD for the money.' },
    { usage: 'gaming', budget: 120000, resolution: '1440p', name: '1440p Gaming Rig', desc: 'Balanced CPU and GPU for high-refresh QHD.' },
    { usage: 'programming', budget: 95000, resolution: '1440p', name: 'Developer Workstation', desc: 'Many cores, 32 GB RAM and fast NVMe for builds.' },
    { usage: 'video', budget: 150000, resolution: '1440p', name: 'Video Editing Studio', desc: '64 GB RAM and GPU acceleration for timelines.' },
    { usage: 'rendering', budget: 210000, resolution: '4k', name: '3D Rendering Powerhouse', desc: 'High core count plus a large-VRAM GPU.' }
  ];

  function renderCurrent() {
    var build = PCB.store.getBuild();
    var items = PCB.store.items(build);
    var report = PCB.compat.check(build);
    var pw = PCB.perf.power(build);
    var score = PCB.perf.score(build, build.usage);

    qs('#d-stats').innerHTML =
      stat('Current build', PCB.money(PCB.store.total(build)), items.length + ' of 8 categories filled') +
      stat('Compatibility', PCB.badge(report.status), report.counts.error + ' errors · ' + report.counts.warn + ' warnings') +
      stat('Estimated power', pw.total + ' W', 'Recommended PSU ' + (pw.recommendedPsu || 0) + ' W') +
      stat(PCB.USAGES[build.usage] + ' score', score ? score + ' pts' : '–', score ? PCB.perf.tier(score) + ' (model estimate)' : 'Select a CPU to estimate');

    qs('#d-build').innerHTML = items.length
      ? '<div class="row-between" style="margin-bottom:10px"><div><strong>' + esc(build.name) + '</strong><div class="small muted">' + esc(PCB.USAGES[build.usage]) +
        (build.budget ? ' · Budget ' + PCB.money(build.budget) : '') + '</div></div>' + PCB.badge(report.status) + '</div>' +
        items.map(function (x) {
          return '<div class="hero-row">' + PCB.imageTag(x.item) + '<div class="grow"><div class="tiny muted">' + esc(PCB.category(x.category).label) + '</div><div>' +
            esc(x.item.brand + ' ' + x.item.name) + '</div></div><span class="mono small">' + PCB.money(x.item.price) + '</span></div>';
        }).join('')
      : '<div class="empty-state"><h3>No components selected</h3><p>Start from scratch or use a quick-start preset.</p><a class="btn btn-primary" href="builder.html">Open PC Builder</a></div>';
    qs('#d-insights').innerHTML = PCB.ui.insightsHtml(PCB.recommend.insights(build));
  }

  function stat(label, value, sub) {
    return '<div class="stat"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + esc(sub) + '</div></div>';
  }

  function renderPresets() {
    qs('#d-presets').innerHTML = PRESETS.map(function (p, i) {
      return '<div class="card feature"><div class="row-between"><span class="chip">' + esc(PCB.USAGES[p.usage]) + '</span><strong class="mono">' + PCB.money(p.budget) + '</strong></div>' +
        '<h3 style="margin:4px 0 0">' + esc(p.name) + '</h3><p>' + esc(p.desc) + '</p>' +
        '<button class="btn btn-sm btn-secondary" data-preset="' + i + '">Generate this build</button></div>';
    }).join('');
  }

  qs('#d-presets').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-preset]');
    if (!btn) return;
    var p = PRESETS[Number(btn.getAttribute('data-preset'))];
    var go = function () {
      var b = PCB.store.newBuild();
      b.name = p.name;
      b.usage = p.usage;
      b.budget = p.budget;
      b.resolution = p.resolution;
      var result = PCB.recommend.autoComplete(b);
      PCB.store.setBuild(result.build);
      PCB.toast('Generated "' + p.name + '" with ' + result.log.length + ' recommended parts.', 'success');
      location.href = 'builder.html';
    };
    var cur = PCB.store.getBuild();
    if (PCB.store.items(cur).length && !cur.savedId) {
      PCB.confirm('Replace your current unsaved build with the "' + p.name + '" preset?', 'Generate').then(function (ok) { if (ok) go(); });
    } else go();
  });

  function renderSaved() {
    PCB.store.listBuilds().then(function (list) {
      qs('#d-saved-count').textContent = list.length;
      qs('#d-saved').innerHTML = list.length ? list.slice(0, 4).map(function (b) {
        return '<div class="hero-row"><div class="grow"><div><strong>' + esc(b.name) + '</strong></div><div class="tiny muted">' + esc(PCB.USAGES[b.usage]) +
          (b.updatedAt ? ' · ' + esc(PCB.date(b.updatedAt)) : '') + '</div></div>' + PCB.badge(PCB.compat.check(b).status) +
          '<a class="btn btn-sm" href="summary.html?id=' + encodeURIComponent(b.savedId) + '">' + PCB.money(PCB.store.total(b)) + '</a></div>';
      }).join('') : '<p class="small muted">No saved builds yet.</p>';
    }).catch(function (err) {
      qs('#d-saved').innerHTML = '<p class="small muted">Could not load saved builds: ' + esc(err.message) + '</p>';
    });
  }

  function renderCatalog() {
    var labels = PCB.CATEGORIES.map(function (c) { return c.label; });
    var counts = PCB.CATEGORIES.map(function (c) { return PCB.store.byCategory(c.key).length; });
    PCB.barChart(qs('#d-chart'), { labels: labels, datasets: [{ label: 'Components', data: counts }], horizontal: true });
    var brands = {};
    PCB.store.components.forEach(function (c) { brands[c.brand] = true; });
    qs('#d-catalog-meta').innerHTML = '<strong>' + PCB.store.components.length + '</strong> components from <strong>' + Object.keys(brands).length +
      '</strong> brands · source: ' + esc(PCB.store.dataSource);
  }

  window.addEventListener('pcb:build-changed', renderCurrent);
  renderCurrent();
  renderPresets();
  renderSaved();
  renderCatalog();
});
