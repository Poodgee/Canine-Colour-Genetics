/* script.js
 Implements Mendelian crosses for loci in data.json (embedded as <script type="application/json" id="datajson">).
 Produces genotype and phenotype probability breakdowns using the agreed rules.
*/

(() => {
  const data = JSON.parse(document.getElementById('datajson').textContent);

  const lociOrder = ['K','E','A','B','D'];
  // Map locus -> allele options to display (all possible diploid combos)
  const alleleOptions = {
    K: ['Kb/Kb','Kb/ky','ky/ky'],
    E: ['E/E','E/e','e/e'],
    A: ['AY/AY','AY/AW','AW/AW','at/at','a/a','AW/at','AY/at','AY/a','AW/a','at/a'],
    B: ['B/B','B/b','b/b'],
    D: ['D/D','D/d','d/d']
  };

  // Helper: populate selects
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

  // Fill all selects
  populateSelect('A_K','K'); populateSelect('B_K','K');
  populateSelect('A_E','E'); populateSelect('B_E','E');
  populateSelect('A_A','A'); populateSelect('B_A','A');
  populateSelect('A_B','B'); populateSelect('B_B','B');
  populateSelect('A_D','D'); populateSelect('B_D','D');

  // Defaults: set heterozygous-ish sensible defaults
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

  // Randomize
  function randomFill(){
    for(const p of ['A','B']){
      for(const locus of lociOrder){
        const sel = document.getElementById(`${p}_${locus}`);
        const opts = alleleOptions[locus];
        sel.value = opts[Math.floor(Math.random()*opts.length)];
      }
    }
  }

  // Parse allele pair string "A/B" -> [A,B]
  function parsePair(s){
    return s.split('/').map(x=>x.trim());
  }

  // Given parent allele pair for locus, return gametes probabilities (equal)
  // E.g., parent 'A/B' => gametes A (50%), B (50%); if homozygous A/A => A 100%
  function gametes(pair){
    const [a,b]=pair;
    if(a===b) return {[a]:1};
    return {[a]:0.5,[b]:0.5};
  }

  // Cross two gamete maps => offspring genotype map (normalized counts)
  function crossGametes(g1,g2){
    const out = {};
    for(const a in g1){
      for(const b in g2){
        const prob = g1[a]*g2[b];
        // canonical order: put known ordering for A locus for readability else alphabetical
        const key = `${a}/${b}`;
        // normalize allele order so e.g., A/B and B/A map same: sort by string
        const parts = [a,b].sort();
        const k2 = `${parts[0]}/${parts[1]}`;
        out[k2] = (out[k2]||0)+prob;
      }
    }
    return out;
  }

  // Combine per-locus genotype distributions into full-genotype distribution (product)
  function combineLoci(distMap){
    // distMap: { locus: {genotype:prob, ...}, ...}
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

  // Phenotype resolver: from a full genotype entry produce phenotype string and short genotype summary
  function phenotypeFromFull(entry){
    // entry is a string like "K:Kb/ky | E:E/e | A:AW/at | B:B/b | D:D/d"
    // parse into map
    const parts = entry.split(' | ').map(p=>p.trim());
    const map = {};
    parts.forEach(part=>{
      const [l,g]=part.split(':');
      map[l]=g;
    });

    // helper to check homozygous
    function isHomo(locus,allele){
      const g = parsePair(map[locus]);
      return g[0]===allele && g[1]===allele;
    }
    function hasAllele(locus,allele){
      const g = parsePair(map[locus]);
      return g[0]===allele || g[1]===allele;
    }

    // 1) E locus ee -> recessive yellow (regardless)
    if(isHomo('E','e')){
      return {phen:'Recessive yellow (ee)', short:'ee; yellow', note:'ee overrides eumelanin'};
    }

    // 2) K locus: if any Kb present -> dominant black
    if(hasAllele('K','Kb')){
      // dominant black phenotype; still modified by B and D (and A ignored)
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown' : 'black';
      if(dilute) color = brown ? 'lilac (diluted brown)' : 'blue (diluted black)';
      return {phen:`Dominant black (${color})`, short:`Kb present; ${brown?'bb':''} ${dilute?'dd':''}`};
    }

    // 3) kyky -> A locus expresses
    // A resolution order: AY > AW > at > aa
    if(isHomo('A','AY') || hasAllele('A','AY')){
      return {phen:'Dominant yellow (AY)', short:'AY present'};
    }
    // treat AW as wild-type if present and no AY
    if(hasAllele('A','AW') && !hasAllele('A','at') && !hasAllele('A','a')){
      // AW with B/D modifiers
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let base = 'agouti';
      let color = brown ? 'brown agouti' : 'agouti (black/tan shading)';
      if(dilute) color += ' (diluted)';
      return {phen:base + ' — ' + color, short:`A:AW; ${brown?'bb':''} ${dilute?'dd':''}`};
    }
    // at: black-and-tan — assume at must be at/at to show (recessive), otherwise treat AW dominance
    if(isHomo('A','at')){
      // black-and-tan expresses if A locus at/at and K is kyky and E not ee
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown and tan' : 'black and tan';
      if(dilute) color += ' (diluted)';
      return {phen:'Black and tan (at/at) — ' + color, short:'at/at'};
    }
    // aa recessive black requires aa
    if(isHomo('A','a')){
      const brown = isHomo('B','b');
      const dilute = isHomo('D','d');
      let color = brown ? 'brown (recessive black modified)' : 'recessive black';
      if(dilute) color += ' (diluted)';
      return {phen:'Recessive black (aa) — ' + color, short:'aa'};
    }

    // Fallback: treat as AW/agouti default
    const brown = isHomo('B','b');
    const dilute = isHomo('D','d');
    let color = brown ? 'brown agouti' : 'agouti/wild-type';
    if(dilute) color += ' (diluted)';
    return {phen:color, short:'default agouti/wild-type'};
  }

  // On Predict: for each locus create distribution map
  function computeDistribution(){
    const locusDist = {};
    for(const locus of lociOrder){
      const pA = parsePair(document.getElementById('A_'+locus).value);
      const pB = parsePair(document.getElementById('B_'+locus).value);
      const g1 = gametes(pA);
      const g2 = gametes(pB);
      const cross = crossGametes(g1,g2); // map genotype->prob
      locusDist[locus] = cross;
    }
    // Combine
    const combined = combineLoci(locusDist); // full genotype -> prob
    return combined;
  }

  // Render results
  function renderResults(){
    const out = document.getElementById('results');
    out.innerHTML = '<div class="small">Calculating...</div>';
    const combined = computeDistribution();
    // Map phenotype -> aggregated prob and sample genotype examples
    const phenMap = {};
    for(const entry in combined){
      const prob = combined[entry];
      const ph = phenotypeFromFull(entry);
      const key = ph.phen;
      if(!phenMap[key]) phenMap[key]={prob:0, examples:[], note:ph.note||''};
      phenMap[key].prob += prob;
      if(phenMap[key].examples.length<3) phenMap[key].examples.push({gen:entry, short:ph.short});
    }

    // Sort phenotypes by probability desc
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

    // also append a small legend / total check
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

  // initial render
  renderResults();

})();
