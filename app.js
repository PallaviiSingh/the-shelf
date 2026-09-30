/* ============================================================
   The Shelf  ·  app logic
   ============================================================ */
(function(){
"use strict";
const LIB = window.LIBRARY;
const BOOKS = LIB.books.slice();
const AUTHORS = LIB.authors;
const MOODS = LIB.taxonomies.moods;
const GENRES = LIB.taxonomies.genres;
const FACETS = LIB.taxonomies.facets;

const bySlug = {}; BOOKS.forEach(b=>bySlug[b.slug]=b);
const moodMap = {}; MOODS.forEach(m=>moodMap[m.slug]=m);
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const overlayPanel = document.getElementById('overlayPanel');

/* ---------------- personal store ---------------- */
const KEY='pallavi-bookshelf-v1';
let STORE={};
try{ STORE=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ STORE={}; }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(STORE)); }catch(e){} }
function P(slug){
  if(!STORE[slug]) STORE[slug]={status:'unread',page:0,pages:0,progMode:'page',chapter:0,chapters:0,rating:0,quotes:[],facts:[],review:'',started:null,finished:null};
  return STORE[slug];
}
function setP(slug,patch){ Object.assign(P(slug),patch); save(); }

/* ---------------- color utils ---------------- */
function hexRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
function lum(h){const {r,g,b}=hexRgb(h);const a=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*a[0]+.7152*a[1]+.0722*a[2];}
function textOn(h){return lum(h)>.42?'#241f1b':'#f6ecda';}
function mix(h,t,amt){const a=hexRgb(h),b=hexRgb(t);const r=Math.round(a.r+(b.r-a.r)*amt),g=Math.round(a.g+(b.g-a.g)*amt),bl=Math.round(a.b+(b.b-a.b)*amt);return '#'+[r,g,bl].map(x=>x.toString(16).padStart(2,'0')).join('');}
const dark=(h,a=.35)=>mix(h,'#000000',a);
const light=(h,a=.35)=>mix(h,'#ffffff',a);
function clampMap(v,inMin,inMax,outMin,outMax){const t=Math.max(0,Math.min(1,(v-inMin)/(inMax-inMin)));return outMin+t*(outMax-outMin);}
function hsl(hex){const {r,g,b}=hexRgb(hex);const R=r/255,G=g/255,B=b/255;const mx=Math.max(R,G,B),mn=Math.min(R,G,B),d=mx-mn;let h=0;if(d){if(mx===R)h=((G-B)/d)%6;else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;if(h<0)h+=360;}return {h,s:mx?d/mx:0,l:(mx+mn)/2};}
// arrange covers into a pleasing colour flow: colourful books by hue, near-neutrals (by lightness) tucked at the end
function arrangeByColour(list){
  return list.slice().sort((a,b)=>{
    const ca=hsl(a.cover.dominantColor||'#888888'),cb=hsl(b.cover.dominantColor||'#888888');
    const na=ca.s<0.16,nb=cb.s<0.16;
    if(na!==nb)return na?1:-1;
    if(na&&nb)return cb.l-ca.l;
    return ca.h-cb.h;
  });
}

const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CB=(LIB&&LIB.version)?('?v='+LIB.version):'';           // cache-bust images when the bundle is rebuilt
const imgsrc=p=>!p?'':(/^(data:|blob:)/.test(p)?p:esc(p)+CB);
// each cover keeps its own natural proportions (never cropped to a uniform box)
const REF_AR=2/3;
const coverAR=c=>{const r=(c&&c.w&&c.h)?(c.w/c.h):REF_AR;return (r>0.35&&r<2.6)?r:REF_AR;};
const coverFH=c=>Math.max(0.72,Math.min(1.42,Math.sqrt(REF_AR/coverAR(c)))); // shelf height multiplier (equal-area feel)
const authorName=slug=>(slug&&AUTHORS[slug]&&AUTHORS[slug].name)||slug||'';
const yearLabel=y=>(y==null||y===0)?'':(y<0?(Math.abs(y)+' BCE'):String(y));
const statusColor={unread:'#9c8e79',reading:'#b8933f',read:'#2f4a3a',dnf:'#7c2b2b'};
const statusLabel={unread:'Want to read',reading:'Reading',read:'Read',dnf:'Set aside'};

function pct(p){
  if(p.status==='read')return 100;
  if(p.progMode==='chapter'){if(!p.chapter||!p.chapters)return 0;return Math.max(0,Math.min(100,Math.round(p.chapter/p.chapters*100)));}
  if(!p.page||!p.pages)return 0;return Math.max(0,Math.min(100,Math.round(p.page/p.pages*100)));
}

/* ---------------- toast ---------------- */
let toastEl;
function toast(msg){
  if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';document.body.appendChild(toastEl);}
  toastEl.textContent=msg;toastEl.classList.add('show');
  clearTimeout(toastEl._t);toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),2200);
}

/* ============================================================
   SHELF VIEW
   ============================================================ */
function renderShelf(){
  const fairy=(n)=>{
    const cols=['#ffd98a','#ffbf66','#fff1cf','#ffc98c'];
    let pts=[],bulbs='';
    for(let i=0;i<=n;i++){const x=i/n*100;const y=8+Math.sin(i*0.85)*6;pts.push(`${i===0?'M':'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);}
    for(let i=0;i<n;i++){const x=(i+0.5)/n*100;const y=8+Math.sin((i+0.5)*0.85)*6;const dur=(2.2+Math.random()*2.3).toFixed(2),del=(Math.random()*3.2).toFixed(2);bulbs+=`<span class="bulb" style="left:${x}%;top:${y.toFixed(1)}px;--gc:${cols[i%cols.length]};--tw:${dur}s;--twd:${del}s"></span>`;}
    return `<div class="fairy"><svg class="wire" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${pts.join(' ')}" fill="none" stroke="rgba(25,16,8,.6)" stroke-width="0.7" vector-effect="non-scaling-stroke"/></svg>${bulbs}</div>`;
  };
  function updateShelf(){
    const box=document.getElementById('shelfResults');const rc=document.getElementById('resultCount');
    const allowed=new Set(applyFilters(BOOKS.slice()).map(b=>b.slug));
    if(rc)rc.textContent=allowed.size+(allowed.size===1?' book':' books');
    // responsive layout metrics (recomputed each render; a window resize re-renders)
    const iw=window.innerWidth||1200;
    const perRow=iw>1000?5:(iw>640?4:3);        // max books on one plank
    const pad=Math.max(16,Math.min(48,0.04*iw));
    const gap=Math.max(12,Math.min(20,0.016*iw));
    const rowW=Math.min(1180,iw)-2*pad-2;
    const fchBase=Math.max(150,Math.min(236,0.19*iw));
    const face=(b,w,h)=>{
      const p=P(b.slug),pr=pct(p);
      return `<div class="facecover${b.cover&&b.cover.alpha?' cut':''}" data-slug="${b.slug}" style="width:${w}px;height:${h}px" title="${esc(b.title)} — ${esc(authorName(b.authors[0]))}">
        <img loading="lazy" src="${imgsrc(b.cover.file)}" alt="${esc(b.title)}">
        ${p.status==='read'?'<span class="fc-badge">✓</span>':''}
        ${p.status==='reading'&&pr>0?`<span class="fc-prog"><i style="width:${pr}%"></i></span>`:''}
      </div>`;
    };
    // each book keeps its own proportions; a full row scales down together only if it would overflow
    const layout=(books)=>{
      const items=books.map(b=>{const ar=coverAR(b.cover),fh=coverFH(b.cover);const h=fchBase*fh;return {b,w:h*ar,h};});
      const total=items.reduce((s,i)=>s+i.w,0)+Math.max(0,items.length-1)*gap;
      const k=total>rowW?rowW/total:1;
      return items.map(i=>({b:i.b,w:Math.max(1,Math.round(i.w*k)),h:Math.max(1,Math.round(i.h*k))}));
    };
    // one named shelf → caption + as many plank rows as needed (max `perRow` books each), no scrolling
    const shelfUnit=(slugs,caption)=>{
      let rows='';
      for(let i=0;i<slugs.length;){
        // never leave a lonely single book on its own plank: if exactly one would spill over,
        // make this the last row and put perRow+1 (e.g. 6) on it instead
        const take=(slugs.length-i===perRow+1)?perRow+1:perRow;
        const chunk=slugs.slice(i,i+take).map(s=>bySlug[s]).filter(Boolean);
        i+=take;
        if(!chunk.length) continue;
        const laid=layout(chunk);
        rows+=`<div class="shelf-row"><div class="shelf-books">${laid.map(x=>face(x.b,x.w,x.h)).join('')}</div>${fairy(20)}<div class="shelf-plank"></div></div>`;
      }
      return `<div class="shelf-unit">${caption?`<div class="shelf-caption">${esc(caption)}</div>`:''}<div class="shelf-rows">${rows}</div></div>`;
    };
    const org=LIB.organization||[]; let html=''; const navOrderList=[];
    const active = activeFilterCount()>0 || (gState.q && gState.q.trim());
    if(active){
      // filtered/searching: no subject or shelf headings — just the matching books, flowing 5 per shelf
      const seen=new Set(); const flat=[];
      for(const subj of org) for(const sh of subj.shelves) for(const s of (sh.books||[]))
        if(bySlug[s]&&allowed.has(s)&&!seen.has(s)){seen.add(s);flat.push(s);}
      [...allowed].forEach(s=>{if(bySlug[s]&&!seen.has(s)){seen.add(s);flat.push(s);}});
      navOrderList.push(...flat);
      if(flat.length) html=`<section class="subject"><div class="subject-shelves">${shelfUnit(flat,'')}</div></section>`;
    } else {
      // default: curated subject groups with headings + shelf captions
      const placed=new Set();
      for(const subj of org){
        let shelves='';
        for(const sh of subj.shelves){
          const bs=sh.books.filter(s=>bySlug[s]&&allowed.has(s));
          bs.forEach(s=>placed.add(s));
          if(bs.length){shelves+=shelfUnit(bs,sh.name);navOrderList.push(...bs);}
        }
        if(shelves) html+=`<section class="subject"><h2 class="subject-title">${esc(subj.subject)}</h2><div class="subject-shelves">${shelves}</div></section>`;
      }
      const leftovers=[...allowed].filter(s=>!placed.has(s)&&bySlug[s]);
      if(leftovers.length){
        navOrderList.push(...leftovers);
        html+=`<section class="subject"><h2 class="subject-title">Also on the shelf</h2><div class="subject-shelves">${shelfUnit(leftovers,'')}</div></section>`;
      }
    }
    window.__navOrder=navOrderList;   // prev/next in the book view follows this exact on-screen order
    if(!html){
      box.innerHTML=`<p class="empty-note" style="text-align:center;padding:60px 20px">Nothing on the shelf matches those filters. <span style="text-decoration:underline;cursor:pointer" id="reset">Clear them</span>.</p>`;
      const r=document.getElementById('reset');if(r)r.onclick=()=>{['subject','genre','mood','diff','era','series','author'].forEach(k=>gState[k].clear());gState.q='';renderShelf();};
      renderChips();return;
    }
    box.innerHTML=html;
    box.querySelectorAll('.facecover').forEach(el=>el.onclick=()=>location.hash='#/book/'+el.dataset.slug);
    if(!window.__shelfResizeHooked){window.__shelfResizeHooked=true;let t;window.addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(()=>{if(typeof refreshView==='function')refreshView();},220);});}
    renderChips();
  }
  const reading=Object.keys(STORE).filter(s=>bySlug[s]&&STORE[s].status==='reading').map(s=>bySlug[s]);
  const continueHTML=reading.length?`<div class="continue">Continue reading: ${reading.slice(0,3).map(x=>`<a href="#/book/${x.slug}">${esc(x.title)} <b>${pct(P(x.slug))}%</b></a>`).join('<span class="sep">·</span>')}</div>`:'';
  app.innerHTML=`
  <section class="shelf-hero">
    <div class="wrap shelf-top">${statsBar()}${continueHTML}${toolbarMarkup({showSort:false})}<div id="resultCount" class="result-count"></div></div>
    <div class="shelf-stage">
      <div id="shelfResults"></div>
      <div class="shelf-hint">hover to lift · click to open</div>
    </div>
  </section>`;
  refreshView=updateShelf;
  wireToolbar({showSort:false});
  updateShelf();
  animateStats();
}

