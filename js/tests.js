/* ══════════════════════════════════════════════════════════════
   ШАПКА — бургер и статус авторизации
══════════════════════════════════════════════════════════════ */
const burgerBtn = document.getElementById('burgerBtn');
const mobileMenu = document.getElementById('mobileMenu');
burgerBtn.addEventListener('click', () => {
    burgerBtn.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
});
mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    burgerBtn.classList.remove('open'); mobileMenu.classList.remove('open'); document.body.style.overflow = '';
}));

const API_BASE = '';

async function fetchUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return null;
        }
        const user = await response.json();
        localStorage.setItem('user', JSON.stringify(user));
        return user;
    } catch {
        return null;
    }
}

function getUser() { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; } }
function isAuthenticated() { return !!localStorage.getItem('token'); }

/* ══════════════════════════════════════════════════════════════
   КНОПКА СООБЩЕНИЙ В ШАПКЕ — счётчик непрочитанных сообщений чата
══════════════════════════════════════════════════════════════ */
function setNotifBadge(count) {
    ['notifBadge', 'notifBadgeMobile'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}

async function loadUnreadCount() {
    const token = localStorage.getItem('token');
    if (!token) { setNotifBadge(0); return; }
    try {
        const response = await fetch(`${API_BASE}/api/messages/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        setNotifBadge(data.unreadCount || 0);
    } catch {
        // тихо игнорируем — счётчик не критичен, обновится при следующем опросе/SSE-событии
    }
}

function goToConsultation() {
    if (!isAuthenticated()) {
        window.location.href = 'auth.html';
        return;
    }
    window.location.href = 'chat.html';
}
document.getElementById('notifBellBtn')?.addEventListener('click', goToConsultation);
document.getElementById('notifBellBtnMobile')?.addEventListener('click', goToConsultation);

/* ══════════════════════════════════════════════════════════════
   КНОПКА ТЕХПОДДЕРЖКИ В ШАПКЕ — счётчик непрочитанных обращений
══════════════════════════════════════════════════════════════ */
function setSupportBadge(count) {
    ['supportBadge', 'supportBadgeMobile'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}

async function loadSupportUnreadCount() {
    const token = localStorage.getItem('token');
    if (!token) { setSupportBadge(0); return; }
    try {
        const response = await fetch(`${API_BASE}/api/messages/support-unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        setSupportBadge(data.unreadCount || 0);
    } catch {
        // тихо игнорируем — обновится при следующем опросе/SSE-событии
    }
}

// Реальное время: слушаем то же SSE-соединение, что и страницы чата/главная,
// чтобы бейджи обновлялись сразу, без перезагрузки страницы.
let notifEventSource = null;

function connectNotifSSE() {
    const token = localStorage.getItem('token');
    if (!token || notifEventSource) return;
    notifEventSource = new EventSource(`${API_BASE}/api/notifications/stream?access_token=${encodeURIComponent(token)}`);
    notifEventSource.addEventListener('new_message', () => { loadUnreadCount(); loadSupportUnreadCount(); });
    notifEventSource.addEventListener('message_read', loadUnreadCount);
    notifEventSource.addEventListener('messages_read', loadUnreadCount);
    notifEventSource.onerror = () => {
        // EventSource сам переподключается; подстраховываемся периодическим опросом (см. ниже).
    };
}

function disconnectNotifSSE() {
    if (notifEventSource) {
        notifEventSource.close();
        notifEventSource = null;
    }
}

// Подстраховка на случай обрыва SSE — фоновый опрос раз в 30 секунд.
setInterval(() => { if (isAuthenticated()) loadUnreadCount(); }, 30000);

// Догружаем счётчик, когда вкладка снова становится активной.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isAuthenticated()) loadUnreadCount();
});

async function renderAuthState() {
    const authed = isAuthenticated();
    document.body.classList.toggle('is-authenticated', authed);
    if (!authed) {
        setNotifBadge(0);
        setSupportBadge(0);
        disconnectNotifSSE();
        return;
    }

    let user = getUser();
    if (!user) {
        user = await fetchUser();
        if (!user) {
            document.body.classList.remove('is-authenticated');
            return;
        }
    }

    const name = user.fullName || user.username || 'Пользователь';
    const initial = name.charAt(0).toUpperCase() || '?';
    document.querySelectorAll('[data-profile-name]').forEach(el => el.textContent = name);
    document.querySelectorAll('[data-profile-avatar]').forEach(el => {
        if (user.avatarUrl) { el.style.backgroundImage = `url(${user.avatarUrl})`; el.textContent = ''; }
        else { el.style.backgroundImage = 'none'; el.textContent = initial; }
    });

    loadUnreadCount();
    loadSupportUnreadCount();
    connectNotifSSE();
}
renderAuthState();
document.querySelectorAll('.logout-trigger').forEach(btn => btn.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch { }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    renderAuthState();
}));

