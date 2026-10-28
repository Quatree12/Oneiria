/* ============================================================
   ONEIRIA — noyau applicatif
   Journal de rêves local (IndexedDB), 100 % navigateur.
   ============================================================ */
'use strict';

/* ---------- Constantes ---------- */
const DB_NAME = 'oneiria';
const DB_VERSION = 1;
const STORE_DREAMS = 'dreams';
const SCHEMA = 'oneiria/1';

const EMOTIONS = ['Émerveillement','Joie','Paix','Confusion','Peur','Mélancolie','Curiosité',
  'Nostalgie','Sérénité','Vertige','Tendresse','Colère','Honte','Euphorie','Solitude','Gratitude'];
const EMOTION_COLOR = {
  'Émerveillement':'#A99AFF','Joie':'#80E5DF','Paix':'#9EE7C4',
  'Confusion':'#F2B6D8','Peur':'#8FA0FF','Mélancolie':'#C6B7FF','Curiosité':'#7FD7E8'
};
const TYPES = { ecrit:'Écrit', raconte:'Raconté', oublie:'Oublié' };

const PALETTE = [
  { c:'#A99AFF', n:'Violet' },
  { c:'#80E5DF', n:'Turquoise' },
  { c:'#F2B6D8', n:'Rose astral' },
  { c:'#F7F4FF', n:'Blanc perle' },
  { c:'#6C8CFF', n:'Bleu' },
  { c:'#FFD9A0', n:'Ambre' },
  { c:'#FF8FB8', n:'Fuchsia' },
  { c:'#9EE7C4', n:'Menthe' },
  { c:'#E0C3FF', n:'Lavande' },
  { c:'#FFB4A2', n:'Corail' }
];

/* ---------- Raccourcis ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);

/* ============================================================
   1. STOCKAGE — IndexedDB avec repli localStorage
   ============================================================ */