/* ============================================================
   GALLERY
   ============================================================ */
const gState={q:'',subject:new Set(),genre:new Set(),mood:new Set(),diff:new Set(),series:new Set(),author:new Set(),era:new Set(),sort:'shelf'};
const titleKey=s=>s.replace(/^(the|a|an)\s+/i,'').toLowerCase();
// stable author-grouped order, used for prev/next navigation in the book view
function navList(){
  return BOOKS.slice().sort((a,b)=>{
    const k=authorName(a.authors[0]).toLowerCase().localeCompare(authorName(b.authors[0]).toLowerCase());if(k)return k;
    if(a.originalPublicationYear!==b.originalPublicationYear)return a.originalPublicationYear-b.originalPublicationYear;
    return titleKey(a.title).localeCompare(titleKey(b.title));
  });
}
// prev/next follows the order the user is actually seeing (shelf groups, or gallery sort); falls back to author order
function navOrder(){ const o=window.__navOrder; return (o&&o.length)?o:navList().map(b=>b.slug); }
const ERAS=[['pre1900','Before 1900',(y)=>y<1900],['early','1900–1945',(y)=>y>=1900&&y<=1945],['mid','1945–2000',(y)=>y>1945&&y<=2000],['c21','21st century',(y)=>y>2000]];
const SUBJECTS=(LIB.organization||[]).map(s=>s.subject).filter((v,i,a)=>v&&a.indexOf(v)===i);
const SUBJECT_OF=(function(){const m={};(LIB.organization||[]).forEach(subj=>(subj.shelves||[]).forEach(sh=>(sh.books||[]).forEach(x=>{if(m[x]==null)m[x]=subj.subject;})));return m;})();

let refreshView=()=>{};   // set by each view so the shared filter bar can refresh the right content
const deaccent=s=>(s==null?'':String(s)).normalize('NFD').replace(/[̀-ͯ]/g,'');
// one lowercased, accent-stripped "blob" per book across every meaningful field, so search is blanket & intuitive
function searchBlob(b){
  if(b._blob!=null) return b._blob;
  const vp=b.vibeProfile||{}, ed=b.edition||{};
  const parts=[
    b.title, b.authors.map(authorName).join(' '),
    b.genre, (b.subgenres||[]).join(' '), (b.tags||[]).join(' '), (b.moods||[]).join(' '),
    b.region, b.originalLanguage, b.difficulty, b.pace,
    b.summary, b.whyReadIt,
    vp.oneLine, (vp.occasions||[]).join(' '), (vp.sensory||[]).join(' '),
    (b.funFacts||[]).map(f=>f&&f.text).join(' '),
    ed.series, ed.publisher, b.originalPublicationYear
  ];
  b._blob=deaccent(parts.filter(Boolean).join(' ').toLowerCase());
  return b._blob;
}
function applyFilters(list){
  const q=deaccent(gState.q.trim().toLowerCase());
  if(q){ const toks=q.split(/\s+/).filter(Boolean); list=list.filter(b=>{const blob=searchBlob(b);return toks.every(t=>blob.includes(t));}); }
  if(gState.genre.size) list=list.filter(b=>gState.genre.has(b.genre));
  if(gState.mood.size) list=list.filter(b=>b.moods.some(m=>gState.mood.has(m)));
  if(gState.diff.size) list=list.filter(b=>gState.diff.has(b.difficulty));
  if(gState.series.size) list=list.filter(b=>b.edition&&gState.series.has(b.edition.series));
  if(gState.author.size) list=list.filter(b=>b.authors.some(a=>gState.author.has(a)));
  if(gState.subject.size) list=list.filter(b=>gState.subject.has(SUBJECT_OF[b.slug]));
  if(gState.era.size) list=list.filter(b=>ERAS.some(e=>gState.era.has(e[0])&&e[2](b.originalPublicationYear)));
  return list;
}
let __orgIndex=null;
function orgIndexOf(slug){   // position of a book in the shelf's subject→shelf sequence
  if(!__orgIndex){__orgIndex={};let i=0;(LIB.organization||[]).forEach(subj=>(subj.shelves||[]).forEach(sh=>(sh.books||[]).forEach(s=>{if(__orgIndex[s]==null)__orgIndex[s]=i++;})));}
  return __orgIndex[slug]!=null?__orgIndex[slug]:1e9;
}
function galleryFiltered(){
  let list=applyFilters(BOOKS.slice());
  const s=gState.sort;
  const auth=b=>authorName(b.authors[0]).toLowerCase();
  list.sort((a,b)=>{
    if(s==='shelf'){ const d=orgIndexOf(a.slug)-orgIndexOf(b.slug); return d||titleKey(a.title).localeCompare(titleKey(b.title)); }
    if(s==='author'){ // group each author's books together, in year order within the author
      const k=auth(a).localeCompare(auth(b)); if(k)return k;
      if(a.originalPublicationYear!==b.originalPublicationYear)return a.originalPublicationYear-b.originalPublicationYear;
      return titleKey(a.title).localeCompare(titleKey(b.title));
    }
    if(s==='title')return titleKey(a.title).localeCompare(titleKey(b.title));
    if(s==='year'){const d=a.originalPublicationYear-b.originalPublicationYear;return d||auth(a).localeCompare(auth(b));}
    if(s==='year-desc'){const d=b.originalPublicationYear-a.originalPublicationYear;return d||auth(a).localeCompare(auth(b));}
    if(s==='rating'){const d=(P(b.slug).rating||0)-(P(a.slug).rating||0);return d||auth(a).localeCompare(auth(b));}
    return 0;
  });
  return list;
}
function activeFilterCount(){return gState.subject.size+gState.genre.size+gState.mood.size+gState.diff.size+gState.series.size+gState.author.size+gState.era.size;}

// ---- library stats strip (whole-collection overview, shown atop Shelf & Gallery) ----
const NON_COUNTRY=new Set(['World','Europe','Central Europe','Americas','Africa','Earth orbit','Caribbean','Arctic','Antarctica']);
const COUNTRY_MAP={'England':'United Kingdom','Scotland':'United Kingdom','Wales':'United Kingdom','Ancient Rome':'Italy','Ancient Greece':'Greece','Russia (Soviet Union)':'Russia','Martinique':'France'};
function libraryStats(){
  const books=BOOKS.length;
  const authors=new Set(BOOKS.flatMap(b=>b.authors||[]).filter(Boolean)).size;
  const cset=new Set();
  BOOKS.forEach(b=>{ if(!b.region)return; b.region.split('/').map(x=>x.trim()).forEach(part=>{ if(!part||NON_COUNTRY.has(part))return; cset.add(COUNTRY_MAP[part]||part); }); });
  const years=BOOKS.map(b=>b.originalPublicationYear).filter(y=>typeof y==='number'&&y!==0);
  const centuries=years.length?Math.round((Math.max(...years)-Math.min(...years))/100):0;
  return {books,authors,countries:cset.size,centuries};
}
function statsBar(){
  const s=libraryStats();
  const cell=(n,l)=>`<div class="stat-cell"><div class="sc-n" data-to="${n}">${n}</div><div class="sc-l">${esc(l)}</div></div>`;
  return `<div class="stats-bar">${cell(s.books,'Books')}${cell(s.authors,'Authors')}${cell(s.countries,'Countries')}${cell(s.centuries,'Centuries spanned')}</div>`;
}
// count-up "ticker" for the stat numbers when the strip appears
function animateStats(){
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  document.querySelectorAll('.sc-n[data-to]').forEach((el,i)=>{
    const to=parseInt(el.dataset.to,10)||0;
    if(reduce){el.textContent=to.toLocaleString();return;}
    const dur=1000+ i*120, start=performance.now();
    el.textContent='0';
    (function step(t){
      const p=Math.min(1,(t-start)/dur), e=1-Math.pow(1-p,3);
      el.textContent=Math.round(e*to).toLocaleString();
      if(p<1) requestAnimationFrame(step); else el.textContent=to.toLocaleString();
    })(start);
  });
}

