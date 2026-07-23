const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });
revealItems.forEach((item) => observer.observe(item));
const slides = Array.from(document.querySelectorAll('.gallery__slide'));
const buttons = document.querySelectorAll('.slider-button');
const galleryCounter = document.querySelector('.gallery__counter');
let current = 0;
function updateGalleryCounter(index) {
  if (!galleryCounter) return;
  const total = slides.length;
  galleryCounter.textContent = `${String(index + 1).padStart(2, '0')} // ${String(total).padStart(2, '0')}`;
}
function showSlide(index) {
  current = index;
  slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
  updateGalleryCounter(index);
}
function nextSlide() { showSlide((current + 1) % slides.length); }
function prevSlide() { showSlide((current - 1 + slides.length) % slides.length); }
buttons.forEach((button) => button.addEventListener('click', () => (button.dataset.dir === 'next' ? nextSlide() : prevSlide())));
setInterval(nextSlide, 5000);
showSlide(0);

// Mobile menu toggle
const hamburger = document.querySelector('.hamburger');
const mainNav = document.getElementById('main-nav');
if (hamburger && mainNav) {
  hamburger.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  });
  // Close when clicking a nav link
  mainNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }));
}

// Simple i18n loader
const I18N_PATH = '/web/i18n';
const DEFAULT_LANG = 'es';
function setLangButtonText(btn, lang) { btn.textContent = lang === 'en' ? 'EN' : 'ES'; }

async function loadTranslations(lang) {
  try {
    const res = await fetch(`${I18N_PATH}/${lang}.json`);
    if (!res.ok) return null;
    return res.json();
  } catch (e) { return null; }
}

async function applyTranslations(lang) {
  const translations = await loadTranslations(lang) || {};
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const text = key.split('.').reduce((o, k) => (o && o[k] ? o[k] : null), translations);
    if (text) {
      if (typeof text === 'string' && text.includes('\n')) {
        el.innerHTML = text.split('\n').map((s) => s.replace(/</g, '&lt;')).join('<br/>');
      } else {
        el.textContent = text;
      }
    }
  });
  // cache for other usage
  window.__translations = translations;
  try { document.documentElement.lang = lang; } catch (e) {}
}

const langBtn = document.getElementById('lang-toggle');
let currentLang = localStorage.getItem('site_lang') || DEFAULT_LANG;
if (langBtn) setLangButtonText(langBtn, currentLang);
applyTranslations(currentLang);

if (langBtn) {
  langBtn.addEventListener('click', async () => {
    currentLang = currentLang === 'es' ? 'en' : 'es';
    localStorage.setItem('site_lang', currentLang);
    setLangButtonText(langBtn, currentLang);
    await applyTranslations(currentLang);
    // update status badge texts if needed
    loadSiteStatus();
  });
}