/* ══════════════════════════════════════════════════════════════
   ДАННЫЕ О ТЕСТАХ
══════════════════════════════════════════════════════════════ */
const ICONS = {
    anxiety: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0"></path><path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0"></path></svg>',
    personality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3v18M3 12h18"></path></svg>',
    mood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-6 6 6 9 0s6-6 9 0"></path></svg>',
    depression: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10a6 6 0 0 1 12 0v1a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8z"></path><line x1="8" y1="21" x2="8" y2="19"></line><line x1="12" y1="21" x2="12" y2="18.5"></line><line x1="16" y1="21" x2="16" y2="19"></line></svg>',
    burnout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2 3 1 4-.5 5.5C10 9 9 10.5 9 12.5a3 3 0 0 0 6 0c0-1-.3-1.6-1-2.3.7 1 1 1.8 1 2.8a4 4 0 1 1-8 0c0-3 1.5-4.5 3-6.3C11 5 11.3 3.5 12 2z"></path></svg>',
    panic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-7 4 14 2-7h8"></path></svg>',
    ocd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3.5 7.1"></path><polyline points="3 17 3 21 7 21"></polyline></svg>',
    asd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M 20.6 12.0 L 20.43 13.73 L 19.95 15.19 L 19.15 16.17 L 18.08 16.52 L 16.78 16.17 L 15.29 15.19 L 13.68 13.73 L 12.0 12.0 L 10.32 10.27 L 8.71 8.81 L 7.22 7.83 L 5.92 7.49 L 4.85 7.83 L 4.05 8.81 L 3.57 10.27 L 3.4 12.0 L 3.57 13.73 L 4.05 15.19 L 4.85 16.17 L 5.92 16.52 L 7.22 16.17 L 8.71 15.19 L 10.32 13.73 L 12.0 12.0 L 13.68 10.27 L 15.29 8.81 L 16.78 7.83 L 18.08 7.49 L 19.15 7.83 L 19.95 8.81 L 20.43 10.27 L 20.6 12.0 Z"></path></svg>',
    bpd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 9.2 2.6z"></path><path d="M12 5v4l-2 2"></path></svg>',
    adhd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"></circle><circle cx="5" cy="6" r="1.4"></circle><circle cx="19" cy="6" r="1.4"></circle><circle cx="5" cy="18" r="1.4"></circle><circle cx="19" cy="18" r="1.4"></circle></svg>',
    ptsd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"></path><path d="M9.5 12l1.8 1.8L15 10"></path></svg>',
    esteem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z"></path></svg>',
    psychosis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    szd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="2.5"></circle><circle cx="17" cy="6" r="2.2"></circle><circle cx="20" cy="10" r="2.2"></circle><path d="M9 16l6-8"></path></svg>',
    rpp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M9 6c1 2 2 2 3 0s2-2 3 0M9 12c1 2 2 2 3 0s2-2 3 0"></path></svg>',
    sch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 1 9 9c0 3-1 4-1 6h-4l-1 3h-6l-1-3H4c0-2-1-3-1-6a9 9 0 0 1 9-9z"></path><path d="M8 10l3 2-2 3M13 9l3 3-3 2"></path></svg>',
    devdelay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4v-4h4V4"></path><circle cx="19" cy="4" r="1.6"></circle></svg>',
    dyscalc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"></rect><line x1="8" y1="7" x2="16" y2="7"></line><line x1="8" y1="12" x2="10" y2="12"></line><line x1="13" y1="12" x2="15" y2="12"></line></svg>',
    klepto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21v-6a3 3 0 0 1 3-3h1V6a2 2 0 1 1 4 0v7"></path><path d="M9 15l-3 1a2 2 0 0 0-1 3l1 2h11l1-4"></path></svg>',
    sza: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14c2-4 4 4 6 0s4-4 6 0 4-4 6 0"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    szf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10H9l-4 4z"></path><circle cx="8" cy="10" r=".6" fill="currentColor" stroke="none"></circle><circle cx="12" cy="9" r=".6" fill="currentColor" stroke="none"></circle><circle cx="16" cy="11" r=".6" fill="currentColor" stroke="none"></circle></svg>',
    dyslex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v14"></path><path d="M4 19a2 2 0 0 0 2 2h11"></path><path d="M8 8h6M8 12h4"></path></svg>',
    szt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2"></path></svg>',
    dri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="6"></circle><circle cx="15" cy="12" r="6"></circle></svg>',
    narc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="3"></circle><circle cx="16" cy="10" r="5"></circle></svg>',
    hoarding: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><rect x="4" y="12" width="7" height="9"></rect><rect x="11" y="8" width="9" height="13"></rect><path d="M6 12V9h4v3"></path></svg>',
    socphob: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"></path><path d="M3 12h2M19 12h2M4.5 6.5l1.5 1M19.5 6.5l-1.5 1"></path></svg>',
    agora: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"></path><path d="M5 20V10l7-6 7 6v10"></path><path d="M10 20v-5h4v5"></path></svg>',
    sepanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"></circle><circle cx="17" cy="17" r="3"></circle><path d="M9 9.5c2 1 4 2 6 5" stroke-dasharray="2 2"></path></svg>',
    phobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"></path><path d="M12 10v4"></path><circle cx="12" cy="17" r=".6"></circle></svg>',
    testanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h4"></path></svg>',
    stagefright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M6 11a6 6 0 0 0 12 0"></path><path d="M12 17v4"></path><path d="M9 21h6"></path></svg>',
    smalltalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"></path></svg>',
    hypochondria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L20 20"></path><path d="M10 7v6M7 10h6"></path></svg>',
    intrusive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path><path d="M12 3v4"></path><path d="M12 17v4"></path></svg>',
    stress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"></path></svg>',
    adjust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-8 6-8 9-3s6 3 9-7"></path><path d="M3 21h18"></path></svg>',
    ecoanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"></path><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z"></path><path d="M12 15c0-3-2-5-5-5 0 3 2 5 5 5z"></path></svg>',
    dysthymia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 18a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 17.7 8.4 4.8 4.8 0 0 1 17.5 18z"></path><path d="M9 21.5h6"></path></svg>',
    seasonal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>',
    anhedonia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path><path d="M3 21L21 3"></path></svg>',
    alexithymia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"></path><path d="M9 10h.01M12 10h.01M15 10h.01"></path></svg>',
    emoreg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path><path d="M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path></svg>',
    anger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3-.5-5 1-8z"></path></svg>',
    rumination: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-3-6.2"></path><path d="M20 4v4h-4"></path></svg>',
    helpless: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V8a6 6 0 0 1 12 0v13"></path><path d="M10 21V6"></path><path d="M14 21V6"></path><path d="M6 13h12"></path></svg>',
    lonely: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M6 21v-2a6 6 0 0 1 12 0v2"></path><path d="M2 12h2M20 12h2"></path></svg>',
    selfcomp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15s-5-3-5-6.5A2.8 2.8 0 0 1 12 6.5a2.8 2.8 0 0 1 5 2c0 3.5-5 6.5-5 6.5z"></path><path d="M3 15c2 3 5 5 9 5s7-2 9-5"></path></svg>',
    innercritic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"></circle><path d="M6 20a6 6 0 0 1 12 0"></path><path d="M19 4l2 2M5 4L3 6"></path></svg>',
    grief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path><path d="M12 9v5"></path></svg>',
    procrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 8v5l3 2"></path><path d="M9 2h6"></path></svg>',
    perfect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle></svg>',
    impostor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9c0-3 3.5-5 8-5s8 2 8 5v3a8 8 0 0 1-16 0z"></path><path d="M8 11h2M14 11h2"></path><path d="M9 16c1.5 1 4.5 1 6 0"></path></svg>',
    failfear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4V8h6"></path><path d="M3 20h18"></path></svg>',
    excellent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7 4 8.8 9.5 8z"></path></svg>',
    fomo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10v7H8l-3 3v-3H4z"></path><path d="M16 10h4v7h-1v3l-3-3h-5v-2"></path></svg>',
    digital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M11 18h2"></path><path d="M10 8h4M10 11h4"></path></svg>',
    ludo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1"></circle><circle cx="15" cy="9" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="9" cy="15" r="1"></circle><circle cx="15" cy="15" r="1"></circle></svg>',
    bedtimeproc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M13 9v3l2 1.5"></path></svg>',
    hikikomori: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"></path><path d="M6 10v10h12V10"></path><rect x="10" y="14" width="4" height="6"></rect></svg>',
    boundaries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"></rect><circle cx="12" cy="12" r="3"></circle></svg>',
    codep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></svg>',
    peer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2 20v-1a5 5 0 0 1 10 0v1"></path><path d="M14 20v-.5a4 4 0 0 1 8 0v.5"></path></svg>',
    insomnia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M15 4h4l-4 4h4"></path></svg>',
    lark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"></path><path d="M7 18a5 5 0 0 1 10 0"></path><path d="M12 6v3"></path><path d="M5 11l1.8 1.8"></path><path d="M19 11l-1.8 1.8"></path></svg>',
    psychosom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path><path d="M9 12h2l1-2 1.5 4 1-2h1.5"></path></svg>',
    trich: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c0-8 3-14 7-16"></path><path d="M9 20c0-6 2-10 5-12"></path><path d="M13 20c0-4 1-7 3-9"></path></svg>',
    tourette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h3l2-6 3 12 2-8 2 4h4"></path></svg>',
    misophonia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9a4 4 0 1 1 8 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0"></path><path d="M11 9a1.2 1.2 0 0 1 2.4 0"></path></svg>',
    dyspraxia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5"></path><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"></path><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.4-1.8L8 15"></path></svg>',
    dysgraphia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19z"></path><path d="M14 7l3 3"></path></svg>',
    depers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="4"></circle><circle cx="15" cy="15" r="4" stroke-dasharray="2 2"></circle></svg>',
    bdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="11" rx="6" ry="8"></ellipse><path d="M9 9.5h.01M15 9.5h.01"></path><path d="M9 14c1 1 5 1 6 0"></path><path d="M5 21l14-3"></path></svg>',
    avoidant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 12h6"></path><path d="M13 9l3 3-3 3"></path></svg>',
    paranoid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="5"></ellipse><circle cx="12" cy="12" r="2.2"></circle><path d="M3 5l4 2M21 5l-4 2"></path></svg>',
    odd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M12 8.5v3"></path><path d="M12 13.6h.01"></path></svg>',
    schoolref: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h10v17"></path><path d="M3 21h18"></path><path d="M12 13h.01"></path><path d="M18 9l3 3-3 3"></path></svg>',
    bullying: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.5"></circle><circle cx="17" cy="7" r="2.5"></circle><circle cx="12" cy="16" r="2.5"></circle><path d="M12 13.5v-2M8.5 9.5l2.5 2M15.5 9.5l-2.5 2"></path></svg>',
    cyberbully: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M12 8v4"></path><path d="M12 15h.01"></path></svg>',
    abuse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path><path d="M9 9l6 6M15 9l-6 6"></path></svg>'
};

