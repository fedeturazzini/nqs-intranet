/* =============================================
   NQS AI PRESENTATION — SCRIPTS
   ============================================= */

// ── CUSTOM CURSOR ────────────────────────────
(function initCursor() {
  // Skip on coarse pointers (touch devices)
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  let tx = 0, ty = 0, cx = 0, cy = 0;
  let rafId = null;

  const render = () => {
    // smooth follow
    cx += (tx - cx) * 0.32;
    cy += (ty - cy) * 0.32;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    rafId = requestAnimationFrame(render);
  };

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!rafId) {
      cx = tx; cy = ty;
      rafId = requestAnimationFrame(render);
    }
  });

  // Hover: look for nearest [data-cursor] OR interactive tag
  const isInteractive = (el) =>
    el.matches('a, button, input, textarea, select, label, [role="button"], [data-cursor]');

  const onOver = (e) => {
    const t = e.target.closest('a, button, input, textarea, select, label, [role="button"], [data-cursor]');
    if (t) {
      cursor.classList.add('hover');
      const label = t.dataset.cursor || '';
      cursor.dataset.label = label;
    } else {
      cursor.classList.remove('hover');
      cursor.dataset.label = '';
    }
  };
  document.addEventListener('mouseover', onOver);
  document.addEventListener('mouseout', (e) => {
    // when leaving to a non-interactive parent, onOver will reset; nothing to do
  });

  // Hide cursor when leaving the window
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
})();

// ── LANGUAGE TOGGLE ──────────────────────────
const LANG_KEY = 'nqs_lang';
let currentLang = 'en';

function applyLang(lang) {
  currentLang = lang;
  const btn = document.getElementById('langToggle');
  btn.textContent = lang === 'en' ? 'ES' : 'EN';
  btn.title = lang === 'en' ? 'Cambiar a Español' : 'Switch to English';

  document.querySelectorAll('[data-en]').forEach(el => {
    const val = el.getAttribute('data-' + lang);
    if (!val) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.innerHTML = val;
    }
  });

  // Update html lang attribute
  document.documentElement.lang = lang === 'en' ? 'en' : 'es';
}

document.getElementById('langToggle').addEventListener('click', () => {
  const next = currentLang === 'en' ? 'es' : 'en';
  applyLang(next);
  requestAnimationFrame(() => scheduleHeroHighlight());
});

// Initialize
applyLang('en');

// ── HERO HEADLINE — highlighter marker on "prompt" & "story" ────────
(function heroHighlightSetup() {
  // Wait for the password gate to be unlocked before starting hero animations.
  // If the gate is already gone (returning user, sessionStorage flag set), start normally.
  function start() {
    setTimeout(scheduleHeroHighlight, 200);
  }
  function gateIsActive() {
    var g = document.getElementById('gate');
    return g && g.style.display !== 'none' && getComputedStyle(g).display !== 'none';
  }
  if (gateIsActive()) {
    window.addEventListener('gateUnlocked', start, { once: true });
  } else {
    window.addEventListener('load', start);
  }
})();

let _heroHiTimers = [];
function scheduleHeroHighlight() {
  _heroHiTimers.forEach(t => clearTimeout(t));
  _heroHiTimers = [];

  const h1 = document.querySelector('.hero-headline');
  if (!h1) return;

  // Words to highlight by language (cleaned, lowercase)
  const targets = currentLang === 'es' ? ['prompt', 'historia'] : ['prompt', 'story'];

  // Wrap each word in a span so we can mark specific ones.
  const raw = currentLang === 'es'
    ? (h1.dataset.es || h1.innerHTML)
    : (h1.dataset.en || h1.innerHTML);

  const lines = raw.split(/<br\s*\/?>/i);
  const wrapped = lines.map(line =>
    line
      .trim()
      .split(/\s+/)
      .map(w => {
        const key = w.toLowerCase().replace(/[.,;:!?()"'’]/g, '');
        const isTarget = targets.includes(key);
        return isTarget
          ? `<span class="hw hl" data-w="${key}">${w}</span>`
          : `<span class="hw" data-w="${key}">${w}</span>`;
      })
      .join(' ')
  ).join('<br>');
  h1.innerHTML = wrapped;

  // Timing — simulate someone reading through, pausing to highlight the key words.
  // Hero fade-in of the h1 itself takes ~1s (IntersectionObserver), so we start ~2s in
  // to let the reader "settle". Then highlight prompt at ~3s, story at ~5.2s.
  const t1 = setTimeout(() => {
    const el = h1.querySelector('.hl[data-w="' + targets[0] + '"]');
    if (el) el.classList.add('drawn');
  }, 1500);
  const t2 = setTimeout(() => {
    const el = h1.querySelector('.hl[data-w="' + targets[1] + '"]');
    if (el) el.classList.add('drawn');
  }, 3500);

  _heroHiTimers.push(t1, t2);
}

// ── INTRO — animated big number counter ─────────────────
(function introCounterSetup() {
  const val = document.querySelector('.intro-grid-e .big-num-val');
  if (!val) return;
  const target = 10;
  const duration = 2200;
  let played = false;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const run = () => {
    if (played) return;
    played = true;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      val.textContent = Math.round(ease(p) * target);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { run(); io.disconnect(); } });
  }, { threshold: 0.4 });
  io.observe(val);
})();