const Store = (() => {
  let db = null;
  let mode = 'idb'; // 'idb' | 'ls'
  let memory = [];  // repli mémoire si même localStorage échoue
  const LS_KEY = 'oneiria.dreams.v1';
  const LS_MODE = 'oneiria.backend';

  function openDB(){
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponible'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch(e){ return reject(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE_DREAMS)){
          const s = d.createObjectStore(STORE_DREAMS, { keyPath:'id' });
          s.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloquée'));
      setTimeout(() => reject(new Error('IndexedDB: délai dépassé')), 4000);
    });
  }

  function lsRead(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch(e){ return memory.slice(); }
  }
  function lsWrite(list){
    memory = list.slice();
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
    catch(e){ /* quota dépassé : on garde en mémoire pour la session */ }
  }
  function tryLocalStorage(){
    try {
      const k = 'oneiria.test';
      localStorage.setItem(k,'1'); localStorage.removeItem(k);
      return true;
    } catch(e){ return false; }
  }

  async function init(){
    try{
      db = await openDB();
      mode = 'idb';
    }catch(err){
      db = null;
      if (tryLocalStorage()){ mode = 'ls'; memory = lsRead(); }
      else { mode = 'mem'; memory = []; }
      console.warn('[Oneiria] Repli de stockage :', mode, err && err.message);
    }
    try { localStorage.setItem(LS_MODE, mode); } catch(e){}
    return mode;
  }

  function tx(write){
    return db.transaction(STORE_DREAMS, write ? 'readwrite' : 'readonly').objectStore(STORE_DREAMS);
  }

  function all(){
    if (mode === 'idb'){
      return new Promise((resolve, reject) => {
        const req = tx(false).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    return Promise.resolve(lsRead());
  }

  function putOne(dream){
    if (mode === 'idb'){
      return new Promise((resolve, reject) => {
        const req = tx(true).put(dream);
        req.onsuccess = () => resolve(dream);
        req.onerror = () => reject(req.error);
      });
    }
    const list = lsRead();
    const i = list.findIndex(d => d.id === dream.id);
    if (i >= 0) list[i] = dream; else list.push(dream);
    lsWrite(list);
    return Promise.resolve(dream);
  }

  function delOne(id){
    if (mode === 'idb'){
      return new Promise((resolve, reject) => {
        const req = tx(true).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }
    lsWrite(lsRead().filter(d => d.id !== id));
    return Promise.resolve(true);
  }

  function clearAll(){
    if (mode === 'idb'){
      return new Promise((resolve, reject) => {
        const req = tx(true).clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }
    lsWrite([]);
    return Promise.resolve(true);
  }

  /** Écrit plusieurs rêves d'un coup (import). */
  async function putMany(list){
    if (mode === 'idb'){
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_DREAMS,'readwrite');
        const s = t.objectStore(STORE_DREAMS);
        list.forEach(d => s.put(d));
        t.oncomplete = () => resolve(list.length);
        t.onerror = () => reject(t.error);
      });
    }
    const cur = lsRead();
    list.forEach(d => {
      const i = cur.findIndex(x => x.id === d.id);
      if (i >= 0) cur[i] = d; else cur.push(d);
    });
    lsWrite(cur);
    return list.length;
  }

  /** Estimation du stockage utilisé. */
  async function estimate(){
    try{
      if (navigator.storage && navigator.storage.estimate){
        const e = await navigator.storage.estimate();
        return { usage:e.usage, quota:e.quota, mode };
      }
    }catch(e){}
    return { usage:null, quota:null, mode };
  }

  return { init, all, putOne, delOne, clearAll, putMany, estimate,
           get mode(){ return mode; } };
})();

/* ============================================================
   2. MODÈLE
   ============================================================ */
function nowISO(){ return new Date().toISOString(); }

function newDream({ type='ecrit', title='', text='', emotions=[], keywords=[], drawing=null, date=null }){
  const id = uid();
  return {
    id, schema:SCHEMA,
    type,
    title: (title||'').trim(),
    createdAt: date || nowISO(),
    emotions: normEmotions(emotions),
    keywords: normKeywords(keywords),
    drawing: drawing || null,
    fragments: [{
      id: uid(),
      kind: type,
      text: (text||'').trim(),
      createdAt: date || nowISO()
    }]
  };
}

function normKeywords(list){
  const out = [];
  (list||[]).forEach(k => {
    const v = String(k||'').trim().replace(/^#+/,'').toLowerCase();
    if (v && v.length <= 40 && !out.includes(v)) out.push(v);
  });
  return out;
}

function parseKeywords(str){
  return normKeywords(String(str||'').split(/[,;\n]/));
}

function dreamText(d){
  return (d.fragments||[]).map(f => f.text).filter(Boolean).join('\n\n');
}

function displayTitle(d){
  if (d.title && d.title.trim()) return d.title.trim();
  if (d.type === 'oublie') return 'Rêve oublié';
  const t = dreamText(d).replace(/\s+/g,' ').trim();
  if (!t) return 'Rêve sans titre';
  return t.length > 46 ? t.slice(0,46).trim() + '…' : t;
}

function formatDate(iso){
  try{
    return new Intl.DateTimeFormat('fr-FR',{ day:'2-digit', month:'short', year:'numeric' }).format(new Date(iso));
  }catch(e){ return (iso||'').slice(0,10); }
}
function formatDateTime(iso){
  try{
    return new Intl.DateTimeFormat('fr-FR',{ weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));
  }catch(e){ return iso; }
}
function formatShort(iso){
  try{
    return new Intl.DateTimeFormat('fr-FR',{ day:'2-digit', month:'short' }).format(new Date(iso));
  }catch(e){ return ''; }
}

/* ============================================================
   3. ÉTAT GLOBAL
   ============================================================ */
const State = {
  dreams: [],
  view: 'univers',
  filter: 'tous',
  search: '',
  constellation: null,
  currentDreamId: null,
  drawingDreamId: null,
  dirty: { raccontes:false, decrit:false }
};

async function loadDreams(){
  const list = await Store.all();
  State.dreams = list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return State.dreams;
}
async function saveDream(d){
  await Store.putOne(d);
  const i = State.dreams.findIndex(x => x.id === d.id);
  if (i >= 0) State.dreams[i] = d; else State.dreams.push(d);
  State.dreams.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function getDream(id){ return State.dreams.find(d => d.id === id); }

/* ============================================================
   4. TOASTS, DIALOGUE, FEUILLES
   ============================================================ */
function toast(msg, kind=''){
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}

function confirmDialog({ title='Confirmer', text='', ok='Confirmer', cancel='Annuler', danger=false }){
  return new Promise(resolve => {
    const dlg = $('#dialog');
    $('#dlg-title').textContent = title;
    $('#dlg-text').textContent = text;
    const okBtn = $('#dlg-ok'), cancelBtn = $('#dlg-cancel');
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    okBtn.className = 'btn ' + (danger ? 'danger-ghost' : 'primary');
    dlg.hidden = false;

    function done(val){
      dlg.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onNo);
      dlg.removeEventListener('click', onBack);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onOk(){ done(true); }
    function onNo(){ done(false); }
    function onBack(e){ if (e.target === dlg) done(false); }
    function onKey(e){ if (e.key === 'Escape') done(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onNo);
    dlg.addEventListener('click', onBack);
    document.addEventListener('keydown', onKey);
  });
}

function openSheet(id){
  const s = $('#'+id);
  s.hidden = false;
  $('#sheet-backdrop').hidden = false;
  document.body.classList.add('locked');
  const close = s.querySelector('.icon-btn.close');
  if (close) close.focus({ preventScroll:true });
}
function closeSheet(id){
  const s = $('#'+id);
  if (!s || s.hidden) return;
  s.hidden = true;
  if (!$$('.sheet').some(x => !x.hidden)) {
    $('#sheet-backdrop').hidden = true;
    document.body.classList.remove('locked');
  }
}
function closeAllSheets(){
  $$('.sheet').forEach(s => s.hidden = true);
  $('#sheet-backdrop').hidden = true;
  document.body.classList.remove('locked');
}

/* ============================================================
   5. NAVIGATION
   ============================================================ */
function go(view){
  if (!['univers','raccontes','decrit','memory'].includes(view)) view = 'univers';
  State.view = view;
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== view; });
  $$('.tab').forEach(t => {
    const on = t.dataset.view === view;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
  const main = $('#main');
  main.style.paddingTop = '';
  window.scrollTo({ top:0, behavior:'auto' });
  if (view === 'univers') renderUnivers();
  if (view === 'memory') renderMemory();
}
window.OneiriaGo = go;

/* ============================================================
   6. UNIVERS
   ============================================================ */
/* Un satellite par rêve : posé directement dans .orb-orbits (jamais dans une
   piste, car un enfant hérite du scaleY de son parent et s'aplatit).
   Position et orbite dérivées de l'identifiant : un rêve garde sa place. */
const SAT_ORBIT = { cx: '50%', cy: '50%' };

function hashOf(str){
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function buildOrbits(){
  const box = $('#orb-orbits');
  if (!box) return;
  const dreams = State.dreams.slice(0, 24);
  box.innerHTML = '';

  // Aucun rêve : trois pistes décoratives seulement
  if (dreams.length === 0){
    [1,2,3].forEach(n => {
      const ring = document.createElement('div');
      ring.className = 'orb-ring empty r' + n;
      box.appendChild(ring);
    });
    return;
  }

  const stage = $('#orb-stage');
  const boxRect = box.getBoundingClientRect();
  const size = boxRect.width || 260;         // largeur de la scène en px

  dreams.forEach((d, i) => {
    const h = hashOf(d.id);

    // Rayon horizontal : chaque rêve a SON orbite, du plus large au plus serré
    const layerR = 0.46 - (i % 6) * 0.05;    // 0.46 → 0.21 (fraction de la largeur)
    const ratioY = 0.26 + ((h >> 4) % 30) / 100;   // 0.26 → 0.55 : aplatissement
    const rx = Math.round(size * layerR);
    const ry = Math.round(rx * ratioY);
    const dur = 18 + ((h >> 8) % 24);        // 18s → 42s par tour
    const delay = -((h >> 12) % dur);

    // La piste correspondante, en ellipse décorative
    const ring = document.createElement('div');
    ring.className = 'orb-ring empty';
    const insetPct = Math.round(50 - layerR * 100);
    ring.style.inset = insetPct + '%';
    ring.style.setProperty('--tilt', ((h % 120) - 60) + 'deg');
    ring.style.setProperty('--squash', ratioY);
    box.appendChild(ring);

    // Le satellite : hors de la piste, positionné par translate
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'sat';
    const emo = dreamEmotions(d)[0] || '';
    dot.style.color = EMOTION_COLOR[emo] || SAT_COLORS[h % SAT_COLORS.length];
    dot.style.setProperty('--cx', '50%');
    dot.style.setProperty('--cy', '50%');
    dot.style.setProperty('--rx', rx + 'px');
    dot.style.setProperty('--ry', ry + 'px');
    dot.style.setProperty('--dur', dur + 's');
    dot.style.setProperty('--d-off', delay + 's');
    dot.setAttribute('aria-label', displayTitle(d));
    dot.title = displayTitle(d);
    dot.addEventListener('click', () => openDream(d.id));
    box.appendChild(dot);
  });
}

function renderUnivers(){
  const n = State.dreams.length;
  const cap = $('#orb-caption');
  if (n === 0) cap.textContent = 'Votre ciel est encore vierge.';
  else if (n === 1) cap.textContent = '1 fragment veille dans votre ciel.';
  else cap.textContent = n + ' fragments veillent dans votre ciel.';

  buildOrbits();
  renderConstellations();
  renderRecent();
}

/* Une constellation = un thème présent dans AU MOINS DEUX rêves.
   Les mots vides et les mots de moins de trois lettres sont écartés. */
const STOPWORDS = new Set(['a','au','aux','avec','ce','ces','cet','dans','de','des','du','elle','en',
  'et','eux','il','ils','je','la','le','les','leur','lui','ma','mais','me','mes','moi','mon','ne',
  'nos','notre','nous','on','ou','par','pas','pour','qu','que','qui','sa','se','ses','son','sur',
  'ta','te','tes','toi','ton','tu','un','une','vos','votre','vous','y','ete','etre','fait','faire']);

function isThemeWord(w){
  return w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w);
}

/* Lit les émotions d'un rêve : tableau (nouveau format) ou valeur unique
   (rêves enregistrés avant la sélection multiple). */
function dreamEmotions(d){
  if (Array.isArray(d.emotions)) return d.emotions;
  if (d.emotion) return [d.emotion];
  return [];
}

function normEmotions(list){
  const src = Array.isArray(list) ? list : (list ? [list] : []);
  const out = [];
  src.forEach(e => {
    const v = String(e || '').trim();
    if (v && !out.includes(v)) out.push(v);
  });
  return out;
}

function themeIndex(){
  const map = new Map();
  State.dreams.forEach(d => {
    const set = new Set();
    (d.keywords||[]).forEach(k => {
      const w = String(k||'').toLowerCase().trim();
      if (isThemeWord(w)) set.add(w);
    });
    dreamEmotions(d).forEach(e => {
      const w = String(e||'').toLowerCase().trim();
      if (w) set.add(w);
    });
    set.forEach(k => {
      if (!map.has(k)) map.set(k, { word:k, count:0, ids:[], color:null });
      const e = map.get(k);
      e.count++;
      e.ids.push(d.id);
      const emo = EMOTIONS.find(x => x.toLowerCase() === k);
      if (emo) e.color = EMOTION_COLOR[emo];
    });
  });
  return Array.from(map.values())
    .filter(t => t.count >= 2)
    .sort((a,b) => b.count - a.count || a.word.localeCompare(b.word));
}

function renderConstellations(){
  const box = $('#constellations');
  const themes = themeIndex();
  box.innerHTML = '';
  $('#const-count').textContent = themes.length ? themes.length + ' thème(s)' : '';

  if (themes.length === 0){
    $('#const-lead').textContent = 'Les mots-clés et les émotions de vos rêves dessineront ici des constellations.';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<h4>Aucun thème pour l’instant</h4>' +
      '<p>Écrivez un premier rêve : ses mots-clés deviendront une étoile, puis une constellation.</p>' +
      '<button class="btn primary" id="empty-first" type="button">Enregistrer mon premier rêve</button>';
    box.appendChild(empty);
    const b = $('#empty-first');
    if (b) b.addEventListener('click', () => go('raccontes'));
    return;
  }
  $('#const-lead').textContent = 'Chaque bulle rassemble les rêves qui partagent ce thème. Touchez-en une pour ouvrir Memory.';

  const max = themes[0].count;
  themes.slice(0, 18).forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bubble c' + (i % 3);
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (t.color) dot.style.color = t.color;
    b.appendChild(dot);
    b.appendChild(document.createTextNode(t.word));
    const c = document.createElement('span');
    c.className = 'cnt';
    c.textContent = t.count;
    b.appendChild(c);
    // Taille progressive selon le nombre de fragments
    const scale = 0.92 + Math.min(0.34, (t.count / max) * 0.34);
    b.style.fontSize = (12.5 * scale + 1.5).toFixed(1) + 'px';
    b.style.animationDelay = Math.min(i * 26, 400) + 'ms';
    b.addEventListener('click', () => {
      State.constellation = t.word;
      State.filter = 'tous';
      State.search = '';
      $('#mem-search').value = '';
      go('memory');
      renderMemory();
      toast('Filtre « ' + t.word + ' » appliqué.');
    });
    box.appendChild(b);
  });
}

function renderRecent(){
  const box = $('#recent');
  box.innerHTML = '';
  if (State.dreams.length === 0){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<h4>Pas encore de fragment</h4>' +
      '<p>Un rêve oublié compte aussi. Il suffit d’un fil pour commencer.</p>' +
      '<button class="btn ghost" id="empty-forgot" type="button">Marquer « Rêve oublié »</button>';
    box.appendChild(empty);
    const b = $('#empty-forgot');
    if (b) b.addEventListener('click', createForgotten);
    return;
  }
  State.dreams.slice(0,4).forEach(d => box.appendChild(miniCard(d)));
}

function miniCard(d){
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mini';
  const thumb = document.createElement('span');
  thumb.className = 'mini-thumb';
  if (d.drawing && d.drawing.dataUrl){
    const img = document.createElement('img');
    img.src = d.drawing.dataUrl; img.alt = '';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/></svg>';
  }
  const body = document.createElement('span');
  body.className = 'mini-body';
  const st = document.createElement('strong'); st.textContent = displayTitle(d);
  const sp = document.createElement('span');
  const txt = dreamText(d).replace(/\s+/g,' ').trim();
  sp.textContent = txt ? txt.slice(0,58) + (txt.length>58?'…':'') : 'Aucun récit — trace gardée.';
  body.appendChild(st); body.appendChild(sp);
  const dt = document.createElement('span');
  dt.className = 'mini-date';
  dt.textContent = formatShort(d.createdAt);
  el.appendChild(thumb); el.appendChild(body); el.appendChild(dt);
  el.addEventListener('click', () => openDream(d.id));
  return el;
}

/* ============================================================
   7. RACCONTES
   ============================================================ */
let rcEmotions = [];

/* Sélection MULTIPLE : chaque puce s'ajoute ou se retire indépendamment. */
function buildChips(container, onPick){
  container.innerHTML = '';
  container.classList.add('chips-multi');
  EMOTIONS.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = e;
    b.dataset.value = e;
    b.setAttribute('role','checkbox');
    b.setAttribute('aria-checked','false');
    b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      const picked = Array.from(container.querySelectorAll('.chip.on')).map(c => c.dataset.value);
      onPick(picked);
    });
    container.appendChild(b);
  });
}

