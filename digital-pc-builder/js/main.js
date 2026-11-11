/* ==========================================================================
   main.js - Shared namespace, constants, utilities and page layout.
   Loaded first on every page. Every other script attaches to window.PCB.
   ========================================================================== */
window.PCB = window.PCB || {};

(function (PCB) {
  'use strict';

  /* ---------- Constants ---------- */

  PCB.CATEGORIES = [
    { key: 'cpu', label: 'CPU', full: 'Processor (CPU)' },
    { key: 'cooler', label: 'CPU Cooler', full: 'CPU Cooler' },
    { key: 'motherboard', label: 'Motherboard', full: 'Motherboard' },
    { key: 'ram', label: 'Memory', full: 'Memory (RAM)' },
    { key: 'gpu', label: 'Graphics Card', full: 'Graphics Card (GPU)' },
    { key: 'storage', label: 'Storage', full: 'Storage (SSD / HDD)', multi: true, max: 4 },
    { key: 'psu', label: 'Power Supply', full: 'Power Supply (PSU)' },
    { key: 'case', label: 'Case', full: 'PC Case' }
  ];
  PCB.CATEGORY_KEYS = PCB.CATEGORIES.map(function (c) { return c.key; });
  PCB.category = function (key) {
    return PCB.CATEGORIES.find(function (c) { return c.key === key; });
  };

  PCB.USAGES = {
    gaming: 'Gaming',
    programming: 'Programming',
    video: 'Video Editing',
    rendering: '3D Rendering',
    general: 'General Use'
  };
  PCB.RESOLUTIONS = { '1080p': '1080p (Full HD)', '1440p': '1440p (QHD)', '4k': '4K (UHD)' };

  PCB.STATUS = {
    ok: { label: 'Compatible', cls: 'ok', icon: 'check' },
    warn: { label: 'Warning', cls: 'warn', icon: 'alert' },
    error: { label: 'Incompatible', cls: 'error', icon: 'x' },
    info: { label: 'Info', cls: 'info', icon: 'info' },
    empty: { label: 'No parts yet', cls: 'muted', icon: 'minus' }
  };

  /* ---------- Inline SVG icons (stroke style, inherit the text colour) ---------- */

  var ICONS = {
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 6v8"/><path d="M12 18h.01"/>',
    info: '<path d="M12 11v7"/><path d="M12 6h.01"/>',
    minus: '<path d="M6 12h12"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    columns: '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/>'
  };
  PCB.icon = function (name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  };

  /* ---------- Small utilities ---------- */

  PCB.root = function () { return document.body.getAttribute('data-root') || ''; };
  PCB.url = function (path) { return PCB.root() + path; };

  PCB.qs = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  PCB.qsa = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  PCB.esc = function (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  PCB.money = function (n) {
    return '\u20B1' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  PCB.num = function (n, digits) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: digits === undefined ? 0 : digits });
  };
  PCB.clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };
  PCB.capacity = function (gb) { return gb >= 1000 ? (gb / 1000) + ' TB' : gb + ' GB'; };
  PCB.date = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  PCB.param = function (name) { return new URLSearchParams(location.search).get(name); };
  PCB.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  };
  PCB.html = function (str) {
    var tpl = document.createElement('template');
    tpl.innerHTML = str.trim();
    return tpl.content.firstElementChild;
  };
  PCB.download = function (filename, content, type) {
    var blob = new Blob([content], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  /* ---------- Component specifications (display helpers) ---------- */

  /**
   * Beginner-friendly description of a component, written from its specs
   * (so it always matches the data shown in the spec table).
   */
  PCB.describe = function (item) {
    var s = item.specs, t = [];
    var a = function (word) { return (/^[aeiou8]|^11|^18/i.test(String(word)) ? 'An ' : 'A ') + word; };
    switch (item.category) {
      case 'cpu':
        t.push(a(s.cores + '-core, ') + s.threads + '-thread ' + item.brand + ' processor (' + s.generation + ') for ' + s.socket + ' motherboards.');
        if (s.gamingIndex >= 90) t.push('One of the fastest gaming processors in this catalog.');
        else if (s.multiCoreIndex >= 75) t.push('Strong at rendering, video exports and compiling code, where many cores help.');
        else if (s.gamingIndex >= 75) t.push('A solid choice for gaming and everyday work.');
        else t.push('Suited to everyday use and entry-level gaming.');
        t.push(s.memoryTypes.length > 1 ? 'Works with DDR4 or DDR5 memory, depending on the motherboard you pick.' : 'Works with ' + s.memoryTypes[0] + ' memory only.');
        t.push(s.integratedGraphics ? 'Has built-in graphics, so it can run a monitor without a graphics card.' : 'Has no built-in graphics, so you also need a graphics card.');
        t.push(s.includesCooler ? 'A basic cooler comes in the box.' : 'No cooler in the box; buy one separately.');
        break;
      case 'gpu':
        t.push(a(s.chipset) + ' graphics card with ' + s.vramGB + ' GB of ' + s.memoryType + ' video memory.');
        if (s.performanceIndex >= 80) t.push('Built for 4K gaming and heavy 3D work.');
        else if (s.performanceIndex >= 55) t.push('Handles 1440p gaming at high settings.');
        else if (s.performanceIndex >= 35) t.push('Good for 1080p gaming at high settings.');
        else t.push('An entry-level card for 1080p at medium settings and esports games.');
        t.push('It is ' + s.lengthMm + ' mm long, so check that your case fits it. It draws up to about ' + s.tdp + ' W; a ' + s.recommendedPsu + ' W power supply is recommended.');
        if (s.requires16Pin) t.push('Uses the newer 16-pin power connector.');
        break;
      case 'motherboard':
        t.push(a(s.formFactor) + ' motherboard with the ' + s.chipset + ' chipset for ' + s.socket + ' processors.');
        t.push('Takes ' + s.memoryType + ' memory in ' + s.memorySlots + ' slots (up to ' + s.maxMemoryGB + ' GB).');
        t.push('Has ' + s.m2Slots + ' M.2 slot' + (s.m2Slots === 1 ? '' : 's') + ' for fast SSDs and ' + s.sataPorts + ' SATA ports for other drives.');
        t.push(s.wifi ? 'Built-in Wi-Fi.' : 'No built-in Wi-Fi; use a cable or add a Wi-Fi card.');
        if ((s.biosUpdateFor || []).length) t.push('Older stock may need a BIOS update before it works with ' + s.biosUpdateFor.join(' or ') + ' processors.');
        break;
      case 'ram':
        t.push(a(s.capacityGB + ' GB ' + s.memoryType) + ' memory kit made of ' + s.modules + ' sticks running at ' + s.speedMHz + ' MT/s.');
        t.push('Only fits ' + s.memoryType + ' motherboards.');
        if (s.capacityGB >= 64) t.push('Plenty for video editing, 3D work and running several virtual machines.');
        else if (s.capacityGB >= 32) t.push('Comfortable for gaming, programming and light video editing.');
        else t.push('Enough for gaming and everyday use.');
        break;
      case 'storage':
        if (s.type === 'NVMe SSD') {
          t.push(a(PCB.capacity(s.capacityGB)) + ' NVMe SSD that plugs straight into an M.2 slot on the motherboard.');
          t.push('Reads at up to ' + PCB.num(s.readMBs) + ' MB/s, so Windows, games and apps load quickly.');
          if (s.pcieGen >= 5) t.push('Needs a PCIe Gen 5 M.2 slot to reach full speed.');
        } else if (s.type === 'SATA SSD') {
          t.push(a(PCB.capacity(s.capacityGB)) + ' 2.5-inch SSD that connects with a SATA cable.');
          t.push('Much faster than a hard drive, but slower than an NVMe SSD.');
        } else {
          t.push(a(PCB.capacity(s.capacityGB)) + ' 3.5-inch hard drive with lots of space for files and backups.');
          t.push('Too slow to use as the main drive for Windows; pair it with an SSD.');
        }
        break;
      case 'psu':
        t.push(a(s.wattage + ' W') + ' power supply with ' + s.efficiency + ' efficiency.');
        t.push(s.modular === 'Fully modular' ? 'Fully modular: you only plug in the cables you need, which keeps the case tidy.'
          : s.modular === 'Semi-modular' ? 'Semi-modular: the main cables are fixed and the rest are detachable.'
            : 'Non-modular: all cables are attached, even the ones you do not use.');
        if (s.formFactor === 'SFX') t.push('SFX size for small cases.');
        if (s.native12V2x6) t.push('Includes a 16-pin cable for newer graphics cards.');
        break;
      case 'case':
        t.push(a(s.type) + ' case for ' + s.supportedFormFactors.join(', ') + ' motherboards.');
        t.push('Fits graphics cards up to ' + s.maxGpuLengthMm + ' mm long and air coolers up to ' + s.maxCoolerHeightMm + ' mm tall.');
        t.push(s.includedFans ? 'Comes with ' + s.includedFans + ' fan' + (s.includedFans > 1 ? 's' : '') + '.' : 'No fans included; add your own for good airflow.');
        if ((s.radiatorSupportMm || []).length) t.push('Supports liquid-cooler radiators up to ' + Math.max.apply(null, s.radiatorSupportMm) + ' mm.');
        break;
      case 'cooler':
        t.push(s.type === 'Air'
          ? 'An air cooler, ' + s.heightMm + ' mm tall, rated for about ' + s.tdpRating + ' W of heat.'
          : a(s.radiatorMm + ' mm') + ' all-in-one liquid cooler rated for about ' + s.tdpRating + ' W of heat.');
        t.push('Fits ' + s.sockets.join(', ') + ' sockets.');
        t.push(s.tdpRating >= 220 ? 'Enough for high-end processors under heavy load.' : s.tdpRating >= 140 ? 'Fine for mid-range processors.' : 'Best for low-power processors.');
        if (s.type !== 'Air') t.push('Your case needs a ' + s.radiatorMm + ' mm radiator mount.');
        break;
    }
    return t.join(' ');
  };

  /** Short spec chips shown on component cards. */
  PCB.keySpecs = function (item) {
    var s = item.specs;
    switch (item.category) {
      case 'cpu': return [s.socket, s.cores + 'C / ' + s.threads + 'T', s.boostClockGHz + ' GHz', s.tdp + ' W'];
      case 'gpu': return [s.vramGB + ' GB ' + s.memoryType, s.lengthMm + ' mm', s.tdp + ' W'];
      case 'motherboard': return [s.socket, s.formFactor, s.memoryType, s.m2Slots + '× M.2'];
      case 'ram': return [s.memoryType, s.capacityGB + ' GB (' + s.modules + '×)', s.speedMHz + ' MT/s', 'CL' + s.casLatency];
      case 'storage': return [s.type, PCB.capacity(s.capacityGB), PCB.num(s.readMBs) + ' MB/s'];
      case 'psu': return [s.wattage + ' W', s.efficiency, s.formFactor];
      case 'case': return [s.type, 'GPU ≤ ' + s.maxGpuLengthMm + ' mm', 'Cooler ≤ ' + s.maxCoolerHeightMm + ' mm'];
      case 'cooler': return [s.type, s.type === 'Air' ? s.heightMm + ' mm tall' : s.radiatorMm + ' mm radiator', s.tdpRating + ' W rated'];
      default: return [];
    }
  };

  var yesNo = function (v) { return v ? 'Yes' : 'No'; };
  var list = function (v) { return (v || []).join(', ') || 'None'; };

  /** Full label/value rows for spec tables. */
  PCB.specRows = function (item) {
    var s = item.specs;
    var rows = {
      cpu: [['Socket', s.socket], ['Generation', s.generation], ['Cores / Threads', s.cores + ' / ' + s.threads],
        ['Base / Boost clock', s.baseClockGHz + ' / ' + s.boostClockGHz + ' GHz'], ['TDP', s.tdp + ' W'],
        ['Max power (est.)', s.maxPower + ' W'], ['Memory support', list(s.memoryTypes)],
        ['Integrated graphics', yesNo(s.integratedGraphics)], ['Cooler included', yesNo(s.includesCooler)],
        ['Single-core index*', s.singleCoreIndex], ['Multi-core index*', s.multiCoreIndex], ['Gaming index*', s.gamingIndex]],
      gpu: [['Chipset', s.chipset], ['VRAM', s.vramGB + ' GB ' + s.memoryType], ['Length', s.lengthMm + ' mm'],
        ['Slot width', s.slotWidth + ' slots'], ['Board power', s.tdp + ' W'], ['Recommended PSU', s.recommendedPsu + ' W'],
        ['Power connector', s.powerConnector], ['PCIe', 'Gen ' + s.pcieGen],
        ['Raster performance index*', s.performanceIndex], ['Ray tracing index*', s.rayTracingIndex]],
      motherboard: [['Socket', s.socket], ['Chipset', s.chipset], ['Form factor', s.formFactor],
        ['Memory', s.memoryType + ', ' + s.memorySlots + ' slots, up to ' + s.maxMemoryGB + ' GB'],
        ['Max memory speed', s.maxMemorySpeed + ' MT/s'], ['M.2 slots', s.m2Slots + ' (PCIe Gen ' + s.m2PcieGen + ')'],
        ['SATA ports', s.sataPorts], ['PCIe (GPU slot)', 'Gen ' + s.pcieGen], ['Wi-Fi', yesNo(s.wifi)],
        ['BIOS update may be needed for', list(s.biosUpdateFor)]],
      ram: [['Type', s.memoryType], ['Capacity', s.capacityGB + ' GB'], ['Modules', s.modules + ' × ' + (s.capacityGB / s.modules) + ' GB'],
        ['Speed', s.speedMHz + ' MT/s'], ['CAS latency', 'CL' + s.casLatency], ['RGB', yesNo(s.rgb)]],
      storage: [['Type', s.type], ['Interface', s.interface + (s.pcieGen ? ' (PCIe Gen ' + s.pcieGen + ')' : '')],
        ['Capacity', PCB.capacity(s.capacityGB)], ['Sequential read', PCB.num(s.readMBs) + ' MB/s'],
        ['Sequential write', PCB.num(s.writeMBs) + ' MB/s'], ['Form factor', s.formFactor], ['Spindle speed', s.rpm ? s.rpm + ' RPM' : 'N/A (solid state)']],
      psu: [['Wattage', s.wattage + ' W'], ['Efficiency', s.efficiency], ['Modularity', s.modular],
        ['Form factor', s.formFactor], ['Native 12V-2x6 (16-pin)', yesNo(s.native12V2x6)]],
      case: [['Type', s.type], ['Motherboard support', list(s.supportedFormFactors)], ['Max GPU length', s.maxGpuLengthMm + ' mm'],
        ['Max air cooler height', s.maxCoolerHeightMm + ' mm'], ['PSU form factor', list(s.psuFormFactors)],
        ['3.5" bays', s.driveBays35], ['2.5" bays', s.driveBays25],
        ['Radiator support', (s.radiatorSupportMm || []).map(function (r) { return r + ' mm'; }).join(', ')], ['Included fans', s.includedFans]],
      cooler: [['Type', s.type], ['Socket support', list(s.sockets)],
        [s.type === 'Air' ? 'Height' : 'Radiator', s.type === 'Air' ? s.heightMm + ' mm' : s.radiatorMm + ' mm'],
        ['Rated cooling capacity', s.tdpRating + ' W'], ['Noise (max)', s.noiseDb + ' dBA'], ['Fans', s.fans]]
    };
    return rows[item.category] || [];
  };

  PCB.imageTag = function (item, cls) {
    return '<img class="' + (cls || 'part-img') + '" src="' + PCB.esc(PCB.url(item.image)) + '" alt="' +
      PCB.esc(item.brand + ' ' + item.name) + '" loading="lazy">';
  };

  PCB.badge = function (status, text) {
    var st = PCB.STATUS[status] || PCB.STATUS.info;
    return '<span class="badge badge-' + st.cls + '"><span class="badge-dot">' + PCB.icon(st.icon) + '</span>' +
      PCB.esc(text || st.label) + '</span>';
  };

  /* ---------- Toasts ---------- */

  PCB.toast = function (message, type) {
    var host = PCB.qs('#toast-host');
    if (!host) {
      host = PCB.html('<div id="toast-host" aria-live="polite"></div>');
      document.body.appendChild(host);
    }
    var el = PCB.html('<div class="toast toast-' + (type || 'info') + '">' + PCB.esc(message) + '</div>');
    host.appendChild(el);
    setTimeout(function () { el.classList.add('leaving'); }, 3200);
    setTimeout(function () { el.remove(); }, 3600);
  };

  /* ---------- Modals ---------- */

  /**
   * Opens a modal dialog.
   * opts: { title, body (HTML string or Node), wide, actions: [{ label, cls, onClick }] }
   * Returning false from onClick keeps the modal open.
   */
  PCB.modal = function (opts) {
    var overlay = PCB.html(
      '<div class="modal-overlay" role="dialog" aria-modal="true">' +
      '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '">' +
      '<div class="modal-head"><h3>' + PCB.esc(opts.title || '') + '</h3>' +
      '<button class="icon-btn modal-close" aria-label="Close">' + PCB.icon('x') + '</button></div>' +
      '<div class="modal-body"></div><div class="modal-actions"></div></div></div>');
    var body = PCB.qs('.modal-body', overlay);
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var actions = PCB.qs('.modal-actions', overlay);
    function close() {
      overlay.classList.add('leaving');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { overlay.remove(); }, 150);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    (opts.actions || [{ label: 'Close', cls: 'btn-ghost' }]).forEach(function (a) {
      var btn = PCB.html('<button class="btn ' + (a.cls || 'btn-ghost') + '">' + PCB.esc(a.label) + '</button>');
      btn.addEventListener('click', function () {
        var result = a.onClick ? a.onClick(overlay) : undefined;
        if (result !== false) close();
      });
      actions.appendChild(btn);
    });
    if (!actions.children.length) actions.remove();
    PCB.qs('.modal-close', overlay).addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    var first = PCB.qs('input, select, textarea', overlay);
    if (first) first.focus();
    return { el: overlay, close: close };
  };

  PCB.confirm = function (message, okLabel) {
    return new Promise(function (resolve) {
      var answered = false;
      PCB.modal({
        title: 'Please confirm',
        body: '<p>' + PCB.esc(message) + '</p>',
        actions: [
          { label: 'Cancel', cls: 'btn-ghost' },
          { label: okLabel || 'Confirm', cls: 'btn-danger', onClick: function () { answered = true; resolve(true); } }
        ],
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  };

  /**
   * Shows a small validated form in a modal. Resolves with the values or null.
   * fields: [{ name, label, type: 'text'|'number'|'textarea'|'select', value, required, maxlength, min, max, options }]
   */
  PCB.form = function (opts) {
    return new Promise(function (resolve) {
      var done = false;
      var html = '<form class="form-grid" novalidate>' + opts.fields.map(function (f) {
        var id = 'f-' + f.name;
        var attrs = ' id="' + id + '" name="' + f.name + '"' + (f.required ? ' required' : '') +
          (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
          (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '');
        var input;
        if (f.type === 'textarea') input = '<textarea' + attrs + ' rows="3">' + PCB.esc(f.value || '') + '</textarea>';
        else if (f.type === 'select') {
          input = '<select' + attrs + '>' + Object.keys(f.options).map(function (k) {
            return '<option value="' + PCB.esc(k) + '"' + (k === f.value ? ' selected' : '') + '>' + PCB.esc(f.options[k]) + '</option>';
          }).join('') + '</select>';
        } else input = '<input type="' + (f.type || 'text') + '"' + attrs + ' value="' + PCB.esc(f.value === undefined ? '' : f.value) + '">';
        return '<label class="field" for="' + id + '"><span>' + PCB.esc(f.label) + '</span>' + input +
          '<small class="field-error" data-for="' + f.name + '"></small></label>';
      }).join('') + (opts.note ? '<p class="muted small">' + opts.note + '</p>' : '') + '</form>';

      function collect(overlay) {
        var values = {}, valid = true;
        opts.fields.forEach(function (f) {
          var el = PCB.qs('[name="' + f.name + '"]', overlay);
          var err = PCB.qs('[data-for="' + f.name + '"]', overlay);
          var v = el.value.trim();
          var msg = '';
          if (f.required && !v) msg = f.label + ' is required.';
          else if (f.type === 'number' && v !== '') {
            var n = Number(v);
            if (isNaN(n)) msg = 'Enter a valid number.';
            else if (f.min !== undefined && n < f.min) msg = 'Minimum is ' + f.min + '.';
            else if (f.max !== undefined && n > f.max) msg = 'Maximum is ' + f.max + '.';
            v = n;
          }
          err.textContent = msg;
          el.classList.toggle('invalid', !!msg);
          if (msg) valid = false;
          values[f.name] = v;
        });
        return valid ? values : null;
      }

      var m = PCB.modal({
        title: opts.title,
        body: html,
        actions: [
          { label: 'Cancel', cls: 'btn-ghost' },
          {
            label: opts.submitLabel || 'Save', cls: 'btn-primary', onClick: function (overlay) {
              var values = collect(overlay);
              if (!values) return false;
              done = true;
              resolve(values);
            }
          }
        ],
        onClose: function () { if (!done) resolve(null); }
      });
      PCB.qs('form', m.el).addEventListener('submit', function (e) {
        e.preventDefault();
        PCB.qs('.modal-actions .btn-primary', m.el).click();
      });
    });
  };

  /* ---------- Charts (Chart.js when available, CSS bars otherwise) ---------- */

  var chartRegistry = new WeakMap();
  var PALETTE = ['#1f5fbf', '#c2570c', '#2d7d8a', '#6b7280', '#1b7f3b'];

  /**
   * Renders a bar chart into a container element.
   * cfg: { labels: [], datasets: [{ label, data: [] }], horizontal, unit, max }
   */
  PCB.barChart = function (container, cfg) {
    if (!container) return;
    var prev = chartRegistry.get(container);
    if (prev && prev.destroy) prev.destroy();
    container.innerHTML = '';
    if (window.Chart) {
      var canvas = document.createElement('canvas');
      container.appendChild(canvas);
      var chart = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: cfg.labels,
          datasets: cfg.datasets.map(function (d, i) {
            return { label: d.label, data: d.data, backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 4, maxBarThickness: 38 };
          })
        },
        options: {
          indexAxis: cfg.horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: cfg.datasets.length > 1, labels: { color: '#3a414c' } },
            tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + PCB.num(c.parsed[cfg.horizontal ? 'x' : 'y'], 1) + (cfg.unit || ''); } } }
          },
          scales: {
            x: { ticks: { color: '#687180' }, grid: { color: 'rgba(16,24,40,.07)' }, max: cfg.horizontal ? cfg.max : undefined, beginAtZero: true },
            y: { ticks: { color: '#687180' }, grid: { color: 'rgba(16,24,40,.07)' }, max: cfg.horizontal ? undefined : cfg.max, beginAtZero: true }
          }
        }
      });
      chartRegistry.set(container, chart);
      return;
    }
    // Fallback: simple CSS bars (used offline when the Chart.js CDN is unreachable).
    var max = cfg.max || Math.max.apply(null, cfg.datasets.reduce(function (a, d) { return a.concat(d.data); }, [1]));
    var html = '<div class="css-chart">';
    cfg.labels.forEach(function (label, li) {
      html += '<div class="css-chart-row"><div class="css-chart-label">' + PCB.esc(label) + '</div><div class="css-chart-bars">';
      cfg.datasets.forEach(function (d, di) {
        var v = d.data[li] || 0;
        html += '<div class="css-bar" title="' + PCB.esc(d.label) + '"><span style="width:' + PCB.clamp(v / max * 100, 0, 100) +
          '%;background:' + PALETTE[di % PALETTE.length] + '"></span><em>' + PCB.num(v, 1) + (cfg.unit || '') + '</em></div>';
      });
      html += '</div></div>';
    });
    if (cfg.datasets.length > 1) {
      html += '<div class="css-chart-legend">' + cfg.datasets.map(function (d, i) {
        return '<span><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' + PCB.esc(d.label) + '</span>';
      }).join('') + '</div>';
    }
    container.innerHTML = html + '</div>';
  };

  /** Horizontal meter (0-100) used for utilization, scores, etc. */
  PCB.meter = function (label, value, opts) {
    opts = opts || {};
    var pct = PCB.clamp(value / (opts.max || 100) * 100, 0, 100);
    var tone = opts.tone || (pct >= 85 ? 'hot' : pct >= 60 ? 'warm' : 'cool');
    return '<div class="meter"><div class="meter-top"><span>' + PCB.esc(label) + '</span><strong>' +
      PCB.esc(opts.text || PCB.num(value) + (opts.unit === undefined ? '%' : opts.unit)) + '</strong></div>' +
      '<div class="meter-track"><div class="meter-fill meter-' + tone + '" style="width:' + pct + '%"></div></div></div>';
  };

  /* ---------- Page layout (header, nav, footer) ---------- */

  var NAV = [
    { page: 'home', href: 'index.html', label: 'Home' },
    { page: 'dashboard', href: 'pages/dashboard.html', label: 'Dashboard' },
    { page: 'builder', href: 'pages/builder.html', label: 'PC Builder' },
    { page: 'catalog', href: 'pages/components.html', label: 'Catalog' },
    { page: 'compatibility', href: 'pages/compatibility.html', label: 'Compatibility' },
    { page: 'simulator', href: 'pages/simulator.html', label: 'Simulator' },
    { page: 'summary', href: 'pages/summary.html', label: 'Summary' },
    { page: 'comparison', href: 'pages/comparison.html', label: 'Compare' },
    { page: 'saved', href: 'pages/saved-builds.html', label: 'Saved Builds' },
    { page: 'about', href: 'pages/about.html', label: 'About' }
  ];

  function renderLayout() {
    var current = document.body.getAttribute('data-page');
    var header = PCB.qs('#site-header');
    if (header) {
      header.className = 'site-header';
      header.innerHTML =
        '<div class="container header-inner">' +
        '<a class="brand" href="' + PCB.url('index.html') + '"><img src="' + PCB.url('assets/icons/logo.svg') + '" alt="">' +
        '<span>Digital PC Builder</span></a>' +
        '<button class="icon-btn nav-toggle" aria-label="Toggle navigation" aria-expanded="false">' + PCB.icon('menu') + '</button>' +
        '<nav class="main-nav" aria-label="Main">' + NAV.map(function (n) {
          return '<a href="' + PCB.url(n.href) + '"' + (n.page === current ? ' class="active" aria-current="page"' : '') + '>' + n.label + '</a>';
        }).join('') + '</nav>' +
        '<a class="build-pill" id="build-pill" href="' + PCB.url('pages/summary.html') + '" title="Current build summary">' +
        '<span class="pill-status"></span><span class="pill-text">Loading</span></a>' +
        '</div>';
      var toggle = PCB.qs('.nav-toggle', header);
      toggle.addEventListener('click', function () {
        var open = header.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    var footer = PCB.qs('#site-footer');
    if (footer) {
      footer.className = 'site-footer';
      footer.innerHTML =
        '<div class="container footer-inner">' +
        '<div><strong>Digital PC Builder</strong> · Virtual compatibility and simulation system</div>' +
        '<nav class="footer-links" aria-label="Footer"><a href="' + PCB.url('pages/about.html') + '">About</a>' +
        '<a href="' + PCB.url('pages/privacy.html') + '">Privacy Policy</a>' +
        '<a href="' + PCB.url('pages/terms.html') + '">Terms and Conditions</a></nav>' +
        '<div class="muted small">Prices in Philippine pesos (PHP), checked at Philippine stores on 2 November 2026; they change often. Performance figures are approximations from a documented model, not measured benchmarks.</div>' +
        '<div class="small" id="storage-mode">Storage: detecting</div>' +
        '</div>';
    }
  }

  /** Updates the build pill in the header with the current build's status. */
  PCB.refreshBuildPill = function () {
    var pill = PCB.qs('#build-pill');
    if (!pill || !PCB.store || !PCB.store.ready) return;
    var build = PCB.store.getBuild();
    var items = PCB.store.items(build);
    var report = PCB.compat.check(build);
    var st = PCB.STATUS[report.status];
    pill.className = 'build-pill pill-' + st.cls;
    PCB.qs('.pill-status', pill).innerHTML = PCB.icon(st.icon);
    PCB.qs('.pill-text', pill).textContent = items.length + ' parts · ' + PCB.money(PCB.store.total(build));
  };

  /**
   * Page bootstrap: renders layout, loads data, then runs the page function.
   * Usage: PCB.init(function () { ...page code... });
   */
  PCB.init = function (pageFn) {
    document.addEventListener('DOMContentLoaded', function () {
      renderLayout();
      var main = PCB.qs('main');
      if (main) main.classList.add('is-loading');
      PCB.store.init().then(function () {
        if (main) main.classList.remove('is-loading');
        var mode = PCB.qs('#storage-mode');
        if (mode) {
          mode.innerHTML = PCB.store.mode === 'server'
            ? '<span class="dot dot-ok"></span>Storage: PHP + MySQL database'
            : '<span class="dot dot-warn"></span>Storage: browser localStorage (backend not detected)';
        }
        PCB.refreshBuildPill();
        window.addEventListener('pcb:build-changed', PCB.refreshBuildPill);
        if (pageFn) pageFn();
      }).catch(function (err) {
        console.error(err);
        if (main) {
          main.classList.remove('is-loading');
          main.innerHTML = '<div class="container"><div class="empty-state error-state"><h2>Could not load hardware data</h2><p>' +
            PCB.esc(err.message) + '</p><p class="muted">Open the project through VS Code Live Server or XAMPP (http://localhost/…) so the data files can be loaded.</p></div></div>';
        }
      });
    });
  };
})(window.PCB);