// ── STICKY NAV ───────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ── HERO VIDEO — single looping file ───────────────────
const heroVidMain = document.getElementById('heroVidMain');
if (heroVidMain && typeof heroVidMain.play === 'function') heroVidMain.play().catch(() => {});

// ── MOTION TIER CARDS (Stories in Motion) ──────────
const motionVideo = document.getElementById('motionVideo');
let activeMotionKey = 'motion-scene';

const videoSources = {
  'motion-scene': 'assets/videos/motion-scene.mp4',
  'motion-multishot': 'assets/videos/motion-multishot.mp4',
  'motion-film': 'assets/videos/motion-film.mp4',
};

function activateMotionTier(key) {
  activeMotionKey = key;

  // Sync tier cards
  document.querySelectorAll('.motion-tier').forEach(tier => {
    tier.classList.remove('motion-tier-active');
  });
  const activeTier = document.querySelector(`.motion-tier[data-tier="${key}"]`);
  if (activeTier) activeTier.classList.add('motion-tier-active');

  const vimeoFilm = document.getElementById('motionVimeoFilm');
  const muteBtn = document.getElementById('motionMuteBtn');
  const expandBtn = document.getElementById('motionExpandBtn');

  if (key === 'motion-film') {
    // Use Vimeo iframe for Films (9:16 portrait) — muted loop, audio only via fullscreen
    if (motionVideo) {
      motionVideo.pause();
      motionVideo.style.display = 'none';
    }
    if (vimeoFilm) {
      vimeoFilm.src = 'https://player.vimeo.com/video/1184598650?background=1&autoplay=1&loop=1&muted=1&autopause=0&dnt=1';
      vimeoFilm.style.display = '';
    }
    if (muteBtn) {
      muteBtn.style.display = '';
      muteBtn.classList.add('film-mode');
      muteBtn.setAttribute('data-tooltip', 'Audio only in fullscreen · Click to expand');
    }
    if (expandBtn) expandBtn.style.display = '';
    // Hide play overlay — no longer used
    const playOverlay = document.getElementById('filmPlayOverlay');
    if (playOverlay) playOverlay.style.display = 'none';
  } else {
    // Hide play overlay & remove film-mode class
    const playOverlay = document.getElementById('filmPlayOverlay');
    if (playOverlay) playOverlay.style.display = 'none';
    if (muteBtn) muteBtn.classList.remove('film-mode');
    if (muteBtn) muteBtn.removeAttribute('data-tooltip');
    // Use native <video> for scene/multishot
    if (vimeoFilm) {
      vimeoFilm.src = '';
      vimeoFilm.style.display = 'none';
    }
    if (motionVideo) {
      motionVideo.style.display = '';
      if (videoSources[key]) {
        motionVideo.src = videoSources[key];
        motionVideo.load();
        motionVideo.play().catch(() => {});
      }
    }
    if (muteBtn) muteBtn.style.display = '';
    if (expandBtn) expandBtn.style.display = '';
  }

  // Sync mute button UI state to whichever video is now active
  if (window.__syncMuteBtn) window.__syncMuteBtn();
}