/* Remplit les puces depuis une liste (édition d'un rêve existant). */
function setChips(container, values){
  if (!container) return;
  const set = new Set(values || []);
  Array.from(container.querySelectorAll('.chip')).forEach(c => {
    const on = set.has(c.dataset.value);
    c.classList.toggle('on', on);
    c.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function resetRaccontes(force){
  if (!force && formIsDirty('raccontes')) {
    return askLeave('Raccontes');
  }
  $('#form-raccontes').reset();
  rcEmotions = [];
  setChips($('#rc-emotions'), []);
  $('#rc-count').textContent = '0';
  State.dirty.raccontes = false;
  hideHint('#rc-hint');
}

function formIsDirty(which){
  if (which === 'raccontes'){
    return !!(($('#rc-titre').value||'').trim() || ($('#rc-texte').value||'').trim() ||
              ($('#rc-mots').value||'').trim() || rcEmotions.length);
  }
  if (which === 'decrit'){
    return !!(($('#dc-titre').value||'').trim() || ($('#dc-texte').value||'').trim() ||
              ($('#dc-mots').value||'').trim() || dcEmotions.length);
  }
  return false;
}

async function askLeave(which){
  const ok = await confirmDialog({
    title:'Abandonner ce récit ?',
    text:'Ce que vous avez écrit n’est pas encore enregistré. En quittant cet écran, il sera perdu.',
    ok:'Abandonner', cancel:'Rester ici', danger:true
  });
  if (ok) resetRaccontes(true);
  return ok;
}

function hideHint(sel){ const h = $(sel); h.hidden = true; h.textContent = ''; }
function showHint(sel, msg){ const h = $(sel); h.textContent = msg; h.hidden = false; }

async function submitRaccontes(e){
  e.preventDefault();
  const text = ($('#rc-texte').value || '').trim();
  if (!text){
    showHint('#rc-hint','Le récit est nécessaire pour enregistrer un rêve écrit. Écrivez au moins une phrase, ou utilisez « Je ne m’en souviens plus ».');
    $('#rc-texte').focus();
    return;
  }
  const d = newDream({
    type:'ecrit',
    title: $('#rc-titre').value,
    text,
    emotions: rcEmotions,
    keywords: parseKeywords($('#rc-mots').value)
  });
  try{
    await saveDream(d);
  }catch(err){
    showHint('#rc-hint','L’enregistrement a échoué : ' + (err && err.message ? err.message : 'stockage indisponible') + '.');
    return;
  }
  resetRaccontes(true);
  hideHint('#rc-hint');
  toast('Rêve enregistré. Il est dans votre Memory.', 'ok');
  renderUnivers();
  openDrawSheet(d.id, true);
}

/* ============================================================
   8. DÉCRIT — dictée
   ============================================================ */
let dcEmotions = [];
let recognition = null;
let listening = false;
let interimBuffer = '';
let recErrorShown = false;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupSpeech(){
  const help = $('#mic-help');
  if (!SR){
    help.className = 'mic-help warn';
    help.innerHTML = 'La reconnaissance vocale du navigateur n’est pas disponible ici. <b>Le microphone ne sera pas activé.</b> ' +
      'Vous pouvez dicter à la voix à l’aide du clavier de votre iPhone : ouvrez le clavier dans le champ de transcription, puis touchez l’icône de microphone du clavier. Vous pouvez aussi écrire le récit à la main.';
    $('#mic-btn').setAttribute('disabled','');
    $('#mic-btn').style.opacity = '.45';
    return;
  }
  help.className = 'mic-help';
  help.innerHTML = 'Appuyez sur le cercle pour dicter. La transcription s’ajoute au champ ci-dessous pendant que vous parlez, avec l’accord du navigateur.';
}

function startDictation(){
  if (!SR || listening) return;
  recognition = new SR();
  recognition.lang = 'fr-FR';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  interimBuffer = '';

  recognition.onstart = () => {
    listening = true;
    $('#mic-btn').classList.add('live');
    $('#mic-btn').setAttribute('aria-label','Arrêter la dictée');
    $('#mic-state').textContent = 'Écoute active…';
    $('#mic-stop').hidden = false;
    recErrorShown = false;
  };
  recognition.onresult = (ev) => {
    let finalTxt = '';
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++){
      const r = ev.results[i];
      if (r.isFinal) finalTxt += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalTxt){
      const ta = $('#dc-texte');
      ta.value = (ta.value ? ta.value.replace(/\s+$/,'') + ' ' : '') + finalTxt.trim();
      updateCount('#dc-texte','#dc-count');
      State.dirty.decrit = true;
    }
    interimBuffer = interim;
    $('#mic-state').textContent = interim ? '… ' + interim.slice(-42) : 'Écoute active…';
  };
  recognition.onerror = (ev) => {
    const code = ev.error;
    if (code === 'not-allowed' || code === 'service-not-allowed'){
      showHint('#dc-hint','L’accès au microphone a été refusé. Autorisez-le dans les réglages du navigateur, ou écrivez le récit à la main — cette saisie fonctionne normalement.');
    } else if (code === 'no-speech'){
      showHint('#dc-hint','Aucune parole détectée. Rapprochez-vous du microphone et réessayez.');
    } else if (code !== 'aborted'){
      showHint('#dc-hint','La dictée s’est interrompue (' + code + '). Vous pouvez réessayer ou écrire le récit à la main.');
    }
    recErrorShown = true;
  };
  recognition.onend = () => {
    listening = false;
    $('#mic-btn').classList.remove('live');
    $('#mic-btn').setAttribute('aria-label','Démarrer la dictée');
    $('#mic-stop').hidden = true;
    if ($('#mic-state').textContent.startsWith('…')) $('#mic-state').textContent = 'Dictée à l’arrêt';
    else $('#mic-state').textContent = 'Dictée à l’arrêt';
  };

  try{
    recognition.start();
  }catch(err){
    showHint('#dc-hint','Impossible de démarrer la dictée sur ce navigateur. La saisie manuelle reste entièrement fonctionnelle.');
  }
}

function stopDictation(){
  if (recognition && listening){
    try{ recognition.stop(); }catch(e){}
  }
  listening = false;
  $('#mic-btn').classList.remove('live');
  $('#mic-stop').hidden = true;
  $('#mic-state').textContent = 'Dictée à l’arrêt';
}

function resetDecrit(force){
  if (!force && formIsDirty('decrit')) return askLeaveDecrit();
  stopDictation();
  $('#form-decrit').reset();
  dcEmotions = [];
  setChips($('#dc-emotions'), []);
  $('#dc-count').textContent = '0';
  State.dirty.decrit = false;
  hideHint('#dc-hint');
}

async function askLeaveDecrit(){
  const ok = await confirmDialog({
    title:'Abandonner cette dictée ?',
    text:'La transcription n’est pas encore enregistrée. En quittant cet écran, elle sera perdue.',
    ok:'Abandonner', cancel:'Rester ici', danger:true
  });
  if (ok) resetDecrit(true);
  return ok;
}

async function submitDecrit(e){
  e.preventDefault();
  stopDictation();
  const text = ($('#dc-texte').value || '').trim();
  if (!text){
    showHint('#dc-hint','Le récit est nécessaire. Dictez, écrivez, ou utilisez « Je ne m’en souviens plus » depuis l’Univers.');
    $('#dc-texte').focus();
    return;
  }
  const d = newDream({
    type:'raconte',
    title: $('#dc-titre').value,
    text,
    emotions: dcEmotions,
    keywords: parseKeywords($('#dc-mots').value)
  });
  try{
    await saveDream(d);
  }catch(err){
    showHint('#dc-hint','L’enregistrement a échoué : ' + (err && err.message ? err.message : 'stockage indisponible') + '.');
    return;
  }
  resetDecrit(true);
  toast('Récit raconté enregistré.', 'ok');
  renderUnivers();
  openDrawSheet(d.id, true);
}

/* ============================================================
   9. DESSINE
   ============================================================ */
const Draw = {
  canvas:null, ctx:null,
  strokes:[],       // tracés validés : {color,size,pts:[{x,y}] en 0..1}
  current:null,
  color: PALETTE[0].c,
  size: 7,
  eraser: false,
  drawing:false,
  w:0, h:0, dpr:1
};

function initCanvas(){
  const c = $('#draw-canvas');
  Draw.canvas = c;
  Draw.ctx = c.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); redraw(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { resizeCanvas(); redraw(); }, 320); });

  const pos = (e) => {
    const r = c.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return {
      x: Math.min(1, Math.max(0, (t.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (t.clientY - r.top) / r.height))
    };
  };

  const start = (e) => {
    e.preventDefault();
    if (Draw.drawing) return;
    Draw.drawing = true;
    Draw.current = { color: Draw.eraser ? '#000' : Draw.color, size: Draw.size, erase: Draw.eraser, pts:[pos(e)] };
    $('#canvas-hint').classList.add('gone');
    redraw();
  };
  const move = (e) => {
    if (!Draw.drawing) return;
    e.preventDefault();
    Draw.current.pts.push(pos(e));
    redraw();
  };
  const end = (e) => {
    if (!Draw.drawing) return;
    if (e && e.preventDefault) e.preventDefault();
    Draw.drawing = false;
    if (Draw.current && Draw.current.pts.length){
      if (Draw.current.pts.length === 1) Draw.current.pts.push({ ...Draw.current.pts[0] });
      Draw.strokes.push(Draw.current);
    }
    Draw.current = null;
    redraw();
  };

  c.addEventListener('pointerdown', start);
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', (e) => { if (Draw.drawing) end(e); });
  // Safari anciens : filets d'événements tactiles en complément
  c.addEventListener('touchstart', (e) => { if (!window.PointerEvent) start(e); }, { passive:false });
  c.addEventListener('touchmove',  (e) => { if (!window.PointerEvent) move(e); },  { passive:false });
  c.addEventListener('touchend',   (e) => { if (!window.PointerEvent) end(e); },   { passive:false });

  buildPalette();
  $$('#draw-sizes button').forEach(b => b.addEventListener('click', () => {
    $$('#draw-sizes button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    Draw.size = parseInt(b.dataset.size, 10) || 7;
  }));
}

function resizeCanvas(){
  const c = Draw.canvas;
  const rect = c.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Draw.dpr = dpr;
  Draw.w = Math.max(1, Math.round(rect.width));
  Draw.h = Math.max(1, Math.round(rect.height));
  c.width = Math.round(Draw.w * dpr);
  c.height = Math.round(Draw.h * dpr);
  Draw.ctx.setTransform(dpr,0,0,dpr,0,0);
}

function drawStroke(s){
  const ctx = Draw.ctx;
  if (!s || !s.pts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size * (s.erase ? 2.1 : 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.pts.length === 1){
    ctx.beginPath();
    ctx.arc(s.pts[0].x * Draw.w, s.pts[0].y * Draw.h, ctx.lineWidth/2, 0, Math.PI*2);
    ctx.fillStyle = s.color;
    if (s.erase) ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(s.pts[0].x * Draw.w, s.pts[0].y * Draw.h);
    for (let i=1;i<s.pts.length;i++){
      const p = s.pts[i], pv = s.pts[i-1];
      const mx = ((pv.x + p.x)/2) * Draw.w, my = ((pv.y + p.y)/2) * Draw.h;
      ctx.quadraticCurveTo(pv.x*Draw.w, pv.y*Draw.h, mx, my);
    }
    const last = s.pts[s.pts.length-1];
    ctx.lineTo(last.x*Draw.w, last.y*Draw.h);
    ctx.stroke();
  }
  ctx.restore();
}

function redraw(){
  const ctx = Draw.ctx;
  ctx.setTransform(Draw.dpr,0,0,Draw.dpr,0,0);
  ctx.clearRect(0,0,Draw.w,Draw.h);
  Draw.strokes.forEach(drawStroke);
  if (Draw.current) drawStroke(Draw.current);
}

function buildPalette(){
  const box = $('#palette');
  box.innerHTML = '';
  PALETTE.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (i === 0 ? ' on' : '');
    b.style.background = p.c;
    b.style.color = p.c;
    b.title = p.n;
    b.setAttribute('aria-label','Couleur ' + p.n);
    b.addEventListener('click', () => {
      Draw.color = p.c; Draw.eraser = false;
      $$('.swatch', box).forEach(s => s.classList.remove('on'));
      b.classList.add('on');
      $('#ds-pen').setAttribute('aria-pressed','true');
      $('#ds-eraser').setAttribute('aria-pressed','false');
    });
    box.appendChild(b);
  });
}

