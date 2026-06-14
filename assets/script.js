const DATA_URL = "./data.json";
let data = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  buildParentsUI();
  buildLegend();
  wireButtons();
  wireHelp();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    data = await res.json();
  } catch (e) {
    console.error("Data load failed", e);
  }
}

function buildParentsUI() {
  const parents = ["sire", "dam"];
  const breed = window.location.pathname;

  // Define the order of loci based on breed
  let order = Object.keys(data.loci);
  if (breed.includes("greatdane")) {
    order = ["K", "A", "E", "D", "M", "H", "S"]; // Your requested order
  } else if (breed.includes("yakutian")) {
    order = ["K", "A", "E", "B", "D", "G", "I", "S", "T"];
  }

  parents.forEach((parent) => {
    const form = document.querySelector(`form[data-parent="${parent}"]`);
    if (!form) return;
    form.innerHTML = "";

    order.forEach((locus) => {
      if (!data.loci[locus]) return; // Skip if the locus isn't in the data.json

      const row = document.createElement("div");
      row.className = "locus-row";
      const lbl = document.createElement("label");
      lbl.textContent = `${locus} Locus`;
      row.appendChild(lbl);

      const s1 = document.createElement("select");
      s1.id = `${parent}-${locus}-a1`;
      const s2 = document.createElement("select");
      s2.id = `${parent}-${locus}-a2`;

      data.loci[locus].alleles.forEach((a) => {
        s1.add(new Option(a.id, a.id));
        s2.add(new Option(a.id, a.id));
      });

      row.appendChild(s1);
      row.appendChild(s2);
      const help = document.createElement("button");
      help.type = "button";
      help.className = "help";
      help.setAttribute("data-locus", locus);
      help.textContent = "?";
      row.appendChild(help);
      form.appendChild(row);
    });
  });
}