async function loadSiteStatus() {
  try {
    const response = await fetch('/api/settings/site-status');
    if (!response.ok) return;
    const data = await response.json();
    const statusBadge = document.querySelector('#hero-status');
    const scheduleText = document.querySelector('#status-schedule');
    if (!statusBadge || !scheduleText) return;

    const t = window.__translations || {};
    const statusOpen = (t.status && t.status.open) || 'ABIERTO';
    const statusClosed = (t.status && t.status.closed) || 'CERRADO';
    const closedUntilLabel = (t.status && t.status.closed_until) || 'CERRADO hasta %s';
    const scheduleLabel = (t.status && t.status.schedule_prefix) || 'Horario: %s';

    const hoursString = data.site_hours_start && data.site_hours_end
      ? `${data.site_hours_start} - ${data.site_hours_end}`
      : data.site_hours || '10:00 - 23:00';

    const parseTime = (value) => {
      if (!value || typeof value !== 'string') return null;
      const [hour, minute] = value.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return hour * 60 + minute;
    };

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = parseTime(data.site_hours_start) ?? parseTime((data.site_hours || '10:00 - 23:00').split('-')[0].trim());
    const endMinutes = parseTime(data.site_hours_end) ?? parseTime((data.site_hours || '10:00 - 23:00').split('-')[1]?.trim());
    const isScheduledOpen = (() => {
      if (startMinutes === null || endMinutes === null) return true;
      if (startMinutes === endMinutes) return true;
      if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    })();

    const footerSchedule = document.querySelector('#footer-hours');
    if (footerSchedule) {
      footerSchedule.textContent = scheduleLabel.replace('%s', hoursString);
    }

    if (data.site_closed || !isScheduledOpen) {
      statusBadge.classList.add('status-banner--closed');
      statusBadge.classList.remove('status-banner--open');
      statusBadge.querySelector('.status-banner__label').textContent = statusClosed;
      if (data.site_closed) {
        if (data.site_closed_until) {
          const date = new Date(data.site_closed_until).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'es-PE', { day: '2-digit', month: 'long' });
          scheduleText.textContent = closedUntilLabel.replace('%s', date);
        } else {
          const closedText = data.site_closed_text || (t.status && t.status.closed_text) || 'Abre mañana';
          scheduleText.textContent = closedText;
        }
      } else {
        const nextOpenText = currentMinutes < startMinutes
          ? `Abre a ${data.site_hours_start || '10:00'}`
          : `Abre mañana a ${data.site_hours_start || '10:00'}`;
        scheduleText.textContent = nextOpenText;
      }
    } else {
      statusBadge.classList.add('status-banner--open');
      statusBadge.classList.remove('status-banner--closed');
      statusBadge.querySelector('.status-banner__label').textContent = statusOpen;
      scheduleText.textContent = scheduleLabel.replace('%s', hoursString);
    }
  } catch (error) {
    console.warn('No se pudo cargar el estado del local:', error);
  }
}

loadSiteStatus();