const TESTS = [
    { id: 'anxiety', title: 'Тест на уровень тревожности', tag: 'Тревожность', tagClass: 'anxiety', desc: '7 коротких вопросов о том, как часто вас беспокоят тревожные мысли и напряжение в последние две недели.', time: '~3 мин', qcount: 7, available: true, href: 'Tests/test-anxiety.html' },
    { id: 'personality', title: 'Интроверт, экстраверт или амбиверт?', tag: 'Тип личности', tagClass: 'personality', desc: '12 утверждений о том, как вы восстанавливаете энергию и ведёте себя в компании — узнайте, где вы на этой шкале.', time: '~4 мин', qcount: 12, available: true, href: 'Tests/test-introvert.html' },
    { id: 'mood', title: 'Скрининг перепадов настроения', tag: 'БАР', tagClass: 'mood', desc: 'Опросник для предварительной оценки выраженных перепадов настроения и энергии.', time: '~5 мин', qcount: 13, available: true, href: 'Tests/test-bipolar.html' },
    { id: 'depression', title: 'Тест на депрессивные симптомы', tag: 'Депрессия', tagClass: 'depression', desc: 'Помогает оценить, насколько сниженное настроение и потеря интереса влияют на повседневную жизнь.', time: '~4 мин', qcount: 9, available: true, href: 'Tests/test-depression.html' },
    { id: 'burnout', title: 'Тест на эмоциональное выгорание', tag: 'Выгорание', tagClass: 'burnout', desc: 'Оценка истощения, цинизма и снижения продуктивности, связанных с хроническим стрессом.', time: '~4 мин', qcount: 10, available: true, href: 'Tests/test-burnout.html' },
    { id: 'panic', title: 'Тест на панические атаки', tag: 'Панические атаки', tagClass: 'panic', desc: 'Поможет разобраться, похожи ли ваши эпизоды сильного страха на панические атаки.', time: '~3 мин', qcount: 8, available: true, href: 'Tests/test-panic.html' },
    { id: 'ocd', title: 'Скрининг навязчивых мыслей и действий', tag: 'ОКР', tagClass: 'ocd', desc: 'Короткий опросник о навязчивых мыслях и повторяющихся действиях, которые трудно контролировать.', time: '~5 мин', qcount: 10, available: true, href: 'Tests/test-ocd.html' },
    { id: 'asd', title: 'Скрининг черт аутистического спектра', tag: 'РАС', tagClass: 'asd', desc: 'Вопросы об особенностях общения, сенсорного восприятия и рутин — не диагноз, а повод для беседы со специалистом.', time: '~6 мин', qcount: 15, available: true, href: 'Tests/test-asd.html' },
    { id: 'bpd', title: 'Скрининг эмоциональной нестабильности', tag: 'ПРЛ', tagClass: 'bpd', desc: 'Оценка резких перепадов в отношениях, самооценке и эмоциях.', time: '~5 мин', qcount: 12, available: true, href: 'Tests/test-bpd.html' },
    { id: 'adhd', title: 'Тест на признаки СДВГ у взрослых', tag: 'СДВГ', tagClass: 'adhd', desc: 'Вопросы о концентрации внимания, импульсивности и организованности в повседневных задачах.', time: '~4 мин', qcount: 11, available: true, href: 'Tests/test-adhd.html' },
    { id: 'ptsd', title: 'Скрининг посттравматической реакции', tag: 'ПТСР', tagClass: 'ptsd', desc: 'Помогает понять, есть ли у вас признаки посттравматической реакции после тяжёлого события.', time: '~4 мин', qcount: 9, available: true, href: 'Tests/test-ptsd.html' },
    { id: 'esteem', title: 'Тест на уровень самооценки', tag: 'Самооценка', tagClass: 'esteem', desc: 'Короткий опросник об отношении к себе и уверенности в собственных силах.', time: '~2 мин', qcount: 10, available: true, href: 'Tests/test-selfesteem.html' },
    { id: 'psychosis', title: 'Скрининг психотических переживаний', tag: 'Психоз', tagClass: 'psychosis', desc: '9 вопросов о необычных переживаниях — голосах, странных убеждениях, спутанности мыслей, — которые стоит обсудить со специалистом.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-psychosis.html' },
    { id: 'szd', title: 'Скрининг шизоидных черт личности', tag: 'Шизоидное', tagClass: 'szd', desc: '11 утверждений о предпочтении уединения, эмоциональной отстранённости и безразличии к мнению окружающих.', time: '~4 мин', qcount: 11, available: true, href: 'Tests/test-szd.html' },
    { id: 'rpp', title: 'Тест на признаки РПП', tag: 'РПП', tagClass: 'rpp', desc: '12 вопросов о мыслях и поведении, связанных с едой, весом и телом, которые могли встречаться в вашей жизни.', time: '~5 мин', qcount: 12, available: true, href: 'Tests/test-rpp.html' },
    { id: 'sch', title: 'Скрининг признаков шизофрении', tag: 'Шизофрения', tagClass: 'sch', desc: '10 вопросов о необычных переживаниях, изменениях в мышлении и эмоциях, снижении инициативы.', time: '~4 мин', qcount: 10, available: true, href: 'Tests/test-sch.html' },
    { id: 'devdelay', title: 'Скрининг трудностей развития и адаптации', tag: 'Задержка развития', tagClass: 'devdelay', desc: '10 вопросов о трудностях обучения и повседневной адаптации, которые прослеживаются с детства.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-devdelay.html' },
    { id: 'dyscalc', title: 'Тест на признаки дискалькулии', tag: 'Дискалькулия', tagClass: 'dyscalc', desc: '11 вопросов о трудностях со счётом, числами и математическими операциями при в целом нормальном уровне интеллекта.', time: '~4 мин', qcount: 11, available: true, href: 'Tests/test-dyscalc.html' },
    { id: 'klepto', title: 'Скрининг признаков клептомании', tag: 'Клептомания', tagClass: 'klepto', desc: '9 вопросов о цикле «напряжение — кража — облегчение», характерном для расстройства контроля импульсов.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-klepto.html' },
    { id: 'sza', title: 'Скрининг шизоаффективных переживаний', tag: 'Шизоаффективное', tagClass: 'sza', desc: '10 вопросов о сочетании необычных переживаний с выраженными эпизодами подавленного или приподнятого настроения.', time: '~4 мин', qcount: 10, available: true, href: 'Tests/test-sza.html' },
    { id: 'szf', title: 'Скрининг дезорганизации речи и мышления', tag: 'Шизофазия', tagClass: 'szf', desc: '9 вопросов о том, замечали ли вы или окружающие спутанность, «соскальзывание» мыслей и трудную для понимания речь.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-szf.html' },
    { id: 'dyslex', title: 'Тест на признаки дислексии', tag: 'Дислексия', tagClass: 'dyslex', desc: '11 вопросов о трудностях с чтением, письмом и фонологической обработкой при в целом сохранном интеллекте.', time: '~4 мин', qcount: 11, available: true, href: 'Tests/test-dyslex.html' },
    { id: 'szt', title: 'Скрининг шизотипических черт личности', tag: 'Шизотипическое', tagClass: 'szt', desc: '11 утверждений об эксцентричном мышлении, необычных убеждениях и сильной тревоге в близких отношениях.', time: '~4 мин', qcount: 11, available: true, href: 'Tests/test-szt.html' },
    { id: 'dri', title: 'Скрининг диссоциативных симптомов (ДРИ)', tag: 'ДРИ', tagClass: 'dri', desc: '10 вопросов о провалах в памяти, ощущении «частей» личности и других диссоциативных переживаниях.', time: '~4 мин', qcount: 10, available: true, href: 'Tests/test-dri.html' },
    { id: 'narc', title: 'Скрининг нарциссических черт личности', tag: 'НРЛ', tagClass: 'narc', desc: '12 утверждений о преувеличенном чувстве собственной значимости, потребности в восхищении и трудностях с эмпатией.', time: '~5 мин', qcount: 12, available: true, href: 'Tests/test-narc.html' },
    { id: 'hoarding', title: 'Скрининг признаков накопительства (синдрома Плюшкина)', tag: 'Синдром Плюшкина', tagClass: 'hoarding', desc: '10 вопросов о том, как вам даётся расставание с вещами и что происходит с пространством вокруг вас.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-hoarding.html' },
    { id: 'socphob', title: 'Скрининг признаков социальной тревоги', tag: 'Социальная фобия', tagClass: 'socphob', desc: '9 вопросов о страхе оценки и осуждения в общении, выступлениях и в компании незнакомых людей.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-socphob.html' },
    { id: 'agora', title: 'Скрининг признаков агорафобии', tag: 'Агорафобия', tagClass: 'agora', desc: '9 вопросов о тревоге в местах, откуда трудно быстро выйти или где сложно получить помощь.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-agora.html' },
    { id: 'sepanx', title: 'Скрининг тревоги разлуки', tag: 'Тревога разлуки', tagClass: 'sepanx', desc: '9 вопросов о том, как вы переживаете расставание с близкими людьми и разлуку с домом.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-sepanx.html' },
    { id: 'phobia', title: 'Скрининг признаков специфической фобии', tag: 'Специфические фобии', tagClass: 'phobia', desc: '9 вопросов о сильном страхе перед конкретным предметом, существом или ситуацией.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-phobia.html' },
    { id: 'testanx', title: 'Тест на экзаменационную тревожность', tag: 'Тревога перед экзаменом', tagClass: 'testanx', desc: '9 вопросов о волнении перед контрольными, экзаменами и другими проверками знаний.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-testanx.html' },
    { id: 'stagefright', title: 'Тест на страх публичных выступлений', tag: 'Страх выступлений', tagClass: 'stagefright', desc: '9 вопросов о волнении перед выступлением, ответом у доски и докладом перед людьми.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-stagefright.html' },
    { id: 'smalltalk', title: 'Тест на неловкость в разговоре (small talk)', tag: 'Small talk', tagClass: 'smalltalk', desc: '9 вопросов о неловкости в лёгких беседах с одноклассниками, коллегами и малознакомыми людьми.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-smalltalk.html' },
    { id: 'hypochondria', title: 'Скрининг тревоги о здоровье', tag: 'Ипохондрия', tagClass: 'hypochondria', desc: '9 вопросов о страхе серьёзной болезни и о том, как вы реагируете на ощущения в теле.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-hypochondria.html' },
    { id: 'intrusive', title: 'Скрининг навязчивых мыслей', tag: 'Навязчивые мысли', tagClass: 'intrusive', desc: '9 вопросов о нежелательных мыслях и образах, которые приходят сами и трудно уходят.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-intrusive.html' },
    { id: 'stress', title: 'Тест на уровень стресса', tag: 'Стресс', tagClass: 'stress', desc: '10 вопросов о том, как вы чувствовали себя в течение последнего месяца.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-stress.html' },
    { id: 'adjust', title: 'Скрининг трудностей адаптации', tag: 'Расстройство адаптации', tagClass: 'adjust', desc: '9 вопросов о том, как вы справляетесь после недавних перемен или трудных событий.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-adjust.html' },
    { id: 'ecoanx', title: 'Тест на экотревогу и тревогу о будущем', tag: 'Экотревога', tagClass: 'ecoanx', desc: '9 вопросов о том, как вы переживаете новости о климате, природе и будущем планеты.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-ecoanx.html' },
    { id: 'dysthymia', title: 'Скрининг затяжного сниженного настроения', tag: 'Дистимия', tagClass: 'dysthymia', desc: '10 вопросов о сниженном настроении, которое держится месяцами и годами, но без резких провалов.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-dysthymia.html' },
    { id: 'seasonal', title: 'Тест на сезонное ухудшение настроения', tag: 'Сезонная депрессия', tagClass: 'seasonal', desc: '9 вопросов о том, как меняются настроение, сон и энергия в тёмное время года.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-seasonal.html' },
    { id: 'anhedonia', title: 'Тест на потерю способности радоваться', tag: 'Ангедония', tagClass: 'anhedonia', desc: '10 вопросов о том, насколько вам доступны радость, интерес и удовольствие от привычных дел.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-anhedonia.html' },
    { id: 'alexithymia', title: 'Тест на трудности с распознаванием чувств', tag: 'Алекситимия', tagClass: 'alexithymia', desc: '10 утверждений о том, насколько легко вам понимать свои чувства и находить для них слова.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-alexithymia.html' },
    { id: 'emoreg', title: 'Тест на эмоциональную саморегуляцию', tag: 'Саморегуляция', tagClass: 'emoreg', desc: '9 вопросов о том, насколько вам легко справляться с сильными эмоциями и успокаиваться.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-emoreg.html' },
    { id: 'anger', title: 'Тест на вспышки гнева', tag: 'Гнев', tagClass: 'anger', desc: '9 вопросов о том, как часто вы злитесь, как быстро вспыхиваете и как справляетесь с гневом.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-anger.html' },
    { id: 'rumination', title: 'Тест на мысленную «жвачку»', tag: 'Руминация', tagClass: 'rumination', desc: '9 вопросов о мыслях, которые ходят по кругу вокруг неприятных событий и собственных ошибок.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-rumination.html' },
    { id: 'helpless', title: 'Тест на выученную беспомощность', tag: 'Выученная беспомощность', tagClass: 'helpless', desc: '10 утверждений о том, насколько вы верите, что ваши усилия могут что-то изменить.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-helpless.html' },
    { id: 'lonely', title: 'Тест на чувство одиночества', tag: 'Одиночество', tagClass: 'lonely', desc: '9 утверждений о том, чувствуете ли вы близость с людьми и поддержку рядом.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-lonely.html' },
    { id: 'selfcomp', title: 'Тест на доброту к себе (самосострадание)', tag: 'Самосострадание', tagClass: 'selfcomp', desc: '9 вопросов о том, как вы обращаетесь с собой в трудные минуты и после ошибок.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-selfcomp.html' },
    { id: 'innercritic', title: 'Тест на внутреннего критика', tag: 'Внутренний критик', tagClass: 'innercritic', desc: '9 вопросов о голосе внутри, который оценивает и критикует вас.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-innercritic.html' },
    { id: 'grief', title: 'Тест на переживание горя и потери', tag: 'Горе', tagClass: 'grief', desc: '9 вопросов о том, как вы переживаете потерю близкого человека, питомца или важного в жизни.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-grief.html' },
    { id: 'procrast', title: 'Тест на прокрастинацию', tag: 'Прокрастинация', tagClass: 'procrast', desc: '9 вопросов о том, как вы откладываете дела и справляетесь со сроками.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-procrast.html' },
    { id: 'perfect', title: 'Тест на перфекционизм', tag: 'Перфекционизм', tagClass: 'perfect', desc: '9 вопросов о стремлении к идеальному результату и о том, как вы относитесь к своим ошибкам.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-perfect.html' },
    { id: 'impostor', title: 'Тест на синдром самозванца', tag: 'Синдром самозванца', tagClass: 'impostor', desc: '9 утверждений о ощущении, что ваши успехи случайны и вы «не заслуживаете» их.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-impostor.html' },
    { id: 'failfear', title: 'Тест на страх неудачи', tag: 'Страх неудачи', tagClass: 'failfear', desc: '9 вопросов о том, как сильно вы боитесь ошибиться или не справиться.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-failfear.html' },
    { id: 'excellent', title: 'Тест на синдром отличника', tag: 'Синдром отличника', tagClass: 'excellent', desc: '9 вопросов о привычке жить в гонке за отличными результатами и одобрением.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-excellent.html' },
    { id: 'fomo', title: 'Тест на страх упустить важное (FOMO)', tag: 'FOMO', tagClass: 'fomo', desc: '9 утверждений о том, как сильно вам важно быть в курсе событий и не пропустить что-то интересное.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-fomo.html' },
    { id: 'digital', title: 'Тест на чрезмерное использование смартфона и соцсетей', tag: 'Соцсети и смартфон', tagClass: 'digital', desc: '9 вопросов о том, как много времени вы проводите в телефоне и как это влияет на вашу жизнь.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-digital.html' },
    { id: 'ludo', title: 'Скрининг игровой зависимости', tag: 'Игровая зависимость', tagClass: 'ludo', desc: '9 вопросов о том, как игры и внутриигровые траты влияют на вашу жизнь.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-ludo.html' },
    { id: 'bedtimeproc', title: 'Тест на откладывание сна («месть» отложенного сна)', tag: '«Месть» сну', tagClass: 'bedtimeproc', desc: '9 вопросов о привычке не ложиться вовремя, чтобы вечером побыть наедине с собой.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-bedtimeproc.html' },
    { id: 'hikikomori', title: 'Скрининг социальной самоизоляции (хикикомори)', tag: 'Хикикомори', tagClass: 'hikikomori', desc: '9 вопросов о том, как много вы бываете дома, в одиночестве и вне общения.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-hikikomori.html' },
    { id: 'boundaries', title: 'Тест на личные границы', tag: 'Личные границы', tagClass: 'boundaries', desc: '9 вопросов о том, как вам даются отказы, просьбы и защита своего времени и пространства.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-boundaries.html' },
    { id: 'codep', title: 'Тест на созависимость', tag: 'Созависимость', tagClass: 'codep', desc: '9 вопросов о том, насколько ваше состояние зависит от чужих чувств и проблем.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-codep.html' },
    { id: 'peer', title: 'Тест на давление сверстников', tag: 'Давление сверстников', tagClass: 'peer', desc: '9 вопросов о том, как мнение друзей и одноклассников влияет на ваши решения.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-peer.html' },
    { id: 'insomnia', title: 'Тест на признаки бессонницы', tag: 'Бессонница', tagClass: 'insomnia', desc: '9 вопросов о том, как вы засыпаете, спите и чувствуете себя днём.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-insomnia.html' },
    { id: 'lark', title: 'Жаворонок, сова или голубь?', tag: 'Жаворонок', tagClass: 'lark', desc: '10 утверждений о том, в какое время суток вам комфортнее всего просыпаться, учиться и работать.', time: '~3 мин', qcount: 10, available: true, href: 'Tests/test-lark.html' },
    { id: 'psychosom', title: 'Тест на психосоматические проявления', tag: 'Психосоматика', tagClass: 'psychosom', desc: '9 вопросов о телесных симптомах, которые могут быть связаны со стрессом и эмоциями.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-psychosom.html' },
    { id: 'trich', title: 'Скрининг признаков трихотилломании', tag: 'Трихотилломания', tagClass: 'trich', desc: '9 вопросов о привычке выдёргивать волосы и о том, как вы справляетесь с желанием это делать.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-trich.html' },
    { id: 'tourette', title: 'Скрининг тиков', tag: 'Синдром Туретта', tagClass: 'tourette', desc: '9 вопросов о непроизвольных движениях и звуках, которые трудно сдержать.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-tourette.html' },
    { id: 'misophonia', title: 'Тест на мисофонию', tag: 'Мисофония', tagClass: 'misophonia', desc: '9 вопросов о том, как вы реагируете на определённые звуки, например чавканье, щёлканье или шмыганье.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-misophonia.html' },
    { id: 'dyspraxia', title: 'Тест на признаки диспраксии', tag: 'Диспраксия', tagClass: 'dyspraxia', desc: '9 вопросов о том, как вам даются координация, ловкость и планирование движений.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-dyspraxia.html' },
    { id: 'dysgraphia', title: 'Тест на признаки дисграфии', tag: 'Дисграфия', tagClass: 'dysgraphia', desc: '9 вопросов о трудностях с письмом: почерк, орфография и перенос мыслей на бумагу.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-dysgraphia.html' },
    { id: 'depers', title: 'Скрининг деперсонализации и дереализации', tag: 'Деперсонализация', tagClass: 'depers', desc: '9 вопросов о ощущении, что вы или мир вокруг стали «нереальными», далёкими или как во сне.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-depers.html' },
    { id: 'bdd', title: 'Скрининг признаков дисморфофобии', tag: 'Дисморфофобия', tagClass: 'bdd', desc: '9 вопросов о мыслях о собственной внешности и о том, как они влияют на вашу жизнь.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-bdd.html' },
    { id: 'avoidant', title: 'Скрининг избегающих черт личности', tag: 'Избегающее РЛ', tagClass: 'avoidant', desc: '9 утверждений о страхе осуждения, чувстве неполноценности и избегании близкого общения.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-avoidant.html' },
    { id: 'paranoid', title: 'Скрининг подозрительности и недоверия', tag: 'Параноидное РЛ', tagClass: 'paranoid', desc: '9 утверждений о недоверии к людям, ожидании подвоха и трудности с прощением.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-paranoid.html' },
    { id: 'odd', title: 'Скрининг оппозиционно-вызывающего поведения', tag: 'ОВР', tagClass: 'odd', desc: '9 вопросов о спорах, раздражительности и сопротивлении правилам взрослых.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-odd.html' },
    { id: 'schoolref', title: 'Скрининг школьного отказа', tag: 'Школьный отказ', tagClass: 'schoolref', desc: '9 вопросов о том, как вам даётся ходить в школу и что вы чувствуете перед уроками.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-schoolref.html' },
    { id: 'bullying', title: 'Скрининг ситуации травли (буллинга)', tag: 'Буллинг', tagClass: 'bullying', desc: '9 вопросов о том, не сталкиваетесь ли вы с систематическими унижениями и давлением в коллективе.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-bullying.html' },
    { id: 'cyberbully', title: 'Скрининг кибербуллинга (травли в интернете)', tag: 'Кибербуллинг', tagClass: 'cyberbully', desc: '9 вопросов о том, не сталкиваетесь ли вы с унижениями, угрозами и травлей в интернете и мессенджерах.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-cyberbully.html' },
    { id: 'abuse', title: 'Скрининг признаков психологического насилия', tag: 'Психологическое насилие', tagClass: 'abuse', desc: '9 вопросов о том, как с вами обращаются близкие или значимые люди, и как вы себя рядом с ними чувствуете.', time: '~3 мин', qcount: 9, available: true, href: 'Tests/test-abuse.html' }
];