document.querySelectorAll('.motion-tier').forEach(tier => {
  tier.style.cursor = 'pointer';
  tier.addEventListener('click', () => {
    activateMotionTier(tier.dataset.tier);
  });
});

// ── SMOOTH SCROLL for anchor links ──────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── BACK TO TOP ──────────────────────────────
document.querySelector('.back-top')?.addEventListener('click', e => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── NQS STORIES — Case Study + Base Nav + Grid + Lightbox ──────────

const CASES = {
  'waldorf':      { label: 'Waldorf Astoria Costa Rica', bases: 5,  stories: 34 },
  'manhattan':    { label: 'Manhattan One',              bases: 7,  stories: 36 },
  'tropicalia':   { label: 'Tropicalia Estates',         bases: 3,  stories: 37 },
  'tropicalia-fs':{ label: 'Tropicalia Four Seasons',    bases: 4,  stories: 47 },
};

const PAGE_SIZE = 8;
let currentCase = 'manhattan';
let currentBase = 1;
let currentPage = 0;
let lightboxImages = []; // full-res paths
let lightboxIndex = 0;
let lightboxMode = 'stories'; // 'stories' or 'base'

const CB = '?v=2';
function thumbPath(c, i)    { return `assets/images/stories/${c}/thumbs/story-${i}.jpg${CB}`; }
function fullPath(c, i)     { return `assets/images/stories/${c}/stories/story-${i}.jpg${CB}`; }
function baseThumb(c, i)    { return `assets/images/stories/${c}/base-thumbs/base-${i}.jpg${CB}`; }
function baseFull(c, i)     { return `assets/images/stories/${c}/base/base-${i}.jpg${CB}`; }

function buildLightboxImages() {
  const c = CASES[currentCase];
  lightboxImages = [];
  for (let i = 1; i <= c.stories; i++) lightboxImages.push(fullPath(currentCase, i));
}

function makeCell(src, fullSrc, onClick, label) {
  const div = document.createElement('div');
  div.className = 'sg-cell';
  const img = document.createElement('img');
  img.src = src;
  img.dataset.full = fullSrc;
  img.loading = 'lazy';
  img.addEventListener('click', onClick);
  div.appendChild(img);
  if (label) {
    const lbl = document.createElement('span');
    lbl.className = 'sg-cell-num';
    lbl.textContent = label;
    div.appendChild(lbl);
  }
  return div;
}

/* Build a v2-style cell: image + single tag top-left corner */
function makeV2Cell(src, fullSrc, onClick, tag) {
  const div = document.createElement('div');
  div.className = 'sv2-cell';
  div.dataset.cursor = 'view';

  const img = document.createElement('img');
  img.src = src;
  img.dataset.full = fullSrc;
  img.loading = 'lazy';
  img.alt = '';
  div.appendChild(img);

  const tagEl = document.createElement('span');
  tagEl.className = 'sv2-tag';
  tagEl.textContent = tag;
  div.appendChild(tagEl);

  div.addEventListener('click', onClick);
  return div;
}

function renderAll() {
  const c = CASES[currentCase];
  const baseTrack = document.getElementById('sv2BaseTrack');
  const genGrid = document.getElementById('sv2GeneratedGrid');
  const countEl = document.getElementById('storiesCount');
  const pageInfo = document.getElementById('storiesPageInfo');
  if (!baseTrack || !genGrid) return;

  buildLightboxImages();

  // ── BASE TRACK — all bases as horizontal carousel ──
  baseTrack.innerHTML = '';
  for (let i = 1; i <= c.bases; i++) {
    const tag = `B.${String(i).padStart(2, '0')}`;
    baseTrack.appendChild(makeV2Cell(
      baseThumb(currentCase, i),
      baseFull(currentCase, i),
      ((idx) => () => openLightboxBase(idx - 1))(i),
      tag
    ));
  }

  // ── GENERATED GRID — 8 per page ──
  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, c.stories);
  genGrid.innerHTML = '';
  for (let i = start; i < end; i++) {
    const tag = `RF.${String(i + 1).padStart(2, '0')}`;
    const si = i;
    genGrid.appendChild(makeV2Cell(
      thumbPath(currentCase, si + 1),
      fullPath(currentCase, si + 1),
      () => openLightbox(si),
      tag
    ));
  }

  if (countEl) countEl.textContent = `${c.stories} STORIES GENERATED`;
  if (pageInfo) pageInfo.textContent = `${start + 1}–${end} / ${c.stories}`;
}

