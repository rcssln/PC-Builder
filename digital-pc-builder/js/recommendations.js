/* ==========================================================================
   recommendations.js - Transparent, rule-based recommendation engine.

   No external service is used. Each candidate component is scored with
   three visible factors, and the reasons behind the score are returned:
     1. Fitness for the intended usage   (50%)
     2. Budget fit for its category       (30%)
     3. Value (performance per peso)      (20%)
   Incompatible parts are never recommended; parts with warnings are
   penalised. For gaming, CPU-GPU balance (bottleneck) also adjusts scores.
   ========================================================================== */
(function (PCB) {
  'use strict';

  var rec = {};

  /* Usage profiles: budget split per category and minimum/ideal specs.
     The splits reflect Philippine prices in November 2026, when memory
     cost far more than in earlier years. */
  rec.PROFILES = {
    gaming: {
      alloc: { cpu: 0.17, gpu: 0.33, motherboard: 0.09, ram: 0.17, storage: 0.09, psu: 0.06, case: 0.05, cooler: 0.04 },
      cpuWeights: { gamingIndex: 0.7, singleCoreIndex: 0.2, multiCoreIndex: 0.1 },
      ramMin: 16, ramIdeal: 32, vramMin: 8, vramIdeal: 12, coresMin: 6, needsGpu: true, storageIdeal: 1000
    },
    programming: {
      alloc: { cpu: 0.25, gpu: 0.06, motherboard: 0.11, ram: 0.26, storage: 0.14, psu: 0.07, case: 0.06, cooler: 0.05 },
      cpuWeights: { multiCoreIndex: 0.55, singleCoreIndex: 0.45 },
      ramMin: 16, ramIdeal: 32, vramMin: 0, vramIdeal: 8, coresMin: 8, needsGpu: false, storageIdeal: 2000
    },
    video: {
      alloc: { cpu: 0.22, gpu: 0.2, motherboard: 0.09, ram: 0.26, storage: 0.12, psu: 0.05, case: 0.03, cooler: 0.03 },
      cpuWeights: { multiCoreIndex: 0.7, singleCoreIndex: 0.3 },
      ramMin: 32, ramIdeal: 64, vramMin: 8, vramIdeal: 12, coresMin: 8, needsGpu: true, storageIdeal: 2000
    },
    rendering: {
      alloc: { cpu: 0.22, gpu: 0.25, motherboard: 0.08, ram: 0.24, storage: 0.1, psu: 0.05, case: 0.03, cooler: 0.03 },
      cpuWeights: { multiCoreIndex: 0.85, singleCoreIndex: 0.15 },
      ramMin: 32, ramIdeal: 64, vramMin: 12, vramIdeal: 16, coresMin: 12, needsGpu: true, storageIdeal: 2000
    },
    general: {
      alloc: { cpu: 0.22, gpu: 0.05, motherboard: 0.14, ram: 0.22, storage: 0.17, psu: 0.08, case: 0.08, cooler: 0.04 },
      cpuWeights: { singleCoreIndex: 0.7, multiCoreIndex: 0.3 },
      ramMin: 16, ramIdeal: 16, vramMin: 0, vramIdeal: 4, coresMin: 4, needsGpu: false, storageIdeal: 1000
    }
  };

  var EFF_BONUS = { '80+ Bronze': 0, '80+ Gold': 0.15, '80+ Platinum': 0.2 };

  function usageLabel(build) { return PCB.USAGES[build.usage].toLowerCase(); }
  function pct(x) { return Math.round(x * 100) + '%'; }

  /* ---------- Budget target for a category ---------- */

  /**
   * Splits the money still available between the categories that are not
   * yet chosen, in proportion to the usage profile.
   */
  rec.categoryTarget = function (build, category) {
    if (!build.budget) return Infinity;
    var alloc = rec.PROFILES[build.usage].alloc;
    var spent = 0, openShare = 0;
    PCB.CATEGORIES.forEach(function (c) {
      var chosen = PCB.store.part(build, c.key);
      var hasPart = Array.isArray(chosen) ? chosen.length > 0 : !!chosen;
      if (c.key === category || !hasPart) {
        openShare += alloc[c.key];
      } else {
        spent += Array.isArray(chosen) ? chosen.reduce(function (s, d) { return s + d.price; }, 0) : chosen.price;
      }
    });
    var remaining = Math.max(0, build.budget - spent);
    // At least PHP 1, so a fully spent budget still limits later picks to the cheapest parts.
    return Math.max(1, remaining * alloc[category] / (openShare || 1));
  };

  /* ---------- Usage fitness (0..~1.3) with reasons ---------- */

  function fitness(item, build) {
    var p = rec.PROFILES[build.usage];
    var s = item.specs;
    var reasons = [], score;
    var cpu = PCB.store.part(build, 'cpu');
    var gpu = PCB.store.part(build, 'gpu');
    switch (item.category) {
      case 'cpu': {
        score = Object.keys(p.cpuWeights).reduce(function (sum, k) { return sum + p.cpuWeights[k] * s[k]; }, 0) / 100;
        if (s.cores >= p.coresMin) reasons.push(s.cores + ' cores meets the ' + p.coresMin + '+ recommended for ' + usageLabel(build) + '.');
        else { score *= 0.85; reasons.push('Only ' + s.cores + ' cores (' + p.coresMin + '+ recommended for ' + usageLabel(build) + ').'); }
        if (build.usage === 'gaming' && s.gamingIndex >= 90) reasons.push('Among the strongest gaming CPUs in the catalog (gaming index ' + s.gamingIndex + ').');
        if (!gpu && !p.needsGpu && s.integratedGraphics) { score += 0.05; reasons.push('Integrated graphics lets you skip a graphics card for ' + usageLabel(build) + '.'); }
        if (!gpu && p.needsGpu && !s.integratedGraphics) reasons.push('Note: needs a dedicated graphics card (no integrated graphics).');
        if (s.includesCooler) reasons.push('Includes a stock cooler, saving the cost of one.');
        break;
      }
      case 'gpu': {
        if (build.usage === 'rendering') score = (0.5 * s.performanceIndex + 0.5 * s.rayTracingIndex) / 100;
        else if (build.usage === 'video') score = (0.8 * s.performanceIndex + 2 * Math.min(s.vramGB, 16)) / 100;
        else if (build.usage === 'gaming') score = s.performanceIndex / 100;
        else score = s.performanceIndex / 200;
        if (s.vramGB < p.vramMin) { score *= 0.8; reasons.push(s.vramGB + ' GB VRAM is below the ' + p.vramMin + ' GB recommended for ' + usageLabel(build) + '.'); }
        else if (s.vramGB >= p.vramIdeal) reasons.push(s.vramGB + ' GB VRAM meets the ' + p.vramIdeal + ' GB+ ideal for ' + usageLabel(build) + '.');
        if (build.usage === 'gaming') {
          var fps = Math.round(s.performanceIndex * { '1080p': 2.4, '1440p': 1.75, '4k': 0.95 }[build.resolution]);
          reasons.push('GPU capacity of roughly ' + fps + ' FPS in AAA titles at ' + build.resolution + ' (model estimate).');
        }
        if (cpu && build.usage === 'gaming') {
          var bal = PCB.perf.balance(cpu, item, build.resolution);
          if (bal.component === 'cpu' && bal.severity !== 'mild') {
            score -= bal.severity === 'severe' ? 0.15 : 0.07;
            reasons.push('Your ' + cpu.name + ' would hold this GPU back by about ' + bal.percent + '% at ' + build.resolution + '.');
          } else if (bal.severity === 'balanced' || bal.component === 'gpu') {
            reasons.push('Balanced pairing with your ' + cpu.name + ' (no CPU bottleneck at ' + build.resolution + ').');
          }
        }
        break;
      }
      case 'motherboard': {
        // Board features matter, but far less than CPU/GPU performance.
        score = 0.6 + 0.4 * Math.min((PCB.perf.componentScore(item) + s.memorySlots * 3) / 150, 1);
        if (s.wifi) reasons.push('Built-in Wi-Fi.');
        reasons.push(s.m2Slots + ' M.2 slots (PCIe Gen ' + s.m2PcieGen + ') and ' + s.memorySlots + ' memory slots for future upgrades.');
        if (cpu && (s.biosUpdateFor || []).indexOf(cpu.specs.generation) !== -1) score -= 0.1;
        break;
      }
      case 'ram': {
        var base = s.memoryType === 'DDR5' ? 6000 : 3600;
        score = Math.min(s.capacityGB / p.ramIdeal, 1) * 0.75 + Math.min(s.speedMHz / base, 1.1) * 0.25;
        if (s.capacityGB < p.ramMin) { score *= 0.6; reasons.push(s.capacityGB + ' GB is below the ' + p.ramMin + ' GB minimum suggested for ' + usageLabel(build) + '.'); }
        else if (s.capacityGB >= p.ramIdeal) reasons.push(s.capacityGB + ' GB meets the ' + p.ramIdeal + ' GB recommended for ' + usageLabel(build) + '.');
        else reasons.push(s.capacityGB + ' GB is enough; ' + p.ramIdeal + ' GB would be ideal for ' + usageLabel(build) + '.');
        if (s.speedMHz >= base) reasons.push(s.memoryType + '-' + s.speedMHz + ' is a performance sweet spot for this platform.');
        if (s.capacityGB > p.ramIdeal * 2) score -= 0.1;
        break;
      }
      case 'storage': {
        var speed = s.type === 'HDD' ? 0.12 : s.type === 'SATA SSD' ? 0.35 : s.pcieGen >= 5 ? 1 : s.pcieGen === 4 ? 0.8 : 0.6;
        score = Math.min(s.capacityGB / p.storageIdeal, 1) * 0.5 + speed * 0.5;
        var hasSsd = PCB.store.part(build, 'storage').some(function (d) { return d.specs.type !== 'HDD'; });
        if (s.type === 'HDD' && !hasSsd) { score *= 0.5; reasons.push('Hard drives are slow as a boot drive: pair it with an SSD.'); }
        if (s.type === 'NVMe SSD') reasons.push('NVMe SSD (Gen ' + s.pcieGen + ', ' + PCB.num(s.readMBs) + ' MB/s) for fast boot and load times.');
        if (s.capacityGB >= p.storageIdeal) reasons.push(PCB.capacity(s.capacityGB) + ' meets the ' + PCB.capacity(p.storageIdeal) + ' suggested for ' + usageLabel(build) + '.');
        break;
      }
      case 'psu': {
        var pw = PCB.perf.power(build);
        score = 0.7 + (EFF_BONUS[s.efficiency] || 0);
        if (pw.total) {
          if (s.wattage < pw.recommendedPsu) { score = 0.3; reasons.push('Below the recommended ' + pw.recommendedPsu + ' W.'); }
          else reasons.push(s.wattage + ' W covers the estimated ' + pw.total + ' W peak (recommended ' + pw.recommendedPsu + ' W).');
          if (s.wattage > pw.recommendedPsu * 1.6) { score -= 0.25; reasons.push('More wattage than this build needs.'); }
        }
        if (gpu && gpu.specs.requires16Pin && s.native12V2x6) { score += 0.1; reasons.push('Native 16-pin cable for your ' + gpu.name + '.'); }
        if (EFF_BONUS[s.efficiency]) reasons.push(s.efficiency + ' efficiency: less heat and lower power bills.');
        break;
      }
      case 'case': {
        score = 0.6 + Math.min(s.includedFans * 0.04, 0.16);
        if (gpu) {
          var spare = s.maxGpuLengthMm - gpu.specs.lengthMm;
          score += Math.min(Math.max(spare, 0) / 300, 0.15);
          if (spare >= 0) reasons.push(spare + ' mm of spare GPU clearance for your ' + gpu.specs.lengthMm + ' mm card.');
        }
        if (s.includedFans >= 3) reasons.push(s.includedFans + ' fans included: good airflow out of the box.');
        if (s.includedFans === 0) reasons.push('No fans included: budget for case fans.');
        break;
      }
      case 'cooler': {
        var need = cpu ? cpu.specs.maxPower : 150;
        score = Math.min(s.tdpRating / need, 1.2) / 1.2 * 0.75 + PCB.clamp((40 - s.noiseDb) / 20, 0, 1) * 0.25;
        reasons.push('Rated for ' + s.tdpRating + ' W' + (cpu ? ' vs your CPU\'s ~' + cpu.specs.maxPower + ' W peak' : '') + '.');
        if (s.noiseDb <= 26) reasons.push('Quiet operation (about ' + s.noiseDb + ' dBA).');
        if (cpu && s.tdpRating > need * 1.6) score -= 0.1;
        break;
      }
    }
    return { score: Math.max(score, 0), reasons: reasons };
  }

  /** A short "why it fits" sentence describing compatibility with chosen parts. */
  function fitReason(item, build) {
    var cpu = PCB.store.part(build, 'cpu'), mb = PCB.store.part(build, 'motherboard');
    var ram = PCB.store.part(build, 'ram'), pcCase = PCB.store.part(build, 'case');
    var s = item.specs, bits = [];
    switch (item.category) {
      case 'cpu': if (mb) bits.push('fits your ' + mb.specs.socket + ' motherboard'); break;
      case 'motherboard':
        if (cpu) bits.push('matches your ' + cpu.specs.socket + ' CPU');
        if (ram) bits.push('accepts your ' + ram.specs.memoryType + ' RAM');
        if (pcCase) bits.push('fits your case');
        break;
      case 'ram': if (mb) bits.push(s.memoryType + ' matches your motherboard'); else if (cpu) bits.push('supported by your CPU'); break;
      case 'cooler': if (cpu) bits.push('supports the ' + cpu.specs.socket + ' socket'); if (pcCase) bits.push('fits inside your case'); break;
      case 'case': if (mb) bits.push('fits your ' + mb.specs.formFactor + ' board'); break;
      case 'gpu': if (pcCase) bits.push('fits your case'); break;
      case 'storage': if (mb) bits.push('a compatible ' + (s.interface === 'SATA' ? 'SATA port' : 'M.2 slot') + ' is free'); break;
    }
    return bits.length ? 'Compatible: ' + bits.join(', ') + '.' : '';
  }

  /**
   * Recommends components for one category.
   * Returns { category, target, current, picks[], note }.
   */
  rec.forCategory = function (build, category, limit) {
    var current = PCB.store.part(build, category);
    var isMulti = Array.isArray(current);
    var base = JSON.parse(JSON.stringify(build));
    if (!isMulti) base.parts[category] = null; // evaluate candidates as replacements
    var target = rec.categoryTarget(build, category);
    var profile = rec.PROFILES[build.usage];

    // A hard drive is only suggested once the build already has an SSD to boot from.
    var hasSsd = category === 'storage' && PCB.store.part(build, 'storage').some(function (d) { return d.specs.type !== 'HDD'; });
    var candidates = PCB.store.byCategory(category).filter(function (item) {
      if (category === 'storage' && !hasSsd && item.specs.type === 'HDD') return false;
      return !(isMulti && build.parts[category].indexOf(item.id) !== -1);
    }).map(function (item) {
      var cc = PCB.compat.checkCandidate(base, category, item.id);
      return { item: item, compat: cc };
    }).filter(function (x) { return x.compat.status !== 'error'; });

    // Parts priced far above their budget share are left out while cheaper compatible parts exist.
    if (isFinite(target) && target > 0 && candidates.length) {
      var affordable = candidates.filter(function (x) { return x.item.price <= target * 2.5; });
      candidates = affordable.length ? affordable
        : candidates.sort(function (a, b) { return a.item.price - b.item.price; }).slice(0, 3);
    }

    if (!candidates.length) {
      return { category: category, target: target, current: current, picks: [], note: 'No compatible ' + PCB.category(category).label.toLowerCase() + ' found for the parts you selected. Try changing a conflicting component.' };
    }

    candidates.forEach(function (x) {
      var f = fitness(x.item, base);
      x.fitness = f.score;
      x.reasons = f.reasons;
      x.value = f.score / x.item.price;
    });
    var maxValue = Math.max.apply(null, candidates.map(function (x) { return x.value; }));

    candidates.forEach(function (x) {
      var price = x.item.price;
      var budgetFit = 1, budgetReason = '';
      if (isFinite(target) && target > 0) {
        var ratio = price / target;
        budgetFit = ratio <= 1 ? 1 - (1 - ratio) * 0.3 : Math.max(-1.5, 1 - (ratio - 1) * 1.2);
        budgetReason = ratio <= 1
          ? 'Within the ~' + PCB.money(Math.round(target)) + ' budget share for this part (' + pct(profile.alloc[category]) + ' of a ' + usageLabel(build) + ' build).'
          : PCB.money(Math.round(price - target)) + ' over the ~' + PCB.money(Math.round(target)) + ' budget share for this part.';
      }
      var valueScore = x.value / maxValue;
      var outOfStock = x.item.priceSource && x.item.priceSource.status === 'out-of-stock';
      x.score = x.fitness * 0.5 + budgetFit * 0.3 + valueScore * 0.2 - (x.compat.status === 'warn' ? 0.1 : 0) - (outOfStock ? 0.08 : 0);
      x.breakdown = { fitness: x.fitness, budget: budgetFit, value: valueScore };
      var fr = fitReason(x.item, base);
      x.reasons = [fr].concat(x.reasons, [budgetReason]).filter(Boolean);
      if (valueScore >= 0.98) x.reasons.push('Best performance-per-peso option in this category.');
      if (outOfStock) x.reasons.push('Out of stock at ' + x.item.priceSource.store + ' when prices were checked.');
      else if (x.item.priceSource && x.item.priceSource.status === 'in-stock') x.reasons.push('In stock at ' + x.item.priceSource.store + ' when prices were checked.');
      x.warnings = x.compat.messages;
    });

    candidates.sort(function (a, b) { return b.score - a.score; });

    // Describe the change versus the currently selected part.
    if (current && !isMulti) {
      var curFit = fitness(current, base).score;
      candidates.forEach(function (x) {
        if (x.item.id === current.id) { x.isCurrent = true; return; }
        var d = curFit ? (x.fitness - curFit) / curFit : 0;
        var priceDiff = x.item.price - current.price;
        x.delta = (d >= 0 ? '+' : '') + Math.round(d * 100) + '% usage fitness, ' + (priceDiff >= 0 ? '+' : '−') + PCB.money(Math.abs(priceDiff)) + ' vs current';
      });
    }

    return {
      category: category,
      target: target,
      current: current,
      picks: candidates.slice(0, limit || 3).map(function (x) {
        return { item: x.item, score: Math.round(x.score * 100), reasons: x.reasons, warnings: x.warnings, delta: x.delta, isCurrent: !!x.isCurrent, breakdown: x.breakdown };
      })
    };
  };

  /* ---------- Build-level insights ---------- */

  rec.insights = function (build) {
    var out = [];
    var p = rec.PROFILES[build.usage];
    var s = PCB.store;
    var total = s.total(build);
    var report = PCB.compat.check(build);
    var cpu = s.part(build, 'cpu'), gpu = s.part(build, 'gpu'), ram = s.part(build, 'ram');

    if (!s.items(build).length) {
      out.push({ level: 'info', text: 'Start by choosing a CPU, or use Auto-complete to generate a full ' + usageLabel(build) + ' build within your budget.' });
      return out;
    }
    if (report.counts.error) out.push({ level: 'error', text: 'Resolve ' + report.counts.error + ' incompatibilit' + (report.counts.error === 1 ? 'y' : 'ies') + ' first: the build cannot be assembled as-is.' });

    if (build.budget) {
      var diff = build.budget - total;
      if (diff < 0) out.push({ level: 'warn', text: 'The build is ' + PCB.money(-diff) + ' over your ' + PCB.money(build.budget) + ' budget (' + pct(-diff / build.budget) + ').' });
      else if (report.complete && diff > build.budget * 0.12) out.push({ level: 'info', text: PCB.money(diff) + ' of your budget is unused. See the upgrade suggestion below for the best way to spend it.' });
    }

    if (ram && ram.specs.capacityGB < p.ramMin) out.push({ level: 'warn', text: ram.specs.capacityGB + ' GB RAM is below the ' + p.ramMin + ' GB recommended for ' + usageLabel(build) + '.' });
    if (gpu && gpu.specs.vramGB < p.vramMin) out.push({ level: 'warn', text: gpu.specs.vramGB + ' GB of VRAM is below the ' + p.vramMin + ' GB recommended for ' + usageLabel(build) + '.' });
    if (cpu && cpu.specs.cores < p.coresMin) out.push({ level: 'info', text: cpu.name + ' has ' + cpu.specs.cores + ' cores; ' + p.coresMin + '+ cores are recommended for ' + usageLabel(build) + '.' });
    if (!gpu && p.needsGpu && cpu) out.push({ level: 'warn', text: PCB.USAGES[build.usage] + ' benefits greatly from a dedicated graphics card.' });

    if (build.usage === 'gaming' && cpu && (gpu || cpu.specs.integratedGraphics)) {
      var g = PCB.perf.gaming(build, build.resolution);
      if (g && g.bottleneck.severity !== 'balanced') {
        out.push({ level: g.bottleneck.component === 'cpu' && g.bottleneck.severity !== 'mild' ? 'warn' : 'info', text: 'Bottleneck at ' + build.resolution + ': ' + g.bottleneck.text });
      } else if (g) {
        out.push({ level: 'ok', text: 'CPU and GPU are well balanced at ' + build.resolution + '.' });
      }
    }

    var upgrade = rec.upgradeSuggestion(build);
    if (upgrade) out.push({ level: 'tip', text: upgrade });

    if (report.missing.length) out.push({ level: 'info', text: 'Still needed: ' + report.missing.map(function (k) { return PCB.category(k).label; }).join(', ') + '.' });
    return out;
  };

  /**
   * Finds the upgrade that most improves the usage score while staying
   * within the remaining budget (GPU or CPU, the parts with most impact).
   */
  rec.upgradeSuggestion = function (build) {
    if (!build.budget) return null;
    var left = build.budget - PCB.store.total(build);
    if (left < 2000) return null;
    var baseScore = PCB.perf.score(build, build.usage);
    if (!baseScore) return null;
    var best = null;
    ['gpu', 'cpu', 'ram'].forEach(function (cat) {
      var current = PCB.store.part(build, cat);
      if (!current) return;
      PCB.store.byCategory(cat).forEach(function (item) {
        var extra = item.price - current.price;
        if (item.id === current.id || extra <= 0 || extra > left) return;
        var trial = JSON.parse(JSON.stringify(build));
        trial.parts[cat] = item.id;
        if (PCB.compat.check(trial).counts.error) return;
        var gain = (PCB.perf.score(trial, build.usage) - baseScore) / baseScore;
        var efficiency = gain / extra;
        if (gain > 0.04 && (!best || efficiency > best.efficiency)) best = { cat: cat, item: item, current: current, gain: gain, extra: extra, efficiency: efficiency };
      });
    });
    if (!best) return null;
    return 'Upgrade suggestion: replacing the ' + best.current.name + ' with the ' + best.item.brand + ' ' + best.item.name +
      ' (+' + PCB.money(best.extra) + ') raises the estimated ' + usageLabel(build) + ' score by about ' + pct(best.gain) +
      ' and stays within budget.';
  };

  /* ---------- Auto-complete ---------- */

  var FILL_ORDER = ['cpu', 'motherboard', 'ram', 'gpu', 'cooler', 'storage', 'case', 'psu'];

  /**
   * Fills every empty slot with the top recommendation, in dependency order.
   * Returns { build, log: [{ category, item, reason }] }.
   */
  rec.autoComplete = function (build) {
    var b = JSON.parse(JSON.stringify(build));
    var p = rec.PROFILES[b.usage];
    var log = [];
    FILL_ORDER.forEach(function (cat) {
      var v = b.parts[cat];
      if (Array.isArray(v) ? v.length : v) return;
      var cpu = PCB.store.part(b, 'cpu');
      if (cat === 'gpu' && !p.needsGpu && cpu && cpu.specs.integratedGraphics) return;
      if (cat === 'cooler' && cpu && cpu.specs.includesCooler && cpu.specs.tdp <= 65 && b.usage !== 'rendering') return;
      var r = rec.forCategory(b, cat, 5);
      if (!r.picks.length) return;
      // Prefer the best pick without warnings (e.g. avoids boards needing a BIOS update).
      var pick = r.picks.find(function (x) { return !x.warnings.length; }) || r.picks[0];
      if (Array.isArray(b.parts[cat])) b.parts[cat].push(pick.item.id); else b.parts[cat] = pick.item.id;
      log.push({ category: cat, item: pick.item, reason: pick.reasons[0] || '' });
    });
    return { build: b, log: log };
  };

  PCB.recommend = rec;
})(window.PCB);
