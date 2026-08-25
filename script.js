// ============ Nav scroll state ============
const nav = document.getElementById('siteNav');
const progressBar = document.getElementById('progressBar');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

function onScroll(){
  const y = window.scrollY;
  nav.classList.toggle('scrolled', y > 40);

  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (y / docHeight) * 100 : 0;
  progressBar.style.width = pct + '%';
}

// ============ Parallax (JS-driven, works on mobile unlike bg-attachment:fixed) ============
const parallaxEls = Array.from(document.querySelectorAll('.parallax-bg'));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = window.innerWidth < 700;

function updateParallax(){
  if (reduceMotion) return;
  const vh = window.innerHeight;
  parallaxEls.forEach(el => {
    const rect = el.parentElement.getBoundingClientRect();
    // only compute when the parent section is near the viewport
    if (rect.bottom < -200 || rect.top > vh + 200) return;
    const speed = parseFloat(el.dataset.speed || '0.3') * (isSmall ? 0.5 : 1);
    const offset = (rect.top) * speed;
    el.style.transform = `translate3d(0, ${offset}px, 0)`;
  });
}

let ticking = false;
function onScrollFrame(){
  onScroll();
  updateParallax();
  ticking = false;
}
window.addEventListener('scroll', () => {
  if (!ticking){
    requestAnimationFrame(onScrollFrame);
    ticking = true;
  }
}, { passive:true });

window.addEventListener('resize', updateParallax);

// ============ Hero: video carousel ============
// Cycles through a few short, muted, silent loops behind the hero text.
// Skipped entirely (falls back to the static poster photo) on small screens,
// slow connections or reduced-motion — videos are never fetched in that case.
(function initHeroVideo(){
  const heroMedia = document.getElementById('heroMedia');
  if (!heroMedia) return;

  const isSmallScreen = window.innerWidth < 700;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduceMotion || isSmallScreen || saveData) return;

  const videos = Array.from(heroMedia.querySelectorAll('.hero-video'));
  if (!videos.length) return;

  const CYCLE_MS = 6500;
  let current = 0;

  function playVideo(v){
    v.currentTime = 0;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  function activate(i){
    videos.forEach((v, idx) => v.classList.toggle('active', idx === i));
    playVideo(videos[i]);
    heroMedia.classList.add('video-active');
  }

  function scheduleNext(){
    setTimeout(() => {
      current = (current + 1) % videos.length;
      activate(current);
      scheduleNext();
    }, CYCLE_MS);
  }

  // Load sources only now that we've decided to actually play video.
  // preload="none" means setting .src alone won't start fetching — call
  // .load() explicitly so playback actually begins.
  videos.forEach(v => {
    v.querySelectorAll('source').forEach(s => { s.src = s.dataset.src; });
    v.load();
  });

  const first = videos[0];
  const start = () => { activate(0); scheduleNext(); };
  if (first.readyState >= 3) start();
  else first.addEventListener('canplay', start, { once: true });
})();

// ============ Scroll reveal ============
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window){
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting){
        setTimeout(() => entry.target.classList.add('in-view'), i * 60 % 240);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '200px 0px -40px 0px' });
  revealEls.forEach(el => io.observe(el));

  // Safety net: a fast/instant scroll (trackpad flick, or a jump via anchor link)
  // can skip an element's viewport window between two intersection callbacks.
  // Sweep once after load and after scroll settles to catch anything IO missed.
  function sweepReveal(){
    const vh = window.innerHeight;
    revealEls.forEach(el => {
      if (el.classList.contains('in-view')) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0){
        el.classList.add('in-view');
        io.unobserve(el);
      }
    });
  }
  window.addEventListener('load', sweepReveal);
  let sweepTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweepReveal, 250);
  }, { passive:true });
} else {
  revealEls.forEach(el => el.classList.add('in-view'));
}

// ============ Mobile nav toggle ============
navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  navToggle.classList.toggle('active');
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ============ Footer year ============
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ============ Init ============
onScroll();
updateParallax();