// Keep renderBase and renderGrid as aliases for compatibility
function renderBase() { renderAll(); }
function renderGrid() { renderAll(); }

function switchCase(c) {
  currentCase = c;
  currentBase = 1;
  currentPage = 0;
  renderAll();
  document.querySelectorAll('.case-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.case === c);
  });
}

// Base navigation — scroll the horizontal track
document.getElementById('basePrevBtn')?.addEventListener('click', () => {
  const track = document.getElementById('sv2BaseTrack');
  if (track) track.scrollBy({ left: -track.clientWidth * 0.6, behavior: 'smooth' });
});
document.getElementById('baseNextBtn')?.addEventListener('click', () => {
  const track = document.getElementById('sv2BaseTrack');
  if (track) track.scrollBy({ left: track.clientWidth * 0.6, behavior: 'smooth' });
});

// Stories page nav buttons (replace old NEXT 6 pill)
document.getElementById('storiesPrevPage')?.addEventListener('click', () => {
  const c = CASES[currentCase];
  const totalPages = Math.ceil(c.stories / PAGE_SIZE);
  currentPage = (currentPage - 1 + totalPages) % totalPages;
  renderAll();
});
document.getElementById('storiesNextPage')?.addEventListener('click', () => {
  const c = CASES[currentCase];
  const totalPages = Math.ceil(c.stories / PAGE_SIZE);
  currentPage = (currentPage + 1) % totalPages;
  renderAll();
});

// storiesLoadMore replaced by storiesNextPage/storiesPrevPage

// Case selector
document.querySelectorAll('.case-btn').forEach(btn => {
  btn.addEventListener('click', () => switchCase(btn.dataset.case));
});

// Lightbox
function openLightbox(idx) {
  lightboxMode = 'stories';
  buildLightboxImages(); // refresh stories array for current case
  lightboxIndex = idx;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const ctr = document.getElementById('lightboxCounter');
  if (!lb || !img) return;
  img.src = lightboxImages[lightboxIndex];
  if (ctr) ctr.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Open BASE lightbox with full navigation across all base images of current case
function openLightboxBase(idx) {
  lightboxMode = 'base';
  const c = CASES[currentCase];
  lightboxImages = [];
  for (let i = 1; i <= c.bases; i++) lightboxImages.push(baseFull(currentCase, i));
  lightboxIndex = idx;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const ctr = document.getElementById('lightboxCounter');
  if (!lb || !img) return;
  img.src = lightboxImages[lightboxIndex];
  if (ctr) ctr.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Deprecated — kept for any external callers (moodboard/maquette modals use it)
function openLightboxSingle(src) {
  lightboxMode = 'single';
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const ctr = document.getElementById('lightboxCounter');
  if (!lb || !img) return;
  img.src = src;
  lightboxIndex = -1;
  if (ctr) ctr.textContent = '';
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

function lightboxNav(dir) {
  if (lightboxIndex < 0) return;
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIndex];
  const ctr = document.getElementById('lightboxCounter');
  if (ctr) ctr.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
}

document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
document.getElementById('lightbox')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLightbox();
});
document.getElementById('lightboxPrev')?.addEventListener('click', () => lightboxNav(-1));
document.getElementById('lightboxNext')?.addEventListener('click', () => lightboxNav(1));
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox')?.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') lightboxNav(1);
  if (e.key === 'ArrowLeft') lightboxNav(-1);
});

// Init
renderAll();
// Init motion tier: Scene active by default
activateMotionTier('motion-scene');

// ── VIDEO EXPAND MODAL ──────────────────────────────────────────────────────
const videoModal        = document.getElementById('videoModal');
const videoModalVideo   = document.getElementById('videoModalVideo');
const videoModalClose   = document.getElementById('videoModalClose');
const videoModalBackdrop = document.getElementById('videoModalBackdrop');
const motionExpandBtn   = document.getElementById('motionExpandBtn');
const motionVideoEl     = document.getElementById('motionVideo');
const motionVideoContainerEl = document.getElementById('motionVideoContainer');

