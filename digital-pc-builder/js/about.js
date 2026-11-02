/* ==========================================================================
   about.js - About page: live dataset statistics and system status.
   ========================================================================== */
PCB.init(function () {
  'use strict';

  var qs = PCB.qs, esc = PCB.esc;

  qs('#about-dataset').innerHTML = '<table><thead><tr><th>Category</th><th class="num">Components</th><th>Brands</th><th class="num">Price range</th></tr></thead><tbody>' +
    PCB.CATEGORIES.map(function (c) {
      var items = PCB.store.byCategory(c.key);
      var prices = items.map(function (i) { return i.price; });
      return '<tr><td>' + esc(c.full) + '</td><td class="num">' + items.length + '</td><td class="small">' + esc(PCB.store.brands(c.key).join(', ')) +
        '</td><td class="num">' + PCB.money(Math.min.apply(null, prices)) + ' – ' + PCB.money(Math.max.apply(null, prices)) + '</td></tr>';
    }).join('') + '</tbody></table>';

  qs('#about-status').innerHTML =
    '<dt>Data source</dt><dd>' + esc(PCB.store.dataSource) + '</dd>' +
    '<dt>Saved builds stored in</dt><dd>' + (PCB.store.mode === 'server' ? 'MySQL database (PHP API)' : 'Browser localStorage') + '</dd>' +
    '<dt>Charts</dt><dd>' + (window.Chart ? 'Chart.js ' + esc(window.Chart.version || '') : 'Built-in CSS bars (Chart.js not loaded)') + '</dd>' +
    '<dt>Reference build (100 pts)</dt><dd>' + esc(PCB.perf.REFERENCE_LABEL) + '</dd>';
});