/* ══════════════════════════════════════════════════════════════
   РЕНДЕР КАРТОЧЕК
══════════════════════════════════════════════════════════════ */
const grid = document.getElementById('testsGrid');
const emptyState = document.getElementById('emptyState');
const resultsCount = document.getElementById('resultsCount');
const pagination = document.getElementById('pagination');

const PAGE_SIZE = 20;
let currentQuery = '';
let currentPage = 1;

function cardMarkup(t) {
    const inner = `
    <div class="test-card-icon icon-${t.tagClass}">${ICONS[t.tagClass] || ''}</div>
    <span class="test-card-tag tag-${t.tagClass}">${t.tag}</span>
    <h3 aria-level="2">${t.title}</h3>
    <p>${t.desc}</p>
    <div class="test-card-meta">
      <span>${t.time} · ${t.qcount} вопросов</span>
      ${t.available ? '<span class="test-card-cta">Пройти <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>' : ''}
    </div>
    ${!t.available ? '<span class="soon-badge">Скоро</span>' : ''}
  `;
    const el = document.createElement(t.available ? 'a' : 'div');
    if (t.available) el.href = t.href;
    el.className = 'test-card' + (t.available ? '' : ' is-soon');
    el.dataset.id = t.id;
    el.innerHTML = inner;
    return el;
}