// ---- shared filter bar (used by Gallery and Shelf) ----
function toolbarMarkup({showSort=true}={}){
  return `
    <div class="toolbar">
      <div class="search">🔍<input id="gq" placeholder="Search title, author, theme…" value="${esc(gState.q)}"><button type="button" id="gqClear" class="q-clear" aria-label="Clear search"${gState.q?'':' hidden'}>✕</button></div>
      <div id="filters"></div>
      ${showSort?`<div class="sortsel">Sort
        <select id="gsort">
          <option value="shelf">Shelf order</option>
          <option value="author">Author</option>
          <option value="title">Title</option>
          <option value="year">Year, oldest</option>
          <option value="year-desc">Year, newest</option>
          <option value="rating">My rating</option>
        </select></div>`:''}
    </div>
    <div id="activeChips" class="chips-active"></div>`;
}
function wireToolbar({showSort=true}={}){
  const seriesVals=[...new Set(BOOKS.map(b=>b.edition&&b.edition.series).filter(Boolean))].sort();
  const authorVals=[...new Set(BOOKS.flatMap(b=>b.authors))].sort((a,b)=>authorName(a).localeCompare(authorName(b)));
  const filters=document.getElementById('filters');
  filters.style.display='flex';filters.style.flexWrap='wrap';filters.style.gap='10px';
  const defs=[
    ['subject','Subject',SUBJECTS.map(s=>({value:s,label:s}))],
    ['genre','Genre',Object.keys(GENRES).map(g=>({value:g,label:g}))],
    ['mood','Mood',MOODS.map(m=>({value:m.slug,label:m.label,color:m.color}))],
    ['diff','Difficulty',FACETS.difficulty.map(d=>({value:d.slug,label:d.label}))],
    ['era','Year',ERAS.map(e=>({value:e[0],label:e[1]}))],
    ['series','Edition',seriesVals.map(s=>({value:s,label:s}))],
    ['author','Author',authorVals.map(a=>({value:a,label:authorName(a)}))],
  ];
  defs.forEach(([key,label,opts])=>filters.appendChild(makeFilter(key,label,opts)));
  const gq=document.getElementById('gq'), gqc=document.getElementById('gqClear');
  gq.oninput=e=>{gState.q=e.target.value;if(gqc)gqc.hidden=!e.target.value;refreshView();};
  if(gqc)gqc.onclick=()=>{gState.q='';gq.value='';gqc.hidden=true;refreshView();gq.focus();};
  const gs=document.getElementById('gsort');
  if(gs){gs.value=gState.sort;gs.onchange=e=>{gState.sort=e.target.value;refreshView();};}
  renderGalleryChrome();
}
function renderGallery(){
  app.innerHTML=`
  <div class="wrap" style="padding-top:clamp(20px,3vw,34px)">
    ${statsBar()}
    ${toolbarMarkup({showSort:true})}
    <div id="resultCount" class="result-count"></div>
    <div id="grid" class="grid"></div>
  </div>`;
  refreshView=updateGrid;
  wireToolbar({showSort:true});
  updateGrid();
  animateStats();
}
function makeFilter(key,label,opts){
  const wrap=document.createElement('div');wrap.className='filter';
  const set=gState[key];
  const btn=document.createElement('button');btn.className='filter-btn'+(set.size?' on':'');
  btn.innerHTML=`${label} <span style="opacity:.6">▾</span>`+(set.size?`<span class="count">${set.size}</span>`:'');
  const menu=document.createElement('div');menu.className='menu';menu.hidden=true;
  menu.innerHTML=opts.map(o=>`<label><input type="checkbox" value="${esc(o.value)}" ${set.has(o.value)?'checked':''}>${o.color?`<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${o.color}"></i> `:''}${esc(o.label)}</label>`).join('')||'<div class="empty-note" style="padding:8px">None</div>';
  btn.onclick=e=>{e.stopPropagation();document.querySelectorAll('.menu').forEach(m=>{if(m!==menu)m.hidden=true;});menu.hidden=!menu.hidden;};
  menu.onchange=e=>{const v=e.target.value;if(e.target.checked)set.add(v);else set.delete(v);renderGalleryChrome();refreshView();};
  wrap.appendChild(btn);wrap.appendChild(menu);
  return wrap;
}
function renderGalleryChrome(){
  // refresh filter button states + chips without full rerender
  document.querySelectorAll('#filters .filter').forEach((f,i)=>{});
  const defsKeys=['subject','genre','mood','diff','era','series','author'];
  const filters=document.getElementById('filters');
  if(filters){[...filters.children].forEach((wrap,idx)=>{
    const key=defsKeys[idx];const set=gState[key];const btn=wrap.querySelector('.filter-btn');
    btn.className='filter-btn'+(set.size?' on':'');
    const labels={subject:'Subject',genre:'Genre',mood:'Mood',diff:'Difficulty',era:'Year',series:'Edition',author:'Author'};
    btn.innerHTML=`${labels[key]} <span style="opacity:.6">▾</span>`+(set.size?`<span class="count">${set.size}</span>`:'');
  });}
  renderChips();
}
function chipLabel(key,v){
  if(key==='mood')return moodMap[v]?moodMap[v].label:v;
  if(key==='diff'){const d=FACETS.difficulty.find(x=>x.slug===v);return d?d.label:v;}
  if(key==='era'){const e=ERAS.find(x=>x[0]===v);return e?e[1]:v;}
  if(key==='author')return authorName(v);
  return v;
}
function renderChips(){
  const box=document.getElementById('activeChips');if(!box)return;
  const chips=[];
  ['subject','genre','mood','diff','era','series','author'].forEach(key=>gState[key].forEach(v=>{
    chips.push(`<span class="chip"><b>${esc(chipLabel(key,v))}</b><span class="x" data-k="${key}" data-v="${esc(v)}">✕</span></span>`);
  }));
  box.innerHTML=chips.join('')+(activeFilterCount()>=1?`<span class="chip clear-all" id="clearAll" title="Clear all filters">Clear all ✕</span>`:'');
  box.querySelectorAll('.x').forEach(x=>x.onclick=()=>{gState[x.dataset.k].delete(x.dataset.v);renderGalleryChrome();refreshView();});
  const ca=document.getElementById('clearAll');if(ca)ca.onclick=()=>{['subject','genre','mood','diff','era','series','author'].forEach(k=>gState[k].clear());renderGalleryChrome();refreshView();};
}
function cardHTML(b){
  const p=P(b.slug);const pr=pct(p);
  const stars=p.rating?`<span class="stars-mini">${'★'.repeat(p.rating)}${'☆'.repeat(5-p.rating)}</span>`:'';
  return `<div class="card${b.cover&&b.cover.alpha?' cut':''}" data-slug="${b.slug}">
    <div class="cover-wrap" style="--ar:${coverAR(b.cover).toFixed(4)}">
      <img loading="lazy" src="${imgsrc(b.cover.file)}" alt="${esc(b.title)}">
      ${p.status!=='unread'?`<span class="status-dot" style="background:${statusColor[p.status]}" title="${statusLabel[p.status]}"></span>`:''}
      ${p.status==='reading'&&pr>0?`<span class="prog"><i style="width:${pr}%"></i></span>`:''}
    </div>
    <div class="meta">
      <div class="t">${esc(b.title)}</div>
      <div class="a">${esc(b.authors.map(authorName).join(', '))}</div>
      <div class="row">
        <span class="mood-dots">${b.moods.slice(0,3).map(m=>`<i style="background:${moodMap[m]?moodMap[m].color:'#999'}" title="${moodMap[m]?moodMap[m].label:m}"></i>`).join('')}</span>
        ${stars}
      </div>
    </div></div>`;
}
function updateGrid(){
  const list=galleryFiltered();
  window.__navOrder=list.map(b=>b.slug);   // prev/next follows the gallery's current sort/filter order
  const grid=document.getElementById('grid');const rc=document.getElementById('resultCount');
  if(rc)rc.textContent=list.length+(list.length===1?' book':' books');
  if(grid){grid.innerHTML=list.map(cardHTML).join('')||`<p class="empty-note">No books match those filters. <span style="text-decoration:underline;cursor:pointer" id="reset">Clear them</span>.</p>`;
    grid.querySelectorAll('.card').forEach(c=>c.onclick=()=>location.hash='#/book/'+c.dataset.slug);
    const r=document.getElementById('reset');if(r)r.onclick=()=>{['subject','genre','mood','diff','era','series','author'].forEach(k=>gState[k].clear());gState.q='';renderGallery();};
  }
  renderChips();
}

/* ============================================================
   BOOK DETAIL
   ============================================================ */
function renderDetail(slug){
  const b=bySlug[slug];if(!b){location.hash=window.__base||'#/shelf';return;}
  const dom=b.cover.dominantColor||'#5b4a3a';
  // header gradient drawn from the cover's own prominent colours (deepened so the title stays readable)
  const deepen=(h,t=.30)=>{let x=h,i=0;while(lum(x)>t&&i++<12)x=dark(x,.14);return x;};
  const pal=(b.cover.palette&&b.cover.palette.length)?b.cover.palette:[dom];
  const cwDark=deepen(pal[0],.28);
  const cw=deepen(pal[1]||dark(pal[0],.35),.44);
  const cwInk='#f6ecda';
  const a=AUTHORS[b.authors[0]]||{};
  const p=P(slug);
  const ed=b.edition||{};
  const facts=[]; (b.funFacts||[]).forEach(f=>facts.push({text:f.text,source:f.source,type:'sourced'}));
  (p.facts||[]).forEach(f=>facts.push({text:f.text,source:null,type:'personal'}));
  let order=navOrder(); let ni=order.indexOf(slug);
  if(ni<0){ order=navList().map(b=>b.slug); ni=order.indexOf(slug); }
  const prevSlug=order[(ni-1+order.length)%order.length], nextSlug=order[(ni+1)%order.length];

  const html=`
  <button class="close" data-close aria-label="Close">✕</button>
  <div class="detail-nav">
    <button class="dnav" data-go="${prevSlug}" title="Previous book">‹</button>
    <button class="dnav" data-go="${nextSlug}" title="Next book">›</button>
  </div>
  <div class="detail-hero" style="--cw:${cw};--cw-dark:${cwDark};--cw-ink:${cwInk}">
    <div class="detail-cover${b.cover&&b.cover.alpha?' cut':''}" style="--ar:${coverAR(b.cover).toFixed(4)}"><img src="${imgsrc(b.cover.file)}" alt="${esc(b.title)}"></div>
    <div class="detail-headinfo">
      <div class="kicker">${[esc(b.genre),yearLabel(b.originalPublicationYear),b.translated?('translated from '+esc(b.originalLanguage)):''].filter(Boolean).join(' · ')}</div>
      <h1>${esc(b.title)}</h1>
      <div class="byline">by <a href="#/author/${b.authors[0]}">${esc(b.authors.map(authorName).join(', '))}</a></div>
      <div class="detail-facts">
        ${ed.pageCount?`<span>📄 ${ed.pageCount} pages</span>`:''}
        ${ed.series?`<span>📚 ${esc(ed.series)}</span>`:''}
        ${b.region?`<span>📍 ${esc(b.region)}</span>`:''}
        ${b.translator?`<span>✎ trans. ${esc(b.translator)}</span>`:''}
      </div>
      <div class="taglets">
        ${b.subgenres.map(s=>`<span class="taglet">${esc(s)}</span>`).join('')}
        ${b.moods.map(m=>`<span class="taglet mood"><i style="background:${moodMap[m]?moodMap[m].color:'#999'}"></i>${moodMap[m]?moodMap[m].label:m}</span>`).join('')}
        <span class="taglet">${esc((FACETS.difficulty.find(d=>d.slug===b.difficulty)||{}).label||b.difficulty)}</span>
      </div>
    </div>
  </div>
  <div class="detail-body">
    <div class="detail-main">
      ${b.summary?`<div class="summary"><div class="blk-title">About the book</div><p>${esc(b.summary)}</p></div>`:''}
      ${b.whyReadIt?`<div><div class="blk-title">Why pick it up</div><div class="shelftalker">${esc(b.whyReadIt)}</div></div>`:''}
      ${facts.length?`<div><div class="blk-title">Did you know</div><div class="funfact" id="funfact"></div></div>`:''}
      ${!b.summary&&!b.whyReadIt?`<div class="empty-note" style="font-size:16px">A fuller write-up for this one is on the way. In the meantime, mark your progress, rate it, and keep your favourite lines in the panel.</div>`:''}
      ${b.awards&&b.awards.length?`<div><div class="blk-title">Recognition</div><div class="awards">${b.awards.map(x=>`<span class="award">🏅 ${esc(x)}</span>`).join('')}</div></div>`:''}
      <div><div class="blk-title">About the author</div>
        <div class="author-blk">
          ${a.photo&&a.photo.file?`<img src="${imgsrc(a.photo.file)}" alt="${esc(a.name)}" data-author="${b.authors[0]}">`:''}
          <div>
            <div class="aname" data-author="${b.authors[0]}">${esc(a.name||'')}</div>
            <div class="adates">${[a.nationality,a.birthYear?(a.birthYear+(a.deathYear?'–'+a.deathYear:'')):''].filter(Boolean).join(' · ')}</div>
            <div class="abio">${esc(a.bio||'')}</div>
          </div>
        </div>
      </div>
    </div>
    <aside class="panel" id="panel"></aside>
  </div>`;
  openOverlay(html);
  mountFunfact(b,facts);
  mountPanel(b);
  overlayPanel.querySelectorAll('[data-author]').forEach(el=>el.onclick=()=>location.hash='#/author/'+el.dataset.author);
  overlayPanel.querySelectorAll('.dnav').forEach(el=>el.onclick=()=>location.hash='#/book/'+el.dataset.go);
}

function mountFunfact(b,facts){
  const box=document.getElementById('funfact');if(!box)return;
  let i=Math.floor(Math.random()*Math.max(1,facts.length));
  function draw(){
    if(!facts.length){box.innerHTML='<div class="ff-text empty-note">No notes yet. Add one from the panel as you read.</div>';return;}
    const f=facts[i%facts.length];
    box.innerHTML=`<div class="ff-text">${esc(f.text)}</div>
      <div class="ff-foot">
        <span>${f.type==='personal'?'✍ your note':(f.source?`<a href="${esc(f.source)}" target="_blank" rel="noopener">source</a>`:'')}</span>
        ${facts.length>1?'<button class="btn-mini" id="ffnext">another →</button>':''}
      </div>`;
    const n=document.getElementById('ffnext');if(n)n.onclick=()=>{i++;draw();};
  }
  draw();
}

function mountPanel(b){
  const slug=b.slug;const p=P(slug);const ed=b.edition||{};
  const panel=document.getElementById('panel');
  panel.innerHTML=`
    <h3>Your reading</h3>
    <div class="sub">saved on this device</div>
    <div class="pblock">
      <div class="plabel">Status</div>
      <div class="statusrow" id="statusrow">
        ${['unread','reading','read','dnf'].map(s=>`<button data-s="${s}" class="${p.status===s?'on':''}">${statusLabel[s]}</button>`).join('')}
      </div>
    </div>
    <div class="pblock">
      <div class="plabel">Progress</div>
      <div class="progwrap"><div class="progbar"><i id="pbar" style="width:${pct(p)}%"></i></div><span class="progpct" id="ppct">${pct(p)}%</span></div>
      <div class="unit-toggle" id="unitToggle">
        <button data-u="page" class="${(p.progMode||'page')==='page'?'on':''}">Pages</button>
        <button data-u="chapter" class="${p.progMode==='chapter'?'on':''}">Chapters</button>
      </div>
      <div class="proginputs" id="proginputs"></div>
    </div>
    <div class="pblock">
      <div class="plabel">My rating</div>
      <div class="stars" id="stars">${[1,2,3,4,5].map(n=>`<span data-n="${n}" class="${p.rating>=n?'lit':''}">★</span>`).join('')}</div>
    </div>
    <div class="pblock">
      <div class="plabel">Quotes worth keeping</div>
      <div class="qadd">
        <textarea id="qtext" placeholder="Type a line you loved…"></textarea>
        <div class="qrow"><input type="text" id="qpage" placeholder="page (optional)"><button class="btn" id="qadd">Add</button></div>
      </div>
      <div class="quote-list" id="qlist"></div>
    </div>
    <div class="pblock">
      <div class="plabel">Add your own fun fact</div>
      <div class="qrow"><input type="text" id="factin" placeholder="Something you discovered…" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:var(--sans);font-size:13px;background:var(--paper)"><button class="btn ghost" id="factadd">Add</button></div>
    </div>
    <div class="pblock review">
      <div class="plabel">My review</div>
      <textarea id="review" placeholder="What did you make of it?">${esc(p.review||'')}</textarea>
    </div>
    <div class="pblock" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="shareBook">Share this book</button>
    </div>
  `;
  // status
  panel.querySelectorAll('#statusrow button').forEach(btn=>btn.onclick=()=>{
    const s=btn.dataset.s;const patch={status:s};
    if(s==='read'){patch.finished=Date.now();if(!p.pages)patch.pages=ed.pageCount||0;patch.page=patch.pages||p.pages;}
    if(s==='reading'&&!p.started)patch.started=Date.now();
    setP(slug,patch);mountPanel(b);
  });
  // progress (pages or chapters)
  const proginputs=document.getElementById('proginputs');
  const syncBar=()=>{const pr=pct(P(slug));const bar=document.getElementById('pbar'),pc=document.getElementById('ppct');if(bar)bar.style.width=pr+'%';if(pc)pc.textContent=pr+'%';panel.querySelectorAll('#statusrow button').forEach(x=>x.classList.toggle('on',x.dataset.s===P(slug).status));};
  function drawProgInputs(){
    const pp=P(slug);const mode=pp.progMode||'page';
    proginputs.innerHTML = mode==='chapter'
      ? `chapter <input type="number" id="pcur" min="0" value="${pp.chapter||''}"> of <input type="number" id="ptot" min="0" value="${pp.chapters||''}">`
      : `page <input type="number" id="pcur" min="0" value="${pp.page||''}"> of <input type="number" id="ptot" min="0" value="${pp.pages||ed.pageCount||''}">`;
    const cur=document.getElementById('pcur'),tot=document.getElementById('ptot');
    const upd=()=>{
      const c=parseInt(cur.value)||0,t=parseInt(tot.value)||0;const pp2=P(slug);const patch={};
      if((pp2.progMode||'page')==='chapter'){patch.chapter=c;patch.chapters=t;}else{patch.page=c;patch.pages=t;}
      if(c>0&&pp2.status==='unread')patch.status='reading';
      if(t>0&&c>=t)patch.status='read';
      setP(slug,patch);syncBar();
    };
    cur.oninput=upd;tot.oninput=upd;
  }
  drawProgInputs();
  panel.querySelectorAll('#unitToggle button').forEach(btn=>btn.onclick=()=>{
    setP(slug,{progMode:btn.dataset.u});
    panel.querySelectorAll('#unitToggle button').forEach(x=>x.classList.toggle('on',x.dataset.u===btn.dataset.u));
    drawProgInputs();syncBar();
  });
  // stars
  panel.querySelectorAll('#stars span').forEach(s=>s.onclick=()=>{
    const n=+s.dataset.n;setP(slug,{rating:P(slug).rating===n?0:n});
    panel.querySelectorAll('#stars span').forEach(x=>x.classList.toggle('lit',+x.dataset.n<=P(slug).rating));
    toast('Rating saved');
  });
  // quotes
  function drawQuotes(){
    const list=document.getElementById('qlist');const qs=P(slug).quotes||[];
    list.innerHTML=qs.map((q,idx)=>`<div class="quote-item">“${esc(q.text)}”
      <div class="qm"><span>${q.page?'p. '+esc(q.page):''}</span><span><span class="share" data-i="${idx}">share</span> · <span class="del" data-i="${idx}">delete</span></span></div></div>`).join('')
      ||'<div class="empty-note">No quotes yet.</div>';
    list.querySelectorAll('.del').forEach(d=>d.onclick=()=>{P(slug).quotes.splice(+d.dataset.i,1);save();drawQuotes();});
    list.querySelectorAll('.share').forEach(d=>d.onclick=()=>shareQuote(b,P(slug).quotes[+d.dataset.i]));
  }
  drawQuotes();
  document.getElementById('qadd').onclick=()=>{
    const t=document.getElementById('qtext').value.trim();if(!t)return;
    const pg=document.getElementById('qpage').value.trim();
    P(slug).quotes.push({text:t,page:pg,ts:Date.now()});save();
    document.getElementById('qtext').value='';document.getElementById('qpage').value='';
    drawQuotes();toast('Quote saved');
  };
  document.getElementById('factadd').onclick=()=>{
    const t=document.getElementById('factin').value.trim();if(!t)return;
    P(slug).facts.push({text:t,ts:Date.now()});save();document.getElementById('factin').value='';
    toast('Fun fact added');
    const facts=[]; (b.funFacts||[]).forEach(f=>facts.push({text:f.text,source:f.source,type:'sourced'}));(P(slug).facts||[]).forEach(f=>facts.push({text:f.text,type:'personal'}));
    mountFunfact(b,facts);
  };
  document.getElementById('review').onblur=e=>{setP(slug,{review:e.target.value});toast('Review saved');};
  document.getElementById('shareBook').onclick=()=>shareBook(b);
}

/* ============================================================
   AUTHOR
   ============================================================ */
function renderAuthor(slug){
  const a=AUTHORS[slug];if(!a){location.hash=window.__base||'#/shelf';return;}
  const books=(a.books||[]).map(s=>bySlug[s]).filter(Boolean);
  const html=`
  <button class="close" data-close aria-label="Close">✕</button>
  <div class="detail-hero" style="--cw:#3a3129;--cw-dark:#241d17;--cw-ink:#f6ecda">
    ${a.photo&&a.photo.file?`<div class="detail-cover" style="border-radius:12px"><img src="${imgsrc(a.photo.file)}" alt="${esc(a.name)}"></div>`:'<div></div>'}
    <div class="detail-headinfo">
      <div class="kicker">Author</div>
      <h1>${esc(a.name)}</h1>
      <div class="adates" style="color:#e9dcc4;opacity:.85;font-family:var(--sans);text-transform:uppercase;letter-spacing:.08em;font-size:12.5px;margin-top:8px">${[a.nationality,a.birthYear?(a.birthYear+(a.deathYear?'–'+a.deathYear:' · living')):''].filter(Boolean).join(' · ')}</div>
      <p style="margin-top:16px;font-size:19px;opacity:.95">${esc(a.bio)}</p>
    </div>
  </div>
  <div style="padding:clamp(24px,4vw,48px)">
    <div class="blk-title">On this shelf (${books.length})</div>
    <div class="grid" id="authorGrid">${books.map(cardHTML).join('')}</div>
  </div>`;
  openOverlay(html);
  overlayPanel.querySelectorAll('#authorGrid .card').forEach(c=>c.onclick=()=>location.hash='#/book/'+c.dataset.slug);
}

/* ============================================================
   SUGGEST
   ============================================================ */
const LEX=[
 // keyword regex -> {moods:[], occ:[], diff:[], pace:[], size:'short'|'long', tags:[]}
 [/\b(calm|relax\w*|unwind|cosy|cozy|comfort\w*|soothing|peace\w*|gentle|quiet|slow|easy|restful|wind down)\b/,{moods:['comforting','quiet'],occ:['to relax and unwind'],diff:['gentle'],pace:['slow-burn','steady']}],
 [/\b(rich|immersive|absorb\w*|lose myself|epic|sweeping|deep dive|get lost|engrossing)\b/,{moods:['epic','luminous','dreamlike'],occ:['to be absorbed for hours'],pace:['slow-burn']}],
 [/\b(sad|melanchol\w*|moving|cry|tearjerker|bittersweet|grief|heartbreak\w*|wistful)\b/,{moods:['melancholic','tender','bleak']}],
 [/\b(hope\w*|uplift\w*|warm|tender|sweet|kind|heartwarming)\b/,{moods:['hopeful','comforting','tender']}],
 [/\b(funny|humou?r\w*|light|witty|playful|comic|laugh)\b/,{moods:['playful','satirical']}],
 [/\b(scary|creepy|spooky|horror|eerie|haunt\w*|ghost|frighten\w*|chilling|gothic)\b/,{moods:['haunting','unsettling','suspenseful'],occ:['in bed at night']}],
 [/\b(thrill\w*|gripping|page.?turn\w*|tense|suspense\w*|exciting|edge of|fast)\b/,{moods:['suspenseful'],pace:['propulsive','brisk']}],
 [/\b(think\w*|thoughtful|smart|intellectual|philosoph\w*|challeng\w*|cerebral|clever|demanding|difficult)\b/,{moods:['cerebral'],diff:['challenging','summit']}],
 [/\b(strange|weird|surreal|dreamlike|trippy|odd|uncanny)\b/,{moods:['dreamlike','unsettling']}],
 [/\b(politic\w*|histor\w*|war|revolution|real events|true story|society)\b/,{moods:['political'],tags:['history']}],
 [/\b(romance|romantic|love story|love)\b/,{moods:['romantic','tender']}],
 [/\b(short|quick|small|one sitting|brief|little)\b/,{size:'short',occ:['a short sitting']}],
 [/\b(long|big|chunky|door.?stop\w*|epic length)\b/,{size:'long'}],
 [/\b(night|bed|before sleep|bedtime|evening)\b/,{occ:['in bed at night']}],
 [/\b(river|water|sea|lake|ocean|beach|coast|by the water|waterside)\b/,{occ:['by the water'],moods:['quiet','luminous']}],
 [/\b(garden|forest|nature|outdoor\w*|trees|plants|mountain\w*|wild)\b/,{occ:['in a garden'],tags:['nature']}],
 [/\b(rain\w*|grey|gloomy|storm\w*)\b/,{occ:['on a rainy day']}],
 [/\b(travel|journey|faraway|escape|adventure|abroad)\b/,{tags:['travel'],occ:['to escape']}],
 [/\b(space|stars|sky|cosmos|planet)\b/,{tags:['space','awe']}],
];

function scoreBook(b,q,signals){
  let s=0;const reasons=new Set();
  const p=P(b.slug);
  signals.moods.forEach(m=>{if(b.moods.includes(m)){s+=3;reasons.add(moodMap[m].label.toLowerCase());}});
  signals.occ.forEach(o=>{if((b.vibeProfile.occasions||[]).includes(o)){s+=2.5;reasons.add(o);}});
  signals.diff.forEach(d=>{if(b.difficulty===d){s+=2;}});
  signals.pace.forEach(pc=>{if(b.pace===pc){s+=1.5;}});
  const pages=(b.edition&&b.edition.pageCount)||300;
  if(signals.size==='short'&&pages<=220){s+=2.5;reasons.add('a short one');}
  if(signals.size==='long'&&pages>=380){s+=2;reasons.add('a big one');}
  signals.tags.forEach(t=>{if((b.tags||[]).some(x=>x.toLowerCase().includes(t))||b.region.toLowerCase().includes(t)){s+=1.5;reasons.add(t);}});
  // raw token matches
  q.split(/\W+/).filter(w=>w.length>3).forEach(w=>{
    const hay=(b.title+' '+b.authors.map(authorName).join(' ')+' '+(b.tags||[]).join(' ')+' '+b.region+' '+b.subgenres.join(' ')+' '+(b.vibeProfile.sensory||[]).join(' ')).toLowerCase();
    if(hay.includes(w)){s+=1.4;}
    if((b.title+' '+b.authors.map(authorName).join(' ')).toLowerCase().includes(w))s+=3;
  });
  return {score:s,reasons:[...reasons]};
}
function parseSignals(q){
  const sig={moods:[],occ:[],diff:[],pace:[],tags:[],size:null};
  LEX.forEach(([re,eff])=>{if(re.test(q)){for(const k in eff){if(k==='size')sig.size=eff.size;else sig[k]=sig[k].concat(eff[k]);}}});
  return sig;
}
function renderSuggest(q0){
  app.innerHTML=`
  <section class="suggest-hero">
    <div class="bg"></div>
    <div class="suggest-inner">
      <div class="eyebrow">Your in-house recommender</div>
      <h1>What do you feel like reading?</h1>
      <p class="lede">Tell me the mood, the moment, the weather. Something calm by the river. A short thrill for tonight. A book that makes you think. I'll match it against the shelf.</p>
      <div class="askbox"><input id="ask" placeholder="e.g. something rich and immersive to read by the river…"></div>
      <div class="examples">
        <button>something calm by the river</button>
        <button>a short, gripping read for tonight</button>
        <button>make me think</button>
        <button>strange and dreamlike</button>
        <button>something that will move me</button>
        <button data-surprise>🎲 surprise me</button>
      </div>
    </div>
  </section>
  <div class="wrap"><div class="suggest-results" id="recs"></div></div>`;
  const ask=document.getElementById('ask');
  ask.addEventListener('keydown',e=>{if(e.key==='Enter')runSuggest(ask.value);});
  app.querySelectorAll('.examples button:not([data-surprise])').forEach(btn=>btn.onclick=()=>{ask.value=btn.textContent;runSuggest(btn.textContent);});
  const sp=app.querySelector('[data-surprise]');
  if(sp)sp.onclick=()=>{const b=BOOKS[Math.floor(Math.random()*BOOKS.length)];location.hash='#/book/'+b.slug;};
  if(q0){ask.value=q0;runSuggest(q0);} else ask.focus();
}
function runSuggest(q){
  q=(q||'').toLowerCase().trim();
  const recs=document.getElementById('recs');
  if(!q){recs.innerHTML='';return;}
  const sig=parseSignals(q);
  let ranked=BOOKS.map(b=>({b,...scoreBook(b,q,sig)})).sort((a,b)=>b.score-a.score);
  const top=ranked.filter(r=>r.score>0).slice(0,6);
  const list=top.length?top:ranked.slice(0,3);
  const head=top.length?`<div class="eyebrow" style="margin-bottom:6px">For “${esc(q)}”</div><h2 class="section-title" style="font-size:30px;margin-bottom:18px">A few from the shelf</h2>`
    :`<div class="eyebrow" style="margin-bottom:6px">Hmm</div><h2 class="section-title" style="font-size:30px;margin-bottom:6px">I'm not sure I followed that</h2><p class="lede" style="margin-bottom:18px">Here are a few worth your time anyway. Try words like calm, thrilling, funny, sad, strange, or short.</p>`;
  recs.innerHTML=head+list.map(({b,reasons})=>{
    const why=reasons.length?('Matches '+reasons.slice(0,3).join(', ')):'A shelf favourite';
    return `<div class="rec" data-slug="${b.slug}">
      <div class="rc"><img src="${imgsrc(b.cover.file)}" alt=""></div>
      <div class="ri">
        <h3>${esc(b.title)}</h3>
        <div class="ra">${[esc(b.authors.map(authorName).join(', ')),yearLabel(b.originalPublicationYear)].filter(Boolean).join(' · ')}</div>
        <div class="rvibe">${esc(b.vibeProfile.oneLine)}</div>
        <div class="rmatch">${esc(why)}</div>
      </div></div>`;
  }).join('');
  recs.querySelectorAll('.rec').forEach(r=>r.onclick=()=>location.hash='#/book/'+r.dataset.slug);
  recs.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ============================================================
   COMMONPLACE
   ============================================================ */
function renderCommonplace(){
  const all=[];
  Object.keys(STORE).forEach(slug=>{(STORE[slug].quotes||[]).forEach(q=>{if(bySlug[slug])all.push({q,b:bySlug[slug]});});});
  all.sort((a,b)=>b.q.ts-a.q.ts);
  app.innerHTML=`<div class="wrap">
    <div class="page-head"><div class="eyebrow">Lines worth keeping</div><h1 class="section-title">The Commonplace Book</h1>
      <p class="lede">Every quote you save, from every book, gathered in one place. A running record of the sentences that stopped you.</p></div>
    ${all.length?`<div class="cp-grid">${all.map(({q,b})=>`
      <div class="cp-card" data-slug="${b.slug}">
        <div class="q">“${esc(q.text)}”</div>
        <div class="src"><span><b>${esc(b.title)}</b><br>${esc(b.authors.map(authorName).join(', '))}${q.page?' · p. '+esc(q.page):''}</span><span class="share" style="cursor:pointer;color:var(--navy)">share</span></div>
      </div>`).join('')}</div>`
    :`<div class="big-empty"><img src="assets/textures/deco-reader.jpg" alt=""><h2 class="section-title" style="font-size:26px">Nothing collected yet</h2><p class="lede" style="margin:10px auto 0">Open any book and save a line you love. It will find its way here.</p><p style="margin-top:20px"><a class="btn" href="#/gallery" style="display:inline-block">Browse the shelf</a></p></div>`}
  </div>`;
  app.querySelectorAll('.cp-card').forEach(c=>{
    const b=bySlug[c.dataset.slug];
    c.onclick=()=>location.hash='#/book/'+c.dataset.slug;
    const share=c.querySelector('.share');
    if(share) share.onclick=e=>{
      e.stopPropagation();
      const shown=c.querySelector('.q').textContent.replace(/^“|”$/g,'');
      const q=(STORE[c.dataset.slug].quotes||[]).find(x=>x.text===shown)||{text:shown};
      shareQuote(b,q);
    };
  });
}

/* ============================================================
   STATS
   ============================================================ */
function renderStats(){
  const entries=Object.entries(STORE).filter(([s])=>bySlug[s]);
  const read=entries.filter(([,v])=>v.status==='read');
  const reading=entries.filter(([,v])=>v.status==='reading');
  const want=entries.filter(([,v])=>v.status==='unread'&&(v.quotes.length||v.rating||v.page));
  let pages=0;read.forEach(([s,v])=>pages+=(v.pages||(bySlug[s].edition||{}).pageCount||0));reading.forEach(([,v])=>pages+=(v.page||0));
  const rated=entries.filter(([,v])=>v.rating);const avg=rated.length?(rated.reduce((a,[,v])=>a+v.rating,0)/rated.length).toFixed(1):'—';
  const quotes=entries.reduce((a,[,v])=>a+(v.quotes?v.quotes.length:0),0);
  // mood distribution among read+reading
  const moodCount={};[...read,...reading].forEach(([s])=>bySlug[s].moods.forEach(m=>moodCount[m]=(moodCount[m]||0)+1));
  const maxM=Math.max(1,...Object.values(moodCount));
  const moodBars=Object.entries(moodCount).sort((a,b)=>b[1]-a[1]).map(([m,n])=>`
    <div class="mood-bar"><span class="ml">${moodMap[m]?moodMap[m].label:m}</span><span class="mt"><i style="width:${n/maxM*100}%;background:${moodMap[m]?moodMap[m].color:'#999'}"></i></span><span class="mn">${n}</span></div>`).join('');
  app.innerHTML=`<div class="wrap">
    <div class="page-head"><div class="eyebrow">Your reading life</div><h1 class="section-title">Reading Life</h1>
      <p class="lede">A quiet record of what you've read and loved. It fills in as you go. Right now the shelf is waiting.</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="n">${read.length}</div><div class="l">Books read</div></div>
      <div class="stat"><div class="n">${reading.length}</div><div class="l">Reading now</div></div>
      <div class="stat"><div class="n">${pages.toLocaleString()}</div><div class="l">Pages turned</div></div>
      <div class="stat"><div class="n">${avg}</div><div class="l">Average rating</div></div>
      <div class="stat"><div class="n">${quotes}</div><div class="l">Quotes kept</div></div>
      <div class="stat"><div class="n">${read.length}/${BOOKS.length}</div><div class="l">This shelf</div></div>
    </div>
    ${moodBars?`<div><div class="blk-title" style="margin-top:30px">The moods you gravitate to</div><div class="mood-bars">${moodBars}</div></div>`
      :`<div class="big-empty" style="padding:40px 20px"><p class="lede">Mark a few books as reading or read, and your reading personality will start to show here.</p><p style="margin-top:18px"><a class="btn" href="#/shelf">Go to the shelf</a></p></div>`}
  </div>`;
}

/* ============================================================
   SHARE CARDS (canvas)
   ============================================================ */
function wrapText(ctx,text,x,y,maxW,lh){
  const words=text.split(' ');let line='';let yy=y;
  for(const w of words){const test=line+w+' ';if(ctx.measureText(test).width>maxW&&line){ctx.fillText(line.trim(),x,yy);line=w+' ';yy+=lh;}else line=test;}
  ctx.fillText(line.trim(),x,yy);return yy;
}
function sheet(html){
  let s=document.getElementById('sheet');
  if(!s){s=document.createElement('div');s.id='sheet';s.className='sheet';document.body.appendChild(s);}
  s.innerHTML=`<div class="sheet-scrim" data-sheet-close></div><div class="sheet-card">${html}</div>`;
  s.hidden=false;document.body.style.overflow='hidden';
  s.querySelectorAll('[data-sheet-close]').forEach(b=>b.onclick=closeSheet);
  return s;
}
function closeSheet(){const s=document.getElementById('sheet');if(s){s.hidden=true;s.innerHTML='';}document.body.style.overflow='';}
function downloadCanvas(name){
  const c=document.getElementById('shareCanvas');let url;
  try{url=c.toDataURL('image/png');}catch(e){toast('Could not build image');return;}
  sheet(`<button class="sheet-x" data-sheet-close aria-label="Close">✕</button>
    <h3 style="font-family:var(--display);font-size:23px;margin:0 0 4px">Your share card</h3>
    <p class="empty-note" style="margin:0 0 14px">Right-click the image and choose Save (on a phone, press and hold), then send it to anyone.</p>
    <img src="${url}" alt="share card" style="width:100%;border-radius:12px;box-shadow:var(--shadow)">
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <a class="btn" href="${url}" download="${name}">Save image</a>
      <button class="btn ghost" data-sheet-close>Done</button>
    </div>`);
}
function shareQuote(b,q){
  if(!q){toast('No quote to share');return;}
  const c=document.getElementById('shareCanvas');c.width=1080;c.height=1080;const x=c.getContext('2d');
  const dom=b.cover.dominantColor||'#3a2f28';
  const g=x.createLinearGradient(0,0,0,1080);g.addColorStop(0,dark(dom,.25));g.addColorStop(1,dark(dom,.55));
  x.fillStyle=g;x.fillRect(0,0,1080,1080);
  const ink=textOn(dom);
  x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.5)':'rgba(255,255,255,.55)';
  x.font='italic 40px Georgia';x.fillText('“',90,180);
  x.fillStyle=ink;x.font='italic 46px Georgia';
  const endY=wrapText(x,q.text,100,260,880,64);
  x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.8)':'rgba(255,255,255,.85)';
  x.font='bold 30px Georgia';x.fillText(b.title.toUpperCase(),100,Math.min(940,endY+120));
  x.font='26px Georgia';x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.65)':'rgba(255,255,255,.7)';
  x.fillText(b.authors.map(authorName).join(', ')+(q.page?'  ·  p. '+q.page:''),100,Math.min(985,endY+165));
  x.font='20px Georgia';x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.5)':'rgba(255,255,255,.5)';
  x.fillText("The Shelf",100,1010);
  downloadCanvas((b.slug||'quote')+'-quote.png');
}
function shareBook(b){
  const p=P(b.slug);const c=document.getElementById('shareCanvas');c.width=1080;c.height=1350;const x=c.getContext('2d');
  const dom=b.cover.dominantColor||'#3a2f28';const ink=textOn(dom);
  const g=x.createLinearGradient(0,0,0,1350);g.addColorStop(0,dom);g.addColorStop(1,dark(dom,.45));
  x.fillStyle=g;x.fillRect(0,0,1080,1350);
  const img=new Image();
  img.onload=()=>{const cw=380,ch=570,cx=(1080-cw)/2,cy=110;x.save();x.shadowColor='rgba(0,0,0,.5)';x.shadowBlur=40;x.shadowOffsetY=20;x.drawImage(img,cx,cy,cw,ch);x.restore();draw();};
  img.onerror=draw;img.src=b.cover.file;
  function draw(){
    x.fillStyle=ink;x.textAlign='center';x.font='bold 54px Georgia';
    wrapTextCenter(x,b.title,540,780,900,60);
    x.font='italic 32px Georgia';x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.8)':'rgba(255,255,255,.85)';
    x.fillText(b.authors.map(authorName).join(', '),540,900);
    if(p.rating){x.font='46px Georgia';x.fillStyle='#e7c15a';x.fillText('★'.repeat(p.rating)+'☆'.repeat(5-p.rating),540,975);}
    x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.85)':'rgba(255,255,255,.9)';x.font='italic 30px Georgia';
    const line=(p.review&&p.review.trim())?('“'+p.review.trim()+'”'):b.vibeProfile.oneLine;
    wrapTextCenter(x,line,540,1050,880,44);
    x.font='22px Georgia';x.fillStyle=ink==='#241f1b'?'rgba(30,20,15,.55)':'rgba(255,255,255,.55)';
    x.fillText("The Shelf",540,1290);x.textAlign='left';
    downloadCanvas((b.slug||'book')+'-card.png');
  }
}
function wrapTextCenter(ctx,text,cx,y,maxW,lh){
  const words=text.split(' ');let line='';let yy=y;
  for(const w of words){const test=line+w+' ';if(ctx.measureText(test).width>maxW&&line){ctx.fillText(line.trim(),cx,yy);line=w+' ';yy+=lh;}else line=test;}
  ctx.fillText(line.trim(),cx,yy);
}

