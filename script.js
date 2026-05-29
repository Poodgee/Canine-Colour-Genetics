// script.js
const DATA_URL = './data.json';
let data = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  buildParentsUI();
  buildLegend();
  wireButtons();
  wireHelp();
});

async function loadData(){
  const res = await fetch(DATA_URL);
  data = await res.json();
}

/* Alleles and display labels: use glyphs provided */
const lociOrder = ['E','K','A','B','D','G','I','S','T'];
// We'll show the loci you care about (E,K,A,B,D plus extras present in data.json)
function getAllelesFor(locus){
  // prefer data.json alleles if present, otherwise fallback to mapping from provided list
  return (data.loci && data.loci[locus] && data.loci[locus].alleles) || [];
}

/* Build two parent forms with two selects per locus */
function buildParentsUI(){
  const parents = ['sire','dam'];
  parents.forEach(parent => {
    const form = document.querySelector(`form[data-parent="${parent}"]`);
    form.innerHTML = '';
    // use top-level data.loci keys in original order if available
    const keys = data && data.loci ? Object.keys(data.loci) : lociOrder;
    keys.forEach(locus => {
      const row = document.createElement('div');
      row.className = 'locus-row';
      const lbl = document.createElement('label');
      lbl.htmlFor = `${parent}-${locus}-a1`;
      lbl.textContent = `${locus} Locus`;
      row.appendChild(lbl);

      // two selects (alleles) per parent/locus
      const s1 = document.createElement('select');
      s1.id = `${parent}-${locus}-a1`;
      const s2 = document.createElement('select');
      s2.id = `${parent}-${locus}-a2`;

      const alleles = getAllelesFor(locus);
      if (alleles.length){
        alleles.forEach(a=>{
          const opt1 = document.createElement('option');
          opt1.value = a.id;
          opt1.textContent = `${a.id}`;
          s1.appendChild(opt1);
          const opt2 = document.createElement('option');
          opt2.value = a.id;
          opt2.textContent = `${a.id}`;
          s2.appendChild(opt2);
        });
      } else {
        // fallback simple options
        ['A','a'].forEach(v=>{
          const o1 = document.createElement('option'); o1.value=v; o1.textContent=v; s1.appendChild(o1);
          const o2 = document.createElement('option'); o2.value=v; o2.textContent=v; s2.appendChild(o2);
        });
      }

      row.appendChild(s1);
      row.appendChild(s2);

      const help = document.createElement('button');
      help.type = 'button';
      help.className = 'help';
      help.setAttribute('data-locus', locus);
      help.textContent = '?';
      row.appendChild(help);

      form.appendChild(row);
    });
  });
}