function updateResultsCount(visibleCount) {
    resultsCount.textContent = visibleCount === TESTS.length
        ? `Всего тестов: ${TESTS.length}`
        : `Найдено: ${visibleCount} из ${TESTS.length}`;
}

function getPageList(current, total) {
    const delta = 1;
    const range = [];
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) range.push(i);
    const pages = [1];
    if (range[0] > 2) pages.push('...');
    pages.push(...range);
    if (range[range.length - 1] < total - 1) pages.push('...');
    if (total > 1) pages.push(total);
    return pages;
}

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        pagination.classList.remove('show');
        pagination.innerHTML = '';
        return;
    }
    pagination.classList.add('show');

    const pages = getPageList(currentPage, totalPages);
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    pagination.innerHTML = `
    <button class="page-btn" data-page="${currentPage - 1}" ${prevDisabled} aria-label="Предыдущая страница">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    ${pages.map(p => p === '...'
        ? '<span class="page-ellipsis">…</span>'
        : `<button class="page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`
    ).join('')}
    <button class="page-btn" data-page="${currentPage + 1}" ${nextDisabled} aria-label="Следующая страница">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
  `;

    pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page, 10);
            if (!p || p === currentPage) return;
            currentPage = p;
            renderPage();
            document.querySelector('.tests-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function getFilteredTests(q) {
    return q ? TESTS.filter(t => matchesQuery(t, q)) : TESTS;
}

function renderPage() {
    const filtered = getFilteredTests(currentQuery);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    grid.innerHTML = '';
    pageItems.forEach(t => grid.appendChild(cardMarkup(t)));

    emptyState.classList.toggle('show', filtered.length === 0);
    updateResultsCount(filtered.length);
    renderPagination(totalPages);
}

renderPage();
// Первая отрисовка карточек готова — резерв высоты под подвал (см. .tests-main.is-loading) больше не нужен.
const testsMainEl = document.querySelector('.tests-main');
if (testsMainEl) testsMainEl.classList.remove('is-loading');

/* ══════════════════════════════════════════════════════════════
   ПОИСК С АВТОПОДСКАЗКАМИ
══════════════════════════════════════════════════════════════ */
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const suggestPanel = document.getElementById('suggestPanel');
let activeSuggestIndex = -1;
let currentSuggestions = [];

function normalize(s) { return s.toLowerCase().replace(/ё/g, 'е'); }

function matchesQuery(t, q) {
    return normalize(t.title).includes(q) || normalize(t.tag).includes(q) || normalize(t.desc).includes(q);
}

function highlight(text, q) {
    const idx = normalize(text).indexOf(q);
    if (idx === -1) return text;
    return text.slice(0, idx) + '<b>' + text.slice(idx, idx + q.length) + '</b>' + text.slice(idx + q.length);
}

function closeSuggestions() {
    suggestPanel.classList.remove('open');
    suggestPanel.innerHTML = '';
    activeSuggestIndex = -1;
    currentSuggestions = [];
}

function renderSuggestions(q) {
    const matches = TESTS.filter(t => matchesQuery(t, q)).slice(0, 6);
    currentSuggestions = matches;
    activeSuggestIndex = -1;

    if (matches.length === 0) {
        suggestPanel.innerHTML = '<div class="suggest-empty">Совпадений не найдено</div>';
        suggestPanel.classList.add('open');
        return;
    }

    suggestPanel.innerHTML = matches.map((t, i) => `
    <div class="suggest-item" data-index="${i}">
      <span>${highlight(t.title, q)}</span>
      <span class="suggest-tag">${t.tag}</span>
    </div>
  `).join('');
    suggestPanel.classList.add('open');

    suggestPanel.querySelectorAll('.suggest-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectSuggestion(parseInt(item.dataset.index, 10));
        });
    });
}

function selectSuggestion(i) {
    const t = currentSuggestions[i];
    if (!t) return;
    searchInput.value = t.title;
    searchBox.classList.add('has-value');
    currentQuery = normalize(t.title);
    currentPage = 1;
    renderPage();
    closeSuggestions();

    const card = grid.querySelector(`[data-id="${t.id}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-pulsing');
        setTimeout(() => card.classList.remove('is-pulsing'), 1200);
    }
}