/* ============================================================
   OVERLAY + ROUTER
   ============================================================ */
function openOverlay(html){
  overlayPanel.innerHTML=html;overlay.hidden=false;document.body.style.overflow='hidden';
  overlayPanel.scrollTop=0;overlay.scrollTop=0;
  overlay.querySelectorAll('[data-close]').forEach(el=>el.onclick=()=>{location.hash=window.__base||'#/shelf';});
}
function closeOverlay(){overlay.hidden=true;overlayPanel.innerHTML='';document.body.style.overflow='';}

function setActiveNav(route){
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===route));
}
function ensureBase(){if(!app.children.length){window.__base='#/gallery';renderGallery();setActiveNav('gallery');}}

function render(){
  const hash=location.hash||'#/shelf';
  const parts=hash.replace(/^#\/?/,'').split('/');
  const route=parts[0]||'shelf';
  document.querySelectorAll('.menu').forEach(m=>m.hidden=true);
  if(route==='book'||route==='author'){
    if(overlay.hidden) window.__scrollY=window.scrollY;   // remember page position before opening the overlay
    ensureBase();
    if(route==='book')renderDetail(parts[1]); else renderAuthor(parts[1]);
    return;
  }
  // just closing the overlay back onto the same, already-rendered view? keep it and restore scroll.
  const reopening = !overlay.hidden && hash===window.__rendered;
  closeOverlay();window.__base=hash;
  if(reopening){
    setActiveNav(route==='shelf'?'shelf':route);
    window.scrollTo(0, window.__scrollY||0);
    return;
  }
  if(route==='gallery')renderGallery();
  else if(route==='suggest')renderSuggest(decodeURIComponent(parts.slice(1).join('/')||''));
  else if(route==='commonplace')renderCommonplace();
  else if(route==='stats')renderStats();
  else if(route==='owner')renderOwner();
  else if(route==='add')renderSubmit();
  else if(route==='publish')renderPublish();
  else renderShelf();
  window.__rendered=hash;
  setActiveNav(route==='shelf'?'shelf':route);
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',render);
document.addEventListener('click',e=>{if(!e.target.closest('.filter'))document.querySelectorAll('.menu').forEach(m=>m.hidden=true);});
document.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();const typing=tag==='input'||tag==='textarea'||tag==='select';
  const sh=document.getElementById('sheet');
  if(e.key==='Escape'){ if(sh&&!sh.hidden){closeSheet();return;} if(typing){e.target.blur();return;} if(!overlay.hidden){location.hash=window.__base||'#/shelf';} return; }
  if(typing) return;
  if(!overlay.hidden && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const parts=(location.hash||'').replace(/^#\/?/,'').split('/');
    if(parts[0]==='book'){const order=navOrder();const i=order.indexOf(parts[1]);if(i>=0){const t=e.key==='ArrowLeft'?order[(i-1+order.length)%order.length]:order[(i+1)%order.length];location.hash='#/book/'+t;}}
  }
});
document.getElementById('navToggle').onclick=()=>document.getElementById('nav').classList.toggle('open');
document.querySelectorAll('#nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('nav').classList.remove('open')));
// clicking "The Shelf" (brand or nav) always returns to the top of the shelf; clicking the view you're already on jumps to top
document.getElementById('topbar').addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#/"]'); if(!a) return;
  const target=a.getAttribute('href');
  if(target==='#/shelf'){
    e.preventDefault(); closeOverlay();
    if(location.hash && location.hash!=='#/shelf') location.hash='#/shelf';
    window.scrollTo(0,0);
  } else if(target===location.hash){
    e.preventDefault(); window.scrollTo(0,0);
  }
});

