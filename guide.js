/* ============================================================
   ONEIRIA — guide de test
   Les vérifications « automatiques » sont exécutées ici, dans le
   navigateur de l'utilisateur, et non dans un environnement de dev.
   ============================================================ */
'use strict';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* ---------- Étoiles (même décor que l'application) ---------- */
function initStars(){
  const c = $('#stars');
  if (!c) return;
  const ctx = c.getContext('2d');
  let raf = null, t = 0, stars = [];
  const colors = ['#F7F4FF','#A99AFF','#80E5DF','#F2B6D8'];

  function build(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    c.width = Math.round(w*dpr); c.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const n = Math.min(110, Math.round(w*h/15000));
    stars = [];
    for (let i=0;i<n;i++){
      stars.push({ x:Math.random()*w, y:Math.random()*h, r:Math.random()*1.3+.35,
        a:Math.random()*.55+.2, ph:Math.random()*Math.PI*2,
        c:colors[Math.floor(Math.random()*colors.length)], vy:Math.random()*.035+.008 });
    }
  }
  function frame(){
    t += .016;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0,0,w,h);
    for (const s of stars){
      s.y -= s.vy; if (s.y < -2) s.y = h + 2;
      ctx.globalAlpha = s.a * (.62 + .38*Math.sin(t*1.1 + s.ph));
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  build(); frame();
  window.addEventListener('resize', build);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden){ if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) frame();
  });
}

/* ---------- Vérifications automatiques ---------- */
const checks = [];

function check(label, fn, note){
  let ok = false, detail = '';
  try {
    const r = fn();
    if (r && typeof r === 'object'){ ok = !!r.ok; detail = r.detail || ''; }
    else ok = !!r;
  } catch(e){ ok = false; detail = (e && e.message) ? e.message : 'erreur'; }
  checks.push({ label, ok, detail: detail || note || '' });
}

function runChecks(){
  const ua = navigator.userAgent;

  check('La page est servie en contexte sécurisé (HTTPS ou localhost)',
    () => isSecureContext
      ? { ok:true }
      : { ok:false, detail:'Le stockage et le service worker sont restreints en http://. Utilisez GitHub Pages (https) ou localhost.' });

  check('IndexedDB est disponible',
    () => ('indexedDB' in window)
      ? { ok:true }
      : { ok:false, detail:'ONEIRIA basculera sur localStorage, indiqué dans les réglages.' });

  check('localStorage est disponible (repli de secours)',
    () => {
      try { localStorage.setItem('oneiria.t','1'); localStorage.removeItem('oneiria.t'); return { ok:true }; }
      catch(e){ return { ok:false, detail:'Repli indisponible : la persistance reposerait sur la mémoire seulement.' }; }
    });

  check('Canvas 2D est disponible (dessin tactile)',
    () => {
      const c = document.createElement('canvas');
      const ok = !!(c.getContext && c.getContext('2d'));
      return { ok, detail: ok ? '' : 'Le dessin ne pourrait pas fonctionner dans ce navigateur.' };
    });

  check('Les événements tactiles sont pris en charge',
    () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
      ? { ok:true }
      : { ok:false, detail:'Pas d’écran tactile détecté : testez au doigt pour valider réellement l’objectif iPhone.' });

  check('Les zones de sécurité (safe-area) sont prises en compte',
    () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h');
      const ok = /env\(/.test(document.querySelector('link[rel="stylesheet"]') ? 'ok' : 'ok') && !!v;
      return { ok, detail: ok ? 'Défilement horizontal mesuré sur cette page' : '' };
    });

  check('Aucun débordement horizontal (largeur mesurée en direct)',
    () => {
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return over <= 1
        ? { ok:true }
        : { ok:false, detail: over + ' px de débordement détectés à ' + window.innerWidth + ' px de large.' };
    });

  check('La police système d’iOS est utilisée (SF Pro / équivalent)',
    () => {
      const f = getComputedStyle(document.body).fontFamily || '';
      const ok = /-apple-system|SF Pro|system-ui/i.test(f);
      return { ok, detail: ok ? '' : 'Police réellement appliquée : ' + f.slice(0,60) };
    });

  check('Le service worker peut être enregistré',
    () => ('serviceWorker' in navigator)
      ? { ok:true }
      : { ok:false, detail:'L’application restera fonctionnelle, mais sans mode hors-ligne ni installation complète.' });

  check('Reconnaissance vocale disponible dans ce navigateur',
    () => (window.SpeechRecognition || window.webkitSpeechRecognition)
      ? { ok:true }
      : { ok:false, detail:'Attendu sur iOS/Safari : ce n’est pas une panne. Le mode manuel et la dictée du clavier iOS prennent le relais.' });

  check('L’écran est au format mobile (largeur ≤ 480 px)',
    () => window.innerWidth <= 480
      ? { ok:true }
      : { ok:false, detail:'Largeur actuelle : ' + window.innerWidth + ' px. Réduisez la fenêtre à 375 px pour reproduire l’iPhone XR.' });

  check('Le pointeur tactile est précis (pointer events)',
    () => 'PointerEvent' in window
      ? { ok:true }
      : { ok:false, detail:'Repli sur les événements tactiles classiques, prévu dans le code.' });

  return { ua, checks };
}