function openDrawSheet(dreamId, fresh){
  const d = getDream(dreamId);
  if (!d) { toast('Rêve introuvable.', 'bad'); return; }
  State.drawingDreamId = dreamId;
  Draw.strokes = [];
  if (d.drawing && Array.isArray(d.drawing.strokes)) Draw.strokes = d.drawing.strokes.map(s => ({...s, pts:s.pts.slice()}));
  Draw.eraser = false;
  $('#ds-pen').setAttribute('aria-pressed','true');
  $('#ds-eraser').setAttribute('aria-pressed','false');
  $('#canvas-hint').classList.toggle('gone', Draw.strokes.length > 0);
  $('#ds-sub').textContent = fresh
    ? 'Le dessin sera lié à « ' + displayTitle(d) + ' ». Vous pouvez aussi passer cette étape.'
    : 'Dessin de « ' + displayTitle(d) + ' » — modifiez-le ou gardez-le tel quel.';
  closeAllSheets();
  openSheet('sheet-dessine');
  requestAnimationFrame(() => { resizeCanvas(); redraw(); });
}

async function saveDrawing(){
  const id = State.drawingDreamId;
  const d = getDream(id);
  if (!d){ closeSheet('sheet-dessine'); return; }
  if (Draw.strokes.length === 0){
    d.drawing = null;
    await saveDream(d);
    closeSheet('sheet-dessine');
    toast('Dessin retiré du rêve.');
    refreshAfterDreamChange();
    return;
  }
  // Rendu PNG net : les tracés restent stockés en vectoriel, le PNG est pour l'export.
  const png = renderPNG(1024, Math.round(1024 * (Draw.h / Math.max(1,Draw.w))));
  d.drawing = { strokes: Draw.strokes, dataUrl: png, updatedAt: nowISO() };
  await saveDream(d);
  closeSheet('sheet-dessine');
  toast('Dessin gardé et associé au rêve.', 'ok');
  refreshAfterDreamChange();
  go('univers');
}

