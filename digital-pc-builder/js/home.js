/* ==========================================================================
   home.js - Landing page: live preview of the current (or sample) build.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;

  // Shown when the visitor has not started a build yet.
  var SAMPLE = {
    name: 'Sample 1440p gaming build', usage: 'gaming', budget: 140000, resolution: '1440p',
    parts: { cpu: 'cpu-r5-7600', cooler: null, motherboard: 'mb-b650-gaming-x', ram: 'ram-ddr5-32-6000', gpu: 'gpu-rtx5070',
      storage: ['ssd-sn580-1tb'], psu: 'psu-rm750e', case: 'case-h5-flow' }
  };

  function render() {
    var current = PCB.store.getBuild();
    var isSample = !PCB.store.items(current).length;
    var build = isSample ? PCB.store.normalize(SAMPLE) : current;
    var report = PCB.compat.check(build);
    var g = PCB.perf.gaming(build, build.resolution);
    qs('#hero-panel').innerHTML =
      '<div class="row-between" style="margin-bottom:8px"><div><div class="eyebrow">' + (isSample ? 'Example build' : 'Your current build') + '</div>' +
      '<strong>' + esc(build.name) + '</strong></div>' + PCB.badge(report.status) + '</div>' +
      PCB.store.items(build).map(function (x) {
        return '<div class="hero-row">' + PCB.imageTag(x.item) + '<div class="grow"><div class="tiny muted">' + esc(PCB.category(x.category).label) +
          '</div><div>' + esc(x.item.brand + ' ' + x.item.name) + '</div></div><span class="mono small">' + PCB.money(x.item.price) + '</span></div>';
      }).join('') +
      '<div class="row-between" style="margin-top:12px"><div><div class="tiny muted">Estimated total</div><div class="price" style="font-size:1.5rem">' +
      PCB.money(PCB.store.total(build)) + '</div></div>' +
      (g ? '<div class="right"><div class="tiny muted">AAA @ ' + esc(build.resolution) + ' (estimate)</div><div class="mono">~' + g.presets[1].low + '–' + g.presets[1].high + ' FPS</div></div>' : '') +
      '</div>';
    qs('#hero-count').textContent = PCB.store.components.length;
  }

  window.addEventListener('pcb:build-changed', render);
  render();
});
