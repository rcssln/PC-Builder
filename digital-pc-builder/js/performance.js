/* ==========================================================================
   performance.js - Transparent performance & power estimation model.

   IMPORTANT: Every number produced here is a model-based APPROXIMATION.
   The model combines the relative performance indices stored with each
   component (normalised from general public benchmark trends) using the
   simple, documented formulas below. Nothing here is a measured benchmark.
   ========================================================================== */
(function (PCB) {
  'use strict';

  var perf = {};

  /* ---------- Power ---------- */

  var MOBO_POWER = { 'E-ATX': 60, 'ATX': 50, 'Micro-ATX': 40, 'Mini-ITX': 35 };
  var STORAGE_POWER = { 'NVMe SSD': 7, 'SATA SSD': 5, 'HDD': 9 };
  var FANS_AND_MISC = 15;

  /**
   * Estimated peak power draw per component and the recommended PSU size.
   * Recommended PSU = estimated peak x 1.3 headroom (transients, ageing,
   * efficiency sweet spot), rounded up to 50 W, and never below the GPU
   * vendor's recommendation.
   */
  perf.power = function (build) {
    var s = PCB.store;
    var cpu = s.part(build, 'cpu'), gpu = s.part(build, 'gpu'), mb = s.part(build, 'motherboard');
    var ram = s.part(build, 'ram'), cooler = s.part(build, 'cooler'), drives = s.part(build, 'storage');
    var parts = {
      cpu: cpu ? cpu.specs.maxPower : 0,
      gpu: gpu ? gpu.specs.tdp : 0,
      motherboard: mb ? (MOBO_POWER[mb.specs.formFactor] || 45) + (/^[XZ]/.test(mb.specs.chipset) ? 10 : 0) : 0,
      ram: ram ? ram.specs.modules * (ram.specs.memoryType === 'DDR5' ? 6 : 4) : 0,
      storage: drives.reduce(function (sum, d) { return sum + (STORAGE_POWER[d.specs.type] || 6); }, 0),
      cooler: cooler ? (cooler.specs.type === 'Air' ? 3 * cooler.specs.fans : 8 + 3 * cooler.specs.fans) : 0,
      other: s.items(build).length ? FANS_AND_MISC : 0
    };
    var total = Object.keys(parts).reduce(function (sum, k) { return sum + parts[k]; }, 0);
    var recommended = total ? Math.ceil(total * 1.3 / 50) * 50 : 0;
    if (gpu) recommended = Math.max(recommended, gpu.specs.recommendedPsu);
    return { parts: parts, total: total, recommendedPsu: recommended };
  };

  /* ---------- Gaming model ---------- */

  // GPU frame-rate multiplier per resolution for "AAA, high settings".
  var RES_FACTOR = { '1080p': 2.4, '1440p': 1.75, '4k': 0.95 };
  // CPU frames per gaming-index point for "AAA, high settings".
  var CPU_FACTOR = 2.0;

  var PRESETS = [
    { key: 'esports', label: 'Esports / lightweight titles', cpu: 2.6, gpu: 3.2 },
    { key: 'aaa', label: 'Modern AAA · high settings', cpu: 1.0, gpu: 1.0 },
    { key: 'ultra', label: 'Demanding AAA · ultra settings', cpu: 0.85, gpu: 0.7 },
    { key: 'rt', label: 'AAA with ray tracing', cpu: 0.8, gpu: 0.62, rt: true }
  ];
  perf.PRESETS = PRESETS;

  function ramFactor(ram) {
    if (!ram) return 0.8;
    var s = ram.specs, f = 1;
    if (s.capacityGB < 16) f *= 0.88;
    if (s.modules === 1) f *= 0.92; // single channel
    if (s.memoryType === 'DDR5' && s.speedMHz >= 6000) f *= 1.03;
    if (s.memoryType === 'DDR4' && s.speedMHz >= 3600) f *= 1.02;
    return f;
  }

  /** Graphics capability of the build (dedicated GPU, else integrated). */
  function graphics(build) {
    var gpu = PCB.store.part(build, 'gpu'), cpu = PCB.store.part(build, 'cpu');
    if (gpu) return { name: gpu.name, perf: gpu.specs.performanceIndex, rt: gpu.specs.rayTracingIndex, vram: gpu.specs.vramGB, dedicated: true };
    if (cpu && cpu.specs.integratedGraphics) return { name: 'Integrated graphics', perf: cpu.specs.igpuIndex, rt: 0, vram: 2, dedicated: false };
    return null;
  }
  perf.graphics = graphics;

  function bottleneckInfo(cpuFps, gpuFps) {
    var cpuBound = cpuFps < gpuFps;
    var pct = Math.round((1 - Math.min(cpuFps, gpuFps) / Math.max(cpuFps, gpuFps)) * 100);
    var severity = pct < 10 ? 'balanced' : !cpuBound ? 'gpu-bound' : pct < 20 ? 'mild' : pct < 35 ? 'moderate' : 'severe';
    var text;
    if (severity === 'balanced') {
      text = 'CPU and GPU are well balanced for this workload (difference under 10%).';
    } else if (cpuBound) {
      text = 'The CPU limits frame rate by about ' + pct + '%: the GPU could render more frames than the CPU prepares. ' +
        (severity === 'mild' ? 'This is minor.' : 'Consider a faster gaming CPU, or play at a higher resolution to shift load to the GPU.');
    } else {
      text = 'The GPU is the limiting component (' + pct + '% below the CPU\'s frame capacity). ' +
        'This is normal and usually desirable for gaming; for higher frame rates, a stronger GPU would help more than a faster CPU.';
    }
    return { component: severity === 'balanced' ? 'none' : (cpuBound ? 'cpu' : 'gpu'), percent: pct, severity: severity, text: text };
  }

  /**
   * Gaming estimate for a build at a resolution.
   * FPS = min(CPU frame capacity, GPU frame capacity); shown as a +/- range.
   */
  perf.gaming = function (build, resolution) {
    var cpu = PCB.store.part(build, 'cpu');
    var gfx = graphics(build);
    if (!cpu || !gfx) return null;
    var res = resolution || build.resolution || '1440p';
    var rf = ramFactor(PCB.store.part(build, 'ram'));
    var cpuBase = cpu.specs.gamingIndex * CPU_FACTOR * rf;
    var gpuBase = gfx.perf * RES_FACTOR[res];

    var presets = PRESETS.map(function (p) {
      if (p.rt && (!gfx.dedicated || !gfx.rt)) return { key: p.key, label: p.label, unavailable: true };
      var cpuFps = cpuBase * p.cpu;
      var gpuFps = (p.rt ? gfx.rt : gfx.perf) * RES_FACTOR[res] * p.gpu;
      var notes = [];
      if ((p.key === 'ultra' || p.rt) && res === '4k' && gfx.vram < 12) { gpuFps *= 0.85; notes.push('VRAM below 12 GB may limit 4K ultra textures.'); }
      if ((p.key === 'ultra' || p.rt) && res !== '1080p' && gfx.vram < 10) { gpuFps *= 0.92; notes.push('8 GB VRAM can stutter with ultra textures above 1080p.'); }
      var fps = Math.min(cpuFps, gpuFps, 600);
      return {
        key: p.key, label: p.label,
        fps: Math.round(fps),
        low: Math.max(1, Math.round(fps * 0.85 / 5) * 5),
        high: Math.round(fps * 1.12 / 5) * 5,
        limitedBy: cpuFps < gpuFps ? 'CPU' : 'GPU',
        notes: notes
      };
    });

    var aaaCpu = cpuBase, aaaGpu = gpuBase;
    var fps = Math.min(aaaCpu, aaaGpu);
    var threadsLoad = PCB.clamp(110 - cpu.specs.threads * 2.2, 30, 95);
    return {
      resolution: res,
      cpuFps: Math.round(aaaCpu),
      gpuFps: Math.round(aaaGpu),
      fps: Math.round(fps),
      presets: presets,
      bottleneck: bottleneckInfo(aaaCpu, aaaGpu),
      cpuUtil: Math.round(fps / aaaCpu * threadsLoad),
      gpuUtil: Math.round(PCB.clamp(fps / aaaGpu * 98, 5, 99)),
      integrated: !gfx.dedicated
    };
  };

  /** Quick CPU/GPU balance used by the recommendation engine. */
  perf.balance = function (cpu, gpu, resolution) {
    if (!cpu || !gpu) return null;
    var res = resolution || '1440p';
    return bottleneckInfo(cpu.specs.gamingIndex * CPU_FACTOR, gpu.specs.performanceIndex * RES_FACTOR[res]);
  };

  /* ---------- Workload scores ---------- */

  perf.WORKLOADS = {
    gaming: { label: 'Gaming', desc: 'Frame rate at your chosen resolution (AAA, high settings).' },
    programming: { label: 'Programming', desc: 'Compiling, IDEs, containers and test suites. Favors multi-core CPU, RAM and fast storage.' },
    video: { label: 'Video Editing', desc: 'Timeline playback and export. Uses CPU cores plus GPU acceleration; benefits from 32-64 GB RAM.' },
    rendering: { label: '3D Rendering', desc: 'CPU or GPU render engines (Blender, V-Ray, etc.). Favors many cores and a strong GPU with large VRAM.' },
    general: { label: 'General Use', desc: 'Web, office and media. Favors single-core speed and a responsive SSD.' }
  };

  function storageScore(build) {
    var best = 0;
    PCB.store.part(build, 'storage').forEach(function (d) {
      var s = d.specs;
      var v = s.type === 'HDD' ? 12 : s.type === 'SATA SSD' ? 35 : s.pcieGen >= 5 ? 100 : s.pcieGen === 4 ? 80 : 60;
      best = Math.max(best, v);
    });
    return best;
  }

  function ramScore(build, ideal) {
    var ram = PCB.store.part(build, 'ram');
    if (!ram) return 0;
    return Math.min(ram.specs.capacityGB / ideal, 1.2) * 100;
  }

  /** Raw (un-normalised) score for a workload; null when key parts are missing. */
  function rawScore(build, workload) {
    var cpu = PCB.store.part(build, 'cpu');
    if (!cpu) return null;
    var gfx = graphics(build) || { perf: 0, rt: 0, vram: 0 };
    var st = cpu.specs.singleCoreIndex, mt = cpu.specs.multiCoreIndex;
    switch (workload) {
      case 'gaming': {
        var g = perf.gaming(build, build.resolution);
        return g ? g.fps : null;
      }
      case 'programming':
        return 0.5 * mt + 0.3 * st + 0.12 * ramScore(build, 32) + 0.08 * storageScore(build);
      case 'video': {
        var gpuVideo = gfx.perf * (gfx.vram < 8 ? 0.8 : 1);
        return 0.4 * mt + 0.15 * st + 0.25 * gpuVideo + 0.12 * ramScore(build, 64) + 0.08 * storageScore(build);
      }
      case 'rendering': {
        var gpuRender = (0.5 * gfx.perf + 0.5 * gfx.rt) * (gfx.vram < 12 ? 0.85 : 1);
        return 0.4 * mt + 0.45 * gpuRender + 0.15 * ramScore(build, 64);
      }
      case 'general':
        return 0.5 * st + 0.15 * mt + 0.15 * ramScore(build, 16) + 0.2 * storageScore(build);
    }
    return null;
  }

  // Reference build = 100 points: Ryzen 5 7600 + RTX 4060 + 32 GB DDR5-6000 + Gen4 NVMe, 1440p.
  var REFERENCE = {
    usage: 'gaming', resolution: '1440p',
    parts: { cpu: 'cpu-r5-7600', gpu: 'gpu-rtx4060', ram: 'ram-ddr5-32-6000', storage: ['ssd-sn580-1tb'], motherboard: null, psu: null, case: null, cooler: null }
  };
  perf.REFERENCE_LABEL = 'Ryzen 5 7600 + RTX 4060 + 32 GB DDR5 + Gen4 NVMe SSD';
  var refCache = {};
  function referenceScore(workload, resolution) {
    var key = workload + '|' + resolution;
    if (!(key in refCache)) {
      var ref = PCB.store.normalize(Object.assign({}, REFERENCE, { resolution: resolution }));
      refCache[key] = rawScore(ref, workload) || 1;
    }
    return refCache[key];
  }

  perf.tier = function (score) {
    if (score >= 150) return 'Enthusiast';
    if (score >= 100) return 'High-end';
    if (score >= 60) return 'Mainstream';
    return 'Entry level';
  };

  /** Workload score normalised so the reference build = 100. */
  perf.score = function (build, workload) {
    var raw = rawScore(build, workload);
    if (raw === null) return null;
    return Math.round(raw / referenceScore(workload, build.resolution || '1440p') * 100);
  };

  // Share of each component's peak power used by a workload (approximation).
  var LOAD = {
    idle: { cpu: 0.12, gpu: 0.06 },
    gaming: { cpu: 0.55, gpu: 0.92 },
    programming: { cpu: 0.9, gpu: 0.08 },
    video: { cpu: 0.85, gpu: 0.5 },
    rendering: { cpu: 1.0, gpu: 0.9 },
    general: { cpu: 0.3, gpu: 0.12 }
  };
  perf.workloadPower = function (build, workload) {
    var p = perf.power(build).parts;
    var l = LOAD[workload] || LOAD.general;
    var rest = p.motherboard + p.ram + p.storage + p.cooler + p.other;
    return Math.round(p.cpu * l.cpu + p.gpu * l.gpu + rest * (workload === 'idle' ? 0.6 : 0.9));
  };

  /**
   * Rough temperature estimate under a workload (approximation).
   * CPU: 40 C + 55 C x (heat produced / cooler rating), so a cooler working
   * at its full rating reaches the ~95 C limit. Stock coolers count as 95 W. GPU: its own cooler is sized for the card, so 35 C + 40 C x load.
   * Both add a few degrees for cases with poor airflow or small cases.
   */
  perf.temperatures = function (build, workload) {
    var cpu = PCB.store.part(build, 'cpu'), gpu = PCB.store.part(build, 'gpu');
    var cooler = PCB.store.part(build, 'cooler'), pcCase = PCB.store.part(build, 'case');
    var l = LOAD[workload] || LOAD.general;
    var airflow = 2;
    if (pcCase) {
      airflow = pcCase.specs.includedFans === 0 ? 5 : pcCase.specs.includedFans >= 3 ? 0 : 2;
      if (/Mini-ITX|Small Form Factor/.test(pcCase.specs.type)) airflow += 4;
    }
    function rate(t, limit) {
      if (t >= limit) return { status: 'error', text: 'Likely to throttle: it would reach its ~' + limit + ' °C safety limit and slow itself down.' };
      if (t >= limit - 10) return { status: 'warn', text: 'Hot but within limits. Better cooling or airflow would help.' };
      return { status: 'ok', text: 'Comfortable temperature for long sessions.' };
    }
    var out = { cpu: null, gpu: null };
    if (cpu) {
      var rating = cooler ? cooler.specs.tdpRating : (cpu.specs.includesCooler ? 95 : null);
      if (rating === null) {
        out.cpu = { value: null, status: 'error', text: 'No cooler selected and none comes with this CPU. It cannot run without one.' };
      } else {
        var heat = cpu.specs.maxPower * l.cpu;
        var t = Math.round(40 + 55 * heat / rating + airflow);
        out.cpu = Object.assign({ value: Math.min(t, 95), low: Math.min(t, 95) - 4, high: Math.min(t + 4, 100), cooler: cooler ? cooler.brand + ' ' + cooler.name : 'Stock cooler' }, rate(t, 95));
      }
    }
    if (gpu) {
      var g = Math.round(35 + 40 * l.gpu + airflow + (gpu.specs.tdp > 350 ? 3 : 0));
      out.gpu = Object.assign({ value: g, low: g - 4, high: g + 4 }, rate(g, 90));
    }
    return out;
  };

  /** Typical utilization pattern for a workload (approximation). */
  function utilization(build, workload, gaming) {
    var cpu = PCB.store.part(build, 'cpu');
    var gfx = graphics(build);
    if (workload === 'gaming' && gaming) return { cpu: gaming.cpuUtil, gpu: gaming.gpuUtil };
    var cpuRel = cpu.specs.multiCoreIndex / 40;              // vs reference CPU
    var gpuRel = gfx ? Math.max(gfx.perf, 1) / 32 : 0.05;    // vs reference GPU
    switch (workload) {
      case 'programming': return { cpu: 92, gpu: gfx && gfx.dedicated ? 5 : 8 };
      case 'video': return {
        cpu: Math.round(PCB.clamp(70 + 25 * Math.min(1, gpuRel / cpuRel), 40, 98)),
        gpu: Math.round(PCB.clamp(25 + 45 * Math.min(1, cpuRel / gpuRel), 10, 90))
      };
      case 'rendering': return { cpu: 98, gpu: gfx && gfx.dedicated ? 95 : 0 };
      default: return { cpu: Math.round(PCB.clamp(30 - (cpu.specs.singleCoreIndex - 60) * 0.4, 8, 35)), gpu: 8 };
    }
  }

  /** Identifies the weakest part for productivity workloads. */
  function productivityBottleneck(build, workload) {
    var cpu = PCB.store.part(build, 'cpu');
    var ram = PCB.store.part(build, 'ram');
    var gfx = graphics(build);
    var ideal = { programming: 32, video: 64, rendering: 64, general: 16 }[workload];
    var factors = [
      { component: 'cpu', label: 'CPU', value: (workload === 'general' ? cpu.specs.singleCoreIndex / 80 : cpu.specs.multiCoreIndex / 52) },
      { component: 'ram', label: 'RAM', value: ram ? ram.specs.capacityGB / ideal : 0 },
      { component: 'storage', label: 'Storage', value: storageScore(build) / 80 }
    ];
    if (workload === 'video' || workload === 'rendering') {
      factors.push({ component: 'gpu', label: 'GPU', value: gfx ? gfx.perf / 48 * (workload === 'rendering' && gfx.vram < 12 ? 0.85 : 1) : 0 });
    }
    factors.sort(function (a, b) { return a.value - b.value; });
    var weakest = factors[0];
    if (weakest.value >= 0.9) {
      return { component: 'none', percent: 0, severity: 'balanced', text: 'No significant bottleneck: every key component meets the recommended level for ' + perf.WORKLOADS[workload].label.toLowerCase() + '.' };
    }
    var pct = Math.round((1 - Math.max(weakest.value, 0)) * 100);
    var tips = {
      cpu: 'A CPU with more cores (or faster single-core speed for general use) would help most.',
      ram: 'More memory is recommended (about ' + ideal + ' GB for this workload).',
      storage: storageScore(build) ? 'A faster NVMe SSD would improve load and save times.' : 'Add a storage drive.',
      gpu: 'A stronger GPU (and more VRAM) would speed up GPU-accelerated effects and rendering.'
    };
    return {
      component: weakest.component,
      percent: PCB.clamp(pct, 0, 100),
      severity: pct < 20 ? 'mild' : pct < 40 ? 'moderate' : 'severe',
      text: weakest.label + ' is the weakest link for this workload (about ' + PCB.clamp(pct, 0, 100) + '% below the recommended level). ' + tips[weakest.component]
    };
  }

  /**
   * Full simulation for one workload.
   * Returns null with a reason when required components are missing.
   */
  perf.simulate = function (build, workload, resolution) {
    var b = Object.assign({}, build, { resolution: resolution || build.resolution || '1440p' });
    var cpu = PCB.store.part(b, 'cpu');
    if (!cpu) return { error: 'Select a CPU to run the simulation.' };
    var gfx = graphics(b);
    if (!gfx && (workload === 'gaming' || workload === 'rendering')) {
      return { error: 'This CPU has no integrated graphics. Select a graphics card to simulate ' + perf.WORKLOADS[workload].label.toLowerCase() + '.' };
    }
    var gaming = workload === 'gaming' ? perf.gaming(b, b.resolution) : null;
    var score = perf.score(b, workload);
    var util = utilization(b, workload, gaming);
    var bottleneck = workload === 'gaming' ? gaming.bottleneck : productivityBottleneck(b, workload);
    var total = PCB.store.total(b);
    var notes = [];
    if (!gfx || !gfx.dedicated) notes.push('Using integrated graphics: suitable for display output and light tasks only.');
    if (!PCB.store.part(b, 'ram')) notes.push('No RAM selected: the score assumes a heavy memory penalty.');
    if (!PCB.store.part(b, 'storage').length) notes.push('No storage selected: storage-dependent parts of the score are zero.');
    if (workload === 'rendering' && gfx && gfx.dedicated && /NVIDIA/i.test(PCB.store.part(b, 'gpu').specs.chipset)) {
      notes.push('NVIDIA GPUs are widely supported by GPU render engines (CUDA / OptiX).');
    }
    return {
      workload: workload,
      resolution: b.resolution,
      score: score,
      tier: perf.tier(score),
      gaming: gaming,
      utilization: util,
      bottleneck: bottleneck,
      power: { idle: perf.workloadPower(b, 'idle'), load: perf.workloadPower(b, workload), peak: perf.power(b).total },
      valuePer10k: total ? Math.round(score / total * 10000 * 10) / 10 : null,
      notes: notes
    };
  };

  /** Scores for every workload (used by summary and comparison pages). */
  perf.overview = function (build) {
    var out = {};
    Object.keys(perf.WORKLOADS).forEach(function (w) { out[w] = perf.score(build, w); });
    return out;
  };

  /** Single "performance points" figure for comparing individual components. */
  perf.componentScore = function (item) {
    var s = item.specs;
    switch (item.category) {
      case 'cpu': return Math.round(0.4 * s.gamingIndex + 0.3 * s.singleCoreIndex + 0.3 * s.multiCoreIndex);
      case 'gpu': return Math.round(0.75 * s.performanceIndex + 0.25 * s.rayTracingIndex);
      case 'ram': return Math.round(s.capacityGB / 64 * 60 + s.speedMHz / 8000 * 40);
      case 'storage': return Math.round(Math.min(s.readMBs / 12400, 1) * 60 + Math.min(s.capacityGB / 4000, 1) * 40);
      case 'motherboard': return Math.round(s.m2Slots * 8 + s.m2PcieGen * 6 + s.pcieGen * 5 + s.maxMemorySpeed / 200 + (s.wifi ? 6 : 0));
      case 'psu': return Math.round(s.wattage / 12 + ({ '80+ Bronze': 5, '80+ Gold': 12, '80+ Platinum': 18 }[s.efficiency] || 0) + (s.native12V2x6 ? 5 : 0));
      case 'cooler': return Math.round(s.tdpRating / 3 + (40 - s.noiseDb));
      case 'case': return Math.round(s.maxGpuLengthMm / 8 + s.maxCoolerHeightMm / 8 + s.supportedFormFactors.length * 3 + s.includedFans * 2);
    }
    return 0;
  };

  PCB.perf = perf;
})(window.PCB);