/* Legend */
function buildLegend(){
  const table = document.getElementById('legend-table');
  table.innerHTML = '<tr><th>Allele</th><th>Meaning</th><th>Mode</th></tr>';
  Object.keys(data.loci).forEach(locus=>{
    data.loci[locus].alleles.forEach(a=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${a.id}</strong></td><td>${a.name || ''}</td><td>${a.mode || ''}</td>`;
      table.appendChild(tr);
    });
  });
}

/* Help popovers */
function wireHelp(){
  const pop = document.getElementById('popover');
  document.querySelectorAll('.help').forEach(btn=>{
    btn.addEventListener('mouseenter', e=>showPop(e.currentTarget));
    btn.addEventListener('focus', e=>showPop(e.currentTarget));
    btn.addEventListener('mouseleave', hidePop);
    btn.addEventListener('blur', hidePop);
    btn.addEventListener('click', e=>{
      if (pop.style.display === 'block') hidePop(); else showPop(e.currentTarget);
    });
  });

  function showPop(btn){
    const locus = btn.getAttribute('data-locus');
    const info = (data.loci && data.loci[locus] && (data.loci[locus].short || data.loci[locus].description)) || '';
    pop.textContent = info || `${locus} locus`;
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - 320, r.right + 8)}px`;
    pop.style.top = `${r.top}px`;
    pop.style.display = 'block';
    pop.setAttribute('aria-hidden','false');
  }
  function hidePop(){ pop.style.display='none'; pop.setAttribute('aria-hidden','true'); }
}

/* Buttons */
function wireButtons(){
  document.getElementById('predict-btn').addEventListener('click', predictHandler);
  document.getElementById('reset-btn').addEventListener('click', resetHandler);
}

function resetHandler(){
  // reset selects to first option
  document.querySelectorAll('select').forEach(s=>s.selectedIndex = 0);
  document.getElementById('predictions-area').innerHTML = '';
  clearPie();
}

/* PREDICTION FLOW */
function predictHandler(){
  const parents = readParents();
  const punnett = computePunnettParents(parents); // per locus genotype probabilities
  const phenos = resolvePhenotypes(punnett);
  renderPredictions(phenos);
  drawPie(phenos);
}

/* Read sire/dam selections */
function readParents(){
  const parents = {sire:{}, dam:{}};
  Object.keys(data.loci).forEach(locus=>{
    parents.sire[locus] = [
      document.getElementById(`sire-${locus}-a1`).value,
      document.getElementById(`sire-${locus}-a2`).value
    ];
    parents.dam[locus] = [
      document.getElementById(`dam-${locus}-a1`).value,
      document.getElementById(`dam-${locus}-a2`).value
    ];
  });
  return parents;
}

/* Compute Punnett for each locus crossing sire vs dam */
function computePunnettParents(parents){
  const out = {};
  Object.keys(parents.sire).forEach(locus=>{
    const sAlleles = parents.sire[locus];
    const dAlleles = parents.dam[locus];
    const combos = {};
    sAlleles.forEach(sa=>{
      dAlleles.forEach(da=>{
        // canonical genotype ordering: uppercase-first where relevant, otherwise alphabetical
        const pair = canonicalPair(sa, da);
        combos[pair] = (combos[pair] || 0) + 1;
      });
    });
    const total = Object.values(combos).reduce((s,v)=>s+v,0);
    Object.keys(combos).forEach(k=> combos[k] = combos[k]/total );
    out[locus] = combos;
  });
  return out;
}

function canonicalPair(a,b){
  // keep glyphs; simple ordering: if a===b return aa; else sort by string but prefer uppercase first
  if (a === b) return `${a}${a}`;
  // prefer uppercase-like (first char uppercase) before lowercase
  const aUpper = a[0] === a[0].toUpperCase();
  const bUpper = b[0] === b[0].toUpperCase();
  if (aUpper && !bUpper) return `${a}${b}`;
  if (!aUpper && bUpper) return `${b}${a}`;
  return [a,b].sort().join('');
}

/* Resolve phenotypes across loci by combining probabilities (cartesian product) */
function resolvePhenotypes(punnett){
  const loci = Object.keys(punnett);
  const perLocusOptions = loci.map(locus => {
    return Object.entries(punnett[locus]).map(([geno,prob])=>({locus,geno,prob}));
  });
  const combos = cartesian(perLocusOptions);
  const phenotypeMap = {};
  combos.forEach(combo=>{
    const prob = combo.reduce((s,c)=>s*c.prob,1);
    const genoObj = {};
    combo.forEach(c=> genoObj[c.locus] = c.geno );
    const ph = phenotypeFromGenotype(genoObj);
    const key = `${ph.name}||${ph.genotype}`; // unique key
    phenotypeMap[key] = (phenotypeMap[key] || 0) + prob;
  });
  // convert to array
  const arr = Object.entries(phenotypeMap).map(([k,v])=>{
    const [name,genotype] = k.split('||');
    return {name,genotype,prob: Math.round(v*1000)/1000};
  }).filter(x=>x.prob>0).sort((a,b)=>b.prob-a.prob);
  return arr;
}

function cartesian(arr){
  return arr.reduce((acc,cur)=>{
    const out = [];
    acc.forEach(a=> cur.forEach(c=> out.push(a.concat([c]))));
    return out;
  }, [[]]);
}

/* phenotypeFromGenotype applies your rules */
function phenotypeFromGenotype(geno){
  // geno: {E: 'EaEa', K:'Kᴮkʸ', A:'aʸa', B:'Bb', D:'Dd', ...}
  // helper: check allele presence
  function hasAllele(locus, allele){
    const g = (geno[locus]||'');
    return g.includes(allele);
  }
  function isHomo(locus, allele){
    const g = (geno[locus]||'');
    return g === `${allele}${allele}` || g === `${allele}${allele}`; // same form
  }

  // E locus first: Em > E > e ; ee => Recessive Yellow/Red (overrides)
  const Egeno = geno['E'] || '';
  if (Egeno === '') return {name:'Unknown', genotype: formatGenotype(geno)};
  if (Egeno.includes('e') && (Egeno === 'ee' || Egeno === 'ee' || Egeno.toLowerCase().includes('ee'))){
    return {name:'Recessive Yellow/Red', genotype: formatGenotype(geno)};
  }

  // K locus: Kᴮ > kʸ
  const Kgeno = geno['K'] || '';
  const hasKB = Kgeno.includes('Kᴮ') || Kgeno.includes('KB') || Kgeno.includes('Kᴮ');
  const hasky = Kgeno.includes('kʸ') || Kgeno.toLowerCase().includes('ky');

  // A locus priority: aʸ > aʷ > aᵗ > a
  const Ageno = geno['A'] || '';
  const aPriority = ['aʸ','aʷ','aᵗ','a'];
  let Acall = null;
  for (const a of aPriority) if (Ageno.includes(a)) { Acall = a; break; }

  // If KB present, A locus cannot display
  let aDisplays = true;
  if (hasKB) aDisplays = false;
  if (hasky) aDisplays = true; // ky allows A display

  // Em mask: if Em present and A is one of ay/aw/at we append Mask
  const EmPresent = Egeno.includes('Eᵐ') || Egeno.includes('Em');

  // B and D modifiers: bb + dd => isabella
  const Bgeno = geno['B'] || '';
  const Dgeno = geno['D'] || '';
  const isBB = Bgeno.includes('b') && !Bgeno.includes('B');
  const isDD = Dgeno.includes('d') && !Dgeno.includes('D');
  const isIsabella = isBB && isDD;

  // S locus intensive white: sᵖ sᵖ homozygous
  const Sgeno = geno['S'] || '';
  const intensiveWhite = Sgeno === 'sᵖsᵖ' || Sgeno === 'spsp' || (Sgeno.includes('sᵖ') && Sgeno.split('sᵖ').length-1 === 2);

  // Build phenotype name pieces
  const pieces = [];

  if (isIsabella) pieces.push('Isabella');
  else if (hasKB) pieces.push('Dominant Black (Kᴮ)');
  else if (hasky && Acall) pieces.push(`A locus ${Acall}`);
  else if (!hasKB && !hasky && Acall) pieces.push(`A locus ${Acall}`);

  if (EmPresent && Acall && ['aʸ','aʷ','aᵗ'].includes(Acall)) pieces.push('Mask');

  if (intensiveWhite) pieces.push('Intensive White');

  // fallback when nothing significant
  if (pieces.length === 0) pieces.push('Default');

  return { name: pieces.join(', '), genotype: formatGenotype(geno) };
}

/* Format genotype output using glyphs and spacing like "kyky EmEm" */
function formatGenotype(geno){
  // join locus genotype strings with spaces
  const order = Object.keys(data.loci);
  return order.map(l=> (geno[l] || '').replace(/(.{1,3})(.{1,3})/, (m)=>m) || '').join(' ');
}

/* Render predictions area */
function renderPredictions(items){
  const area = document.getElementById('predictions-area');
  area.innerHTML = '';
  if (!items.length){ area.textContent = 'No predictions'; return; }
  items.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'prediction-item';
    const title = document.createElement('div');
    title.className = 'prediction-title';
    title.textContent = `${it.name} — ${(it.prob*100).toFixed(1)}%`;
    const geno = document.createElement('div');
    geno.className = 'prediction-genotype';
    geno.textContent = it.genotype;
    div.appendChild(title);
    div.appendChild(geno);
    area.appendChild(div);
  });
}

/* Pie chart */
function drawPie(items){
  const canvas = document.getElementById('pie');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const total = items.reduce((s,i)=>s+i.prob,0);
  if (total === 0) return;
  let start = -0.5 * Math.PI;
  const cx = canvas.width/2, cy = canvas.height/2, r = Math.min(cx,cy)-12;
  items.forEach((it,i)=>{
    const slice = (it.prob/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+slice);
    ctx.closePath();
    ctx.fillStyle = colorFor(i);
    ctx.fill();
    start += slice;
  });
  // legend on canvas
  ctx.font = '12px Inter, sans-serif';
  let y = 14;
  items.forEach((it,i)=>{
    ctx.fillStyle = colorFor(i);
    ctx.fillRect(8,y-10,10,10);
    ctx.fillStyle = '#dfeef6';
    ctx.fillText(`${it.name} ${(it.prob*100).toFixed(1)}%`, 26, y);
    y += 16;
  });
}
function clearPie(){ const c=document.getElementById('pie'); c.getContext('2d').clearRect(0,0,c.width,c.height); }
function colorFor(i){ const p = ['#7c9eff','#4fd1c5','#ffb86b','#ff7b7b','#a3f3a3','#caa6ff']; return p[i%p.length]; }
