/* Mechanism diagrams. Only explicit controls compute or change local examples. */
(function () {
  'use strict';
  var E = Book.el, S = Book.sv, serial = 0;
  function svg(host, height, label) {
    var s = S('svg', {viewBox:'0 0 760 ' + height, role:'img', 'aria-label':label, class:'aq-svg'}, host);
    var id = 'aq-arrow-' + (++serial), d = S('defs', {}, s);
    var m = S('marker', {id:id, viewBox:'0 0 10 10', refX:9, refY:5, markerWidth:7, markerHeight:7, orient:'auto-start-reverse'}, d);
    S('path', {d:'M 0 0 L 10 5 L 0 10 z', fill:'var(--ink-3)'}, m);
    s._arrow = id; return s;
  }
  function txt(s,x,y,t,cls) { return S('text',{x:x,y:y,text:t,class:cls || 't-md'},s); }
  function box(s,y,title,detail,tone,x,width) {
    x = x == null ? 24 : x; width = width || 684;
    S('rect',{x:x,y:y,width:width,height:100,rx:12,class:'box '+(tone || '')},s);
    txt(s,x+20,y+39,title,'t-md t-b'); if(detail) txt(s,x+20,y+77,detail,'t-sm');
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
      S('rect',{x:20,y:y,width:650,height:154,rx:12,class:'box '+(r?'a':'')},s);
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
        var s=svg(out,650,'Ten sampled AUC pairs with clicked score, non-clicked score and pair credit.');txt(s,24,38,'Clicked score     Non-click score      Credit','t-sm t-b');
        pairs.forEach(function(p,i){txt(s,24,97+i*56,p[0].toFixed(4)+'                 '+p[1].toFixed(4)+'                 '+(p[2]===.5?'½ · tie':p[2]?'1 · correct':'0 · reversed'),'t-sm');});
        status.textContent=n+' pairs · sampled AUC '+(sum/n).toFixed(3)+' · full-log AUC '+data.full.toFixed(3)+' · Using '+data.source+'.';
      }catch(e){status.textContent='Could not sample pairs: '+e.message;}finally{btn.disabled=false;reset.disabled=false;}
    }
    var btn=button(controls,'Sample 10 pairs',sample),reset=button(controls,'Reset sample',function(){n=0;sum=0;data=null;rng=Book.rng(91);out.replaceChildren();status.textContent='Reset. The next sample reloads the current stack.';});
    status.textContent='Ready. Sampling uses observed click labels, not oracle probabilities.';
  }
  window.AQDiagrams={gsp:gsp};
  document.addEventListener('DOMContentLoaded',function(){errors();gradient();feedback();auc();});
})();
