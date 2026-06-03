const DATA_URL = './data.json';
let data = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  buildGuide();
  buildParentsUI();
  buildLegend();
  wireButtons();
  wireHelp();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    data = await res.json();
  } catch (e) { console.error("Data load failed", e); }
}

function buildGuide() {
  const guide = document.getElementById('quick-list');
  guide.innerHTML = `
    <p><strong>For Experts:</strong> Select the alleles for both parents. The engine calculates the Punnett square for each locus and resolves phenotypes based on strict hierarchy.</p>
    <p><strong>For Beginners:</strong> Use the <strong>?</strong> buttons to see what each gene does. Choose a combination for the Sire and Dam, then click <strong>Predict</strong> to see the possible puppy colours!</p>
    <p><strong>Pro Tip:</strong> Use the <strong>Random</strong> button to explore how different gene combinations interact.</p>
  `;
}

function buildParentsUI() {
  const parents = ['sire', 'dam'];
  parents.forEach(parent => {
    const form = document.querySelector(`form[data-parent="${parent}"]`);
    form.innerHTML = '';
    const keys = Object.keys(data.loci);
    keys.forEach(locus => {
      const row = document.createElement('div');
      row.className = 'locus-row';
      const lbl = document.createElement('label');
      lbl.textContent = `${locus} Locus`;
      row.appendChild(lbl);

      const s1 = document.createElement('select');
      s1.id = `${parent}-${locus}-a1`;
      const s2 = document.createElement('select');
      s2.id = `${parent}-${locus}-a2`;

      data.loci[locus].alleles.forEach(a => {
        s1.add(new Option(a.id, a.id));
        s2.add(new Option(a.id, a.id));
      });

      row.appendChild(s1); row.appendChild(s2);
      const help = document.createElement('button');
      help.type = 'button'; help.className = 'help';
      help.setAttribute('data-locus', locus); help.textContent = '?';
      row.appendChild(help);
      form.appendChild(row);
    });
  });
}

