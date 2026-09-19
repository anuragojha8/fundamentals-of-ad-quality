/* Mechanism diagrams. Only explicit controls compute or change local examples. */
(function () {
  'use strict';
  var E = Book.el, S = Book.sv, serial = 0;
  function svg(host, height, label) {
    var s = S('svg', {viewBox:'0 0 760 ' + height, role:'img', 'aria-label':label, class:'aq-svg'}, host);
    var id = 'aq-arrow-' + (++serial), d = S('defs', {}, s);
    var m = S('marker', {id:id, viewBox:'0 0 10 10', refX:9, refY:5, markerWidth:7, markerHeight:7, orient:'auto-start-reverse'}, d);
    S('path', {d:'M 0 0 L 10 5 L 0 10 z', fill:'var(--ink-3)'}, m);
    ['', 'a', 'b', 'g', 'v'].forEach(function(tone) {
      var colors = {a:'accent',b:'blue',g:'green',v:'violet'}, color = colors[tone];
      var gradient = S('linearGradient', {id:id+'-wash-'+(tone||'base'), x1:'0%',y1:'0%',x2:'100%',y2:'100%'}, d);
      S('stop', {offset:'0%', 'stop-color':color?'var(--'+color+'-soft)':'var(--card)'}, gradient);
      S('stop', {offset:'100%', 'stop-color':'var(--card)'}, gradient);
      s.style.setProperty('--aq-fill-'+(tone||'base'), 'url(#'+id+'-wash-'+(tone||'base')+')');
    });
    s._arrow = id; return s;
  }
  function txt(s,x,y,t,cls) { return S('text',{x:x,y:y,text:t,class:cls || 't-md'},s); }
  function box(s,y,title,detail,tone,x,width) {
    x = x == null ? 24 : x; width = width || 684;
    S('rect',{x:x,y:y,width:width,height:100,rx:18,class:'box '+(tone || '')},s);
    S('rect',{x:x+1,y:y+21,width:4,height:58,rx:2,fill:'var(--'+({a:'accent',b:'blue',g:'green',v:'violet'}[tone]||'ink-3')+')'},s);
    txt(s,x+24,y+39,title,'t-md t-b'); if(detail) txt(s,x+24,y+77,detail,'t-sm');
  }
  function arrow(s,d) { S('path',{d:d,class:'arrow',style:'marker-end:url(#'+s._arrow+')'},s); }
  function down(s,y) { arrow(s,'M 366 '+y+' V '+(y+27)); }
  function stage(host,rows,label) {
    var s=svg(host,rows.length*140-12,label);
    rows.forEach(function(r,i){box(s,12+i*140,r[0],r[1],r[2]);if(i<rows.length-1)down(s,112+i*140);});return s;
  }
  function mount(id,title,caption,interactive) {
    var host=document.getElementById(id);if(!host)return null;
    host.className=interactive?'widget aq-diagram':'diagram aq-diagram';
    if(title)host.appendChild(E('div',{class:'w-title',text:title}));
    host.appendChild(E(interactive?'p':'figcaption',{class:'w-sub',text:caption}));return host;
  }
  function output(host) {var p=E('p',{class:'aq-status',role:'status','aria-live':'polite'});host.appendChild(p);return p;}
  function button(host,label,fn) {var b=E('button',{type:'button',class:'btn',text:label});b.addEventListener('click',fn);host.appendChild(b);return b;}
  function source(id) {return Stack.implSource(id)==='you'?'your '+id+'()':'reference '+id+'() (you have not built this slot yet)';}

  function gsp(host,ads,cands,res,rankBy) {
    var f=host.querySelector('.aq-gsp');if(!f){f=E('figure',{class:'diagram aq-diagram aq-gsp'});host.appendChild(f);}f.replaceChildren();
    var s=svg(f,890,'Five auction candidates in current rank order. Each winning price is set by the next candidate.');
    var max=Math.max.apply(null,cands.map(function(c){return c.score;}))||1;
    cands.forEach(function(c,k){
      var a=ads[c.i],y=12+k*173,r=res[c.i];
      S('rect',{x:20,y:y,width:650,height:154,rx:20,class:'box '+(r?'a':'')},s);
      S('rect',{x:40,y:y+87,width:590,height:9,rx:4,fill:'var(--rule)'},s);
      txt(s,40,y+36,a.name+' · '+(r?'slot '+(r.slot+1):'not shown'),'t-md t-b');
      txt(s,40,y+72,'$'+a.bid.toFixed(2)+' × '+a.pctr.toFixed(3)+' = $'+c.score.toFixed(4),'t-sm');
      S('rect',{x:40,y:y+87,width:590*c.score/max,height:9,rx:4,fill:'var(--accent)'},s);
      if(r){var n=cands[k+1];txt(s,40,y+134,rankBy==='bid'?'Next bid → $'+r.price.toFixed(2)+'/click':'$'+n.score.toFixed(4)+' ÷ '+a.pctr.toFixed(3)+' → $'+r.price.toFixed(2)+'/click','t-sm');
        arrow(s,'M 670 '+(y+173+40)+' H 726 V '+(y+124)+' H 674');}
    });
    f.appendChild(E('figcaption',{text:rankBy==='bid'?'Bid-only mode: rows follow bids; prices come from the next bid. Bars still show bid × pCTR. These are the editable example’s numbers.':'Edit the table and follow the arrows upward: the next ad sets the winner’s price. Bars show bid × pCTR in dollars per impression, not the platform’s collected revenue. No reserve in this example.'}));
  }
  function errors() {
    var h=mount('d-errors','Two ways to move the price','Hold the competing score at $0.03 and your bid at $2. The true CTR is 4%. These are conditional prices for a won slot; a lower prediction may instead make you lose.',false);if(!h)return;
    var s=svg(h,535,'Mirrored overprediction and underprediction paths meet at a mispriced impression, with the rival threshold held fixed.');
    [[24,'Overpredict','pCTR = 8%','Score = $0.16','CPC = $0.375','Spend = 1.5¢','a'],[400,'Underpredict','pCTR = 2%','Score = $0.04','CPC = $1.50','Spend = 6¢','b']].forEach(function(r){
      S('rect',{x:r[0],y:20,width:336,height:270,rx:12,class:'box '+r[6]},s);
      r.slice(1,6).forEach(function(t,i){txt(s,r[0]+18,66+i*46,t,i?'t-sm':'t-md t-b');});
    });
    arrow(s,'M 192 290 V 329 H 380 V 360');arrow(s,'M 568 290 V 329 H 380');
    box(s,370,'Somebody pays the wrong price.','At the true 4% CTR: CPC $0.75; spend 3¢.','v');
  }
  function gradient() {
    var h=mount('w-gradient-diagram','Anatomy of one gradient step','A local example with two active binary features, label y = 1, learning rate 0.1 and no L2 penalty. Take a step, inspect the arithmetic, then take another. Your saved model stays as it was.',true);if(!h)return;
    var controls=E('div',{class:'btn-row'}),out=E('div'),status;h.appendChild(controls);h.appendChild(out);status=output(h);
    var w,step=0;
    function draw(take){
      out.replaceChildren();var before=[w[1],w[3]],z=before[0]+before[1],p=Stack.sigmoid(z),g=p-1,ret;
      try{if(take){ret=Stack.impl('sgdStep')(w,Int32Array.of(1,3),1,0.1,0);step++;if(!Number.isFinite(ret)||!Number.isFinite(w[1])||!Number.isFinite(w[3]))throw Error('The step returned non-finite values. Reset and check your implementation.');}}
      catch(e){status.textContent=e.message;return;}
      var s=stage(out,[['1 · Active features: buckets 1 and 3','Before: w₁ = '+before[0].toFixed(4)+'; w₃ = '+before[1].toFixed(4),'b'],['2 · Add weights → logit z','z = '+before[0].toFixed(4)+' + '+before[1].toFixed(4)+' = '+z.toFixed(4),''],['3 · Sigmoid → probability','p = 1 / (1 + exp(−z)) = '+p.toFixed(4),'g'],['4 · Compare with the clicked label','Loss = −ln(p) = '+(-Math.log(p)).toFixed(4)+'; y = 1',''],['5 · Send the gradient backward','∂loss/∂z = p − y = '+g.toFixed(4),'v'],[take?'6 · Active weights after the step':'6 · Next update: w ← w − 0.1 × gradient',take?'w₁ = '+w[1].toFixed(4)+'; w₃ = '+w[3].toFixed(4):'Both active weights would move up by '+(-0.1*g).toFixed(4),'a']], 'One logistic regression training step from active features through log loss and its gradient back to the active weights.');
      arrow(s,'M 708 666 H 742 V 65 H 712');
      status.textContent='Step '+step+' · Using '+source('sgdStep')+(take?'. Returned pre-update p = '+ret.toFixed(4):'. Press Take one step to execute it.');
    }
    button(controls,'Take one step',function(){draw(true);});button(controls,'Reset / replay',function(){reset();});
    function reset(){w=new Float64Array(8);w[1]=0.5;w[3]=-0.25;step=0;draw(false);}reset();
  }
  function feedback() {
    var h=mount('w-feedback-diagram','The loop that keeps its own secrets','This switch changes the illustration, not your production exploration setting. Exploration gives eligible, previously overlooked ads a chance to supply labels; it does not guarantee a click.',true);if(!h)return;
    var label=E('label',{class:'aq-check'}),input=E('input',{type:'checkbox'});label.append(input,document.createTextNode(' Give overlooked ads a chance'));h.appendChild(label);var out=E('div');h.appendChild(out);
    function draw(){out.replaceChildren();var on=input.checked,s=stage(out,[['Show ads selected by the current policy','Selection decides which outcomes can be logged.','a'],['Log outcomes from shown ads','Clicks and non-clicks both become labels.','b'],['Train the next model','Learn from the examples the policy collected.','g'],[on?'Explore other eligible ads':'The missing arm: never shown',on?'Some receive exposure → observed outcomes.':'No exposure → no outcome label.','v']], 'Exposure produces logged labels that train the next selection model; exploration adds a path for overlooked eligible ads.');arrow(s,'M 708 343 H 742 V 60 H 714');if(on)arrow(s,'M 24 482 H 8 V 202 H 20');}
    input.addEventListener('change',draw);draw();
  }
  function auc() {
    var h=mount('w-auc-diagram','AUC, one pair at a time','Sample a clicked and a non-clicked row from your held-out logs. A higher clicked score earns 1; a tie earns ½. Ten pairs are a noisy estimate, not the full-data AUC.',true);if(!h)return;
    var controls=E('div',{class:'btn-row'}),out=E('div');h.append(controls,out);var status=output(h),rng=Book.rng(91),n=0,sum=0,data=null;
    async function sample(){btn.disabled=true;reset.disabled=true;status.textContent='Loading held-out outcomes and predictions…';
      try{
        if(!data){var log=await Stack.evalLog(),rows=Stack.labeledRows(log),model=Stack.getModel('lr'),p=model?Stack.lrPredictRows(model,rows):log.impressions.map(function(i){return Math.min(.99,i.pctr*Stack.world().cfg.examine[i.slot]);});
          var pos=[],neg=[];rows.forEach(function(r,i){(r.click?pos:neg).push(p[i]);});if(!pos.length||!neg.length)throw Error('AUC needs at least one clicked and one non-clicked row.');
          data={pos:pos,neg:neg,full:Stack.aucRef(p,rows.map(function(r){return r.click;})),source:model?'your saved LR predictions':'logged serving predictions (no saved LR model)'};
        }
        out.replaceChildren();var pairs=[];
        for(var i=0;i<10;i++){var a=data.pos[Math.floor(rng()*data.pos.length)],b=data.neg[Math.floor(rng()*data.neg.length)],v=a>b?1:a===b?.5:0;pairs.push([a,b,v]);sum+=v;n++;}
        var last=pairs[9],c=Book.chart(out,{w:760,h:240,x:[0,Math.max(.05,last[0],last[1])*1.15],y:[0,1],xticks:[0,Math.max(.05,last[0],last[1])],yticks:[.25,.75],yfmt:function(v){return v===.75?'clicked':'no click';},xfmt:function(v){return v.toFixed(3);},xlabel:'Prediction · latest pair',label:'Latest sampled clicked and non-clicked row on a prediction axis.',margin:{l:165,r:45,b:72,t:22}});
        c.dots([[last[0],.75,10,'var(--green)'],[last[1],.25,10,'var(--accent)']]);
        var s=svg(out,650,'Ten sampled AUC pairs with clicked score, non-clicked score and pair credit.');txt(s,24,38,'Clicked','t-sm t-b');txt(s,265,38,'Non-click','t-sm t-b');txt(s,505,38,'Credit','t-sm t-b');
        pairs.forEach(function(p,i){txt(s,24,97+i*56,p[0].toFixed(4),'t-sm');txt(s,265,97+i*56,p[1].toFixed(4),'t-sm');txt(s,505,97+i*56,p[2]===.5?'½ · tie':p[2]?'1 · correct':'0 · reversed','t-sm');});
        status.textContent=n+' pairs · sampled AUC '+(sum/n).toFixed(3)+' · full-log AUC '+data.full.toFixed(3)+' · Using '+data.source+'.';
      }catch(e){status.textContent='Could not sample pairs: '+e.message;}finally{btn.disabled=false;reset.disabled=false;}
    }
    var btn=button(controls,'Sample 10 pairs',sample),reset=button(controls,'Reset sample',function(){n=0;sum=0;data=null;rng=Book.rng(91);out.replaceChildren();status.textContent='Reset. The next sample reloads the current stack.';});
    document.addEventListener('stackchange',function(){data=null;n=0;sum=0;rng=Book.rng(91);out.replaceChildren();status.textContent='Stack changed. Sample again to use its current predictions.';});
    status.textContent='Ready. Sampling uses observed click labels, not oracle probabilities.';
  }
  function hashing() {
    var h=mount('w-hashing-diagram','Two features. One unfortunate address.','This uses the real feature hash and the table size in your stack. Different strings can land in the same bucket, which means they share a weight. The four boxes show a neighborhood, not the whole table.',true);if(!h)return;
    var label=E('label',{text:'Feature string'}),input=E('input',{type:'text',value:'hour=12',maxlength:'120'});label.appendChild(input);h.appendChild(label);
    var controls=E('div',{class:'btn-row'}),out=E('div');h.append(controls,out);var status=output(h),pair=null;
    function draw(){out.replaceChildren();var bits=Stack.state.settings.hashBits,feats=pair||[input.value],idx=Stack.hashFeatures(feats,bits),B=Math.pow(2,bits),s=svg(out,510,'Feature strings are hashed into a fixed-size table; a collision makes unrelated features share a weight.');
      box(s,12,feats[0].length>35?feats[0].slice(0,32)+'…':feats[0],pair?'Also: '+feats[1]:'String → unsigned FNV-1a hash','b');down(s,112);
      box(s,152,'FNV-1a = '+Stack.fnv1a(feats[0]),bits+' bits → '+B.toLocaleString()+' buckets','v');down(s,252);
      var start=Math.max(0,Math.min(B-4,idx[0]-1));
      for(var j=0;j<4;j++){var n=start+j,x=24+j*182;S('rect',{x:x,y:316,width:166,height:112,rx:10,class:'box '+(n===idx[0]?'a':'')},s);txt(s,x+12,357,'Bucket','t-sm');txt(s,x+12,402,String(n),'t-md t-b');}
      txt(s,24,483,pair?'Collision: both strings update bucket '+idx[0]: 'Selected weight: w['+idx[0]+']','t-sm');
      status.textContent=feats.join(' and ')+' → '+Array.from(idx).join(', ')+'. Using Stack.fnv1a and Stack.hashFeatures; '+bits+'-bit table from your settings.';
    }
    button(controls,'Show a collision',function(){var bits=Stack.state.settings.hashBits,seen=new Map(),found=null;for(var i=0;i<50000;i++){var f='feature='+i,b=Stack.hashFeatures([f],bits)[0];if(seen.has(b)){found=[seen.get(b),f];break;}seen.set(b,f);}if(found){pair=found;input.value=pair[0];draw();}else status.textContent='No collision found in this bounded search. Try a smaller table in your stack.';});
    input.addEventListener('input',function(){pair=null;draw();});document.addEventListener('stackchange',function(){pair=null;draw();});draw();
  }
  function timeline() {
    var h=mount('w-timeline-diagram','Same window. Different clocks.','Two illustrative users: each sees an impression 15 minutes before clicking at hour 0. One converts at hour 2; the other at hour 120. Move the post-click window. This changes the illustration; use the next widget to compare windows on your logs.',true);if(!h)return;
    var label=E('label',{text:'Attribution window: '}),range=E('input',{type:'range',min:'0',max:'168',step:'1',value:'24','aria-label':'Attribution window in hours'});label.appendChild(range);h.appendChild(label);var out=E('div');h.appendChild(out);var status=output(h);
    function draw(){var v=+range.value;out.replaceChildren();stage(out,[['Impression → click','−0.25 hours → hour 0 (both users)','b']], 'Both users see an impression a quarter hour before clicking at hour zero.');
      var c=Book.chart(out,{w:760,h:350,x:[-12,180],y:[0,1],xticks:[0,24,72,120,168],yticks:[.25,.75],yfmt:function(y){return y===.75?'fast':'slow';},xlabel:'Hours after click',label:'Attribution window shaded from click time to the selected cutoff; fast and slow conversion events shown on separate rows.',margin:{l:100,r:45,t:45,b:75}});
      c.rect(0,0,v,1,{fill:'var(--green)',opacity:.16});c.vline(0);c.vline(v,{color:'var(--accent)'});
      [[2,.75],[120,.25]].forEach(function(r){c.line([[0,r[1]],[168,r[1]]],{color:'var(--ink-3)',width:1});c.dots([[0,r[1],7,'var(--blue)'],[r[0],r[1],12,r[0]<=v?'var(--green)':'var(--accent)']]);});
      status.textContent='Window: '+v+' hours. Fast conversion at 2h: '+(v>=2?'counted':'outside')+'. Slow conversion at 120h: '+(v>=120?'counted':'outside')+'. Boundary rule: event time ≤ cutoff.';
    }range.addEventListener('input',draw);draw();
  }
  function worlds() {
    var h=mount('d-two-worlds','Two worlds, one causal question','Illustrative population expectations under random assignment: 10% convert with ads and 6% without. The 4 percentage-point difference is aggregate lift. We cannot point to a particular person and say the ad caused their purchase.',false);if(!h)return;
    var s=svg(h,490,'Ad-assigned and randomized holdout populations have conversion rates of ten and six percent, for four percentage points of aggregate lift.');
    [[24,'Ads assigned','10% convert','6% baseline','4 pp net lift','a'],[400,'Random holdout','6% convert','6% baseline','No campaign ads','b']].forEach(function(r){S('rect',{x:r[0],y:20,width:336,height:260,rx:12,class:'box '+r[5]},s);r.slice(1,5).forEach(function(t,i){txt(s,r[0]+18,65+i*55,t,i?'t-sm':'t-md t-b');});});
    arrow(s,'M 192 280 V 315 H 380 V 346');arrow(s,'M 568 280 V 315 H 380');box(s,355,'10% − 6% = 4 percentage points','40 extra conversions per 1,000 assigned users.','g');
    h.appendChild(E('p',{class:'w-sub',text:'The baseline-plus-lift split is an aggregate illustration. Identifying “would convert anyway” people requires unobservable potential outcomes; interpreting lift as a count helped also assumes no one is discouraged. Real estimates need uncertainty and checks for spillovers.'}));
  }
  function objective() {
    var h=mount('d-objective','Predictions inform the score. People set the policy.','A simplified CPC objective, with every term expressed in value per impression. A conversion goal replaces bidCPC × pCTR with targetCPA × pCTR × pCVR before controller adjustments. The score is not the clearing payment.',false);if(!h)return;
    stage(h,[['Advertiser term: bidCPC × pCTR','Bid: dollars/click. pCTR: model prediction.','b'],['Alternative: conversion bidding','Replace CPC term with CPA × pCTR × pCVR.','b'],['User cost: λ × c × pHide','pHide: prediction. λ and value scale c: policy.','v'],['Total score = advertiser term','+ user-value term − user-cost term','a'],['Ad load: how many slots may be filled','A policy constraint, outside the score formula.','g']], 'Predicted click, conversion and hide probabilities feed a value score; human policy sets tradeoff weights and the number of ad slots.');
  }
  function latency(host,segs,lat) {
    var f=E('figure',{class:'diagram aq-diagram aq-latency'});host.appendChild(f);
    f.appendChild(E('figcaption',{text:'The chapter’s full request has a 200 ms reference budget. This widget models selection with a 100 ms timeout budget. Colored segments below use this widget’s actual stage costs; the budget lines are references, not extra work.'}));
    var max=Math.max(220,lat*1.1),c=Book.chart(f,{w:760,h:270,x:[0,max],y:[0,1],xticks:[0,100,200],yticks:[],xlabel:'Milliseconds · current selection path',label:'Current selection stage latencies compared with the simulator’s 100 millisecond timeout budget and the chapter’s 200 millisecond full-request reference.',margin:{l:24,r:45,t:60,b:75}}),start=0;
    segs.forEach(function(s){c.rect(start,.25,start+s[1],.75,{fill:s[2]});start+=s[1];});c.vline(100,{color:'var(--accent)'});c.vline(200,{color:'var(--ink-3)'});
    c.text(100,.93,'100',{anchor:'middle',size:28});c.text(200,.93,'200',{anchor:'middle',size:28});
    var s=svg(f,210,'Current latency in milliseconds for fixed overhead, retrieval, early ranking and late ranking.');segs.forEach(function(r,i){txt(s,24,35+i*46,r[0]+': '+r[1].toFixed(1)+' ms','t-sm');});
    f.appendChild(E('p',{class:'w-sub',text:'Total selection latency: '+lat.toFixed(1)+' ms. Increasing candidates or late-ranker size changes these numbers and the timeout rate shown below.'}));
  }
  function levers() {
    var h=mount('d-levers','The decisions behind your dashboard','Use this map when a capstone metric moves. Pick the mechanism you suspect, then return to the chapter that lets you inspect it.',false);if(!h)return;
    var rows=[['Candidate eligibility','01-two-hundred-ms','Ch. 1 · who enters'],['Reserves and auction prices','02-auction','Ch. 2 · who wins and pays'],['Calibration and conversion bids','12-conversion-modeling','Ch. 3 + 12 · prediction scale'],['Exploration and retrieval','10-retrieval','Ch. 5 + 10 · who gets a chance'],['Model refresh','14-pretrain-train-refresh','Ch. 14 · what the model remembers'],['Hide penalty and ad load','15-beyond-the-click','Ch. 15 · cost to users']];
    var s=svg(h,rows.length*124,'Clickable capstone levers lead back to their mechanism chapters.');rows.forEach(function(r,i){var a=S('a',{href:r[1]+'.html','aria-label':r[0]+': '+r[2]},s);box(a,10+i*124,r[0],r[2],i%2?'b':'a');});
    h.appendChild(E('p',{class:'w-sub',text:'Pacing controls when an advertiser’s budget can be spent; revisit the capstone budget rules. For credible impact measurement, return to Chapters 9 and 16.'}));
  }
  function privacy() {
    var h=mount('w-privacy-diagram','Watch one reporting cell disappear','Illustrative cell: nine conversions for one advertiser on one day. Your reporting function applies the threshold; the diagram then adds a fixed Gaussian noise draw scaled by the noise dial. This does not establish differential privacy.',true);if(!h)return;
    var controls=E('div'),out=E('div');h.append(controls,out);var status=output(h),z=Book.rng(99).normal();
    var ctl=Book.controls(controls,[{key:'k',label:'Minimum conversions to publish',min:1,max:15,step:1,value:5},{key:'noise',label:'Noise standard deviation',min:0,max:6,step:.5,value:2}],draw);
    function draw(){if(!ctl)return;out.replaceChildren();var rows=Array.from({length:9},function(){return {adv:1,day:0,conv:1};}),report;
      try{report=Stack.impl('privacyReport')(rows,{k:ctl.values.k});}catch(e){status.textContent=e.message;return;}
      var count=report['1:0'],published=count==null?null:Math.max(0,Math.round(count+ctl.values.noise*z));
      stage(out,[['Input cell: 9 conversions','One advertiser × one day; illustrative counts.','b'],['Threshold: k = '+ctl.values.k,count==null?'Suppressed: no published cell.':'Passes: '+count+' conversions before noise.','v'],['Noise draw: '+(ctl.values.noise*z).toFixed(2),'Same random draw; change only its scale.',''],['Published result',published==null?'No value (not a reported zero).':String(published)+' conversions after rounding / clipping.','a']], 'A conversion count passes or fails a threshold, then receives scaled noise before publication.');
      status.textContent='Using '+source('privacyReport')+'. Published: '+(published==null?'suppressed':published)+'. No privacy budget, contribution bound or guarantee is modeled.';
    }draw();
  }
  function ann() {
    var h=mount('d-ann','Why retrieval gets to be fast','Two towers move ad-side work out of the request path. Approximate search visits part of an index and trades recall for speed; it does not promise a fixed millisecond latency. The book’s small corpus uses exact top-K.',false);if(!h)return;
    stage(h,[['Before the request: encode each ad','Store vectors in a versioned, refreshed index.','b'],['At request time: encode the user once','Search the index using dot-product similarity.','g'],['Retrieve K candidates → ranking','Measure both index recall and relevance recall.','a'],['Cross tower: combine each user–ad pair','A fresh joint forward pass for each candidate.','v'],['That cost grows with candidate count','Cache invariant work; reserve joint work for K.','']], 'Two-tower retrieval precomputes ad vectors and searches with one user vector, while cross-tower ranking performs joint work for each retained candidate.');
  }

  function animatedFunnel() {
    var h = mount('w-request-funnel', 'One request. Twelve hopeful ads.',
      'Follow the same ads through filtering, scoring and selection. This is a twelve-ad teaching example, not a sample of your saved stack. The animation slows the request down so you can see what changes.', true);
    if (!h) return;
    var candidates = [
      {id:'A',bid:2,p:.03}, {id:'B',bid:5,p:.01,reason:'Wrong country'},
      {id:'C',bid:1.5,p:.05}, {id:'D',bid:3,p:.012},
      {id:'E',bid:4,p:.04,reason:'Not running'}, {id:'F',bid:1,p:.09},
      {id:'G',bid:2.5,p:.02}, {id:'H',bid:2,p:.025,reason:'Budget spent'},
      {id:'I',bid:.8,p:.04}, {id:'J',bid:1.8,p:.025},
      {id:'K',bid:3,p:.06,reason:'Frequency cap'}, {id:'L',bid:1.2,p:.035}
    ];
    candidates.forEach(function(a){a.score=a.bid*a.p;});
    var eligible = candidates.filter(function(a){return !a.reason;}),
      excluded = candidates.filter(function(a){return !!a.reason;}),
      ranked = eligible.slice().sort(function(a,b){return b.score-a.score;});
    var descriptions = [
      'Start: twelve ads enter the example. A high bid alone cannot get an ad shown.',
      'Eligibility: B, E, H and K are filtered out. Eight remain. Targeting, campaign dates, budget and frequency caps are constraints, not model scores.',
      'Rank: the same eight eligible ads are ordered by bid × pCTR. No ad disappears at this step. F leads with $0.090 per impression, ahead of C and A.',
      'Select and serve: F, C and A fill the three slots. Five eligible ads lose this auction; four never qualified. The auction also sets prices, which Chapter 2 explains.'
    ];
    var controls=E('div',{class:'btn-row'});h.appendChild(controls);
    var play=button(controls,'Play request',start), pause=button(controls,'Pause',stop),
      next=button(controls,'Next stage',function(){stop();setStage(Math.min(3,current+1));}),
      reset=button(controls,'Reset',function(){stop();setStage(0);});
    var status=output(h);
    var s=svg(h,625,'Twelve illustrative ads pass through eligibility, ranking and selection. Start the animation or use Next stage to follow their identities.');
    var stages=[];
    ['All ads','Eligible','Ranked','Shown'].forEach(function(name,i){
      var x=20+i*186, g=S('g',{},s),y=20+i*8;
      var shape=S('rect',{x:x,y:20,width:160,height:140,rx:22,class:'box'},g);
      txt(g,x+80,68,name,'t-sm t-b').setAttribute('text-anchor','middle');
      var count=txt(g,x+80,124,String([12,8,8,3][i]),'aq-count t-b');count.setAttribute('text-anchor','middle');
      stages.push(shape);
      if(i<3)arrow(s,'M '+(x+164)+' 92 H '+(x+179));
    });
    var heading=txt(s,20,207,'12 candidates · before filtering','t-md t-b');
    var tiles=candidates.map(function(a){
      var g=S('g',{class:'aq-candidate'},s),rect=S('rect',{x:0,y:0,width:166,height:108,rx:18,class:'box'},g);
      var name=txt(g,14,35,'Ad '+a.id,'t-md t-b'),detail=txt(g,14,68,'$'+a.bid.toFixed(2)+'/click','t-sm'),note=txt(g,14,94,'pCTR '+(a.p*100).toFixed(1)+'%','t-sm');
      return {ad:a,g:g,rect:rect,name:name,detail:detail,note:note};
    });
    h.appendChild(E('p',{class:'w-sub',text:'Solid cards are still in contention; faded cards are out. Notice that ranking reorders the eight survivors—it does not shrink this candidate set. Your small stack scores every eligible ad; retrieval joins the funnel in Chapter 10.'}));
    var current=0,timer=null,running=false,reduced=matchMedia('(prefers-reduced-motion: reduce)'),narrow=matchMedia('(max-width: 600px)');
    function setStage(n){
      current=n;
      s.setAttribute('viewBox',narrow.matches?'0 0 760 1005':'0 0 760 625');
      var order=n===0?candidates:n===1?eligible.concat(excluded):ranked.concat(excluded);
      stages.forEach(function(shape,i){shape.setAttribute('class','box '+(i===n?(i===3?'g':'a'):i<n?'b':''));});
      heading.textContent=['12 candidates · before filtering','8 eligible · 4 filtered out','8 scored · highest bid × pCTR first','3 winners · ready for the feed'][n];
      tiles.forEach(function(t){
        var a=t.ad,k=order.indexOf(a),out=n>0&&a.reason,win=n===3&&!a.reason&&k<3,loser=n===3&&!a.reason&&k>=3;
        var cols=narrow.matches?2:4;
        t.rect.setAttribute('width',narrow.matches?352:166);
        t.g.style.transform='translate('+(20+(k%cols)*(narrow.matches?372:186))+'px,'+(232+Math.floor(k/cols)*128)+'px)';
        t.g.style.opacity=out||loser?'0.58':'1';
        t.rect.setAttribute('class','box '+(win?'g':n>=2&&!out?'b':''));
        t.name.textContent=win?'Slot '+(k+1)+' · '+a.id:'Ad '+a.id;
        t.detail.textContent=out?({B:'Country',E:'Inactive',H:'Budget',K:'Freq. cap'}[a.id]):n>=2?'$'+a.score.toFixed(3):'$'+a.bid.toFixed(2)+'/click';
        t.note.textContent=out?'Filtered out':loser?'Not selected':n>=2?'bid × pCTR':'pCTR '+(a.p*100).toFixed(1)+'%';
      });
      status.textContent=descriptions[n];s.setAttribute('aria-label',descriptions[n]);
      next.disabled=n===3;pause.disabled=!running;
      play.textContent=reduced.matches?'Show result':n===3?'Replay request':n===0?'Play request':'Continue request';play.disabled=running;
    }
    function stop(){clearTimeout(timer);timer=null;running=false;pause.disabled=true;play.disabled=false;}
    function advance(){if(!running)return;setStage(current+1);if(current===3){stop();setStage(3);}else timer=setTimeout(advance,1700);}
    function start(){
      stop();if(reduced.matches){setStage(3);return;}
      if(current===3)setStage(0);
      running=true;play.disabled=true;pause.disabled=false;timer=setTimeout(advance,current===0?900:300);
    }
    narrow.addEventListener('change',function(){setStage(current);});
    reduced.addEventListener('change',function(){stop();setStage(current);});
    document.addEventListener('visibilitychange',function(){if(document.hidden)stop();});
    setStage(0);
  }

  window.AQDiagrams={gsp:gsp,latency:latency};
  document.addEventListener('DOMContentLoaded',function(){errors();gradient();feedback();auc();hashing();timeline();worlds();objective();levers();privacy();ann();animatedFunnel();});
})();