function renderPNG(w, h){
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#0A0A18';
  ctx.fillRect(0,0,w,h);
  Draw.strokes.forEach(s => {
    if (!s.pts.length) return;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size * (w / Math.max(1, Draw.w));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.pts.length === 1){
      ctx.beginPath();
      ctx.arc(s.pts[0].x*w, s.pts[0].y*h, ctx.lineWidth/2, 0, Math.PI*2);
      ctx.fillStyle = s.color; ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x*w, s.pts[0].y*h);
      for (let i=1;i<s.pts.length;i++){
        const p = s.pts[i], pv = s.pts[i-1];
        ctx.quadraticCurveTo(pv.x*w, pv.y*h, ((pv.x+p.x)/2)*w, ((pv.y+p.y)/2)*h);
      }
      const last = s.pts[s.pts.length-1];
      ctx.lineTo(last.x*w, last.y*h);
      ctx.stroke();
    }
    ctx.restore();
  });
  try { return off.toDataURL('image/png'); }
  catch(e){ return null; }
}

function skipDrawing(){
  const id = State.drawingDreamId;
  closeSheet('sheet-dessine');
  toast(id ? 'Dessin passé. Le rêve est conservé.' : 'Dessin passé.');
  go('univers');
}

function refreshAfterDreamChange(){
  renderUnivers();
  if (State.view === 'memory') renderMemory();
  if (State.currentDreamId && !$('#sheet-dream').hidden) openDream(State.currentDreamId);
}

/* ============================================================
   10. MEMORY
   ============================================================ */
function matchesFilter(d){
  switch(State.filter){
    case 'ecrit': return d.type === 'ecrit';
    case 'raconte': return d.type === 'raconte';
    case 'oublie': return d.type === 'oublie';
    case 'dessin': return !!(d.drawing && (d.drawing.dataUrl || (d.drawing.strokes && d.drawing.strokes.length)));
    default: return true;
  }
}

function matchesSearch(d, q){
  if (!q) return true;
  const hay = [
    d.title, dreamText(d), dreamEmotions(d).join(' '), (d.keywords||[]).join(' '),
    formatDate(d.createdAt), TYPES[d.type] || ''
  ].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(term => hay.includes(term));
}

function matchesConstellation(d){
  if (!State.constellation) return true;
  const c = State.constellation.toLowerCase();
  if ((d.keywords||[]).some(k => k.toLowerCase() === c)) return true;
  if (dreamEmotions(d).some(e => e.toLowerCase() === c)) return true;
  return dreamText(d).toLowerCase().includes(c);
}

function visibleDreams(){
  const q = State.search.trim();
  return State.dreams.filter(d => matchesFilter(d) && matchesSearch(d,q) && matchesConstellation(d));
}

function renderMemory(){
  const list = $('#dream-list');
  list.innerHTML = '';
  const items = visibleDreams();

  const af = $('#mem-active');
  if (State.constellation){
    af.hidden = false;
    $('#mem-active-label').textContent = 'Thème : ' + State.constellation;
  } else af.hidden = true;

  if (items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'empty';
    const anyDreams = State.dreams.length > 0;
    empty.innerHTML = anyDreams
      ? '<h4>Aucun rêve ne correspond</h4><p>Essayez un autre mot, un autre filtre, ou retirez le thème actif.</p>' +
        '<button class="btn ghost" id="mem-reset" type="button">Réinitialiser les filtres</button>'
      : '<h4>Votre archive est vide</h4><p>Le premier fragment peut être un rêve entier, ou simplement « Rêve oublié ».</p>' +
        '<button class="btn primary" id="mem-first" type="button">Écrire un premier rêve</button>';
    list.appendChild(empty);
    const r = $('#mem-reset');
    if (r) r.addEventListener('click', () => { clearMemoryFilters(); });
    const f = $('#mem-first');
    if (f) f.addEventListener('click', () => go('raccontes'));
    return;
  }
  items.forEach((d,i) => list.appendChild(dreamCard(d,i)));
}