function buildLegend() {
  const table = document.getElementById("legend-table");
  if (!table) return;
  table.innerHTML =
    "<thead><tr><th>Allele</th><th>Meaning</th></tr></thead><tbody></tbody>";
  const tbody = table.querySelector("tbody");
  Object.keys(data.loci).forEach((locus) => {
    data.loci[locus].alleles.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><strong>${a.id}</strong></td><td>${a.name}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function wireButtons() {
  document
    .getElementById("predict-btn")
    .addEventListener("click", predictHandler);
  document.getElementById("reset-btn").addEventListener("click", resetHandler);
  document
    .getElementById("random-btn")
    .addEventListener("click", randomHandler);
}

function randomHandler() {
  document.querySelectorAll("select").forEach((s) => {
    s.selectedIndex = Math.floor(Math.random() * s.options.length);
  });
  predictHandler();
}

function resetHandler() {
  const url = window.location.href.toLowerCase();
  let defaults = {};

  if (url.includes("yakutian")) {
    defaults = {
      K: ["ky", "ky"],
      E: ["E", "E"],
      A: ["a", "a"],
      B: ["B", "B"],
      D: ["D", "D"],
      S: ["S", "sp"],
    };
  } else if (url.includes("greatdane")) {
    defaults = {
      M: ["m", "m"],
      H: ["h", "h"],
      K: ["ky", "ky"],
      E: ["Em", "Em"],
      A: ["AY", "AY"],
      D: ["D", "D"],
      S: ["S", "S"],
    };
  } else {
    defaults = { K: ["ky", "ky"], E: ["E", "E"] };
  }

  const parents = ["sire", "dam"];
  parents.forEach((p) => {
    Object.keys(defaults).forEach((locus) => {
      const a1 = document.getElementById(`${p}-${locus}-a1`);
      const a2 = document.getElementById(`${p}-${locus}-a2`);
      if (a1) a1.value = defaults[locus][0];
      if (a2) a2.value = defaults[locus][1];
    });
  });

  document.getElementById("predictions-area").innerHTML = "";
  document.getElementById("possibilities-count").textContent = "";
  clearPie();
}

function predictHandler() {
  const parents = readParents();
  const punnett = computePunnett(parents);
  const phenos = resolvePhenotypes(punnett);
  renderPredictions(phenos);
  drawPie(phenos);
}

function readParents() {
  const parents = { sire: {}, dam: {} };
  Object.keys(data.loci).forEach((locus) => {
    parents.sire[locus] = [
      document.getElementById(`sire-${locus}-a1`).value,
      document.getElementById(`sire-${locus}-a2`).value,
    ];
    parents.dam[locus] = [
      document.getElementById(`dam-${locus}-a1`).value,
      document.getElementById(`dam-${locus}-a2`).value,
    ];
  });
  return parents;
}

function computePunnett(parents) {
  const out = {};
  Object.keys(parents.sire).forEach((locus) => {
    const s = parents.sire[locus],
      d = parents.dam[locus],
      combos = {};
    s.forEach((sa) => {
      d.forEach((da) => {
        const pair = [sa, da].sort().join("");
        combos[pair] = (combos[pair] || 0) + 1;
      });
    });
    Object.keys(combos).forEach((k) => (combos[k] /= 4));
    out[locus] = combos;
  });
  return out;
}

function resolvePhenotypes(punnett) {
  const loci = Object.keys(punnett);
  const options = loci.map((l) =>
    Object.entries(punnett[l]).map(([g, p]) => ({ l, g, p })),
  );
  const combos = cartesian(options);
  const map = {};

  combos.forEach((combo) => {
    const prob = combo.reduce((s, c) => s * c.p, 1);
    const geno = {};
    combo.forEach((c) => (geno[c.l] = c.g));
    const ph = determinePhenotype(geno);
    const key = `${ph.name}||${ph.carrierInfo}||${ph.genoStr}`;
    map[key] = (map[key] || 0) + prob;
  });

  return Object.entries(map)
    .map(([k, v]) => {
      const [name, carrier, genoStr] = k.split("||");
      return { name, carrier, genoStr, prob: v };
    })
    .sort((a, b) => b.prob - a.prob);
}

function determinePhenotype(geno) {
  const url = window.location.href.toLowerCase();
  let carrierNotes = [];

  if (url.includes('yakutian')) {
    if (geno['E'] === 'ee') return { name: 'Recessive Yellow/Red', carrierInfo: '', genoStr: formatGeno(geno), isStandard: false };
    const isMasked = geno['E'].includes('Em');
    if (!isMasked && geno['E'] === 'Ee') carrierNotes.push('Mask Carrier');
    const isLiver = geno['B'] === 'bb';
    const isBlue = geno['D'] === 'dd';
    const isIsabella = isLiver && isBlue;
    if (geno['B'] === 'Bb') carrierNotes.push('Liver Carrier');
    if (geno['D'] === 'Dd') carrierNotes.push('Blue Carrier');
    const hasKB = geno['K'].includes('KB');
    if (geno['K'] === 'KBky') carrierNotes.push('Non-black Carrier');
    const aGeno = geno['A'];
    let aColor = 'Recessive Black';
    if (aGeno.includes('ay')) aColor = 'Sable/Fawn';
    else if (aGeno.includes('aw')) aColor = 'Wild Type';
    else if (aGeno.includes('at')) aColor = 'Black and Tan (Tri-colour)';
    let name = isIsabella ? 'Isabella' : (hasKB ? 'Dominant Black' : aColor);
    if (!isIsabella && hasKB) {
      if (isLiver) name = 'Liver Black';
      if (isBlue) name = 'Blue Black';
    } else if (!isIsabella && !hasKB) {
      if (isLiver) name = `Liver ${name}`;
      if (isBlue) name = `Blue ${name}`;
    }
    if (isMasked && (aGeno.includes('ay') || aGeno.includes('aw') || aGeno.includes('at'))) name += ' (with Mask)';
    const sGeno = geno['S'];
    if (sGeno === 'spsp') name = `Intensive White & ${name}`;
    else if (sGeno === 'Ssp') name = `White & ${name}`;
    return { name, carrierInfo: carrierNotes.join(', '), genoStr: formatGeno(geno), isStandard: (isIsabella ? false : true) };
  } else if (url.includes('greatdane')) {
    const isBlue = geno['D'] === 'dd';
    if (isBlue) carrierNotes.push('Blue'); // For coloring logic
    
    const hasKB = geno['K'].includes('KB');
    const hasKbr = geno['K'].includes('kbr');
    
    // Carrier notes
    if (geno['D'] === 'Dd') carrierNotes.push('Blue Carrier');
    if (geno['K'] === 'KBky') carrierNotes.push('Non-black Carrier');
    if (geno['S'] === 'Ssi') carrierNotes.push('Mantle Carrier');

    // 1. Determine Base Colour (A Locus check added here!)
    let name = 'Recessive Black'; 
    const aGeno = geno['A'];
    if (aGeno.includes('AY')) name = 'Sable/Fawn';
    else if (aGeno.includes('aw')) name = 'Wild Type';
    else if (aGeno.includes('at')) name = 'Black and Tan (Tri-colour)';
    else if (aGeno === 'aa') name = 'Recessive Black';

    // 2. K Locus Overwrites
    if (hasKB) name = 'Dominant Black';
    else if (hasKbr) name = 'Brindle';

    // 3. Dilution
    if (isBlue) name = `Blue ${name}`;

    // 4. Merle/Harlequin
    const isMerle = geno['M'].includes('M');
    const isHarlequin = geno['H'].includes('H') && isMerle;
    if (isHarlequin) name = `Harlequin ${name}`;
    else if (isMerle) name = `Merle ${name}`;

    // 5. Mantle
    if (geno['S'] === 'sisi') name = `Mantle ${name}`;

    return { name, carrierInfo: carrierNotes.join(', '), genoStr: formatGeno(geno), isStandard: (isBlue ? false : true) };
  }
  return { name: 'Unknown', carrierInfo: '', genoStr: formatGeno(geno), isStandard: false };
}

  return {
    name: "Unknown",
    carrierInfo: "",
    genoStr: formatGeno(geno),
    isStandard: false,
  };

function renderPredictions(items) {
  const area = document.getElementById("predictions-area");
  const count = document.getElementById("possibilities-count");
  area.innerHTML = "";
  count.textContent = `${items.length} possibilities`;

  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "prediction-item";

    // --- IMAGE STACK SYSTEM ---
    const imgStack = document.createElement("div");
    imgStack.className = "pheno-stack";

    // We only do layering for Great Danes for now
    if (window.location.pathname.includes("greatdane")) {
      const geno = it.genoStr;
      const isBlue = geno.includes("dd");
      const isSable = geno.includes("AY");
      const isKB = geno.includes("KB");
      const isKbr = geno.includes("kbr");
      const isEm = geno.includes("Em");
      const isMerle = geno.includes("M");
      const isHarlequin = geno.includes("H") && isMerle;
      const isMantle = geno.includes("sisi");

      // Layer 1: Base
      if (isBlue) addLayer(imgStack, "assets/images/greatdane/blue_base.PNG");
      else if (isSable)
        addLayer(imgStack, "assets/images/greatdane/fawn_base.PNG");
      else addLayer(imgStack, "assets/images/greatdane/black_base.PNG");

      // Layer 2: Brindle
      if (isKbr) {
        if (isBlue)
          addLayer(imgStack, "assets/images/greatdane/blue_brindle.PNG");
        else addLayer(imgStack, "assets/images/greatdane/fawn_brindle.PNG");
      }

      // Layer 3: Mask
      if (isEm) {
        if (isBlue) addLayer(imgStack, "assets/images/greatdane/blue_mask.PNG");
        else addLayer(imgStack, "assets/images/greatdane/black_mask.PNG");
      }

      // Layer 4: Merle/Harlequin
      if (isHarlequin)
        addLayer(imgStack, "assets/images/greatdane/harlequin.PNG");
      else if (isMerle) {
        if (isBlue)
          addLayer(imgStack, "assets/images/greatdane/blue_merle.PNG");
        else addLayer(imgStack, "assets/images/greatdane/merle.PNG");
      }

      // Layer 5: Mantle
      if (isMantle) addLayer(imgStack, "assets/images/greatdane/mantle.PNG");

      // Layer 6: Final Lineart
      addLayer(imgStack, "assets/images/greatdane/lineart.PNG");
    } else {
      // Yakutian fallback (use a single image or default)
      addLayer(imgStack, "assets/images/yakutian/default.PNG");
    }

    const textDiv = document.createElement("div");
    textDiv.className = "prediction-text";
    textDiv.innerHTML = `
      <div class="prediction-title">
        <span>${it.name} — ${(it.prob * 100).toFixed(1)}% ${it.isStandard ? "✅" : "⚪"}</span>
      </div>
      ${it.carrier ? `<span class="carrier-text">${it.carrier}</span>` : ""}
      <div class="prediction-genotype">${it.genoStr}</div>
    `;

    div.appendChild(imgStack);
    div.appendChild(textDiv);
    area.appendChild(div);
  });
}

// Helper function to handle image stacking
function addLayer(container, src) {
  const img = document.createElement("img");
  img.src = src;
  img.style.position = "absolute";
  img.style.top = "0";
  img.style.left = "0";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.pointerEvents = "none";
  container.appendChild(img);
}

function formatGeno(geno) {
  return Object.entries(geno)
    .map(([l, g]) => g)
    .join(" ");
}

function renderPredictions(items) {
  const area = document.getElementById("predictions-area");
  const count = document.getElementById("possibilities-count");
  area.innerHTML = "";
  count.textContent = `${items.length} possibilities`;
  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "prediction-item";
    div.innerHTML = `
      <div class="prediction-title"><span>${it.name} — ${(it.prob * 100).toFixed(1)}%</span></div>
      ${it.carrier ? `<span class="carrier-text">${it.carrier}</span>` : ""}
      <div class="prediction-genotype">${it.genoStr}</div>
    `;
    area.appendChild(div);
  });
}