function openVideoModal() {
  if (!videoModal) return;
  const isPortrait = activeMotionKey === 'motion-film';
  const modalIframe = document.getElementById('videoModalIframe');

  if (isPortrait && modalIframe) {
    // Vimeo Film → show portrait 9:16 in modal with full Vimeo controls
    videoModalVideo.pause();
    videoModalVideo.src = '';
    videoModalVideo.style.display = 'none';

    // Get current time from background iframe to sync
    const bgPlayer = getVimeoFilmPlayer();
    const startTime = bgPlayer ? bgPlayer.getCurrentTime().catch(() => 0) : Promise.resolve(0);

    startTime.then(t => {
      const startParam = t ? `&#t=${Math.floor(t)}s` : '';
      modalIframe.src = `https://player.vimeo.com/video/1184598650?autoplay=1&loop=1&muted=0&dnt=1&title=0&byline=0&portrait=0&pip=0&playsinline=1&keyboard=0${startParam}`;
      // Force unmute via SDK after ready
      setTimeout(() => {
        if (window.Vimeo && modalIframe) {
          try {
            const mp = new Vimeo.Player(modalIframe);
            mp.ready().then(() => {
              mp.setMuted(false);
              mp.setVolume(1);
              mp.play();
            }).catch(() => {});
          } catch(e) {}
        }
      }, 400);
    });

    modalIframe.style.display = '';
    modalIframe.style.aspectRatio = '9/16';
    modalIframe.style.height = '92vh';
    modalIframe.style.width = 'auto';
    modalIframe.style.maxWidth = '95vw';
    modalIframe.style.borderRadius = '4px';

    // Pause background iframe
    if (bgPlayer) bgPlayer.pause().catch(() => {});
  } else {
    if (modalIframe) {
      modalIframe.src = '';
      modalIframe.style.display = 'none';
    }
    videoModalVideo.style.display = '';
    const currentSrc = videoSources[activeMotionKey] || motionVideoEl.currentSrc || motionVideoEl.src;
    videoModalVideo.src = currentSrc;
    videoModalVideo.style.aspectRatio = '16/9';
    videoModalVideo.style.height = 'auto';
    videoModalVideo.style.width = '88vw';
    videoModalVideo.style.maxWidth = '1200px';
    videoModalVideo.load();
    videoModalVideo.play().catch(() => {});
  }

  videoModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  // Pause background videos
  if (motionVideoEl) motionVideoEl.pause();
  // Pause background vimeo film (by clearing its src we'd lose position — just let it run muted)
}

function closeVideoModal() {
  if (!videoModal) return;
  videoModal.classList.remove('open');
  videoModalVideo.pause();
  videoModalVideo.src = '';
  const modalIframe = document.getElementById('videoModalIframe');
  if (modalIframe) {
    modalIframe.src = '';
    modalIframe.style.display = 'none';
  }
  document.body.style.overflow = '';
  // Resume background video
  if (motionVideoEl && activeMotionKey !== 'motion-film') motionVideoEl.play().catch(() => {});
  // Resume background Vimeo iframe if on Film
  if (activeMotionKey === 'motion-film') {
    const bgPlayer = getVimeoFilmPlayer();
    if (bgPlayer) bgPlayer.play().catch(() => {});
  }
}

if (motionExpandBtn) motionExpandBtn.addEventListener('click', openVideoModal);

// ── VIMEO POSTMESSAGE HELPERS ───────────────────────────────────────────────
// We use the Vimeo Player SDK (loaded via <script>) for reliable mute/volume control.
let vimeoFilmPlayer = null;
function getVimeoFilmPlayer() {
  const iframe = document.getElementById('motionVimeoFilm');
  if (!iframe || !window.Vimeo) return null;
  if (!vimeoFilmPlayer || vimeoFilmPlayer.element !== iframe) {
    try { vimeoFilmPlayer = new Vimeo.Player(iframe); }
    catch(e) { vimeoFilmPlayer = null; }
  }
  return vimeoFilmPlayer;
}