/* data tools in footer */
(function(){
  const f=document.getElementById('footer');
  const tools=document.createElement('div');tools.className='datatools';
  tools.innerHTML=`<button id="exp">Export my data</button><button id="imp">Import</button><input type="file" id="impfile" accept="application/json" hidden>`;
  f.appendChild(tools);
  document.getElementById('exp').onclick=()=>{
    const json=JSON.stringify(STORE,null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    sheet(`<button class="sheet-x" data-sheet-close aria-label="Close">✕</button>
      <h3 style="font-family:var(--display);font-size:23px;margin:0 0 4px">Your reading data</h3>
      <p class="empty-note" style="margin:0 0 12px">Copy this text, or save the file, to keep a backup. Use Import to bring it back later or onto another device.</p>
      <textarea readonly style="width:100%;height:190px;border:1px solid var(--line);border-radius:10px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;background:var(--paper)">${esc(json)}</textarea>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" id="copyjson">Copy</button>
        <a class="btn ghost" href="${url}" download="the-shelf-backup.json">Save file</a>
      </div>`);
    const cj=document.getElementById('copyjson');if(cj)cj.onclick=()=>{(navigator.clipboard?navigator.clipboard.writeText(json):Promise.reject()).then(()=>toast('Copied to clipboard'),()=>toast('Select the text and copy'));};
  };
  document.getElementById('imp').onclick=()=>document.getElementById('impfile').click();
  document.getElementById('impfile').onchange=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{STORE=JSON.parse(r.result)||{};save();toast('Data imported');render();}catch(err){toast('Could not read that file');}};r.readAsText(file);};
})();