function buildLegend() {
  const table = document.getElementById('legend-table');
  table.innerHTML = '<thead><tr><th>Allele</th><th>Meaning</th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');
  Object.keys(data.loci).forEach(locus => {
    data.loci[locus].alleles.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${a.id}</strong></td><td>${a.name}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function wireButtons() {
  document.getElementById('predict-btn').addEventListener('click', predictHandler);
  document.getElementById('reset-btn').addEventListener('click', resetHandler);
  document.getElementById('random-btn').addEventListener('click', randomHandler);
}

function randomHandler() {
  document.querySelectorAll('select').forEach(s => {
    s.selectedIndex = Math.floor(Math.random() * s.options.length);
  });
  predictHandler();
}

function resetHandler() {
  document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  document.getElementById('predictions-area').innerHTML = '';
  document.getElementById('possibilities-count').textContent = '';
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
  Object.keys(data.loci).forEach(locus => {
    parents.sire[locus] = [document.getElementById(`sire-${locus}-a1`).value, document.getElementById(`sire-${locus}-a2`).value];
    parents.dam[locus] = [document.getElementById(`dam-${locus}-a1`).value, document.getElementById(`dam-${locus}-a2`).value];
  });
  return parents;
}

function computePunnett(parents) {
  const out = {};
  Object.keys(parents.sire).forEach(locus => {
    const s = parents.sire[locus], d = parents.dam[locus], combos = {};
    s.forEach(sa => {
      d.forEach(da => {
        const pair = [sa, da].sort().join('');
        combos[pair] = (combos[pair] || 0) + 1;
      });
    });
    Object.keys(combos).forEach(k => combos[k] /= 4);
    out[locus] = combos;
  });
  return out;
}

function resolvePhenotypes(punnett) {
  const loci = Object.keys(punnett);
  const options = loci.map(l => Object.entries(punnett[l]).map(([g, p]) => ({ l, g, p })));
  const combos = cartesian(options);
  const map = {};

  combos.forEach(combo => {
    const prob = combo.reduce((s, c) => s * c.p, 1);
    const geno = {};
    combo.forEach(c => geno[c.l] = c.g);
    const ph = determinePhenotype(geno);
    const key = `${ph.name}||${ph.genoStr}`;
    map[key] = (map[key] || 0) + prob;
  });

  return Object.entries(map).map(([k, v]) => {
    const [name, genoStr] = k.split('||');
    return { name, genoStr, prob: v };
  }).sort((a, b) => b.prob - a.prob);
}

function determinePhenotype(geno) {
  if (geno['E'] === 'ee') return { name: 'Recessive Yellow/Red', genoStr: formatGeno(geno) };

  const isLiver = geno['B'] === 'bb';
  const isBlue = geno['D'] === 'dd';
  const isIsabella = isLiver && isBlue;
  const hasKB = geno['K'].includes('KB');
  const aGeno = geno['A'];
  
  let aColor = 'Recessive Black';
  if (aGeno.includes('ay')) aColor = 'Sable/Fawn';
  else if (aGeno.includes('aw')) aColor = 'Wolf Grey';
  else if (aGeno.includes('at')) aColor = 'Black and Tan (Tri-colour)';
  else if (aGeno === 'aa') aColor = 'Recessive Black';

  let name = '';
  if (isIsabella) name = 'Isabella';
  else if (hasKB) {
    name = 'Dominant Black';
    if (isLiver) name = 'Liver (Dominant Black)';
    if (isBlue) name = 'Blue (Dominant Black)';
  } else {
    name = aColor;
    if (isLiver) name = `Liver ${name}`;
    if (isBlue) name = `Blue ${name}`;
  }

  if (geno['E'].includes('Em') && (aGeno.includes('ay') || aGeno.includes('aw') || aGeno.includes('at'))) {
    name += ' (with Mask)';
  }
  if (geno['S'] === 'spsp') name += ' (Intensive White)';

  return { name, genoStr: formatGeno(geno) };
}

function formatGeno(geno) {
  return Object.entries(geno).map(([l, g]) => g).join(' ');
}

function renderPredictions(items) {
  const area = document.getElementById('predictions-area');
  const count = document.getElementById('possibilities-count');
  area.innerHTML = '';
  count.textContent = `${items.length} possibilities`;

  items.forEach(it => {
    const div = document.createElement('div');
    div.className = 'prediction-item';
    div.innerHTML = `
      <div class="prediction-title">${it.name} — ${(it.prob * 100).toFixed(1)}%</div>
      <div class="prediction-genotype">${it.genoStr}</div>
    `;
    area.appendChild(div);
  });
}

function cartesian(arr) {
  return arr.reduce((acc, cur) => {
    const out = [];
    acc.forEach(a => cur.forEach(c => out.push(a.concat([c]))));
    return out;
  }, [[]]);
}

function drawPie(items) {
  const canvas = document.getElementById('pie');
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('pie-tooltip');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  let start = -0.5 * Math.PI;
  const cx = canvas.width / 2, cy = canvas.height / 2, r = 120;
  const slices = [];

  items.forEach((it, i) => {
    const sliceAngle = it.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + sliceAngle);
    ctx.fillStyle = `hsl(${i * 137.5}, 70%, 60%)`;
    ctx.fill();
    slices.push({ start, end: start + sliceAngle, name: it.name, prob: it.prob });
    start += sliceAngle;
  });

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const angle = Math.atan2(y, x);
    const normalizedAngle = angle < -0.5 * Math.PI ? angle + 2 * Math.PI : angle;

    const found = slices.find(s => normalizedAngle >= s.start && normalizedAngle <= s.end);
    if (found) {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top + 10}px`;
      tooltip.textContent = `${found.name} (${(found.prob * 100).toFixed(1)}%)`;
    } else {
      tooltip.style.display = 'none';
    }
  };
  canvas.onmouseleave = () => tooltip.style.display = 'none';
}

function clearPie() {
  const canvas = document.getElementById('pie');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('pie-tooltip').style.display = 'none';
}

function wireHelp() {
  const pop = document.getElementById('popover');
  document.querySelectorAll('.help').forEach(btn => {
    btn.addEventListener('mouseenter', e => {
      const locus = btn.getAttribute('data-locus');
      pop.textContent = data.loci[locus].description;
      const r = btn.getBoundingClientRect();
      pop.style.left = `${r.right + 10}px`;
      pop.style.top = `${r.top}px`;
      pop.style.display = 'block';
    });
    btn.addEventListener('mouseleave', () => pop.style.display = 'none');
  });
}