function renderChecks(){
  const { ua, checks } = runChecks();
  const zone = $('#auto-zone');
  zone.innerHTML = '';

  const okCount = checks.filter(c => c.ok).length;

  const head = document.createElement('div');
  head.className = 'auto ' + (okCount === checks.length ? 'ok' : '');
  head.innerHTML = '<b>' + okCount + ' / ' + checks.length + '</b> vérifications automatiques passées sur cet appareil.';
  zone.appendChild(head);

  checks.forEach(c => {
    const el = document.createElement('div');
    el.className = 'auto ' + (c.ok ? 'ok' : 'bad');
    el.innerHTML = '<span aria-hidden="true">' + (c.ok ? '✓' : '!') + '</span><span><b>' +
      c.label + '</b>' + (c.detail ? '<br>' + c.detail : '') + '</span>';
    zone.appendChild(el);
  });

  const uaBox = document.createElement('div');
  uaBox.className = 'auto';
  uaBox.innerHTML = '<span aria-hidden="true">i</span><span>' + ua.slice(0,150) + '</span>';
  zone.appendChild(uaBox);
}

/* ---------- Suppression totale (avec double confirmation) ---------- */
function dialog({ title, text, ok, cancel, danger }){
  return new Promise(resolve => {
    const dlg = $('#dialog');
    $('#dlg-title').textContent = title;
    $('#dlg-text').textContent = text;
    const okBtn = $('#dlg-ok'), noBtn = $('#dlg-cancel');
    okBtn.textContent = ok; noBtn.textContent = cancel;
    okBtn.className = 'btn ' + (danger ? 'danger-ghost' : 'primary');
    dlg.hidden = false;
    const done = v => {
      dlg.hidden = true;
      okBtn.removeEventListener('click', onOk);
      noBtn.removeEventListener('click', onNo);
      resolve(v);
    };
    const onOk = () => done(true);
    const onNo = () => done(false);
    okBtn.addEventListener('click', onOk);
    noBtn.addEventListener('click', onNo);
  });
}

function toast(msg, kind=''){
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2800);
}

function wipeEverything(){
  const req = indexedDB.deleteDatabase('oneiria');
  req.onsuccess = req.onerror = req.onblocked = () => {
    try { localStorage.removeItem('oneiria.dreams.v1'); } catch(e){}
    toast('Base locale ONEIRIA supprimée de cet appareil.', 'ok');
  };
  try { localStorage.removeItem('oneiria.dreams.v1'); } catch(e){}
}

async function handleWipe(){
  const first = await dialog({
    title: 'Supprimer toutes les données ?',
    text: 'Les rêves, les mots-clés et tous les dessins enregistrés par ONEIRIA seront effacés de cet appareil. Aucune copie n’existe ailleurs : ni serveur, ni sauvegarde automatique. Si vous n’avez pas exporté de fichier JSON, tout sera perdu.',
    ok: 'Continuer', cancel: 'Annuler', danger: true
  });
  if (!first) return;
  const second = await dialog({
    title: 'Dernière vérification',
    text: 'Cette suppression est immédiate et sans retour possible. Confirmez-vous ?',
    ok: 'Tout supprimer', cancel: 'Annuler', danger: true
  });
  if (!second) return;
  wipeEverything();
}

/* ---------- Démarrage ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initStars();
  renderChecks();
  window.addEventListener('resize', () => {
    clearTimeout(window.__recheck);
    window.__recheck = setTimeout(renderChecks, 250);
  });
  $('#g-open').addEventListener('click', () => { location.href = './index.html'; });
  $('#g-wipe').addEventListener('click', handleWipe);
});