function clearMemoryFilters(){
  State.filter = 'tous';
  State.search = '';
  State.constellation = null;
  $('#mem-search').value = '';
  $('#mem-clear').hidden = true;
  $$('#mem-filters .fchip').forEach(c => {
    const on = c.dataset.filter === 'tous';
    c.classList.toggle('active', on);
    c.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  renderMemory();
}

function dreamCard(d, i){
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dream-card';
  el.style.animationDelay = Math.min(i * 22, 320) + 'ms';

  const top = document.createElement('div');
  top.className = 'dc-top';
  const h = document.createElement('h4');
  h.className = 'dc-title';
  h.textContent = displayTitle(d);
  const dt = document.createElement('span');
  dt.className = 'dc-date';
  dt.textContent = formatDate(d.createdAt);
  top.appendChild(h); top.appendChild(dt);

  const badges = document.createElement('div');
  badges.className = 'dc-badges';
  const tb = document.createElement('span');
  tb.className = 'badge ' + d.type;
  tb.textContent = TYPES[d.type] || 'Fragment';
  badges.appendChild(tb);
  dreamEmotions(d).forEach(e => {
    const eb = document.createElement('span');
    eb.className = 'badge emo';
    eb.textContent = e;
    badges.appendChild(eb);
  });
  if (d.drawing && (d.drawing.dataUrl || (d.drawing.strokes||[]).length)){
    const db = document.createElement('span');
    db.className = 'badge dessin';
    db.textContent = 'Dessin';
    badges.appendChild(db);
  }

  el.appendChild(top);
  el.appendChild(badges);

  const txt = dreamText(d).replace(/\s+/g,' ').trim();
  if (txt){
    const p = document.createElement('p');
    p.className = 'dc-excerpt';
    p.textContent = txt;
    el.appendChild(p);
  }

  const foot = document.createElement('div');
  foot.className = 'dc-foot';
  if (d.drawing && d.drawing.dataUrl){
    const th = document.createElement('span');
    th.className = 'dc-thumb';
    const img = document.createElement('img');
    img.src = d.drawing.dataUrl; img.alt = 'Dessin associé';
    th.appendChild(img);
    foot.appendChild(th);
  }
  const tags = document.createElement('span');
  tags.className = 'dc-tags';
  (d.keywords||[]).slice(0,5).forEach(k => {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = k;
    tags.appendChild(t);
  });
  foot.appendChild(tags);
  const nf = document.createElement('span');
  nf.className = 'dc-nfrag';
  const n = (d.fragments||[]).length;
  nf.textContent = n > 1 ? n + ' fragments' : '1 fragment';
  foot.appendChild(nf);
  el.appendChild(foot);

  el.addEventListener('click', () => openDream(d.id));
  return el;
}

/* ============================================================
   11. DÉTAIL D'UN RÊVE
   ============================================================ */
function openDream(id){
  const d = getDream(id);
  if (!d) return;
  State.currentDreamId = id;

  $('#dream-type').textContent = TYPES[d.type] || 'Fragment';
  $('#dream-title').textContent = displayTitle(d);

  const meta = $('#dream-meta');
  meta.innerHTML = '';
  const addMeta = (txt, cls) => {
    const b = document.createElement('span');
    b.className = 'badge ' + (cls||'');
    b.textContent = txt;
    meta.appendChild(b);
  };
  addMeta(formatDateTime(d.createdAt));
  addMeta(TYPES[d.type] || 'Fragment', d.type);
  dreamEmotions(d).forEach(e => addMeta(e, 'emo'));
  (d.keywords||[]).forEach(k => addMeta('#' + k));

  const wrap = $('#dream-draw-wrap');
  wrap.innerHTML = '';
  if (d.drawing && d.drawing.dataUrl){
    wrap.style.display = 'block';
    const img = document.createElement('img');
    img.src = d.drawing.dataUrl;
    img.alt = 'Dessin associé à ce rêve';
    wrap.appendChild(img);
  } else if (d.drawing && (d.drawing.strokes||[]).length){
    wrap.style.display = 'block';
    const img = document.createElement('img');
    const prev = renderStrokesPNG(d.drawing.strokes);
    if (prev) img.src = prev;
    img.alt = 'Dessin associé à ce rêve';
    wrap.appendChild(img);
  } else {
    wrap.style.display = 'none';
  }

  const frags = $('#dream-fragments');
  frags.innerHTML = '';
  (d.fragments||[]).forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'frag' + (i === 0 ? ' orig' : '');
    const head = document.createElement('div');
    head.className = 'frag-head';
    const k = document.createElement('span');
    k.className = 'frag-kind';
    k.textContent = i === 0 ? 'Fragment original' : 'Fragment ajouté';
    const t = document.createElement('span');
    t.className = 'frag-time';
    t.textContent = formatDateTime(f.createdAt);
    head.appendChild(k); head.appendChild(t);
    el.appendChild(head);
    const p = document.createElement('p');
    p.textContent = f.text || '(aucun texte)';
    el.appendChild(p);
    frags.appendChild(el);
  });

  $('#dr-edit-form').hidden = true;
  $('#dr-add-form').hidden = true;
  closeAllSheets();
  openSheet('sheet-dream');
}

function renderStrokesPNG(strokes){
  const old = { strokes: Draw.strokes, w: Draw.w, h: Draw.h };
  Draw.strokes = strokes;
  Draw.w = 1024; Draw.h = 1024;
  const url = renderPNG(1024, 1024);
  Draw.strokes = old.strokes; Draw.w = old.w; Draw.h = old.h;
  return url;
}

function startEdit(){
  const d = getDream(State.currentDreamId);
  if (!d) return;
  $('#dr-edit-titre').value = d.title || '';
  $('#dr-edit-texte').value = (d.fragments[0] && d.fragments[0].text) || '';
  setChips($('#dr-edit-emotions'), dreamEmotions(d));
  $('#dr-add-form').hidden = true;
  $('#dr-edit-form').hidden = false;
  $('#dr-edit-titre').focus({ preventScroll:true });
}

async function saveEdit(e){
  e.preventDefault();
  const d = getDream(State.currentDreamId);
  if (!d) return;
  const txt = ($('#dr-edit-texte').value || '').trim();
  if (!txt && d.type !== 'oublie'){
    toast('Le texte du premier fragment ne peut pas être vide.', 'bad');
    return;
  }
  d.title = $('#dr-edit-titre').value.trim();
  const emoBox = $('#dr-edit-emotions');
  if (emoBox) d.emotions = Array.from(emoBox.querySelectorAll('.chip.on')).map(c => c.dataset.value);
  if (!d.fragments.length) d.fragments.push({ id: uid(), kind:d.type, text:txt, createdAt:d.createdAt });
  else d.fragments[0].text = txt;
  await saveDream(d);
  $('#dr-edit-form').hidden = true;
  toast('Rêve modifié.', 'ok');
  openDream(d.id);
  renderUnivers();
  if (State.view === 'memory') renderMemory();
}

function startAddFragment(){
  $('#dr-edit-form').hidden = true;
  $('#dr-add-form').hidden = false;
  $('#dr-add-texte').value = '';
  $('#dr-add-mots').value = '';
  $('#dr-add-texte').focus({ preventScroll:true });
}

async function saveFragment(e){
  e.preventDefault();
  const d = getDream(State.currentDreamId);
  if (!d) return;
  const txt = ($('#dr-add-texte').value || '').trim();
  if (!txt){ toast('Écrivez d’abord le nouveau fragment.', 'bad'); return; }
  d.fragments.push({ id: uid(), kind:d.type, text: txt, createdAt: nowISO() });
  const extra = parseKeywords($('#dr-add-mots').value);
  d.keywords = normKeywords([...(d.keywords||[]), ...extra]);
  await saveDream(d);
  $('#dr-add-form').hidden = true;
  toast('Nouveau fragment ajouté — l’historique est conservé.', 'ok');
  openDream(d.id);
  renderUnivers();
  if (State.view === 'memory') renderMemory();
}