function cartesian(arr) {
  return arr.reduce(
    (acc, cur) => {
      const out = [];
      acc.forEach((a) => cur.forEach((c) => out.push(a.concat([c]))));
      return out;
    },
    [[]],
  );
}

function drawPie(items) {
  const canvas = document.getElementById("pie");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("pie-tooltip");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let start = -0.5 * Math.PI;
  const cx = canvas.width / 2,
    cy = canvas.height / 2,
    r = 120;
  const slices = [];
  items.forEach((it, i) => {
    const sliceAngle = it.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + sliceAngle);
    ctx.fillStyle = getPhenoColor(it.name, i);
    ctx.fill();
    slices.push({
      start,
      end: start + sliceAngle,
      name: it.name,
      prob: it.prob,
    });
    start += sliceAngle;
  });
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const angle = Math.atan2(y, x);
    const normalizedAngle =
      angle < -0.5 * Math.PI ? angle + 2 * Math.PI : angle;
    const found = slices.find(
      (s) => normalizedAngle >= s.start && normalizedAngle <= s.end,
    );
    if (found) {
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top + 10}px`;
      tooltip.textContent = `${found.name} (${(found.prob * 100).toFixed(1)}%)`;
    } else {
      tooltip.style.display = "none";
    }
  };
  canvas.onmouseleave = () => (tooltip.style.display = "none");
}

function getPhenoColor(name, index) {
  const lower = name.toLowerCase();
  if (lower.includes("isabella")) return "#d2b48c";
  if (lower.includes("blue")) return "#aeb9c3";
  if (lower.includes("liver")) return "#7d5a44";
  if (lower.includes("yellow") || lower.includes("fawn")) return "#e1ad01";
  if (lower.includes("wild type")) return "#8e8e8e";
  if (lower.includes("black")) return "#2d3436";
  if (lower.includes("white")) return "#fcfcfc";
  return `hsl(${index * 137.5}, 60%, 50%)`;
}

function clearPie() {
  const canvas = document.getElementById("pie");
  if (canvas)
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  const tool = document.getElementById("pie-tooltip");
  if (tool) tool.style.display = "none";
}

function wireHelp() {
  const pop = document.getElementById("popover");
  document.querySelectorAll(".help").forEach((btn) => {
    btn.addEventListener("mouseenter", (e) => {
      const locus = btn.getAttribute("data-locus");
      pop.textContent = data.loci[locus].description;
      const r = btn.getBoundingClientRect();
      pop.style.left = `${r.right + 10}px`;
      pop.style.top = `${r.top}px`;
      pop.style.display = "block";
    });
    btn.addEventListener("mouseleave", () => (pop.style.display = "none"));
  });
}
