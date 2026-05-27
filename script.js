/* script.js
 Loads data.json via fetch then initializes the app.
*/

(async () => {
  // load data.json
  let data;
  try {
    const resp = await fetch('data.json', {cache: 'no-store'});
    if (!resp.ok) throw new Error('Failed to load data.json: ' + resp.status);
    data = await resp.json();
  } catch (err) {
    document.body.innerHTML = '<pre style="color:#f88;padding:16px">Error loading data.json: '+err.message+'</pre>';
    console.error(err);
    return;
  }

  // --- begin original code, using `data` variable ---
  const lociOrder = ['K','E','A','B','D'];
  const alleleOptions = {
    K: ['Kb/Kb','Kb/ky','ky/ky'],
    E: ['E/E','E/e','e/e'],
    A: ['AY/AY','AY/AW','AW/AW','at/at','a/a','AW/at','AY/at','AY/a','AW/a','at/a'],
    B: ['B/B','B/b','b/b'],
    D: ['D/D','D/d','d/d']
  };

  function populateSelect(id, locus){
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    alleleOptions[locus].forEach(opt => {
      const o=document.createElement('option');
      o.value=opt;
      o.textContent=opt.replace('/',' / ');
      sel.appendChild(o);
    });
  }

  populateSelect('A_K','K'); populateSelect('B_K','K');
  populateSelect('A_E','E'); populateSelect('B_E','E');
  populateSelect('A_A','A'); populateSelect('B_A','A');
  populateSelect('A_B','B'); populateSelect('B_B','B');
  populateSelect('A_D','D'); populateSelect('B_D','D');

  function setDefaults(){
    document.getElementById('A_K').value='Kb/ky';
    document.getElementById('B_K').value='ky/ky';
    document.getElementById('A_E').value='E/e';
    document.getElementById('B_E').value='E/e';
    document.getElementById('A_A').value='AW/at';
    document.getElementById('B_A').value='AW/at';
    document.getElementById('A_B').value='B/b';
    document.getElementById('B_B').value='B/b';
    document.getElementById('A_D').value='D/d';
    document.getElementById('B_D').value='D/d';
  }
  setDefaults();

  function randomFill(){
    for(const p of ['A','B']){
      for(const locus of lociOrder){
        const sel = document.getElementById(`${p}_${locus}`);
        const opts = alleleOptions[locus];
        sel.value = opts[Math.floor(Math.random()*opts.length)];
      }
    }
  }

  function parsePair(s){
    return s.split('/').map(x=>x.trim());
  }

  function gametes(pair){
    const [a,b]=pair;
    if(a===b) return {[a]:1};
    return {[a]:0.5,[b]:0.5};
  }

  function crossGametes(g1,g2){
    const out = {};
    for(const a in g1){
      for(const b in g2){
        const prob = g1[a]*g2[b];
        const parts = [a,b].sort();
        const k2 = `${parts[0]}/${parts[1]}`;
        out[k2] = (out[k2]||0)+prob;
      }
    }
    return out;
  }

  function combineLoci(distMap){
    let combined = {'':1};
    for(const locus of lociOrder){
      const locusMap = distMap[locus];
      const next = {};
      for(const base in combined){
        for(const g in locusMap){
          const p = combined[base]*locusMap[g];
          const key = base ? (base + ' | ' + locus + ':' + g) : (locus + ':' + g);
          next[key] = (next[key]||0) + p;
        }
      }
      combined = next;
    }
    return combined;
  }

  function phenotypeFromFull(entry){
    const parts = entry.split(' | ').map(p=>p.trim());
    const map = {};
    parts.forEach(part=>{
      const [l,g]=part.split(':');
      map[l]=g;
    });
    function isHomo(locus,allele){
      const g = parsePair(map[locus]);
      return g[0]===allele && g[1]===allele;
    }
    function hasAllele(locus,allele){
      const g = parsePair(map[locus]);
      return g[0]===allele || g[1]===allele;
    }
    if(isHomo('E','e')){
      return {phen:'Recessive yellow (ee)', short:'ee; yellow', note:'ee overrides eumelanin'};
    }
    if(hasAllele('K','Kb')){
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown' : 'black';
      if(dilute) color = brown ? 'lilac (diluted brown)' : 'blue (diluted black)';
      return {phen:`Dominant black (${color})`, short:`Kb present; ${brown?'bb':''} ${dilute?'dd':''}`};
    }
    if(isHomo('A','AY') || hasAllele('A','AY')){
      return {phen:'Dominant yellow (AY)', short:'AY present'};
    }
    if(hasAllele('A','AW') && !hasAllele('A','at') && !hasAllele('A','a')){
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let base = 'agouti';
      let color = brown ? 'brown agouti' : 'agouti (black/tan shading)';
      if(dilute) color += ' (diluted)';
      return {phen:base + ' — ' + color, short:`A:AW; ${brown?'bb':''} ${dilute?'dd':''}`};
    }
    if(isHomo('A','at')){
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown and tan' : 'black and tan';
      if(dilute) color += ' (diluted)';
      return {phen:'Black and tan (at/at) — ' + color, short:'at/at'};
    }
    if(isHomo('A','a')){
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown (recessive black modified)' : 'recessive black';
      if(dilute) color += ' (diluted)';
      return {phen:'Recessive black (aa) — ' + color, short:'aa'};
    }
    const brown = isHomo('B','b');
    const dilute = isHomo('D','d');
    let color = brown ? 'brown agouti' : 'agouti/wild-type';
    if(dilute) color += ' (diluted)';
    return {phen:color, short:'default agouti/wild-type'};
  }

  function computeDistribution(){
    const locusDist = {};
    for(const locus of lociOrder){
      const pA = parsePair(document.getElementById('A_'+locus).value);
      const pB = parsePair(document.getElementById('B_'+locus).value);
      const g1 = gametes(pA);
      const g2 = gametes(pB);
      const cross = crossGametes(g1,g2);
      locusDist[locus] = cross;
    }
    const combined = combineLoci(locusDist);
    return combined;
  }

  function renderResults(){
    const out = document.getElementById('results');
    out.innerHTML = '<div class="small">Calculating...</div>';
    const combined = computeDistribution();
    const phenMap = {};
    for(const entry in combined){
      const prob = combined[entry];
      const ph = phenotypeFromFull(entry);
      const key = ph.phen;
      if(!phenMap[key]) phenMap[key]={prob:0, examples:[], note:ph.note||''};
      phenMap[key].prob += prob;
      if(phenMap[key].examples.length<3) phenMap[key].examples.push({gen:entry, short:ph.short});
    }
    const rows = Object.entries(phenMap).sort((a,b)=>b[1].prob - a[1].prob);
    if(rows.length===0){ out.innerHTML='<div class="small">No results</div>'; return; }
    out.innerHTML = '';
    rows.forEach(([phen,info])=>{
      const pct = (info.prob*100).toFixed(1);
      const div = document.createElement('div');
      div.className='result-item';
      div.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:12px;">
            <div>
              <div class="swatch" aria-hidden="true"></div>
            </div>
            <div>
              <div style="font-weight:600">${phen} — ${pct}%</div>
              <div class="genos">${info.examples.map(e=>e.short).join(' ; ')}</div>
            </div>
          </div>
        </div>
      `;
      out.appendChild(div);
    });
    const total = Object.values(combined).reduce((s,v)=>s+v,0);
    const check = document.createElement('div');
    check.className='small';
    check.style.marginTop='8px';
    check.textContent = `Total genotype probability: ${total.toFixed(4)} (should be 1.0000)`;
    out.appendChild(check);
  }

  document.getElementById('predictBtn').addEventListener('click', renderResults);
  document.getElementById('randomBtn').addEventListener('click', ()=>{ randomFill(); });
  document.getElementById('resetBtn').addEventListener('click', setDefaults);

  renderResults();
  // --- end original code ---
})();
