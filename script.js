// script.js
// Assumes data.json is at the same root and structured as before.

const DATA_URL = './data.json';
let data = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  buildUI();
  wireButtons();
});

async function loadData(){
  const res = await fetch(DATA_URL);
  data = await res.json();
}

function buildUI(){
  // populate selects for each locus
  const loci = ['E','K','A','B','D'];
  loci.forEach(locus => {
    const alleles = data.loci[locus].alleles;
    const s1 = document.getElementById(`${locus}1`);
    const s2 = document.getElementById(`${locus}2`);
    fillSelect(s1, alleles);
    fillSelect(s2, alleles);
  });

  buildLegend();
  wireHelpButtons();
  // set defaults if present in data
  if (data.defaults){
    Object.entries(data.defaults).forEach(([k,v])=>{
      const el = document.getElementById(k);
      if (el) el.value = v;
    });
  }
}

function fillSelect(select, alleles){
  select.innerHTML = '';
  alleles.forEach(a=>{
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.id} — ${a.name}`;
    select.appendChild(opt);
  });
}

function buildLegend(){
  const table = document.getElementById('legend-table');
  table.innerHTML = '<tr><th>Allele</th><th>Meaning</th><th>Mode</th></tr>';
  Object.keys(data.loci).forEach(locus=>{
    data.loci[locus].alleles.forEach(a=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${a.id}</strong></td><td>${a.name}</td><td>${a.mode || ''}</td>`;
      table.appendChild(tr);
    });
  });
}

function wireHelpButtons(){
  const pop = document.getElementById('popover');
  document.querySelectorAll('.help').forEach(btn=>{
    btn.addEventListener('mouseenter', e=>showPopover(e.currentTarget));
    btn.addEventListener('focus', e=>showPopover(e.currentTarget));
    btn.addEventListener('mouseleave', hidePopover);
    btn.addEventListener('blur', hidePopover);
    btn.addEventListener('click', e=>{
      // toggle on click for touch users
      if (pop.style.display === 'block') hidePopover();
      else showPopover(e.currentTarget);
    });
  });
}

function showPopover(btn){
  const locus = btn.getAttribute('data-locus');
  const pop = document.getElementById('popover');
  const info = data.loci[locus].short || data.loci[locus].description || 'No info';
  pop.textContent = info;
  const rect = btn.getBoundingClientRect();
  pop.style.left = `${rect.right + 10}px`;
  pop.style.top = `${rect.top}px`;
  pop.style.display = 'block';
  pop.setAttribute('aria-hidden','false');
}

function hidePopover(){
  const pop = document.getElementById('popover');
  pop.style.display = 'none';
  pop.setAttribute('aria-hidden','true');
}

function wireButtons(){
  document.getElementById('predict-btn').addEventListener('click', predictHandler);
  document.getElementById('reset-btn').addEventListener('click', resetHandler);
}

function resetHandler(){
  const form = document.getElementById('loci-form');
  form.reset();
  // reapply any data.defaults if present
  if (data.defaults){
    Object.entries(data.defaults).forEach(([k,v])=>{
      const el = document.getElementById(k);
      if (el) el.value = v;
    });
  }
  clearResults();
}

function clearResults(){
  document.getElementById('results').innerHTML = '';
  const ctx = document.getElementById('pie').getContext('2d');
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
}

function predictHandler(){
  const parents = readForm();
  const punnett = computePunnett(parents);
  const phenos = resolvePhenotypes(punnett);
  renderResults(phenos);
  drawPie(phenos);
}

/* read current form selections into object */
function readForm(){
  const loci = ['E','K','A','B','D'];
  const out = {};
  loci.forEach(locus=>{
    out[locus] = [
      document.getElementById(`${locus}1`).value,
      document.getElementById(`${locus}2`).value
    ];
  });
  return out;
}

/* compute simple Mendelian 2x2 cross for each locus returning genotype distribution */
function computePunnett(parents){
  // For each locus, get gametes from parent alleles (both parents are represented by the two selects).
  // We assume the form shows one individual's genotype (two alleles) and we cross two identical parents for simplicity.
  // If you previously used different assumption, adjust here. We will cross the same genotype with itself (self-cross).
  const out = {};
  for (const locus in parents){
    const [a,b] = parents[locus];
    const gametes = [[a],[b]]; // parent gametes
    const combos = {};
    for (const g1 of gametes){
      for (const g2 of gametes){
        const pair = [g1[0], g2[0]].sort().join('/');
        combos[pair] = (combos[pair] || 0) + 1;
      }
    }
    // normalize to probabilities
    const total = Object.values(combos).reduce((s,v)=>s+v,0);
    Object.entries(combos).forEach(([k,v])=>{
      combos[k] = v/total;
    });
    out[locus] = combos;
  }
  return out;
}

