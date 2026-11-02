/* ==========================================================================
   storage.js - Data access layer.
   - Loads the hardware catalog (PHP API -> components.json -> components.js).
   - Keeps the in-progress build in localStorage.
   - Saves builds to MySQL through the PHP API when it is available,
     otherwise to localStorage.
   ========================================================================== */
(function (PCB) {
  'use strict';

  var KEYS = {
    current: 'pcb.currentBuild',
    saved: 'pcb.savedBuilds',
    compare: 'pcb.compareList',
    currency: 'pcb.currency'
  };

  // Builds saved before the switch to pesos stored their budget in US dollars.
  var PHP_PER_USD = 58;
  var MAX_BUDGET = 10000000;

  var store = {
    ready: false,
    mode: 'local',          // 'server' when the PHP/MySQL backend answers
    components: [],
    meta: {},
    dataSource: '',
    _byId: {}
  };

  /* ---------- Safe localStorage access ---------- */

  function readLocal(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      PCB.toast('Your browser blocked local storage. Changes will not persist after refresh.', 'error');
    }
  }

  /* ---------- HTTP helpers ---------- */

  function fetchWithTimeout(url, options, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 4000) : null;
    var opts = Object.assign({}, options || {}, ctrl ? { signal: ctrl.signal } : {});
    return fetch(url, opts).finally(function () { if (timer) clearTimeout(timer); });
  }

  /** Calls the PHP API and returns parsed JSON, throwing readable errors. */
  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: {} };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    return fetchWithTimeout(PCB.url('backend/api/' + path), init, 8000).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('The server returned an invalid response.'); }
        if (!res.ok || !data.ok) {
          var msg = data.error || ('Request failed (' + res.status + ')');
          if (data.details && Array.isArray(data.details)) msg += ' ' + data.details.join(' ');
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  /** Returns true when backend/api/health.php answers with valid JSON. */
  function detectBackend() {
    if (location.protocol === 'file:') return Promise.resolve(false);
    return fetchWithTimeout(PCB.url('backend/api/health.php'), {}, 2500)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return !!(data && data.ok); })
      .catch(function () { return false; });
  }

  function loadScriptData() {
    return new Promise(function (resolve, reject) {
      if (window.PCB_COMPONENT_DATA) return resolve(window.PCB_COMPONENT_DATA);
      var s = document.createElement('script');
      s.src = PCB.url('data/components.js');
      s.onload = function () {
        if (window.PCB_COMPONENT_DATA) resolve(window.PCB_COMPONENT_DATA);
        else reject(new Error('data/components.js did not define the catalog.'));
      };
      s.onerror = function () { reject(new Error('Hardware dataset could not be loaded.')); };
      document.head.appendChild(s);
    });
  }

  function loadComponents() {
    if (store.mode === 'server') {
      return api('components.php').then(function (data) {
        store.dataSource = 'MySQL database';
        return data;
      });
    }
    return fetchWithTimeout(PCB.url('data/components.json'), {}, 5000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        store.dataSource = 'data/components.json';
        return res.json();
      })
      .catch(function () {
        store.dataSource = 'data/components.js (offline mirror)';
        return loadScriptData();
      });
  }

  store.init = function () {
    return detectBackend().then(function (isServer) {
      store.mode = isServer ? 'server' : 'local';
      return loadComponents();
    }).then(function (data) {
      store.meta = data.meta || {};
      store.components = (data.components || []).filter(function (c) {
        return c && c.id && PCB.CATEGORY_KEYS.indexOf(c.category) !== -1 && c.specs;
      });
      store._byId = {};
      store.components.forEach(function (c) { store._byId[c.id] = c; });
      if (!store.components.length) throw new Error('The hardware catalog is empty.');
      migrateBudgetsToPeso();
      store.ready = true;
      // Keep tabs in sync: another tab changed the current build.
      window.addEventListener('storage', function (e) {
        if (e.key === KEYS.current) window.dispatchEvent(new CustomEvent('pcb:build-changed'));
      });
    });
  };

  /** One-time conversion of budgets stored in this browser from USD to PHP. */
  function migrateBudgetsToPeso() {
    if (readLocal(KEYS.currency, null) === 'PHP') return;
    var cur = readLocal(KEYS.current, null);
    if (cur && cur.budget) { cur.budget = Math.round(cur.budget * PHP_PER_USD); writeLocal(KEYS.current, cur); }
    var saved = readLocal(KEYS.saved, []);
    saved.forEach(function (b) { if (b.budget) b.budget = Math.round(b.budget * PHP_PER_USD); });
    if (saved.length) writeLocal(KEYS.saved, saved);
    writeLocal(KEYS.currency, 'PHP');
  }

  /* ---------- Catalog queries ---------- */

  store.byId = function (id) { return store._byId[id] || null; };
  store.byCategory = function (category) {
    return store.components.filter(function (c) { return c.category === category; });
  };
  store.brands = function (category) {
    var set = {};
    store.byCategory(category).forEach(function (c) { set[c.brand] = true; });
    return Object.keys(set).sort();
  };

  /* ---------- Build helpers ---------- */

  function emptyParts() {
    var parts = {};
    PCB.CATEGORIES.forEach(function (c) { parts[c.key] = c.multi ? [] : null; });
    return parts;
  }

  store.newBuild = function () {
    return {
      savedId: null,
      name: 'My Custom Build',
      usage: 'gaming',
      budget: 100000,
      resolution: '1440p',
      notes: '',
      parts: emptyParts()
    };
  };

  /** Normalises any build-like object; drops ids that are not in the catalog. */
  store.normalize = function (b) {
    var build = Object.assign(store.newBuild(), b || {});
    var parts = emptyParts();
    var src = (b && b.parts) || {};
    PCB.CATEGORIES.forEach(function (c) {
      if (c.multi) {
        parts[c.key] = (Array.isArray(src[c.key]) ? src[c.key] : []).filter(function (id) {
          var item = store.byId(id);
          return item && item.category === c.key;
        }).slice(0, c.max);
      } else {
        var item = store.byId(src[c.key]);
        parts[c.key] = item && item.category === c.key ? item.id : null;
      }
    });
    build.parts = parts;
    if (!PCB.USAGES[build.usage]) build.usage = 'gaming';
    if (!PCB.RESOLUTIONS[build.resolution]) build.resolution = '1440p';
    build.budget = Math.max(0, Number(build.budget) || 0);
    return build;
  };

  /** Returns [{ category, item }] for every selected component. */
  store.items = function (build) {
    var out = [];
    PCB.CATEGORIES.forEach(function (c) {
      var v = build.parts[c.key];
      (c.multi ? v : [v]).forEach(function (id) {
        var item = id && store.byId(id);
        if (item) out.push({ category: c.key, item: item });
      });
    });
    return out;
  };

  /** Returns the selected item(s) for a category (array for storage). */
  store.part = function (build, category) {
    var v = build.parts[category];
    if (Array.isArray(v)) return v.map(store.byId).filter(Boolean);
    return v ? store.byId(v) : null;
  };

  store.total = function (build) {
    return Math.round(store.items(build).reduce(function (sum, x) { return sum + x.item.price; }, 0) * 100) / 100;
  };

  /* ---------- Current (in-progress) build ---------- */

  store.getBuild = function () {
    return store.normalize(readLocal(KEYS.current, null));
  };

  store.setBuild = function (build) {
    var clean = store.normalize(build);
    writeLocal(KEYS.current, clean);
    window.dispatchEvent(new CustomEvent('pcb:build-changed', { detail: clean }));
    return clean;
  };

  store.updateBuild = function (mutator) {
    var build = store.getBuild();
    mutator(build);
    return store.setBuild(build);
  };

  /** Adds or replaces a component. Storage drives are appended (max 4). */
  store.setPart = function (category, id) {
    var cat = PCB.category(category);
    var result = { ok: true, message: '' };
    store.updateBuild(function (b) {
      if (cat.multi) {
        if (b.parts[category].length >= cat.max) {
          result = { ok: false, message: 'You can add up to ' + cat.max + ' storage drives.' };
          return;
        }
        b.parts[category].push(id);
      } else {
        b.parts[category] = id;
      }
    });
    return result;
  };

  /** Removes a component. For storage, pass the index of the drive to remove. */
  store.removePart = function (category, index) {
    store.updateBuild(function (b) {
      if (Array.isArray(b.parts[category])) {
        if (index === undefined) b.parts[category] = [];
        else b.parts[category].splice(index, 1);
      } else {
        b.parts[category] = null;
      }
    });
  };

  store.clearBuild = function () {
    var b = store.newBuild();
    var cur = store.getBuild();
    b.usage = cur.usage;
    b.budget = cur.budget;
    b.resolution = cur.resolution;
    return store.setBuild(b);
  };

  /* ---------- Saved builds (server or local) ---------- */

  function payload(build) {
    return {
      name: build.name,
      usage: build.usage,
      budget: build.budget,
      resolution: build.resolution,
      notes: build.notes || '',
      parts: build.parts
    };
  }

  /** Converts a saved record into a normalised build object with savedId. */
  store.fromSaved = function (rec) {
    var b = store.normalize(rec);
    b.savedId = String(rec.id);
    b.createdAt = rec.createdAt;
    b.updatedAt = rec.updatedAt;
    return b;
  };

  store.listBuilds = function () {
    if (store.mode === 'server') {
      return api('builds.php').then(function (d) { return d.builds.map(store.fromSaved); });
    }
    var list = readLocal(KEYS.saved, []);
    list.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    return Promise.resolve(list.map(store.fromSaved));
  };

  store.getSaved = function (id) {
    if (store.mode === 'server') {
      return api('builds.php?id=' + encodeURIComponent(id)).then(function (d) { return store.fromSaved(d.build); });
    }
    var rec = readLocal(KEYS.saved, []).find(function (b) { return String(b.id) === String(id); });
    return rec ? Promise.resolve(store.fromSaved(rec)) : Promise.reject(new Error('Build not found.'));
  };

  function validate(build) {
    var name = String(build.name || '').trim();
    if (!name) return 'Build name is required.';
    if (name.length > 100) return 'Build name must be 100 characters or fewer.';
    if (String(build.notes || '').length > 500) return 'Notes must be 500 characters or fewer.';
    if (!(build.budget >= 0 && build.budget <= MAX_BUDGET)) return 'Budget must be between \u20B10 and \u20B110,000,000.';
    if (!store.items(build).length) return 'Add at least one component before saving.';
    return null;
  }

  /**
   * Saves a build. Updates the existing record when build.savedId is set
   * (unless asNew is true). Resolves with the saved build.
   */
  store.saveBuild = function (build, asNew) {
    build = store.normalize(build);
    build.name = String(build.name || '').trim();
    var error = validate(build);
    if (error) return Promise.reject(new Error(error));
    var updating = build.savedId && !asNew;

    if (store.mode === 'server') {
      var req = updating
        ? api('builds.php?id=' + encodeURIComponent(build.savedId), { method: 'PUT', body: payload(build) })
        : api('builds.php', { method: 'POST', body: payload(build) });
      return req.then(function (d) { return store.fromSaved(d.build); });
    }

    var list = readLocal(KEYS.saved, []);
    var now = new Date().toISOString();
    var rec = Object.assign(payload(build), { totalPrice: store.total(build), updatedAt: now });
    if (updating) {
      var idx = list.findIndex(function (b) { return String(b.id) === String(build.savedId); });
      if (idx === -1) return Promise.reject(new Error('The build you are editing no longer exists. Save it as a new build.'));
      rec.id = list[idx].id;
      rec.createdAt = list[idx].createdAt;
      list[idx] = rec;
    } else {
      rec.id = 'L' + Date.now();
      rec.createdAt = now;
      list.push(rec);
    }
    writeLocal(KEYS.saved, list);
    return Promise.resolve(store.fromSaved(rec));
  };

  store.deleteBuild = function (id) {
    var after = function () {
      // Detach the current build from the deleted record so "Save" creates a new one.
      var cur = store.getBuild();
      if (cur.savedId && String(cur.savedId) === String(id)) {
        cur.savedId = null;
        store.setBuild(cur);
      }
    };
    if (store.mode === 'server') {
      return api('builds.php?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(after);
    }
    writeLocal(KEYS.saved, readLocal(KEYS.saved, []).filter(function (b) { return String(b.id) !== String(id); }));
    after();
    return Promise.resolve();
  };

  /** Builds that were saved in this browser before the database was available. */
  store.localSavedCount = function () { return readLocal(KEYS.saved, []).length; };

  /** Copies browser-saved builds into MySQL (server mode only). */
  store.importLocalToServer = function () {
    var list = readLocal(KEYS.saved, []);
    return list.reduce(function (p, rec) {
      return p.then(function (count) {
        var b = store.normalize(rec);
        if (!store.items(b).length) return count;
        return api('builds.php', { method: 'POST', body: payload(b) }).then(function () { return count + 1; });
      });
    }, Promise.resolve(0)).then(function (count) {
      writeLocal(KEYS.saved, []);
      return count;
    });
  };

  /** Imports a build from an exported JSON file into the saved list. */
  store.importBuild = function (obj) {
    var src = obj && obj.build ? obj.build : obj;
    if (!src || typeof src !== 'object' || !src.parts) return Promise.reject(new Error('This file does not contain a Digital PC Builder build.'));
    var b = store.normalize(src);
    b.savedId = null;
    b.name = String(src.name || 'Imported build').slice(0, 100);
    return store.saveBuild(b, true);
  };

  /* ---------- Component compare list (catalog -> comparison page) ---------- */

  store.getCompare = function () { return readLocal(KEYS.compare, { category: null, ids: [] }); };
  store.toggleCompare = function (item) {
    var c = store.getCompare();
    if (c.category !== item.category) c = { category: item.category, ids: [] };
    var i = c.ids.indexOf(item.id);
    if (i === -1) {
      if (c.ids.length >= 4) return { ok: false, message: 'You can compare up to 4 components at a time.' };
      c.ids.push(item.id);
    } else {
      c.ids.splice(i, 1);
    }
    writeLocal(KEYS.compare, c);
    return { ok: true, added: i === -1, list: c };
  };
  store.setCompare = function (category, ids) { writeLocal(KEYS.compare, { category: category, ids: ids.slice(0, 4) }); };

  PCB.store = store;
})(window.PCB);