searchInput.addEventListener('input', () => {
    const raw = searchInput.value.trim();
    const q = normalize(raw);
    searchBox.classList.toggle('has-value', raw.length > 0);
    currentQuery = q;
    currentPage = 1;
    renderPage();
    if (raw.length >= 3) renderSuggestions(q); else closeSuggestions();
});

searchInput.addEventListener('keydown', (e) => {
    if (!suggestPanel.classList.contains('open')) return;
    const items = suggestPanel.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestIndex = Math.min(activeSuggestIndex + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('is-active', i === activeSuggestIndex));
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestIndex = Math.max(activeSuggestIndex - 1, 0);
        items.forEach((it, i) => it.classList.toggle('is-active', i === activeSuggestIndex));
    } else if (e.key === 'Enter') {
        if (activeSuggestIndex >= 0) { e.preventDefault(); selectSuggestion(activeSuggestIndex); }
    } else if (e.key === 'Escape') {
        closeSuggestions();
    }
});

searchInput.addEventListener('focus', () => {
    const raw = searchInput.value.trim();
    if (raw.length >= 3) renderSuggestions(normalize(raw));
});

document.addEventListener('click', (e) => {
    if (!searchBox.contains(e.target) && !suggestPanel.contains(e.target)) closeSuggestions();
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchBox.classList.remove('has-value');
    currentQuery = '';
    currentPage = 1;
    renderPage();
    closeSuggestions();
    searchInput.focus();
});
/* ══════════════════════════════════════════════════════════════
   WECHAT — ОКНО С ID И КОПИРОВАНИЕМ В БУФЕР ОБМЕНА
══════════════════════════════════════════════════════════════ */
(function () {
    const trigger = document.getElementById('wechatTrigger');
    const overlay = document.getElementById('wechatOverlay');
    if (!trigger || !overlay) return;

    const idText = document.getElementById('wechatIdText');
    const idBox = document.getElementById('wechatIdBox');
    const copyBtn = document.getElementById('wechatCopyBtn');
    const closeBtn = document.getElementById('wechatCloseBtn');
    const copiedHint = document.getElementById('wechatCopiedHint');

    const wechatId = trigger.dataset.wechatId || '';
    idText.textContent = wechatId;

    function openModal() {
        if (typeof closeMobileMenu === 'function') closeMobileMenu();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeModal() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    trigger.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });

    const copyIconMarkup = copyBtn.innerHTML;
    const checkIconMarkup = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    let hintTimeout;

    async function copyWechatId() {
        if (!wechatId) return;
        try {
            await navigator.clipboard.writeText(wechatId);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = wechatId;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try { document.execCommand('copy'); } catch { }
            document.body.removeChild(ta);
        }
        showCopiedFeedback();
    }

    function showCopiedFeedback() {
        copiedHint.classList.add('show');
        copyBtn.innerHTML = checkIconMarkup;
        copyBtn.classList.add('is-copied');
        if (navigator.vibrate) navigator.vibrate(25);
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(() => {
            copiedHint.classList.remove('show');
            copyBtn.innerHTML = copyIconMarkup;
            copyBtn.classList.remove('is-copied');
        }, 1600);
    }

    copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyWechatId(); });

    // Длительное нажатие на сам ID — для мобильных устройств
    let longPressTimer = null;
    let longPressFired = false;

    idBox.addEventListener('touchstart', () => {
        longPressFired = false;
        longPressTimer = setTimeout(() => {
            longPressFired = true;
            copyWechatId();
        }, 500);
    }, { passive: true });

    ['touchend', 'touchmove', 'touchcancel'].forEach(evt => {
        idBox.addEventListener(evt, () => clearTimeout(longPressTimer));
    });

    // Клик по всей области ID (не только по кнопке) — тоже копирует, для удобства на десктопе
    idBox.addEventListener('click', (e) => {
        if (e.target.closest('.wechat-copy-btn') || longPressFired) return;
        copyWechatId();
    });
})();
/* ══════════════════════════════════════════════════════════════
   ИНСТРУКЦИЯ WECHAT — ГАЛЕРЕЯ ШАГОВ «КАК НАЙТИ МЕНЯ»
══════════════════════════════════════════════════════════════ */
(function () {
    const guideBtn = document.getElementById('wechatGuideBtn');
    const overlay = document.getElementById('wechatGuideOverlay');
    if (!guideBtn || !overlay) return;

    const wechatOverlay = document.getElementById('wechatOverlay');
    const viewport = document.getElementById('wechatGuideViewport');
    const image = document.getElementById('wechatGuideImage');
    const dotsWrap = document.getElementById('wechatGuideDots');
    const countLabel = document.getElementById('wechatGuideCount');
    const stepText = document.getElementById('wechatGuideText');
    const prevArrow = document.getElementById('wechatGuidePrev');
    const nextArrow = document.getElementById('wechatGuideNext');
    const backBtn = document.getElementById('wechatGuideBackBtn');
    const nextBtn = document.getElementById('wechatGuideNextBtn');
    const closeBtn = document.getElementById('wechatGuideCloseBtn');

    const steps = [
        { img: 'img/1.jpg', text: 'Откройте WeChat. На вкладке со списком чатов нажмите на значок «+» в правом верхнем углу экрана.' },
        { img: 'img/2.jpg', text: 'Появится выпадающее меню с несколькими действиями.' },
        { img: 'img/3.jpg', text: 'В меню выберите пункт «Доб. контакты» (добавить контакты).' },
        { img: 'img/4.jpg', text: 'На экране «Доб. контакты» нажмите на строку поиска «Поиск уч. записи/телефона» вверху экрана.' },
        { img: 'img/5.jpg', text: 'Откроется клавиатура — поле поиска готово для ввода.' },
        { img: 'img/6.jpg', text: 'Вставьте скопированный ID (или введите его вручную) и нажмите на появившийся результат поиска.' },
        { img: 'img/7.jpg', text: 'Откроется профиль — нажмите «Добавить в контакты», чтобы отправить заявку в друзья.' }
    ];

    let current = 0;

    steps.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'guide-dot';
        dot.setAttribute('aria-label', 'Шаг ' + (i + 1));
        dot.addEventListener('click', () => render(i));
        dotsWrap.appendChild(dot);
    });

    function render(index) {
        current = Math.max(0, Math.min(steps.length - 1, index));
        const step = steps[current];
        image.src = step.img;
        image.alt = 'Шаг ' + (current + 1) + ' из ' + steps.length + ': инструкция WeChat';
        countLabel.textContent = 'Шаг ' + (current + 1) + ' из ' + steps.length;
        stepText.textContent = step.text;

        [...dotsWrap.children].forEach((dot, i) => dot.classList.toggle('active', i === current));

        prevArrow.disabled = current === 0;
        backBtn.disabled = current === 0;
        backBtn.style.opacity = current === 0 ? '.5' : '';
        backBtn.style.pointerEvents = current === 0 ? 'none' : '';

        const isLast = current === steps.length - 1;
        nextArrow.disabled = isLast;
        nextBtn.textContent = isLast ? 'Готово' : 'Далее';
    }

    function openGuide() {
        if (wechatOverlay && wechatOverlay.classList.contains('open')) {
            wechatOverlay.classList.remove('open');
        }
        render(0);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeGuide() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function goPrev() { if (current > 0) render(current - 1); }
    function goNext() {
        if (current < steps.length - 1) render(current + 1);
        else closeGuide();
    }

    guideBtn.addEventListener('click', (e) => { e.preventDefault(); openGuide(); });
    closeBtn.addEventListener('click', closeGuide);
    backBtn.addEventListener('click', goPrev);
    nextBtn.addEventListener('click', goNext);
    prevArrow.addEventListener('click', goPrev);
    nextArrow.addEventListener('click', goNext);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGuide(); });
    document.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') closeGuide();
        else if (e.key === 'ArrowLeft') goPrev();
        else if (e.key === 'ArrowRight') goNext();
    });

    // Свайп по изображению — для мобильных устройств
    let touchStartX = 0;
    let touchDeltaX = 0;

    viewport.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchDeltaX = 0;
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        touchDeltaX = e.touches[0].clientX - touchStartX;
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
        if (Math.abs(touchDeltaX) > 40) {
            if (touchDeltaX < 0) goNext(); else goPrev();
        }
        touchDeltaX = 0;
    });
})();