/* Resolve phenotype probabilities combining locus effects.
   This function uses the same rule hierarchy you had:
   - E: ee overrides masking (if ee then yellow regardless of K/A)
   - K: Kb dominant black etc (use data.assumptions for priority)
   - A: AY > AW > at > a, with at/aa treated recessive
   - B, D: bb and dd affect eumelanin color and dilution
*/
function resolvePhenotypes(punnett){
  // We'll generate all genotype combinations by multiplying probabilities across loci.
  const loci = Object.keys(punnett);
  // convert locus genotype maps to arrays
  const locusOptions = loci.map(locus => {
    return Object.entries(punnett[locus]).map(([geno,prob])=>({locus,geno,prob}));
  });

  // cartesian product
  const combos = cartesian(locusOptions);
  const phenotypeMap = {};

  combos.forEach(combo => {
    const p = combo.reduce((s,x)=>s * x.prob, 1);
    const geno = {};
    combo.forEach(c=>{
      geno[c.locus] = c.geno; // like "AY/at"
    });

    const pheno = determinePhenotypeFromGenotype(geno);
    phenotypeMap[pheno] = (phenotypeMap[pheno] || 0) + p;
  });

  // round small float jitter and sort
  Object.keys(phenotypeMap).forEach(k=>{
    phenotypeMap[k] = Math.round(phenotypeMap[k]*1000)/1000;
  });

  // remove zeroes and sort descending
  const items = Object.entries(phenotypeMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  return items.map(([name,prob])=>({name,prob}));
}

function cartesian(arrays){
  return arrays.reduce((acc,cur)=>{
    const out = [];
    acc.forEach(a=>{
      cur.forEach(c=>{
        out.push(a.concat([c]));
      });
    });
    return out;
  }, [[]]);
}

/* determine phenotype name from genotype object.
   This uses data.assumptions and locus allele ids to decide.
*/
function determinePhenotypeFromGenotype(geno){
  // E locus: if either genotype is "e/e" or an ee genotype present -> recessive yellow
  const Egeno = geno['E'] || '';
  const isEE = Egeno.split('/').every(x => x.toLowerCase() === 'ee' || x.toLowerCase().includes('e'));
  if (isEE || Egeno.toLowerCase().includes('ee')) {
    return 'Yellow (ee)';
  }

  // K locus preference (data.assumptions.kPriority is expected like ['Kb','kbr','ky'])
  const Kgeno = geno['K'] || '';
  const Kalleles = Kgeno.split('/');
  const kPriority = data.assumptions?.kPriority || [];
  for (const k of kPriority){
    if (Kalleles.includes(k)) return `K:${k}`; // shorthand label
  }

  // A locus: evaluate AY > AW > at > a
  const Ageno = geno['A'] || '';
  const Aalleles = Ageno.split('/');
  const aOrder = data.assumptions?.aPriority || [];
  for (const a of aOrder){
    if (Aalleles.includes(a)) return `A:${a}`;
  }

  // B and D modifiers appended
  const Bgeno = geno['B'] || '';
  const Dgeno = geno['D'] || '';
  const bIsBB = !Bgeno.includes('bb') && !Bgeno.toLowerCase().includes('bb');
  const dDilute = Dgeno.toLowerCase().includes('dd');

  let base = 'Default';
  // combine into a readable name
  let modifiers = [];
  if (Bgeno.includes('bb') || Bgeno.toLowerCase().includes('bb')) modifiers.push('brown (bb)');
  if (dDilute) modifiers.push('dilute (dd)');

  if (modifiers.length) base += ' — ' + modifiers.join(', ');
  return base;
}

function renderResults(phenos){
  const div = document.getElementById('results');
  if (!phenos.length){
    div.textContent = 'No results';
    return;
  }
  div.innerHTML = '';
  const ul = document.createElement('ul');
  phenos.forEach(p=>{
    const li = document.createElement('li');
    li.textContent = `${p.name}: ${(p.prob*100).toFixed(1)}%`;
    ul.appendChild(li);
  });
  div.appendChild(ul);
}

function drawPie(phenos){
  const canvas = document.getElementById('pie');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const total = phenos.reduce((s,p)=>s+p.prob,0);
  let start = -0.5 * Math.PI;
  const cx = canvas.width/2;
  const cy = canvas.height/2;
  const radius = Math.min(cx,cy) - 10;

  phenos.forEach((p, i) => {
    const slice = (p.prob/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,radius,start,start+slice);
    start += slice;
    ctx.closePath();
    ctx.fillStyle = colorForIndex(i);
    ctx.fill();
  });

  // legend small
  ctx.font = '12px Inter, sans-serif';
  let y = 12;
  phenos.forEach((p,i)=>{
    ctx.fillStyle = colorForIndex(i);
    ctx.fillRect(8,y-10,10,10);
    ctx.fillStyle = '#dfeef6';
    ctx.fillText(`${p.name} ${(p.prob*100).toFixed(1)}%`, 26, y);
    y += 18;
  });
}

function colorForIndex(i){
  const palette = ['#7c9eff','#4fd1c5','#ffb86b','#ff7b7b','#a3f3a3','#caa6ff','#ffd6e0'];
  return palette[i % palette.length];
}