async function deleteCurrentDream(){
  const d = getDream(State.currentDreamId);
  if (!d) return;
  const ok = await confirmDialog({
    title:'Supprimer ce rêve ?',
    text:'« ' + displayTitle(d) + ' » et son dessin seront définitivement supprimés de cet appareil. Cette action est irréversible.',
    ok:'Supprimer', cancel:'Garder', danger:true
  });
  if (!ok) return;
  await Store.delOne(d.id);
  State.dreams = State.dreams.filter(x => x.id !== d.id);
  State.currentDreamId = null;
  closeSheet('sheet-dream');
  toast('Rêve supprimé.');
  renderUnivers();
  renderMemory();
}

/* ============================================================
   12. RÊVE OUBLIÉ
   ============================================================ */
async function createForgotten(){
  const today = new Date();
  const sameDay = State.dreams.find(d => d.type === 'oublie' &&
    new Date(d.createdAt).toDateString() === today.toDateString());
  if (sameDay){
    const ok = await confirmDialog({
      title:'Un rêve oublié existe déjà aujourd’hui',
      text:'Vous avez déjà gardé une trace de ce jour. En ajouter une seconde quand même ?',
      ok:'Ajouter', cancel:'Annuler'
    });
    if (!ok) { go('univers'); return; }
  }
  const d = newDream({ type:'oublie', title:'Rêve oublié', text:'' });
  await saveDream(d);
  toast('« Rêve oublié » enregistré pour aujourd’hui.', 'ok');
  go('univers');
  renderUnivers();
}

/* ============================================================
   13. RÉGLAGES / EXPORT / IMPORT / EFFACEMENT
   ============================================================ */
function tsFile(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return 'oneiria-' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
}

function exportJSON(){
  if (State.dreams.length === 0){
    toast('Aucun rêve à exporter.', 'bad');
    return;
  }
  const payload = {
    app:'ONEIRIA', schema:SCHEMA, exportedAt: nowISO(),
    device: navigator.userAgent.slice(0,120),
    count: State.dreams.length,
    dreams: State.dreams
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsFile();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(State.dreams.length + ' rêve(s) exporté(s).', 'ok');
}

function normalizeImported(raw){
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.dreams) ? raw.dreams : null);
  if (!list) return [];
  const out = [];
  list.forEach(item => {
    if (!item || typeof item !== 'object') return;
    let frags = Array.isArray(item.fragments) ? item.fragments
      .filter(f => f && typeof f === 'object')
      .map(f => ({
        id: f.id || uid(),
        kind: f.kind || item.type || 'ecrit',
        text: String(f.text || ''),
        createdAt: f.createdAt || item.createdAt || nowISO()
      })) : [];
    if (!frags.length && item.text) frags = [{ id: uid(), kind: item.type || 'ecrit', text: String(item.text), createdAt: item.createdAt || nowISO() }];
    const type = ['ecrit','raconte','oublie'].includes(item.type) ? item.type : 'ecrit';
    const drawing = item.drawing && typeof item.drawing === 'object'
      ? (item.drawing.dataUrl || Array.isArray(item.drawing.strokes) ? item.drawing : null)
      : null;
    out.push({
      id: item.id || uid(),
      schema: SCHEMA,
      type,
      title: String(item.title || ''),
      createdAt: item.createdAt || nowISO(),
      emotions: normEmotions(item.emotions && item.emotions.length ? item.emotions : item.emotion),
      keywords: normKeywords(item.keywords),
      drawing,
      fragments: frags
    });
  });
  return out;
}

async function importJSON(file){
  try{
    const text = await file.text();
    let raw;
    try { raw = JSON.parse(text); }
    catch(e){ toast('Ce fichier n’est pas un JSON valide.', 'bad'); return; }
    const incoming = normalizeImported(raw);
    if (!incoming.length){
      toast('Aucun rêve reconnu dans ce fichier.', 'bad');
      return;
    }
    const ans = await confirmDialog({
      title:'Importer ' + incoming.length + ' rêve(s) ?',
      text:'Les rêves du fichier seront ajoutés à ceux déjà présents sur cet appareil. Les identifiants identiques seront remplacés par la version importée. Rien n’est effacé.',
      ok:'Importer', cancel:'Annuler'
    });
    if (!ans) return;
    await Store.putMany(incoming);
    await loadDreams();
    renderUnivers();
    renderMemory();
    toast(incoming.length + ' rêve(s) importé(s).', 'ok');
    updateStorageInfo();
  }catch(err){
    toast('Import impossible : ' + (err && err.message ? err.message : 'lecture du fichier'), 'bad');
  }
}

async function wipeAll(){
  const n = State.dreams.length;
  if (n === 0){ toast('Il n’y a rien à supprimer.', 'bad'); return; }
  const first = await confirmDialog({
    title:'Supprimer toutes les données ?',
    text:n + ' rêve(s), leurs dessins et leurs mots-clés seront définitivement effacés de cet appareil. Aucune copie n’existe ailleurs : ni serveur, ni sauvegarde automatique.',
    ok:'Continuer', cancel:'Annuler', danger:true
  });
  if (!first) return;
  const second = await confirmDialog({
    title:'Dernière vérification',
    text:'Cette suppression est immédiate et sans retour possible. Confirmez-vous ?',
    ok:'Tout supprimer', cancel:'Annuler', danger:true
  });
  if (!second) return;
  await Store.clearAll();
  State.dreams = [];
  try { localStorage.removeItem('oneiria.dreams.v1'); } catch(e){}
  renderUnivers();
  renderMemory();
  updateStorageInfo();
  toast('Toutes les données ont été supprimées.');
}

async function updateStorageInfo(){
  const el = $('#st-storage');
  const e = await Store.estimate();
  const parts = [];
  if (e.usage != null){
    parts.push('Stockage utilisé : ' + (e.usage < 1024*1024
      ? Math.max(1, Math.round(e.usage/1024)) + ' Ko'
      : (e.usage/1024/1024).toFixed(1) + ' Mo'));
  }
  if (e.quota != null) parts.push('limite du navigateur : ' + (e.quota/1024/1024).toFixed(0) + ' Mo');
  parts.push(e.mode === 'idb' ? 'base locale IndexedDB active' : (e.mode === 'ls' ? 'repli localStorage (IndexedDB indisponible)' : 'stockage de session (aucune persistance)'));
  el.textContent = parts.join(' · ');
}

/* ============================================================
   14. ÉTOILES
   ============================================================ */
function initStars(){
  const c = $('#stars');
  const ctx = c.getContext('2d');
  let stars = [], raf = null, t = 0;
  const colors = ['#F7F4FF','#A99AFF','#80E5DF','#F2B6D8'];

  function build(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    c.width = Math.round(w*dpr); c.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const count = Math.min(120, Math.round(w*h/14000));
    stars = [];
    for (let i=0;i<count;i++){
      stars.push({
        x: Math.random()*w, y: Math.random()*h,
        r: Math.random()*1.3 + .35,
        a: Math.random()*.55 + .2,
        sp: Math.random()*.02 + .006,
        ph: Math.random()*Math.PI*2,
        c: colors[Math.floor(Math.random()*colors.length)],
        vy: Math.random()*.035 + .008
      });
    }
  }
  function frame(){
    t += 0.016;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0,0,w,h);
    for (const s of stars){
      s.y -= s.vy; if (s.y < -2) s.y = h + 2;
      const alpha = s.a * (0.62 + 0.38*Math.sin(t*1.1 + s.ph));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  build();
  frame();
  window.addEventListener('resize', build);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) frame();
  });
}