// light / dark toggle ("switch the lights")
(function(){
  const btn=document.getElementById('themeToggle'); if(!btn) return;
  btn.onclick=()=>{
    const dark=document.documentElement.getAttribute('data-theme')==='dark';
    if(dark)document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme','dark');
    try{localStorage.setItem('shelf-theme',dark?'light':'dark');}catch(e){}
  };
})();

/* ============================================================
   ADD A BOOK  ·  owner-only, commits to your GitHub repo
   The token lives ONLY in this browser (localStorage), never in
   the deployed site, so visitors can never add or change anything.
   ============================================================ */
const OKEY='shelf-owner-cfg';
function ownerCfg(){ try{return JSON.parse(localStorage.getItem(OKEY))||{};}catch(e){return {};} }
function setOwnerCfg(c){ try{localStorage.setItem(OKEY,JSON.stringify(c));}catch(e){} }
function isOwner(){ const c=ownerCfg(); return !!(c.token&&c.owner&&c.repo); }

function ghHeaders(){ const c=ownerCfg(); return {'Authorization':'Bearer '+c.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}; }
function ghBase(){ const c=ownerCfg(); return 'https://api.github.com/repos/'+c.owner+'/'+c.repo; }
function ghBranch(){ return ownerCfg().branch||'main'; }
function b64utf8(s){ return btoa(unescape(encodeURIComponent(s))); }
function utf8b64(b){ try{return decodeURIComponent(escape(atob((b||'').replace(/\s/g,''))));}catch(e){return '';} }