const distributionVideoPreview = document.querySelector('.distribution-card__video--preview');
if (distributionVideoPreview) {
  distributionVideoPreview.addEventListener('click', () => {
    const videoId = distributionVideoPreview.dataset.videoId;
    if (!videoId) return;
    distributionVideoPreview.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${videoId}?rel=0&showinfo=0"
        title="Video de Global Games"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
      ></iframe>
    `;
  }, { once: true });
}

// --- Games search and rendering ---
const gamesInput = document.getElementById('game-search-input');
const gamesResults = document.getElementById('games-results');
const platformBadgesContainer = document.getElementById('platform-badges');
const featuredGamesContainer = document.getElementById('games-featured');

const PLATFORM_BADGES = [
  { key: 'Steam', name: 'Steam', domain: 'store.steampowered.com' },
  { key: 'BattleNet', name: 'BattleNet', domain: 'battle.net' },
  { key: 'EpicGames', name: 'Epic Games', domain: 'epicgames.com' },
  { key: 'RioGamer', name: 'RioGamer', domain: 'riogamer.com' },
  { key: 'More', name: 'Más', domain: 'globalgames.gg' },
];

function faviconFor(domain) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}

function renderPlatformBadges() {
  if (!platformBadgesContainer) return;
  platformBadgesContainer.innerHTML = PLATFORM_BADGES.map(p => `
    <a class="platform-badge" href="https://${p.domain}" target="_blank" rel="noopener noreferrer" title="${p.name}">
      <img src="${faviconFor(p.domain)}" alt="${p.name}" />
      <span class="platform-badge__label">${p.name}</span>
    </a>
  `).join('');
}

const FEATURED_GAMES = [
  { name: 'League of Legends', url: 'https://www.leagueoflegends.com/es-es/', domain: 'leagueoflegends.com', tag: 'MOBA' },
  { name: 'Counter-Strike 2', url: 'https://www.counter-strike.net/cs2?l=spanish', domain: 'counter-strike.net', tag: 'Shooter' },
  { name: 'Fortnite', url: 'https://www.fortnite.com/', domain: 'fortnite.com', tag: 'Battle Royale' },
  { name: 'Dota 2', url: 'https://www.dota2.com/home', domain: 'dota2.com', tag: 'MOBA' },
  { name: 'Call of Duty: Warzone', url: 'https://www.callofduty.com/es/warzone', domain: 'callofduty.com', tag: 'Shooter' },
  { name: 'Valorant', url: 'https://playvalorant.com/es-mx/', domain: 'playvalorant.com', tag: 'Táctico' },
];

function renderFeaturedGames() {
  if (!featuredGamesContainer) return;
  featuredGamesContainer.innerHTML = `
    <div class="games-featured__header">
      <span class="games-featured__eyebrow">Destacados</span>
      <h3>Juegos principales</h3>
    </div>
    <div class="games-featured__grid">
      ${FEATURED_GAMES.map((game) => `
        <a class="games-featured__card" href="${game.url}" target="_blank" rel="noopener noreferrer">
          <div class="games-featured__icon"><img src="${faviconFor(game.domain)}" alt="${(game.name||'').replace(/</g,'&lt;')} logo" width="40" height="40"/></div>
          <div>
            <h4>${String(game.name || '').replace(/</g, '&lt;')}</h4>
            <p>${String(game.tag || '').replace(/</g, '&lt;')}</p>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderGamesList(games, initialDisplay = false) {
  if (!gamesResults) return;
  if (!Array.isArray(games) || games.length === 0) {
    gamesResults.innerHTML = `
      <div class="game-card game-card--empty">
        <div class="no-results-badge">No está en lista? No te preocupes!</div>
        <h3>Visítanos y lo instalamos para ti!</h3>
        <p>Nuestra experiencia en juegos, soporte técnico y atención te garantiza la mejor experiencia.</p>
      </div>
    `;
    return;
  }

  const effectiveGames = initialDisplay ? games.slice(0, 6) : games;
  const items = effectiveGames.map(g => `
    <article class="game-card" data-slug="${String(g.slug || '')}">
      <div class="game-card__header">
        <span class="game-card__icon" aria-hidden="true">🎮</span>
        <h3 class="game-card__title">${String(g.name || '').replace(/</g, '&lt;')}</h3>

        ${(Array.isArray(g.platforms) ? g.platforms : []).slice(0,3).map(p => `
          <a class="game-card__platform" href="https://${(p.domain||'').replace(/\"/g,'')}" target="_blank" rel="noopener noreferrer" title="${(p.name||'').replace(/</g,'&lt;')}" aria-label="${(p.name||'').replace(/</g,'&lt;')}">
            <img src="${faviconFor((p.domain||'').toString())}" alt="${(p.name||'').replace(/</g,'&lt;')}" />
          </a>
        `).join('')}
        
      </div>
         
    
    </article>
  `).join('');

  const moreGamesCard = initialDisplay ? `
    <article class="game-card game-card--cta">
      <div class="game-card__header">
        <span class="game-card__icon game-card__icon--highlight" aria-hidden="true">✨</span>
        <h3 class="game-card__title">Más juegos</h3>
      </div>
      <p>Busca en nuestro catálogo para encontrar tu título favorito.</p>
    </article>
  ` : '';

  gamesResults.innerHTML = `${items}${moreGamesCard}`;
}

let gamesTimer = null;
async function fetchAndRenderGames(query) {
  try {
    const q = String(query || '').trim();
    const url = q ? `/api/games?q=${encodeURIComponent(q)}` : '/api/games';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch games');
    const data = await res.json();
    renderGamesList(Array.isArray(data) ? data : [], q === '');
  } catch (err) {
    console.warn('Games fetch failed:', err);
    renderGamesList([]);
  }
}

if (gamesInput) {
  gamesInput.addEventListener('input', (e) => {
    clearTimeout(gamesTimer);
    gamesTimer = setTimeout(() => fetchAndRenderGames(e.target.value), 220);
  });
}

// Initial render
renderPlatformBadges();
renderFeaturedGames();
fetchAndRenderGames('');