/* ============================================================
   15. CÂBLAGE DES ÉVÉNEMENTS
   ============================================================ */
function updateCount(fromSel, toSel){
  const v = $(fromSel).value || '';
  $(toSel).textContent = String(v.length);
}

function wire(){
  // Navigation
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    const target = t.dataset.view;
    if (State.view === 'raccontes' && target !== 'raccontes' && formIsDirty('raccontes')){
      askLeave('raccontes').then(ok => { if (ok) go(target); });
      return;
    }
    if (State.view === 'decrit' && target !== 'decrit' && formIsDirty('decrit')){
      askLeaveDecrit().then(ok => { if (ok) go(target); });
      return;
    }
    go(target);
  }));

  // Univers : actions
  $('#act-remember').addEventListener('click', () => go('raccontes'));
  $('#act-speak').addEventListener('click', () => go('decrit'));
  $('#act-forgot').addEventListener('click', createForgotten);
  $('#to-memory').addEventListener('click', () => go('memory'));

  // Raccontes
  buildChips($('#rc-emotions'), v => { rcEmotions = v; State.dirty.raccontes = true; });
  $('#form-raccontes').addEventListener('submit', submitRaccontes);
  $('#rc-cancel').addEventListener('click', async () => {
    if (formIsDirty('raccontes')) { const ok = await askLeave('raccontes'); if (!ok) return; }
    else resetRaccontes(true);
    go('univers');
  });
  ['#rc-titre','#rc-texte','#rc-mots'].forEach(sel => {
    $(sel).addEventListener('input', () => { State.dirty.raccontes = true; hideHint('#rc-hint'); });
  });
  $('#rc-texte').addEventListener('input', () => updateCount('#rc-texte','#rc-count'));

  // Décrit
  buildChips($('#dc-emotions'), v => { dcEmotions = v; State.dirty.decrit = true; });
  $('#mic-btn').addEventListener('click', () => { listening ? stopDictation() : startDictation(); });
  $('#mic-stop').addEventListener('click', stopDictation);
  $('#form-decrit').addEventListener('submit', submitDecrit);
  $('#dc-cancel').addEventListener('click', async () => {
    if (formIsDirty('decrit')) { const ok = await askLeaveDecrit(); if (!ok) return; }
    else resetDecrit(true);
    go('univers');
  });
  ['#dc-titre','#dc-texte','#dc-mots'].forEach(sel => {
    $(sel).addEventListener('input', () => { State.dirty.decrit = true; hideHint('#dc-hint'); });
  });
  $('#dc-texte').addEventListener('input', () => updateCount('#dc-texte','#dc-count'));

  // Dessine
  $('#ds-pen').addEventListener('click', () => {
    Draw.eraser = false;
    $('#ds-pen').setAttribute('aria-pressed','true');
    $('#ds-eraser').setAttribute('aria-pressed','false');
  });
  $('#ds-eraser').addEventListener('click', () => {
    Draw.eraser = true;
    $('#ds-eraser').setAttribute('aria-pressed','true');
    $('#ds-pen').setAttribute('aria-pressed','false');
  });
  $('#ds-undo').addEventListener('click', () => {
    if (!Draw.strokes.length){ toast('Aucun trait à annuler.'); return; }
    Draw.strokes.pop();
    redraw();
  });
  $('#ds-clear').addEventListener('click', async () => {
    if (!Draw.strokes.length){ toast('Le dessin est déjà vide.'); return; }
    const ok = await confirmDialog({
      title:'Effacer le dessin ?',
      text:'Tous les tracés de ce dessin seront retirés. Le rêve, lui, n’est pas touché.',
      ok:'Effacer', cancel:'Annuler', danger:true
    });
    if (!ok) return;
    Draw.strokes = [];
    redraw();
    $('#canvas-hint').classList.remove('gone');
    toast('Dessin effacé. Appuyez sur « Passer le dessin » ou dessinez à nouveau.');
  });
  $('#ds-save').addEventListener('click', saveDrawing);
  $('#ds-skip').addEventListener('click', skipDrawing);
  $('#ds-close').addEventListener('click', skipDrawing);

  // Memory
  $('#mem-search').addEventListener('input', () => {
    State.search = $('#mem-search').value;
    $('#mem-clear').hidden = !State.search;
    renderMemory();
  });
  $('#mem-clear').addEventListener('click', () => {
    $('#mem-search').value = '';
    State.search = '';
    $('#mem-clear').hidden = true;
    renderMemory();
  });
  $('#mem-filters').addEventListener('click', (e) => {
    const b = e.target.closest('.fchip');
    if (!b) return;
    State.filter = b.dataset.filter;
    $$('#mem-filters .fchip').forEach(c => {
      const on = c === b;
      c.classList.toggle('active', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderMemory();
  });
  $('#mem-active-clear').addEventListener('click', () => {
    State.constellation = null;
    renderMemory();
  });

  // Détail
  $('#dr-close').addEventListener('click', () => closeSheet('sheet-dream'));
  $('#dr-edit').addEventListener('click', startEdit);
  $('#dr-edit-cancel').addEventListener('click', () => { $('#dr-edit-form').hidden = true; });
  $('#dr-edit-form').addEventListener('submit', saveEdit);
  $('#dr-add').addEventListener('click', startAddFragment);
  $('#dr-add-cancel').addEventListener('click', () => { $('#dr-add-form').hidden = true; });
  $('#dr-add-form').addEventListener('submit', saveFragment);
  $('#dr-delete').addEventListener('click', deleteCurrentDream);
  $('#dr-draw').addEventListener('click', () => {
    const id = State.currentDreamId;
    if (!id) return;
    closeSheet('sheet-dream');
    openDrawSheet(id, false);
  });

  // Réglages
  $('#btn-settings').addEventListener('click', () => { openSheet('sheet-settings'); updateStorageInfo(); });
  $('#st-close').addEventListener('click', () => closeSheet('sheet-settings'));
  $('#st-export').addEventListener('click', exportJSON);
  $('#st-import').addEventListener('click', () => $('#st-file').click());
  $('#st-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await importJSON(f);
  });
  $('#st-wipe').addEventListener('click', wipeAll);

  // Feuilles
  $('#sheet-backdrop').addEventListener('click', () => {
    if (!$('#sheet-dessine').hidden) skipDrawing();
    else closeAllSheets();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      if (!$('#dialog').hidden) return;
      closeAllSheets();
    }
  });

  // Mémoire : rechargement après retour d'onglet
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderUnivers();
  });
}

/* ============================================================
   16. DÉMARRAGE
   ============================================================ */
async function boot(){
  initStars();
  await Store.init();
  try { await loadDreams(); } catch(e){ console.warn(e); }
  buildChips($('#rc-emotions'), v => { rcEmotions = v; });
  buildChips($('#dc-emotions'), v => { dcEmotions = v; });
  const editEmoBox = $('#dr-edit-emotions');
  if (editEmoBox) buildChips(editEmoBox, () => {});
  initCanvas();
  setupSpeech();
  wire();
  go('univers');

  if (Store.mode === 'mem'){
    toast('Stockage local indisponible : les rêves de cette session ne seront pas conservés après fermeture.', 'bad');
  }

  // Sécurité : prévenir si un formulaire est en cours
  window.addEventListener('beforeunload', (e) => {
    if (formIsDirty('raccontes') || formIsDirty('decrit')){
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  window.Oneiria = { State, Store, exportJSON, importJSON, createForgotten, go, openDream };
}

document.addEventListener('DOMContentLoaded', boot);