async function ghTest(){
  const r=await fetch(ghBase(),{headers:ghHeaders()});
  if(!r.ok) throw new Error('GitHub returned '+r.status+(r.status===404?' — check the username / repo name':r.status===401?' — the token looks wrong':''));
  return r.json();
}
async function ghGetFile(path){
  const r=await fetch(ghBase()+'/contents/'+path+'?ref='+ghBranch()+'&t='+Date.now(),{headers:ghHeaders()});
  if(r.status===404) return null;
  if(!r.ok) throw new Error('Could not read '+path+' ('+r.status+')');
  const j=await r.json();
  return {text:utf8b64(j.content), sha:j.sha};
}
// one atomic commit that writes several files. files:[{path,content,b64}]
async function ghCommit(files, message){
  const H=ghHeaders(), B=ghBase(), br=ghBranch();
  const ref=await (await fetch(B+'/git/ref/heads/'+br,{headers:H})).json();
  if(!ref.object) throw new Error('Branch "'+br+'" not found');
  const headSha=ref.object.sha;
  const baseCommit=await (await fetch(B+'/git/commits/'+headSha,{headers:H})).json();
  const tree=[];
  for(const f of files){
    const body=f.b64?{content:f.content,encoding:'base64'}:{content:f.content,encoding:'utf-8'};
    const blob=await (await fetch(B+'/git/blobs',{method:'POST',headers:H,body:JSON.stringify(body)})).json();
    if(!blob.sha) throw new Error('Upload failed for '+f.path);
    tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const newTree=await (await fetch(B+'/git/trees',{method:'POST',headers:H,body:JSON.stringify({base_tree:baseCommit.tree.sha,tree})})).json();
  if(!newTree.sha) throw new Error('Could not build the commit');
  const commit=await (await fetch(B+'/git/commits',{method:'POST',headers:H,body:JSON.stringify({message,tree:newTree.sha,parents:[headSha]})})).json();
  if(!commit.sha) throw new Error('Commit failed');
  const upd=await fetch(B+'/git/refs/heads/'+br,{method:'PATCH',headers:H,body:JSON.stringify({sha:commit.sha})});
  if(!upd.ok) throw new Error('Push failed ('+upd.status+')');
  return commit.sha;
}

function slugify(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function uniqueSlug(base){ base=base||'book'; let s=base,n=2; while(bySlug[s]){ s=base+'-'+n; n++; } return s; }

function loadImageFile(file){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error('bad image')); img.src=URL.createObjectURL(file); }); }
function scaleToJpeg(img,maxW){ const sc=Math.min(1,maxW/img.naturalWidth); const w=Math.round(img.naturalWidth*sc),h=Math.round(img.naturalHeight*sc); const cv=document.createElement('canvas');cv.width=w;cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h); return {w,h,dataUrl:cv.toDataURL('image/jpeg',0.86)}; }
// read the cover's own colours so its detail-page colour-world just works
function coverPalette(img){
  const w=64,h=Math.max(1,Math.round(64*img.naturalHeight/(img.naturalWidth||1)));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.drawImage(img,0,0,w,h);
  const d=c.getImageData(0,0,w,h).data, bins={};
  for(let i=0;i<d.length;i+=4){ if(d[i+3]<128)continue; const r=d[i],g=d[i+1],b=d[i+2]; const k=(r>>4)+'|'+(g>>4)+'|'+(b>>4); const o=bins[k]||(bins[k]={n:0,r:0,g:0,b:0}); o.n++;o.r+=r;o.g+=g;o.b+=b; }
  const arr=Object.keys(bins).map(k=>{const o=bins[k];return {n:o.n,r:Math.round(o.r/o.n),g:Math.round(o.g/o.n),b:Math.round(o.b/o.n)};});
  const hex=o=>'#'+[o.r,o.g,o.b].map(x=>x.toString(16).padStart(2,'0')).join('');
  const sat=o=>{const mx=Math.max(o.r,o.g,o.b),mn=Math.min(o.r,o.g,o.b);return mx?(mx-mn)/mx:0;};
  arr.sort((a,b)=>b.n-a.n);
  const dominant=arr.length?hex(arr[0]):'#b8933f';
  const sum=o=>o.r+o.g+o.b;
  const vivid=arr.filter(o=>sat(o)>0.2&&sum(o)>90&&sum(o)<720).slice(0,6);
  const pal=(vivid.length?vivid:arr).slice(0,3).map(hex);
  while(pal.length<3)pal.push(dominant);
  return {dominantColor:dominant, palette:pal.slice(0,3)};
}

function mergeBookIntoMemory(b){
  if(bySlug[b.slug]) return;
  (b._authors||[]).forEach(a=>{ if(a&&a.slug&&!AUTHORS[a.slug]) AUTHORS[a.slug]={name:a.name}; });
  BOOKS.push(b); bySlug[b.slug]=b; if(LIB.books.indexOf(b)<0) LIB.books.push(b);
  const subjName=b.subject||'New Arrivals', shelfName=b.shelfName||'New Arrivals';
  let subj=(LIB.organization||[]).find(s=>s.subject===subjName);
  if(!subj){ subj={subject:subjName,shelves:[]}; (LIB.organization=LIB.organization||[]).push(subj); if(SUBJECTS.indexOf(subjName)<0)SUBJECTS.push(subjName); }
  let sh=(subj.shelves=subj.shelves||[]).find(x=>x.name===shelfName);
  if(!sh){ sh={name:shelfName,books:[]}; subj.shelves.push(sh); }
  if(sh.books.indexOf(b.slug)<0) sh.books.push(b.slug);
  if(SUBJECT_OF[b.slug]==null) SUBJECT_OF[b.slug]=subjName;
  __orgIndex=null;
}
function removeFromMemory(slug){
  let i=BOOKS.findIndex(b=>b.slug===slug); if(i>=0)BOOKS.splice(i,1);
  let j=LIB.books.findIndex(b=>b.slug===slug); if(j>=0)LIB.books.splice(j,1);
  delete bySlug[slug]; delete SUBJECT_OF[slug];
  (LIB.organization||[]).forEach(subj=>(subj.shelves||[]).forEach(sh=>{ const k=(sh.books||[]).indexOf(slug); if(k>=0)sh.books.splice(k,1); }));
  __orgIndex=null;
}

function initOwnerUI(){
  const nav=document.getElementById('nav'); if(!nav)return;
  // The "Add" sign shows for everyone; only the owner (who has the key saved in their browser) can actually publish.
  if(!document.getElementById('ownerAddLink')){
    const link=document.createElement('a'); link.id='ownerAddLink'; link.href='#/add'; link.setAttribute('data-view','add'); link.textContent='Add'; nav.appendChild(link);
  }
}

function renderOwner(){
  const c=ownerCfg();
  app.innerHTML=`<div class="wrap owner-wrap view">
    <h1 class="section-title">Owner settings</h1>
    <p class="lede" style="margin-bottom:18px">Connect your GitHub repo to add books from the site. Your token is stored only in this browser — it never appears on the public site, so visitors can't add or change anything.</p>
    <div class="ownform">
      <label>GitHub username<input id="o_owner" value="${esc(c.owner||'')}" placeholder="your-github-username" autocapitalize="off" autocomplete="off"></label>
      <label>Repository name<input id="o_repo" value="${esc(c.repo||'')}" placeholder="the-shelf" autocapitalize="off" autocomplete="off"></label>
      <label>Branch<input id="o_branch" value="${esc(c.branch||'main')}" placeholder="main" autocapitalize="off" autocomplete="off"></label>
      <label>Access token<input id="o_token" type="password" value="${esc(c.token||'')}" placeholder="github_pat_…" autocomplete="off"></label>
      <div class="ownrow">
        <button class="btn" id="o_save">Save</button>
        <button class="btn ghost" id="o_test">Test connection</button>
        <span id="o_status" class="own-status"></span>
      </div>
    </div>
    ${isOwner()?`<div style="margin-top:26px"><a class="btn" href="#/publish">+ Publish a book</a></div>`:''}
    <div id="o_added" style="margin-top:30px"></div>
  </div>`;
  const g=id=>document.getElementById(id);
  const read=()=>({owner:g('o_owner').value.trim(),repo:g('o_repo').value.trim(),branch:(g('o_branch').value.trim()||'main'),token:g('o_token').value.trim()});
  g('o_save').onclick=()=>{ setOwnerCfg(read()); toast('Saved in this browser'); initOwnerUI(); renderOwner(); };
  g('o_test').onclick=async()=>{ const st=g('o_status'); setOwnerCfg(read()); st.textContent='Checking…'; st.className='own-status'; try{ const repo=await ghTest(); st.textContent='✓ Connected to '+repo.full_name; st.className='own-status ok'; }catch(e){ st.textContent='✗ '+e.message; st.className='own-status bad'; } };
  renderAddedList();
}
function renderAddedList(){
  const box=document.getElementById('o_added'); if(!box)return;
  const mine=BOOKS.filter(b=>b._added);
  box.innerHTML = mine.length ? `<h2 style="font-size:20px;margin:0 0 10px">Books you've added (${mine.length})</h2>`+
    mine.map(b=>`<div class="added-row"><a href="#/book/${b.slug}">${esc(b.title)}</a><span>${esc(authorName(b.authors[0]))}</span><button class="btn ghost sm" data-del="${esc(b.slug)}">Delete</button></div>`).join('') : '';
  box.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=()=>deleteAdded(btn.dataset.del));
}
async function deleteAdded(slug){
  if(!isOwner()){ toast('Connect your repo first'); return; }
  const b=bySlug[slug];
  if(!window.confirm('Remove "'+(b?b.title:slug)+'" from the shelf?')) return;
  try{
    const f=await ghGetFile('data/added-books.json');
    let list=f?(JSON.parse(f.text)||[]):[];
    list=list.filter(x=>x.slug!==slug);
    await ghCommit([{path:'data/added-books.json',content:JSON.stringify(list,null,2)}],'Remove book: '+slug);
    removeFromMemory(slug);
    toast('Removed. Gone for everyone in ~1 min.');
    renderOwner();
  }catch(e){ toast('Delete failed: '+e.message); }
}

