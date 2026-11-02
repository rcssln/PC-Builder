/* ==========================================================================
   compatibility.js - Rule-based hardware compatibility engine.

   Every rule reads compatibility attributes from the component data
   (socket, memory type, form factor, dimensions, wattage, interfaces...)
   and returns checks with a status and a plain-language explanation:
     ok    = compatible (green)
     warn  = potential issue (yellow)
     error = incompatible (red)
     info  = neutral information
   ========================================================================== */
(function (PCB) {
  'use strict';

  var compat = {};

  compat.RULES = {
    socket: { label: 'CPU and motherboard socket' },
    memory: { label: 'Motherboard and RAM generation' },
    formfactor: { label: 'Motherboard and case form factor' },
    gpu: { label: 'GPU and case clearance' },
    cooler: { label: 'CPU cooler socket and clearance' },
    power: { label: 'Power supply wattage' },
    storage: { label: 'Storage interface' }
  };

  var RANK = { error: 3, warn: 2, ok: 1, info: 0 };
  compat.worst = function (statuses) {
    return statuses.reduce(function (w, s) { return RANK[s] > RANK[w] ? s : w; }, 'info');
  };

  function c(rule, status, title, detail, parts, pending) {
    return { rule: rule, status: status, title: title, detail: detail, parts: parts, pending: !!pending };
  }
  function n(item) { return item.brand + ' ' + item.name; }

  /* ---------- 1. CPU and motherboard socket ---------- */
  function socketRules(cpu, mb) {
    var out = [];
    if (!cpu || !mb) return out;
    var cs = cpu.specs, ms = mb.specs;
    if (cs.socket !== ms.socket) {
      out.push(c('socket', 'error', 'CPU socket does not match the motherboard',
        n(cpu) + ' uses the ' + cs.socket + ' socket, but ' + n(mb) + ' has an ' + ms.socket +
        ' socket. The CPU physically cannot be installed. Choose an ' + cs.socket + ' motherboard or a ' + ms.socket + ' CPU.',
        ['cpu', 'motherboard']));
      return out;
    }
    out.push(c('socket', 'ok', 'Socket match: ' + cs.socket,
      n(cpu) + ' and ' + n(mb) + ' both use the ' + cs.socket + ' socket.', ['cpu', 'motherboard']));
    if (cs.memoryTypes.indexOf(ms.memoryType) === -1) {
      out.push(c('socket', 'error', 'CPU does not support the board\'s memory type',
        n(cpu) + ' supports ' + cs.memoryTypes.join('/') + ' only, but this motherboard uses ' + ms.memoryType + '.',
        ['cpu', 'motherboard']));
    }
    if ((ms.biosUpdateFor || []).indexOf(cs.generation) !== -1) {
      out.push(c('socket', 'warn', 'BIOS update may be required',
        'Older stock of ' + n(mb) + ' (' + ms.chipset + ') may ship with a BIOS that predates ' + cs.generation +
        ' processors. The PC may not boot until the BIOS is updated. Look for a board with BIOS Flashback or a "' +
        cs.generation + ' ready" label, or ask the retailer to update it.', ['cpu', 'motherboard']));
    }
    return out;
  }

  /* ---------- 2. Motherboard and RAM ---------- */
  function memoryRules(ram, mb, cpu) {
    var out = [];
    if (!ram) return out;
    var rs = ram.specs;
    if (!mb) {
      if (cpu && cpu.specs.memoryTypes.indexOf(rs.memoryType) === -1) {
        out.push(c('memory', 'error', 'RAM generation not supported by the CPU',
          n(cpu) + ' supports ' + cpu.specs.memoryTypes.join('/') + ' memory, but the selected kit is ' + rs.memoryType + '.', ['ram', 'cpu']));
      }
      return out;
    }
    var ms = mb.specs;
    if (rs.memoryType !== ms.memoryType) {
      out.push(c('memory', 'error', 'RAM generation mismatch (' + rs.memoryType + ' vs ' + ms.memoryType + ')',
        'The motherboard only accepts ' + ms.memoryType + ' modules. ' + rs.memoryType + ' modules have a different notch position and will not fit. Select a ' +
        ms.memoryType + ' kit or a ' + rs.memoryType + ' motherboard.', ['ram', 'motherboard']));
      return out;
    }
    var problems = 0;
    if (rs.modules > ms.memorySlots) {
      problems++;
      out.push(c('memory', 'error', 'Not enough memory slots',
        'This kit has ' + rs.modules + ' modules but the motherboard has only ' + ms.memorySlots + ' slots.', ['ram', 'motherboard']));
    }
    if (rs.capacityGB > ms.maxMemoryGB) {
      problems++;
      out.push(c('memory', 'error', 'Capacity exceeds motherboard maximum',
        rs.capacityGB + ' GB exceeds the ' + ms.maxMemoryGB + ' GB maximum supported by ' + n(mb) + '.', ['ram', 'motherboard']));
    }
    if (rs.speedMHz > ms.maxMemorySpeed) {
      problems++;
      out.push(c('memory', 'warn', 'RAM speed above motherboard rating',
        'The kit is rated ' + rs.speedMHz + ' MT/s but the board officially supports up to ' + ms.maxMemorySpeed +
        ' MT/s. It will work, but may need to run at a lower speed.', ['ram', 'motherboard']));
    }
    if (rs.modules === 1) {
      problems++;
      out.push(c('memory', 'warn', 'Single-channel memory',
        'A single module runs in single-channel mode, which can noticeably reduce performance. A 2-module kit is recommended.', ['ram']));
    }
    if (!problems) {
      out.push(c('memory', 'ok', 'Memory compatible: ' + rs.memoryType,
        rs.capacityGB + ' GB ' + rs.memoryType + '-' + rs.speedMHz + ' (' + rs.modules + ' modules) fits the board\'s ' +
        ms.memorySlots + ' ' + ms.memoryType + ' slots (max ' + ms.maxMemoryGB + ' GB, ' + ms.maxMemorySpeed + ' MT/s).', ['ram', 'motherboard']));
    }
    return out;
  }

  /* ---------- 3. Motherboard form factor and case ---------- */
  function formFactorRules(mb, pcCase) {
    if (!mb || !pcCase) return [];
    var ff = mb.specs.formFactor, supported = pcCase.specs.supportedFormFactors;
    if (supported.indexOf(ff) === -1) {
      return [c('formfactor', 'error', ff + ' motherboard does not fit this case',
        n(pcCase) + ' supports ' + supported.join(', ') + ' motherboards only. A ' + ff +
        ' board is too large for its mounting points. Choose a larger case or a smaller motherboard.', ['motherboard', 'case'])];
    }
    return [c('formfactor', 'ok', ff + ' board fits the case',
      n(pcCase) + ' (' + pcCase.specs.type + ') supports ' + supported.join(', ') + ' motherboards.', ['motherboard', 'case'])];
  }

  /* ---------- 4. GPU and case clearance ---------- */
  function gpuRules(gpu, pcCase, cpu) {
    var out = [];
    if (!gpu) {
      if (cpu && !cpu.specs.integratedGraphics) {
        out.push(c('gpu', 'error', 'No display output',
          n(cpu) + ' has no integrated graphics, so a graphics card is required to connect a monitor.', ['gpu', 'cpu'], true));
      } else if (cpu) {
        out.push(c('gpu', 'info', 'Using integrated graphics',
          'No graphics card selected. ' + n(cpu) + ' has integrated graphics, which is fine for office work and video playback but not for modern gaming or 3D work.', ['gpu', 'cpu']));
      }
      return out;
    }
    if (!pcCase) return out;
    var len = gpu.specs.lengthMm, max = pcCase.specs.maxGpuLengthMm, spare = max - len;
    if (spare < 0) {
      out.push(c('gpu', 'error', 'Graphics card is too long for the case',
        n(gpu) + ' is ' + len + ' mm long, but ' + n(pcCase) + ' fits cards up to ' + max + ' mm (' + (-spare) +
        ' mm short). Choose a shorter card or a larger case.', ['gpu', 'case']));
    } else if (spare < 15) {
      out.push(c('gpu', 'warn', 'Tight GPU clearance (' + spare + ' mm spare)',
        n(gpu) + ' (' + len + ' mm) fits within the ' + max + ' mm limit, but only just. Front-mounted fans, radiators or cables can reduce the usable space.', ['gpu', 'case']));
    } else {
      out.push(c('gpu', 'ok', 'GPU fits with ' + spare + ' mm to spare',
        n(gpu) + ' is ' + len + ' mm long; the case supports up to ' + max + ' mm.', ['gpu', 'case']));
    }
    return out;
  }

  /* ---------- 5. CPU cooler: socket, capacity and clearance ---------- */
  function coolerRules(cooler, cpu, pcCase) {
    var out = [];
    if (!cooler) {
      if (cpu && cpu.specs.includesCooler) {
        out.push(c('cooler', 'info', 'Using the bundled stock cooler',
          n(cpu) + ' ships with a cooler. It is adequate at stock settings; an aftermarket cooler will run quieter and cooler.', ['cooler', 'cpu']));
      } else if (cpu) {
        out.push(c('cooler', 'warn', 'CPU cooler required',
          n(cpu) + ' does not include a cooler. Add an air cooler or AIO rated for at least ' + cpu.specs.tdp + ' W.', ['cooler', 'cpu'], true));
      }
      return out;
    }
    var cs = cooler.specs;
    if (cpu) {
      if (cs.sockets.indexOf(cpu.specs.socket) === -1) {
        out.push(c('cooler', 'error', 'Cooler does not support the ' + cpu.specs.socket + ' socket',
          n(cooler) + ' includes mounting hardware for ' + cs.sockets.join(', ') + ' only.', ['cooler', 'cpu']));
      } else if (cs.tdpRating < cpu.specs.tdp) {
        out.push(c('cooler', 'warn', 'Cooler is under-rated for this CPU',
          n(cooler) + ' is rated for about ' + cs.tdpRating + ' W, below the ' + cpu.specs.tdp + ' W TDP of ' + n(cpu) + '. Expect high temperatures and throttling.', ['cooler', 'cpu']));
      } else if (cs.tdpRating < cpu.specs.maxPower * 0.9) {
        out.push(c('cooler', 'warn', 'Cooler may limit sustained boost',
          n(cpu) + ' can draw up to ~' + cpu.specs.maxPower + ' W under heavy all-core loads; this ' + cs.tdpRating +
          ' W cooler handles normal use but may throttle in long renders or compiles.', ['cooler', 'cpu']));
      } else {
        out.push(c('cooler', 'ok', 'Cooler supports ' + cpu.specs.socket + ' and the CPU\'s heat output',
          cs.tdpRating + ' W rated cooling covers the ' + cpu.specs.tdp + ' W TDP (up to ~' + cpu.specs.maxPower + ' W peak).', ['cooler', 'cpu']));
      }
    }
    if (pcCase) {
      var ps = pcCase.specs;
      if (cs.type === 'Air') {
        var spare = ps.maxCoolerHeightMm - cs.heightMm;
        if (spare < 0) {
          out.push(c('cooler', 'error', 'Air cooler is too tall for the case',
            n(cooler) + ' is ' + cs.heightMm + ' mm tall, but ' + n(pcCase) + ' allows up to ' + ps.maxCoolerHeightMm + ' mm. The side panel will not close.', ['cooler', 'case']));
        } else if (spare < 5) {
          out.push(c('cooler', 'warn', 'Very tight cooler clearance (' + spare + ' mm)',
            'The cooler fits within the ' + ps.maxCoolerHeightMm + ' mm limit, but tall RAM heatspreaders or side-panel fans could interfere.', ['cooler', 'case']));
        } else {
          out.push(c('cooler', 'ok', 'Cooler height fits (' + spare + ' mm spare)',
            cs.heightMm + ' mm cooler in a case that allows ' + ps.maxCoolerHeightMm + ' mm.', ['cooler', 'case']));
        }
      } else {
        if (ps.radiatorSupportMm.indexOf(cs.radiatorMm) === -1) {
          out.push(c('cooler', 'error', cs.radiatorMm + ' mm radiator is not supported by the case',
            n(pcCase) + ' supports radiators of ' + ps.radiatorSupportMm.join(', ') + ' mm only.', ['cooler', 'case']));
        } else {
          out.push(c('cooler', 'ok', cs.radiatorMm + ' mm radiator fits the case',
            n(pcCase) + ' supports ' + ps.radiatorSupportMm.join(', ') + ' mm radiators.', ['cooler', 'case']));
        }
      }
    }
    return out;
  }

  /* ---------- 6. Power supply ---------- */
  function powerRules(build, psu, gpu, pcCase) {
    var out = [];
    var pw = PCB.perf.power(build);
    if (!psu) {
      if (pw.total) {
        out.push(c('power', 'info', 'Estimated draw ' + pw.total + ' W · recommended PSU ' + pw.recommendedPsu + ' W',
          'Select a power supply of at least ' + pw.recommendedPsu + ' W for this configuration.', ['psu']));
      }
      return out;
    }
    var ps = psu.specs;
    var basis = 'Estimated peak draw is ' + pw.total + ' W (CPU ' + pw.parts.cpu + ' W, GPU ' + pw.parts.gpu +
      ' W, rest ' + (pw.total - pw.parts.cpu - pw.parts.gpu) + ' W). Recommended: ' + pw.recommendedPsu + ' W.';
    if (ps.wattage < pw.total) {
      out.push(c('power', 'error', 'PSU wattage is too low',
        'The ' + ps.wattage + ' W PSU cannot supply the estimated ' + pw.total + ' W peak load. The system may shut down under load. ' + basis, ['psu', 'cpu', 'gpu']));
    } else if (ps.wattage < pw.recommendedPsu) {
      out.push(c('power', 'warn', 'PSU has little headroom',
        'The ' + ps.wattage + ' W PSU covers the estimated load with only ' + Math.round((ps.wattage / pw.total - 1) * 100) +
        '% headroom. Power spikes from modern GPUs may trigger shutdowns. ' + basis, ['psu', 'cpu', 'gpu']));
    } else {
      out.push(c('power', 'ok', ps.wattage + ' W PSU is sufficient',
        'Provides ' + Math.round((ps.wattage / Math.max(pw.total, 1) - 1) * 100) + '% headroom. ' + basis, ['psu']));
    }
    if (gpu && gpu.specs.requires16Pin && !ps.native12V2x6) {
      out.push(c('power', 'warn', 'GPU needs a 16-pin connector adapter',
        n(gpu) + ' uses a 16-pin 12V-2x6 connector but this PSU has no native cable. The adapter bundled with the card works, but needs several 8-pin PCIe cables and must be fully seated.', ['psu', 'gpu']));
    }
    if (pcCase && pcCase.specs.psuFormFactors.indexOf(ps.formFactor) === -1) {
      if (ps.formFactor === 'SFX' && pcCase.specs.psuFormFactors.indexOf('ATX') !== -1) {
        out.push(c('power', 'warn', 'SFX PSU in an ATX case',
          'An SFX power supply fits in an ATX case with an SFX-to-ATX adapter bracket (often sold separately).', ['psu', 'case']));
      } else {
        out.push(c('power', 'error', ps.formFactor + ' PSU does not fit this case',
          n(pcCase) + ' only accepts ' + pcCase.specs.psuFormFactors.join('/') + ' power supplies.', ['psu', 'case']));
      }
    }
    return out;
  }

  /* ---------- 7. Storage interface ---------- */
  function storageRules(drives, mb, pcCase) {
    var out = [];
    if (!drives.length) return out;
    var nvme = drives.filter(function (d) { return d.specs.interface === 'M.2 NVMe'; });
    var sata = drives.filter(function (d) { return d.specs.interface === 'SATA'; });
    var bays35 = drives.filter(function (d) { return d.specs.formFactor === '3.5-inch'; });
    var bays25 = drives.filter(function (d) { return d.specs.formFactor === '2.5-inch'; });
    var problems = 0;
    if (mb) {
      var ms = mb.specs;
      if (nvme.length > ms.m2Slots) {
        problems++;
        out.push(c('storage', 'error', 'Not enough M.2 slots',
          nvme.length + ' NVMe drives are selected but ' + n(mb) + ' has ' + ms.m2Slots + ' M.2 slot' + (ms.m2Slots === 1 ? '' : 's') + '.', ['storage', 'motherboard']));
      }
      nvme.forEach(function (d) {
        if (d.specs.pcieGen > ms.m2PcieGen) {
          problems++;
          out.push(c('storage', 'warn', d.name + ' will run at reduced speed',
            'This is a PCIe Gen ' + d.specs.pcieGen + ' drive, but the board\'s M.2 slots are Gen ' + ms.m2PcieGen +
            '. It works, but sequential speed is capped at roughly ' + (ms.m2PcieGen === 3 ? '3,500' : '7,000') + ' MB/s.', ['storage', 'motherboard']));
        }
      });
      if (sata.length > ms.sataPorts) {
        problems++;
        out.push(c('storage', 'error', 'Not enough SATA ports',
          sata.length + ' SATA drives are selected but the board has ' + ms.sataPorts + ' SATA ports.', ['storage', 'motherboard']));
      }
    }
    if (pcCase) {
      if (bays35.length > pcCase.specs.driveBays35) {
        problems++;
        out.push(c('storage', 'error', 'No room for 3.5-inch drives',
          n(pcCase) + ' has ' + pcCase.specs.driveBays35 + ' 3.5-inch bay(s) but ' + bays35.length + ' hard drive(s) are selected.', ['storage', 'case']));
      }
      if (bays25.length > pcCase.specs.driveBays25) {
        problems++;
        out.push(c('storage', 'warn', 'Limited 2.5-inch mounting space',
          'The case lists ' + pcCase.specs.driveBays25 + ' dedicated 2.5-inch mounts for ' + bays25.length + ' SSD(s). Extra drives may need a 3.5-inch bay adapter.', ['storage', 'case']));
      }
    }
    if (!problems && mb) {
      var parts = [];
      if (nvme.length) parts.push(nvme.length + ' of ' + mb.specs.m2Slots + ' M.2 slots (Gen ' + mb.specs.m2PcieGen + ')');
      if (sata.length) parts.push(sata.length + ' of ' + mb.specs.sataPorts + ' SATA ports');
      out.push(c('storage', 'ok', 'Storage interfaces available',
        'The selected drive' + (drives.length > 1 ? 's use ' : ' uses ') + parts.join(' and ') + '.', ['storage', 'motherboard']));
    }
    return out;
  }

  /**
   * Checks a build. Returns:
   * { status, checks[], counts{ok,warn,error,info}, missing[], complete, byRule{} }
   */
  compat.check = function (build) {
    var s = PCB.store;
    var cpu = s.part(build, 'cpu'), gpu = s.part(build, 'gpu'), mb = s.part(build, 'motherboard');
    var ram = s.part(build, 'ram'), psu = s.part(build, 'psu'), pcCase = s.part(build, 'case');
    var cooler = s.part(build, 'cooler'), drives = s.part(build, 'storage');

    var checks = [].concat(
      socketRules(cpu, mb),
      memoryRules(ram, mb, cpu),
      formFactorRules(mb, pcCase),
      gpuRules(gpu, pcCase, cpu),
      coolerRules(cooler, cpu, pcCase),
      powerRules(build, psu, gpu, pcCase),
      storageRules(drives, mb, pcCase)
    );

    var missing = [];
    ['cpu', 'motherboard', 'ram', 'storage', 'psu', 'case'].forEach(function (k) {
      var v = build.parts[k];
      if (!v || (Array.isArray(v) && !v.length)) missing.push(k);
    });
    if (!gpu && cpu && !cpu.specs.integratedGraphics) missing.push('gpu');
    if (!cooler && cpu && !cpu.specs.includesCooler) missing.push('cooler');

    var counts = { ok: 0, warn: 0, error: 0, info: 0 };
    checks.forEach(function (x) { counts[x.status]++; });
    var byRule = {};
    Object.keys(compat.RULES).forEach(function (r) { byRule[r] = checks.filter(function (x) { return x.rule === r; }); });

    var status = s.items(build).length === 0 ? 'empty' : counts.error ? 'error' : counts.warn ? 'warn' : 'ok';
    return { status: status, checks: checks, counts: counts, missing: missing, complete: missing.length === 0, byRule: byRule };
  };

  /**
   * Checks how a candidate component would fit into the build.
   * Returns { status, messages[] } considering only checks involving it.
   */
  compat.checkCandidate = function (build, category, id) {
    var trial = JSON.parse(JSON.stringify(build));
    if (Array.isArray(trial.parts[category])) {
      if (trial.parts[category].indexOf(id) === -1) trial.parts[category].push(id);
    } else {
      trial.parts[category] = id;
    }
    var relevant = compat.check(trial).checks.filter(function (x) {
      return x.parts.indexOf(category) !== -1 && x.status !== 'info' && !x.pending;
    });
    var status = relevant.length ? compat.worst(relevant.map(function (x) { return x.status; })) : 'ok';
    return {
      status: status,
      messages: relevant.filter(function (x) { return x.status === status && status !== 'ok'; }).map(function (x) { return x.title; })
    };
  };

  PCB.compat = compat;
})(window.PCB);
