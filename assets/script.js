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

// HELPER: This is the most important function.
// It prevents the "undefined" crash by returning an empty string if a gene is missing.
function safeGet(geno, locus) {
  return geno && geno[locus] ? geno[locus] : "";
}

function buildParentsUI() {
  const parents = ["sire", "dam"];
  const url = window.location.href.toLowerCase();
  let order = Object.keys(data.loci);
  if (url.includes("greatdane")) order = ["K", "A", "E", "D", "M", "H", "S"];
  else if (url.includes("yakutian")) order = ["K", "A", "E", "B", "D", "S"];

  parents.forEach((parent) => {
    const form = document.querySelector(`form[data-parent="${parent}"]`);
    if (!form) return;
    form.innerHTML = "";
    order.forEach((locus) => {
      if (!data.loci[locus]) return;
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
  if (url.includes("yakutian"))
    defaults = {
      K: ["ky", "ky"],
      E: ["E", "E"],
      A: ["a", "a"],
      B: ["B", "B"],
      D: ["D", "D"],
      S: ["S", "sp"],
    };
  else if (url.includes("greatdane"))
    defaults = {
      M: ["m", "m"],
      H: ["h", "h"],
      K: ["KB", "KB"],
      E: ["Em", "Em"],
      A: ["ay", "ay"],
      D: ["D", "D"],
      S: ["S", "S"],
    };
  else defaults = { K: ["ky", "ky"], E: ["E", "E"] };

  ["sire", "dam"].forEach((p) => {
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

async function predictHandler() {
  // Close any open popovers first to fix the "grey overlay" bug
  document.getElementById("popover").style.display = "none";

  const parents = readParents();
  const punnett = computePunnett(parents);
  const phenos = resolvePhenotypes(punnett);
  await renderPredictions(phenos);
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
      return {
        name,
        carrier,
        genoStr,
        prob: v,
        isStandard: phIsStandard(name),
      };
    })
    .sort((a, b) => b.prob - a.prob);
}

function phIsStandard(name) {
  const n = name.toLowerCase();
  if (n.includes("isabella")) return false;
  if (n.includes("blue merle") || n.includes("blue harlequin")) return false;
  return true;
}

function determinePhenotype(geno) {
  const url = window.location.href.toLowerCase();
  let carrierNotes = [];
  let warning = "";
  let standards = { akc: true, fci: true };

  // HELPER: Prevents the "undefined" crash
  const safeGet = (locus) => (geno[locus] ? geno[locus] : "");

  if (url.includes("yakutian")) {
    const eGeno = safeGet("E");
    if (eGeno === "ee")
      return {
        name: "Recessive Yellow/Red",
        carrierInfo: "",
        genoStr: formatGeno(geno),
        standards: { akc: true, fci: true },
        warning: "",
      };

    const isMasked = eGeno.includes("Em");
    if (!isMasked && eGeno === "Ee") carrierNotes.push("Mask Carrier");

    const bGeno = safeGet("B");
    const dGeno = safeGet("D");
    const isLiver = bGeno === "bb";
    const isBlue = dGeno === "dd";
    const isIsabella = isLiver && isBlue;

    if (bGeno === "Bb") carrierNotes.push("Liver Carrier");
    if (dGeno === "Dd") carrierNotes.push("Blue Carrier");

    const kGeno = safeGet("K");
    const hasKB = kGeno.includes("KB");
    if (kGeno === "KBky") carrierNotes.push("Non-black Carrier");

    const aGeno = safeGet("A");
    let aColor = "Recessive Black";
    if (aGeno.toLowerCase().includes("ay")) aColor = "Sable/Fawn";
    else if (aGeno.toLowerCase().includes("aw")) aColor = "Wild Type";
    else if (aGeno.toLowerCase().includes("at"))
      aColor = "Black and Tan (Tri-colour)";

    let name = isIsabella ? "Isabella" : hasKB ? "Dominant Black" : aColor;
    if (!isIsabella && hasKB) {
      if (isLiver) name = "Liver Black";
      if (isBlue) name = "Blue Black";
    } else if (!isIsabella && !hasKB) {
      if (isLiver) name = `Liver ${name}`;
      if (isBlue) name = `Blue ${name}`;
    }
    if (
      isMasked &&
      (aGeno.toLowerCase().includes("ay") ||
        aGeno.toLowerCase().includes("aw") ||
        aGeno.toLowerCase().includes("at"))
    )
      name += " (with Mask)";

    const sGeno = safeGet("S");
    if (sGeno === "spsp") name = `Intensive White & ${name}`;
    else if (sGeno === "Ssp") name = `White & ${name}`;

    return {
      name,
      carrierInfo: carrierNotes.join(", "),
      genoStr: formatGeno(geno),
      standards: {
        akc: isIsabella ? false : true,
        fci: isIsabella ? false : true,
      },
      warning: "",
    };
  } else if (url.includes("greatdane")) {
    const mGeno = safeGet("M");
    const hGeno = safeGet("H");
    const kGeno = safeGet("K");
    const aGeno = safeGet("A");
    const dGeno = safeGet("D");
    const sGeno = safeGet("S");

    // 1. LETHAL CHECK
    if (hGeno === "HH")
      return {
        name: "Embryonic Lethal",
        carrierInfo: "",
        genoStr: formatGeno(geno),
        standards: { akc: false, fci: false },
        warning: "lethal",
      };

    // 2. HEALTH WARNINGS
    if (mGeno === "MM") {
      warning = "⚠️ DOUBLE MERLE: High risk of deafness/blindness";
      standards.akc = false;
      standards.fci = false;
    }

    const isBlue = dGeno === "dd";
    const hasKB = kGeno.includes("KB");
    const hasKbr = kGeno.includes("kbr"); // Note: Fix typo here if needed: kGeno.includes('kbr')
    const hasKbr_fixed = kGeno.includes("kbr");

    if (dGeno === "Dd") carrierNotes.push("Blue Carrier");
    if (kGeno === "KBky") carrierNotes.push("Non-black Carrier");
    if (sGeno === "Ssi") carrierNotes.push("Mantle Carrier");

    // 3. SUBSCRIPT: Genetic type first
    let geneticType = "Recessive Black";
    if (hasKB) geneticType = "Dominant Black";
    else if (hasKbr_fixed) geneticType = "Brindle";
    carrierNotes.unshift(geneticType);

    // 4. VISUAL NAME
    let name = "Black";
    if (hasKbr_fixed) {
      name = aGeno.toLowerCase().includes("ay") ? "Fawn Brindle" : "Brindle";
    } else if (!hasKB) {
      if (aGeno.toLowerCase().includes("ay")) name = "Sable/Fawn";
      else if (aGeno.toLowerCase().includes("aw")) name = "Wild Type";
      else if (aGeno.toLowerCase().includes("at"))
        name = "Black and Tan (Tri-colour)";
      else name = "Black";
    }

    if (isBlue) name = `Blue ${name}`;

    const isMerle = mGeno.includes("M");
    const isHarlequin = hGeno.includes("H") && isMerle;
    if (isHarlequin) name = `Harlequin ${name}`;
    else if (isMerle) name = `Merle ${name}`;
    if (sGeno === "sisi") name = `Mantle ${name}`;

    // 5. STANDARD CHECK (Restored)
    if (isBlue && (isMerle || isHarlequin)) {
      standards.akc = false;
      standards.fci = false;
    }

    return {
      name,
      carrierInfo: carrierNotes.join(", "),
      genoStr: formatGeno(geno),
      standards,
      warning: warning || (mGeno === "MM" ? "doublemerle" : ""),
    };
  }

  return {
    name: "Unknown",
    carrierInfo: "",
    genoStr: formatGeno(geno),
    standards: { akc: false, fci: false },
    warning: "",
  };
}

function formatGeno(geno) {
  const url = window.location.href.toLowerCase();
  let order = Object.keys(geno);
  if (url.includes("greatdane")) order = ["K", "A", "E", "D", "M", "H", "S"];
  else if (url.includes("yakutian")) order = ["K", "A", "E", "B", "D", "S"];
  return order
    .filter((locus) => geno[locus])
    .map((locus) => geno[locus])
    .join(" ");
}

async function renderPredictions(items) {
  const area = document.getElementById("predictions-area");
  const count = document.getElementById("possibilities-count");
  area.innerHTML = "";
  count.textContent = `${items.length} possibilities`;

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "prediction-item";

    if (it.warning === "lethal") div.classList.add("bg-lethal");
    if (it.warning === "doublemerle") div.classList.add("bg-doublemerle");

    const currentPath = window.location.pathname.toLowerCase();

    if (currentPath.includes("greatdane")) {
      const imgStack = document.createElement("div");
      imgStack.className = "pheno-stack";

      const mergedImageSrc = await createMergedImage(it.genoStr);
      const img = document.createElement("img");
      img.src = mergedImageSrc;
      img.onclick = () => {
        document.getElementById("lightbox-img").src = mergedImageSrc;
        document.getElementById("lightbox").style.display = "flex";
      };
      imgStack.appendChild(img);
      div.appendChild(imgStack);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "prediction-text";

    //If not standard, return an empty string instead of a white circle
    const akcIcon = it.standards?.akc ? "✅" : "";
    const fciIcon = it.standards?.fci ? "💠" : "";

    textDiv.innerHTML = `
      <div class="prediction-title">
        <span>${it.name} — ${(it.prob * 100).toFixed(1)}% ${akcIcon} ${fciIcon}</span>
      </div>
      ${it.carrier ? `<span class="carrier-text">${it.carrier}</span>` : ""}
      <div class="prediction-genotype">${it.genoStr}</div>
      ${it.warning ? `<span class="warning-text">${it.warning}</span>` : ""}
    `;

    div.appendChild(textDiv);
    area.appendChild(div);
  }
}

async function createMergedImage(geno) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");

  const layers = [];
  const isBlue = geno.includes("dd");
  const isSable = geno.toLowerCase().includes("ay");
  const isKB = geno.includes("KB");
  const isKbr = geno.includes("kbr");
  const isEm = geno.includes("Em");
  const isMerle = geno.includes("M");
  const isHarlequin = geno.includes("H") && isMerle;
  const isMantle = geno.includes("sisi");

  const pathBase = "/Canine-Colour-Genetics/assets/images/greatdane/";

  // --- FIXED BASE LAYER LOGIC ---
  // 1. Blue always comes first
  if (isBlue) {
    layers.push(pathBase + "blue_base.PNG");
  }
  // 2. Dominant Black (KB) overrides the A-Locus (Sable)
  else if (isKB) {
    layers.push(pathBase + "black_base.PNG");
  }
  // 3. If not KB, check if they are Sable/Fawn
  else if (isSable) {
    layers.push(pathBase + "fawn_base.PNG");
  }
  // 4. Otherwise, they are Recessive Black
  else {
    layers.push(pathBase + "black_base.PNG");
  }

  // --- REST OF LAYERS (Order is important) ---
  if (isKbr) {
    layers.push(
      isBlue ? pathBase + "blue_brindle.PNG" : pathBase + "fawn_brindle.PNG",
    );
  }
  if (isEm) {
    layers.push(
      isBlue ? pathBase + "blue_mask.PNG" : pathBase + "black_mask.PNG",
    );
  }
  if (isHarlequin) {
    layers.push(pathBase + "harlequin.PNG");
  } else if (isMerle) {
    layers.push(isBlue ? pathBase + "blue_merle.PNG" : pathBase + "merle.PNG");
  }
  if (isMantle) {
    layers.push(pathBase + "mantle.PNG");
  }
  layers.push(pathBase + "lineart.PNG");

  for (const src of layers) {
    await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1000, 1000);
        resolve();
      };
      img.onerror = () => {
        console.error("Missing layer:", src);
        resolve();
      };
      img.src = src;
    });
  }
  return canvas.toDataURL("image/png");
}

function addLayer(container, src) {
  const img = document.createElement("img");
  img.src = src;
  img.style.position = "absolute";
  img.style.top = "0";
  img.style.left = "0";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.pointerEvents = "auto";
  container.appendChild(img);
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
    const x = e.clientX - rect.left - cx,
      y = e.clientY - rect.top - cy;
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
    } else tooltip.style.display = "none";
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