/* Public "suggest a book" form — open to everyone; emails the owner via Web3Forms. */
const WEB3FORMS_KEY='7df2f3ab-df9d-41a0-84c4-b4202dd8cbc8'; // Web3Forms access key — routes suggestions to the owner's inbox
function renderSubmit(){
  const ownerLink=isOwner()?`<div style="margin:-6px 0 18px"><a class="btn ghost sm" href="#/publish">You're the keeper — publish a book directly →</a></div>`:'';
  app.innerHTML=`<div class="wrap add-wrap view">
    <h1 class="section-title">Suggest a book</h1>
    <p class="lede" style="margin-bottom:18px">Loved a book and think it belongs here? Suggest it below. Every suggestion goes to the keeper of the shelf, who decides what finds a home on it.</p>
    ${ownerLink}
    <form id="suggestForm" class="addform">
      <div class="fgrid">
        <label class="req">Book title *<input name="title" required></label>
        <label class="req">Author *<input name="author" required></label>
        <label>Year first published<input name="year" type="number"></label>
        <label>Genre<input name="genre"></label>
      </div>
      <label class="full req">Why should it be on the shelf? *<textarea name="why" rows="4" required placeholder="A line or two on why you love it…"></textarea></label>
      <label class="full">Your name (optional)<input name="from_name" placeholder="So the keeper knows who to thank"></label>
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off">
      <div class="ownrow">
        <button class="btn" type="submit" id="suggestBtn">Send suggestion</button>
        <span id="suggestStatus" class="own-status"></span>
      </div>
    </form>
  </div>`;
  const form=document.getElementById('suggestForm');
  form.onsubmit=async ev=>{
    ev.preventDefault();
    const st=document.getElementById('suggestStatus'), btn=document.getElementById('suggestBtn');
    const fd=new FormData(form);
    if(fd.get('botcheck')) return;                 // honeypot
    if(!WEB3FORMS_KEY){ st.textContent='Suggestions aren’t switched on yet.'; st.className='own-status bad'; return; }
    const payload={
      access_key:WEB3FORMS_KEY,
      subject:'📚 New book suggestion for The Shelf',
      from_name:'The Shelf',
      Title:fd.get('title'), Author:fd.get('author'), Year:fd.get('year')||'—', Genre:fd.get('genre')||'—',
      Why:fd.get('why'), Suggested_by:fd.get('from_name')||'anonymous'
    };
    btn.disabled=true; st.textContent='Sending…'; st.className='own-status';
    try{
      const r=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
      const j=await r.json();
      if(j.success){ document.querySelector('.add-wrap').innerHTML=`<h1 class="section-title">Thank you 🌱</h1><p class="lede">Your suggestion is on its way to the keeper of the shelf. If it finds a home here, you may just see it appear.</p><div style="margin-top:22px"><a class="btn" href="#/shelf">Back to the shelf</a></div>`; }
      else throw new Error(j.message||'Could not send');
    }catch(e){ btn.disabled=false; st.textContent='✗ '+e.message; st.className='own-status bad'; }
  };
}

function renderPublishGate(){
  const c=ownerCfg();
  app.innerHTML=`<div class="wrap owner-wrap view">
    <h1 class="section-title">Publish a book</h1>
    <p class="lede" style="margin-bottom:18px">Publishing to the shelf is just for you, the keeper. Unlock it with your key (saved only in this browser). Everyone else can suggest books, but only you put them on the shelf.</p>
    <div class="ownform">
      <label>GitHub username<input id="o_owner" value="${esc(c.owner||'')}" placeholder="your-github-username" autocapitalize="off" autocomplete="off"></label>
      <label>Repository name<input id="o_repo" value="${esc(c.repo||'')}" placeholder="the-shelf" autocapitalize="off" autocomplete="off"></label>
      <label>Branch<input id="o_branch" value="${esc(c.branch||'main')}" placeholder="main" autocapitalize="off" autocomplete="off"></label>
      <label>Access token<input id="o_token" type="password" value="${esc(c.token||'')}" placeholder="ghp_…" autocomplete="off"></label>
      <div class="ownrow">
        <button class="btn" id="o_unlock">Unlock</button>
        <button class="btn ghost" id="o_test">Test connection</button>
        <span id="o_status" class="own-status"></span>
      </div>
    </div>
  </div>`;
  const g=id=>document.getElementById(id);
  const read=()=>({owner:g('o_owner').value.trim(),repo:g('o_repo').value.trim(),branch:(g('o_branch').value.trim()||'main'),token:g('o_token').value.trim()});
  g('o_unlock').onclick=async()=>{ const st=g('o_status'); setOwnerCfg(read()); st.textContent='Checking…'; st.className='own-status'; try{ await ghTest(); initOwnerUI(); toast('Unlocked'); renderPublish(); }catch(e){ st.textContent='✗ '+e.message; st.className='own-status bad'; } };
  g('o_test').onclick=async()=>{ const st=g('o_status'); setOwnerCfg(read()); st.textContent='Checking…'; st.className='own-status'; try{ const r=await ghTest(); st.textContent='✓ Connected to '+r.full_name; st.className='own-status ok'; }catch(e){ st.textContent='✗ '+e.message; st.className='own-status bad'; } };
}
function renderPublish(){
  if(!isOwner()){ renderPublishGate(); return; }
  const subjOpts=SUBJECTS.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const genreOpts=Object.keys(GENRES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const moodOpts=MOODS.map(m=>`<label class="pchk"><input type="checkbox" value="${esc(m.slug)}"> ${esc(m.label)}</label>`).join('');
  const diffOpts=[['gentle','Gentle'],['moderate','Moderate'],['challenging','Challenging'],['summit','Summit']].map(d=>`<option value="${d[0]}"${d[0]==='moderate'?' selected':''}>${d[1]}</option>`).join('');
  const paceOpts=[['gentle','Gentle'],['steady','Steady'],['brisk','Brisk'],['propulsive','Propulsive']].map(d=>`<option value="${d[0]}"${d[0]==='steady'?' selected':''}>${d[1]}</option>`).join('');
  const regionList=[...new Set(BOOKS.map(b=>b.region).filter(Boolean))].sort().map(r=>`<option value="${esc(r)}">`).join('');
  app.innerHTML=`<div class="wrap add-wrap view">
    <h1 class="section-title">Publish a book</h1>
    <p class="lede" style="margin-bottom:20px">Put a book on the shelf. It shows for you right away, and goes live for everyone within about a minute.</p>
    <form id="addForm" class="addform">
      <div class="fgrid">
        <label class="req">Title *<input name="title" required></label>
        <label>Subtitle<input name="subtitle"></label>
        <label class="req">Author(s) *<input name="authors" required placeholder="Jane Austen, ..."></label>
        <label class="req">Year first published *<input name="year" type="number" required placeholder="1843"></label>
        <label class="req">Genre *<select name="genre">${genreOpts}</select></label>
        <label>Region / country<input name="region" list="regionlist" placeholder="England"><datalist id="regionlist">${regionList}</datalist></label>
        <label>Publisher<input name="publisher"></label>
        <label>Edition / series<input name="series" placeholder="Penguin Clothbound Edition"></label>
        <label>ISBN<input name="isbn"></label>
        <label>Pages<input name="pages" type="number"></label>
        <label>Difficulty<select name="difficulty">${diffOpts}</select></label>
        <label>Pace<select name="pace">${paceOpts}</select></label>
        <label class="req">Subject (shelf heading) *<select name="subject">${subjOpts}</select></label>
        <label class="req">Shelf *<input name="shelf" list="shelflist" value="New Arrivals"><datalist id="shelflist"></datalist></label>
      </div>
      <label class="full">Tags (comma separated)<input name="tags" placeholder="christmas, redemption, ghosts"></label>
      <fieldset class="moods"><legend>Moods</legend><div class="moodgrid">${moodOpts}</div></fieldset>
      <label class="full req">Summary (~100 words) *<textarea name="summary" rows="5" required></textarea></label>
      <label class="full">Why read it<textarea name="why" rows="2"></textarea></label>
      <label class="full">A fun fact<textarea name="fact" rows="2"></textarea></label>
      <label class="full">One-line hook<input name="oneline" placeholder="Three ghosts give a miser one night to change his heart."></label>
      <label class="full req">Cover image *<input name="cover" type="file" accept="image/*" required></label>
      <div id="coverPrev" class="cover-prev"></div>
      <div class="ownrow">
        <button class="btn" type="submit" id="addSubmit">Add to shelf</button>
        <a class="btn ghost" href="#/owner">Owner settings</a>
        <span id="addStatus" class="own-status"></span>
      </div>
    </form>
  </div>`;
  const form=document.getElementById('addForm');
  const shelfList=document.getElementById('shelflist');
  function fillShelves(){ const subj=(LIB.organization||[]).find(s=>s.subject===form.subject.value); const names=subj?(subj.shelves||[]).map(s=>s.name):[]; shelfList.innerHTML=names.map(n=>`<option value="${esc(n)}">`).join(''); }
  form.subject.onchange=fillShelves; fillShelves();
  let coverData=null;
  form.cover.onchange=async e=>{
    const file=e.target.files[0]; if(!file)return;
    try{ const img=await loadImageFile(file); const scaled=scaleToJpeg(img,720); const pal=coverPalette(img); coverData=Object.assign({},scaled,pal);
      document.getElementById('coverPrev').innerHTML=`<img src="${scaled.dataUrl}" alt=""><div class="pal">${pal.palette.map(h=>`<span style="background:${h}"></span>`).join('')}</div>`;
    }catch(err){ toast('Could not read that image'); }
  };
  form.onsubmit=async ev=>{
    ev.preventDefault();
    if(!coverData){ toast('Please choose a cover image'); return; }
    const st=document.getElementById('addStatus'), btn=document.getElementById('addSubmit');
    const fd=new FormData(form);
    const title=(fd.get('title')||'').trim();
    const authorNames=(fd.get('authors')||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!title||!authorNames.length){ toast('Title and author are required'); return; }
    const authors=authorNames.map(n=>({slug:slugify(n),name:n}));
    authors.forEach(a=>{ if(!AUTHORS[a.slug]){ const hit=Object.keys(AUTHORS).find(k=>slugify(AUTHORS[k].name||'')===a.slug); if(hit)a.slug=hit; } });
    const slug=uniqueSlug(slugify(title));
    const coverPath='assets/covers/'+slug+'.jpg';
    const moods=[...form.querySelectorAll('.moodgrid input:checked')].map(i=>i.value);
    const factText=(fd.get('fact')||'').trim();
    const book={
      slug, title, subtitle:(fd.get('subtitle')||'').trim()||null,
      authors:authors.map(a=>a.slug), translator:null, originalLanguage:'English', translated:false,
      originalPublicationYear:parseInt(fd.get('year'),10)||null,
      edition:{publisher:(fd.get('publisher')||'').trim()||null, series:(fd.get('series')||'').trim()||null, isbn:(fd.get('isbn')||'').trim()||null, pageCount:parseInt(fd.get('pages'),10)||null},
      cover:{file:coverPath, source:'owned', match:'owned-edition', sourceUrl:null, dominantColor:coverData.dominantColor, w:coverData.w, h:coverData.h, palette:coverData.palette},
      genre:fd.get('genre'), subgenres:[], region:(fd.get('region')||'').trim()||'',
      tags:(fd.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean),
      moods, difficulty:fd.get('difficulty')||'moderate', pace:fd.get('pace')||'steady',
      vibeProfile:{occasions:[],sensory:[],oneLine:(fd.get('oneline')||'').trim()||''},
      summary:(fd.get('summary')||'').trim(), summarySource:'owner',
      whyReadIt:(fd.get('why')||'').trim()||'', awards:[],
      funFacts:factText?[{text:factText,source:null,type:'knowledge'}]:[],
      physicalShelf:null, enriched:true,
      subject:fd.get('subject'), shelfName:(fd.get('shelf')||'New Arrivals').trim()||'New Arrivals',
      _authors:authors, _added:true
    };
    btn.disabled=true; st.textContent='Publishing…'; st.className='own-status';
    try{
      const f=await ghGetFile('data/added-books.json');
      let list=[]; if(f){ try{list=JSON.parse(f.text)||[];}catch(e){list=[];} }
      list.push(book);
      await ghCommit([
        {path:coverPath, content:coverData.dataUrl.split(',')[1], b64:true},
        {path:'data/added-books.json', content:JSON.stringify(list,null,2)}
      ], 'Add book: '+title);
      const memBook=JSON.parse(JSON.stringify(book)); memBook.cover.file=coverData.dataUrl; // show instantly before the deploy lands
      mergeBookIntoMemory(memBook);
      toast('Added! Live for everyone in ~1 minute.');
      location.hash='#/book/'+slug;
    }catch(e){ btn.disabled=false; st.textContent='✗ '+e.message; st.className='own-status bad'; }
  };
}

initOwnerUI();

render();
})();