// Film Play Overlay — user gesture triggers play with sound
const filmPlayOverlay = document.getElementById('filmPlayOverlay');
if (filmPlayOverlay) {
  filmPlayOverlay.addEventListener('click', (e) => {
    e.stopPropagation();
    const iframe = document.getElementById('motionVimeoFilm');
    if (!iframe || !window.Vimeo) {
      filmPlayOverlay.style.display = 'none';
      return;
    }
    // Use SDK without reload — click is user-gesture, Vimeo should allow unmute
    try {
      // Open the modal directly — native Vimeo controls guarantee audio on user click
      filmPlayOverlay.style.display = 'none';
      if (typeof openVideoModal === 'function') openVideoModal();
    } catch(err) {}
  });
}

// ── MOTION VIDEO MUTE TOGGLE ────────────────────────────────────────────────
const motionMuteBtn = document.getElementById('motionMuteBtn');
const vimeoFilmIframe = document.getElementById('motionVimeoFilm');
let filmMuted = true; // state for vimeo film (starts muted)
if (motionMuteBtn && motionVideoEl) {
  // default: muted
  motionVideoEl.muted = true;
  motionMuteBtn.setAttribute('aria-pressed', 'false');
  const iconMuted = motionMuteBtn.querySelector('.icon-muted');
  const iconSound = motionMuteBtn.querySelector('.icon-sound');

  function updateMuteBtnUI(muted) {
    motionMuteBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    if (iconMuted && iconSound) {
      iconMuted.style.display = muted ? '' : 'none';
      iconSound.style.display = muted ? 'none' : '';
    }
  }

  motionMuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Determine if we're on vimeo film or on native video
    const onFilm = activeMotionKey === 'motion-film';
    if (onFilm) {
      // Films: audio is only available in fullscreen (browser policy) — open modal
      if (typeof openVideoModal === 'function') openVideoModal();
      return;
    }
    const nowMuted = !motionVideoEl.muted;
    motionVideoEl.muted = nowMuted;
    updateMuteBtnUI(nowMuted);
    if (!nowMuted) motionVideoEl.play().catch(() => {});
  });

  // Expose UI updater so setActiveMotion can sync button state on tab switch
  window.__syncMuteBtn = () => {
    const onFilm = activeMotionKey === 'motion-film';
    if (onFilm) updateMuteBtnUI(filmMuted);
    else updateMuteBtnUI(motionVideoEl.muted);
  };
}
if (videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
if (videoModalBackdrop) videoModalBackdrop.addEventListener('click', closeVideoModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && videoModal && videoModal.classList.contains('open')) closeVideoModal();
});

// ── Moodboard animate toggle ──────────────────────────────────────────────
(function() {
  const wrap = document.getElementById('moodboardOutWrap');
  const media = wrap ? wrap.querySelector('.moodboard-out-media') : null;
  const img   = document.getElementById('moodboardOutImg');
  const vid   = document.getElementById('moodboardOutVideo');
  const hint  = wrap ? wrap.querySelector('.moodboard-animate-hint span') : null;
  if (!media || !img || !vid || !hint) return;

  let playing = false;

  media.addEventListener('click', function() {
    if (!playing) {
      // Switch to video
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.play().catch(() => {});
      media.classList.add('playing');
      hint.textContent = 'IMAGE';
      playing = true;
    } else {
      // Switch back to image
      vid.pause();
      vid.style.display = 'none';
      img.style.display = 'block';
      media.classList.remove('playing');
      hint.textContent = 'ANIMATE';
      playing = false;
    }
  });
})();

// ── Maquette animate toggle ───────────────────────────────────────────────
(function() {
  const wrap  = document.getElementById('maquetteOutWrap');
  const media = wrap ? wrap.querySelector('.maquette-out-media') : null;
  const img   = document.getElementById('maquetteOutImg');
  const vid   = document.getElementById('maquetteOutVideo');
  const hint  = wrap ? wrap.querySelector('.maquette-animate-hint span') : null;
  if (!media || !img || !vid || !hint) return;

  let playing = false;

  media.addEventListener('click', function() {
    if (!playing) {
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.play().catch(() => {});
      media.classList.add('playing');
      hint.textContent = 'IMAGE';
      playing = true;
    } else {
      vid.pause();
      vid.style.display = 'none';
      img.style.display = 'block';
      media.classList.remove('playing');
      hint.textContent = 'ANIMATE';
      playing = false;
    }
  });
})();
