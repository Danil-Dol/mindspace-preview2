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
   ДАННЫЕ О СТАТЬЯХ
══════════════════════════════════════════════════════════════ */
const ICONS = {
    mood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-6 6 6 9 0s6-6 9 0"></path></svg>',
    adhd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"></circle><circle cx="5" cy="6" r="1.4"></circle><circle cx="19" cy="6" r="1.4"></circle><circle cx="5" cy="18" r="1.4"></circle><circle cx="19" cy="18" r="1.4"></circle></svg>',
    depression: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10a6 6 0 0 1 12 0v1a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8z"></path><line x1="8" y1="21" x2="8" y2="19"></line><line x1="12" y1="21" x2="12" y2="18.5"></line><line x1="16" y1="21" x2="16" y2="19"></line></svg>',
    anxiety: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0"></path><path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0"></path></svg>',
    ocd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3.5 7.1"></path><polyline points="3 17 3 21 7 21"></polyline></svg>',
    asd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M 20.6 12.0 L 20.43 13.73 L 19.95 15.19 L 19.15 16.17 L 18.08 16.52 L 16.78 16.17 L 15.29 15.19 L 13.68 13.73 L 12.0 12.0 L 10.32 10.27 L 8.71 8.81 L 7.22 7.83 L 5.92 7.49 L 4.85 7.83 L 4.05 8.81 L 3.57 10.27 L 3.4 12.0 L 3.57 13.73 L 4.05 15.19 L 4.85 16.17 L 5.92 16.52 L 7.22 16.17 L 8.71 15.19 L 10.32 13.73 L 12.0 12.0 L 13.68 10.27 L 15.29 8.81 L 16.78 7.83 L 18.08 7.49 L 19.15 7.83 L 19.95 8.81 L 20.43 10.27 L 20.6 12.0 Z"></path></svg>',
    did: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="10" r="5"></circle><circle cx="15" cy="14" r="5" opacity=".55"></circle></svg>',
    panic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-7 4 14 2-7h8"></path></svg>',
    ptsd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"></path><path d="M9.5 12l1.8 1.8L15 10"></path></svg>',
    eating: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v7a3 3 0 0 0 6 0V2M9 9v13"></path><path d="M17 2c-1.5 2-2 4-2 6a2 2 0 0 0 4 0c0-2-.5-4-2-6zM17 12v9"></path></svg>',
    bpd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 9.2 2.6z"></path><path d="M12 5v4l-2 2"></path></svg>',
    narc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6"></path><path d="M12 2v1M4.5 6l.8.6M19.5 6l-.8.6"></path></svg>',
    sch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M6 9l4 1.5-2 3 5 .5-1.5 4 5-3-1-4 4-2-4.5-1.5z"></path></svg>',
    id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20V10M9 20V6M15 20V13M21 20V4"></path></svg>',
    klepto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path><path d="M15 3l5 4-4 2"></path></svg>',
    dyscalc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h5l-4 8 5 8H6"></path><path d="M14 8h5M14 12h5M16 16h3"></path></svg>',
    dyslex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5l6 8V5l6 8V5l4 14"></path></svg>',
    psychosis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2.5-4 5.7-6 10-6s7.5 2 10 6c-2.5 4-5.7 6-10 6s-7.5-2-10-6z"></path><path d="M9.5 9.5l1.2 1.2M12 8v1.6M14.5 9.5l-1.2 1.2M8 12.5l1.6-.3M16 12.5l-1.6-.3M9.5 15.5l1.2-1.2M14.5 15.5l-1.2-1.2"></path></svg>',
    szf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10H9l-4 4v-4H4z"></path><path d="M7.5 8.5h2M12 8.5h3M9 11.5h6"></path></svg>',
    sza: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0"></path><circle cx="12" cy="8" r="4.5"></circle></svg>',
    szt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"></circle></svg>',
    szd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="7" r="2" opacity=".4"></circle><circle cx="19" cy="16" r="2" opacity=".4"></circle></svg>',
    munch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"></path><path d="M7 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"></path><path d="M12 11v6M9 14h6"></path></svg>',
    misogyny: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"></circle><path d="M12 14v7M9 18h6"></path><path d="M4 4l16 16"></path></svg>',
    misandry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3.5"></circle><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"></path><path d="M4 4l16 16"></path></svg>',
    ableism: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="1.8"></circle><path d="M5 8h14M12 8v6M8.5 21l3.5-7 3.5 7"></path></svg>',
    xeno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"></path></svg>',
    racism: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14"></path><path d="M5 7l-3 7a3 3 0 0 0 6 0z"></path><path d="M19 7l-3 7a3 3 0 0 0 6 0z"></path></svg>',
    ageism: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12"></path><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"></path></svg>',
    gaslight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5.8 2.5 2 2.5C11 9 11 6 12 3z"></path></svg>',
    codep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></svg>',
    perfect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle></svg>',
    socphob: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"></path><path d="M3 12h2M19 12h2M4.5 6.5l1.5 1M19.5 6.5l-1.5 1"></path></svg>',
    phobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"></path><path d="M12 10v4"></path><circle cx="12" cy="17" r=".6"></circle></svg>',
    insomnia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M15 4h4l-4 4h4"></path></svg>',
    burnout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21h6"></path><path d="M12 3v3"></path><path d="M8 8h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"></path><path d="M12 10c1 1.5 1 2.5 0 4"></path></svg>',
    impostor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9c0-3 3.5-5 8-5s8 2 8 5v3a8 8 0 0 1-16 0z"></path><path d="M8 11h2M14 11h2"></path><path d="M9 16c1.5 1 4.5 1 6 0"></path></svg>',
    bullying: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.5"></circle><circle cx="17" cy="7" r="2.5"></circle><circle cx="12" cy="16" r="2.5"></circle><path d="M12 13.5v-2M8.5 9.5l2.5 2M15.5 9.5l-2.5 2"></path></svg>',
    ludo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1"></circle><circle cx="15" cy="9" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="9" cy="15" r="1"></circle><circle cx="15" cy="15" r="1"></circle></svg>',
    procrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 8v5l3 2"></path><path d="M9 2h6"></path></svg>',
    apathy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 10h.01M16 10h.01"></path><path d="M8.5 15.5h7"></path></svg>',
    psychosom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path><path d="M9 12h2l1-2 1.5 4 1-2h1.5"></path></svg>',
    anhedonia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path><path d="M3 21L21 3"></path></svg>',
    alexithymia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"></path><path d="M9 10h.01M12 10h.01M15 10h.01"></path></svg>',
    depers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="4"></circle><circle cx="15" cy="15" r="4" stroke-dasharray="2 2"></circle></svg>',
    hypochondria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L20 20"></path><path d="M10 7v6M7 10h6"></path></svg>',
    bdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="11" rx="6" ry="8"></ellipse><path d="M9 9.5h.01M15 9.5h.01"></path><path d="M9 14c1 1 5 1 6 0"></path><path d="M5 21l14-3"></path></svg>',
    tourette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h3l2-6 3 12 2-8 2 4h4"></path></svg>',
    grief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path><path d="M12 9v5"></path></svg>',
    mutism: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"></path><path d="M8 10.5h8"></path></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="16" r="3"></circle><path d="M10.5 10.5l3 3"></path></svg>',
    abuse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path><path d="M9 9l6 6M15 9l-6 6"></path></svg>',
    avoidant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 12h6"></path><path d="M13 9l3 3-3 3"></path></svg>',
    agora: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"></path><path d="M5 20V10l7-6 7 6v10"></path><path d="M10 20v-5h4v5"></path></svg>',
    sepanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"></circle><circle cx="17" cy="17" r="3"></circle><path d="M9 9.5c2 1 4 2 6 5" stroke-dasharray="2 2"></path></svg>',
    adjust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-8 6-8 9-3s6 3 9-7"></path><path d="M3 21h18"></path></svg>',
    paranoid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="5"></ellipse><circle cx="12" cy="12" r="2.2"></circle><path d="M3 5l4 2M21 5l-4 2"></path></svg>',
    parasomnia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M15 9h.01M17 12h.01"></path></svg>',
    digital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M11 18h2"></path><path d="M10 8h4M10 11h4"></path></svg>',
    lonely: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M6 21v-2a6 6 0 0 1 12 0v2"></path><path d="M2 12h2M20 12h2"></path></svg>',
    trich: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c0-8 3-14 7-16"></path><path d="M9 20c0-6 2-10 5-12"></path><path d="M13 20c0-4 1-7 3-9"></path></svg>',
    stress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"></path></svg>',
    dysthymia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 18a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 17.7 8.4 4.8 4.8 0 0 1 17.5 18z"></path><path d="M9 21.5h6"></path></svg>',
    seasonal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>',
    testanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h4"></path></svg>',
    schoolref: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h10v17"></path><path d="M3 21h18"></path><path d="M12 13h.01"></path><path d="M18 9l3 3-3 3"></path></svg>',
    odd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M12 8.5v3"></path><path d="M12 13.6h.01"></path></svg>',
    anger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3-.5-5 1-8z"></path></svg>',
    dyspraxia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5"></path><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"></path><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.4-1.8L8 15"></path></svg>',
    dysgraphia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19z"></path><path d="M14 7l3 3"></path></svg>',
    stutter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h2M8 8v8M12 5v14M16 9v6M20 12h1"></path></svg>',
    misophonia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9a4 4 0 1 1 8 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0"></path><path d="M11 9a1.2 1.2 0 0 1 2.4 0"></path></svg>',
    dsps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    fomo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10v7H8l-3 3v-3H4z"></path><path d="M16 10h4v7h-1v3l-3-3h-5v-2"></path></svg>',
    cyberbully: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M12 8v4"></path><path d="M12 15h.01"></path></svg>',
    shame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 9.5l2 1M16 9.5l-2 1"></path><path d="M9 16h6"></path></svg>',
    peer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2 20v-1a5 5 0 0 1 10 0v1"></path><path d="M14 20v-.5a4 4 0 0 1 8 0v.5"></path></svg>',
    cultshock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c3 3 3 15 0 18"></path><path d="M12 3c-3 3-3 15 0 18"></path></svg>',
    paris: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"></path><path d="M10 21l2-15 2 15"></path><path d="M8.5 21h7"></path><path d="M10.7 12h2.6"></path><path d="M9.6 16.5h4.8"></path></svg>',
    jerusalem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20V9h3V7h3v2h6V7h3v2h3v11z"></path><path d="M10 20v-4h4v4"></path></svg>',
    stendhal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="1"></rect><path d="M4 16l5-5 4 4 3-3 4 4"></path><circle cx="15.5" cy="9.5" r="1.2"></circle></svg>',
    spanshame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M7 10h10v3H7z"></path><path d="M10 17c1.2-.7 2.8-.7 4 0"></path></svg>',
    rumination: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-3-6.2"></path><path d="M20 4v4h-4"></path></svg>',
    helpless: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V8a6 6 0 0 1 12 0v13"></path><path d="M10 21V6"></path><path d="M14 21V6"></path><path d="M6 13h12"></path></svg>',
    toxicpos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2"></path><path d="M9 9.5h.01"></path><path d="M15 9.5h.01"></path><path d="M6 6l12 12"></path></svg>',
    hikikomori: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"></path><path d="M6 10v10h12V10"></path><rect x="10" y="14" width="4" height="6"></rect></svg>',
    nostalgia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path><path d="M12 7v5l3 2"></path></svg>',
    duckling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="4"></circle><path d="M13 9h3l-1.5 1.5"></path><path d="M6 13c0 4 3 7 7 7s6-2 6-5c0-2-2-3-4-3h-3"></path><path d="M8 8.5h.01"></path></svg>',
    mandela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h7v12H4z"></path><path d="M13 6h7v12h-7z"></path><path d="M7 10h1M16 10h1"></path></svg>',
    dejavu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="5"></circle><circle cx="15" cy="12" r="5"></circle></svg>',
    ecoanx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"></path><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z"></path><path d="M12 15c0-3-2-5-5-5 0 3 2 5 5 5z"></path></svg>',
    boredom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 10h2M14 10h2"></path><path d="M9 15h6"></path></svg>',
    excellent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7 4 8.8 9.5 8z"></path></svg>',
    emoreg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path><path d="M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path></svg>',
    dunning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20l6-9 4 5 4-8 6 12z"></path></svg>',
    bedtimeproc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M13 9v3l2 1.5"></path></svg>',
    timepress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12"></path><path d="M6 21h12"></path><path d="M7 3c0 5 5 5.5 5 9s-5 4-5 9"></path><path d="M17 3c0 5-5 5.5-5 9s5 4 5 9"></path></svg>',
    smalltalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"></path></svg>',
    eq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 16.5s-4-2.4-4-5.2a2.2 2.2 0 0 1 4-1.3 2.2 2.2 0 0 1 4 1.3c0 2.8-4 5.2-4 5.2z"></path></svg>',
    spotlight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"></circle><path d="M10.5 7L5 20h14l-5.5-13"></path></svg>',
    cogdist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0z"></path><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"></path></svg>',
    selfcomp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15s-5-3-5-6.5A2.8 2.8 0 0 1 12 6.5a2.8 2.8 0 0 1 5 2c0 3.5-5 6.5-5 6.5z"></path><path d="M3 15c2 3 5 5 9 5s7-2 9-5"></path></svg>',
    boundaries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"></rect><circle cx="12" cy="12" r="3"></circle></svg>',
    barnum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M12 8l1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.5-2.5 1.5.5-2.8-2-2 2.8-.4z"></path></svg>',
    failfear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4V8h6"></path><path d="M3 20h18"></path></svg>',
    choiceparal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8"></path><path d="M12 13c0-4-6-4-6-9"></path><path d="M12 13c0-4 6-4 6-9"></path><path d="M12 13V4"></path></svg>',
    freudslip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M8 10l2-2 2 2 2-2 2 2"></path></svg>',
    sleepwalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"></circle><path d="M12 7v7"></path><path d="M12 9l5 2"></path><path d="M12 9L7 7"></path><path d="M12 14l-3 6"></path><path d="M12 14l3 6"></path></svg>',
    intrusive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"></path><path d="M12 3v4"></path><path d="M12 17v4"></path></svg>',
    daydream: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 18a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 17.7 8.4 4.8 4.8 0 0 1 17.5 18z"></path><circle cx="8" cy="21" r=".8"></circle><circle cx="5" cy="23" r=".5"></circle></svg>',
    maincharacter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="14" height="10" rx="2"></rect><path d="M17 11l4-2v6l-4-2"></path></svg>',
    doorway: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h12v17"></path><path d="M3 21h18"></path><path d="M14 12h.01"></path></svg>',
    phantomvib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M3 9v6M21 9v6"></path><path d="M1 11v2M23 11v2"></path></svg>',
    satiation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M4 12h12" opacity=".7"></path><path d="M4 17h8" opacity=".4"></path></svg>',
    innerspeech: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11h-9l-4 4v-4H4z"></path><path d="M8 9h8M8 12h5"></path></svg>',
    tiptongue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8c2-3 6-4 8-4s6 1 8 4c-2 4-5 8-8 8s-6-4-8-8z"></path><path d="M12 11v5"></path></svg>',
    frequencyill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>',
    hypnicjerk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M9 20l2-3-2-2 2-3"></path></svg>',
    hoarding: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><rect x="4" y="12" width="7" height="9"></rect><rect x="11" y="8" width="9" height="13"></rect><path d="M6 12V9h4v3"></path></svg>',
    dissonance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h5l3-6 3 12 3-6h2"></path></svg>',
    bystander: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="2"></circle><circle cx="16" cy="7" r="2"></circle><path d="M4 20v-3a4 4 0 0 1 8 0v3"></path><path d="M12 20v-3a4 4 0 0 1 8 0v3"></path></svg>',
    zeigarnik: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="40 16"></circle><path d="M12 7v5l3 2"></path></svg>',
    introversion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="16" height="9" rx="2"></rect><path d="M21 11v3"></path><path d="M6 12h4"></path></svg>',
    innercritic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"></circle><path d="M6 20a6 6 0 0 1 12 0"></path><path d="M19 4l2 2M5 4L3 6"></path></svg>',
    envy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"></path></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8c3-3 5 3 9 0s6 3 9 0"></path><path d="M3 14c3-3 5 3 9 0s6 3 9 0"></path><path d="M3 20c3-3 5 3 9 0s6 3 9 0"></path></svg>',
    hedonic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18"></path><circle cx="9" cy="11" r="2"></circle><path d="M9 13l-2 4M9 13l3 2 3-1"></path><path d="M18 5l.7 1.6L20 7l-1.3.5L18 9l-.7-1.5L16 7l1.3-.4z"></path></svg>',
    sunkcost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path></svg>',
    placebo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-30 12 12.5)"></rect><path d="M9 8.5l6 7"></path></svg>',
    uncanny: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c4 0 5 12 9 12s5-12 9-12"></path></svg>',
    socialjetlag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"></circle><path d="M12 9v4l3 2"></path><path d="M5 4L3 6M19 4l2 2"></path></svg>',
    shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 13H5z"></path><path d="M9 7a3 3 0 0 1 6 0"></path></svg>',
    sleepinertia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-4 3 8 2-4h7"></path><path d="M4 20h16" opacity=".5"></path></svg>',
    anchoring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"></circle><path d="M12 7v13"></path><path d="M5 14c0 4 3 6 7 6s7-2 7-6"></path><path d="M9 10h6"></path></svg>',
    pygmalion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.500-7 10-7 10z"></path></svg>',
    rescuer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"></path><circle cx="12" cy="9" r="1"></circle><path d="M8.500 16l3.500-4 3.500 4"></path></svg>',
    ikea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V9l7-5 7 5v11z"></path><path d="M9 20v-6h6v6"></path></svg>',
    halo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="4.500" rx="5" ry="1.500"></ellipse><circle cx="12" cy="11" r="3.500"></circle><path d="M5 21a7 7 0 0 1 14 0"></path></svg>',
    forgetting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4v16h18"></path><path d="M5 6c3 8 7 10 14 11"></path></svg>',
    loafing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="8" r="2"></circle><circle cx="12" cy="8" r="2"></circle><circle cx="18" cy="8" r="2"></circle><path d="M4 20v-5a2 2 0 0 1 4 0v5M10 20v-5a2 2 0 0 1 4 0v5"></path><path d="M16 20v-9a2 2 0 0 1 4 0v9"></path></svg>',
    mereexposure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2"></circle><circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="12" r="2"></circle></svg>',
    identity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5z"></path><path d="M12 8v4"></path><path d="M12 15v.01"></path></svg>',
    infantamnesia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
    paranoia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"></path><path d="M12 3v2"></path></svg>',
    pica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>',
    dementia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0z"></path><path d="M15 6l2 2-2 2M17 14l2 2"></path></svg>',
    alzheimer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 11c0 5.500-7 10-7 10z"></path><path d="M9 11h6" opacity=".6"></path></svg>',
    cotard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0" stroke-dasharray="3 2"></path></svg>',
    prosopagnosia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M9 10h.01M15 10h.01" stroke-width="3"></path><path d="M9 15h6" opacity=".4"></path></svg>',
    alicewonder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="14" width="6" height="6"></rect><rect x="12" y="6" width="9" height="14"></rect><path d="M5 11l2-3 2 3"></path></svg>',
    lycanthropy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20l2-12 5 3 5-3 2 12z"></path><path d="M9 14h.01M15 14h.01"></path><path d="M7 8L5 4M17 8l2-4"></path></svg>',
    alienhand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-9a1.500 1.500 0 0 1 3 0V6a1.500 1.500 0 0 1 3 0v5a1.500 1.500 0 0 1 3 0v1.500a1.500 1.500 0 0 1 3 0V16a4 4 0 0 1-4 4z"></path></svg>',
    doubles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"></circle><circle cx="15" cy="9" r="3" stroke-dasharray="2 2"></circle><path d="M4 20a5 5 0 0 1 10 0"></path><path d="M10 20a5 5 0 0 1 10 0" stroke-dasharray="2 2"></path></svg>',
    presence: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"></circle><path d="M4 20a5 5 0 0 1 10 0"></path><circle cx="18" cy="9" r="2" stroke-dasharray="2 2"></circle><path d="M15 20a4 4 0 0 1 6 0" stroke-dasharray="2 2"></path></svg>',
    confusional: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"></path><path d="M12 8c1-2 3-1 3 1s-2 2-2 4"></path></svg>',
    kleinelevin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"></path><path d="M9 4v16M15 4v16" opacity=".35"></path></svg>',
    ffi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="M12 8c-5 0-6-3-6-5M12 12c5 0 6-3 6-5M12 16c-5 0-6-3-6-5"></path></svg>',
    ekbom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12c0-4 3-7 7-7s7 3 7 7-3 7-7 7-7-3-7-7z"></path><path d="M9 10l2 2 4-4M10 15l2 1 3-3" opacity=".7"></path></svg>',
    urbach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-4 0-7 3-7 7 0 3 2 5 3 6v5h8v-5c1-1 3-3 3-6 0-4-3-7-7-7z"></path><circle cx="10" cy="10" r="1.500"></circle></svg>',
    akinetopsia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="4" height="10" rx="1"></rect><rect x="10" y="7" width="4" height="10" rx="1" opacity=".6"></rect><rect x="17" y="7" width="4" height="10" rx="1" opacity=".3"></rect></svg>',
    savant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0-4 10.500V17h8v-3.500A6 6 0 0 0 12 3z"></path><path d="M9 20h6M10 22h4"></path></svg>',
    survivor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1.6 2 2.2 3.2 0 5.2-2.2-2-1.6-3.2 0-5.2z"></path><rect x="9" y="10" width="6" height="10" rx="1"></rect><path d="M7 20h10"></path></svg>',
    sportplacebo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"></circle><path d="M12 13V9"></path><path d="M10 3h4"></path><path d="M18.5 6l1.5-1.5"></path></svg>',
    lakewobegon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20v-8"></path><path d="M10 20V7"></path><path d="M15 20v-6"></path><path d="M20 20v-9"></path><path d="M3 20h18"></path></svg>',
    stagefright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M6 11a6 6 0 0 0 12 0"></path><path d="M12 17v4"></path><path d="M9 21h6"></path></svg>',
    detox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M12 8v3"></path><path d="M9.6 9.6a3.4 3.4 0 1 0 4.8 0"></path></svg>',
    watchman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    streisand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l7 4V6L7 10H4z"></path><path d="M17 9a4 4 0 0 1 0 6"></path><path d="M19.5 6.5a8 8 0 0 1 0 11"></path></svg>',
    laststraw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"></path><path d="M10 14a2 2 0 0 0 2 2"></path></svg>',
    fas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-4 4v-4H4z"></path><path d="M8 10.5c1-1.5 2-1.5 3 0s2 1.5 3 0 1.5-1 2-.5"></path></svg>',
    lark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"></path><path d="M7 18a5 5 0 0 1 10 0"></path><path d="M12 6v3"></path><path d="M5 11l1.8 1.8"></path><path d="M19 11l-1.8 1.8"></path></svg>',
    illusions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>',
    pareidolia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.8-7.9A6 6 0 0 1 17.6 9 4.5 4.5 0 0 1 17.5 18z"></path><path d="M9.5 12h.01"></path><path d="M14.5 12h.01"></path><path d="M10 15c1.2.8 2.8.8 4 0"></path></svg>',
    toxic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 16.5h-19z"></path><path d="M12 10v4"></path><path d="M12 17h.01"></path></svg>',
    toxparents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="3"></circle><path d="M2.5 20v-2a4 4 0 0 1 4-4H9"></path><circle cx="17" cy="9" r="2"></circle><path d="M13 20v-1.5a3.5 3.5 0 0 1 3.5-3.5h1a3.5 3.5 0 0 1 3.5 3.5V20"></path></svg>',
    infidelity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.5A4.5 4.5 0 0 1 12 6.4a4.5 4.5 0 0 1 7.5 3.1C19.5 15.4 12 20 12 20z"></path><path d="M12 6.5l-1.8 3.6 3 1.8-1.7 3.6"></path></svg>',
    divorce: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="13" r="5"></circle><circle cx="16" cy="11" r="5"></circle><path d="M12 4V2M12 22v-2"></path></svg>',
    breakup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5V3h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>',
    humiliation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13"></path><path d="M6 12l6 6 6-6"></path><path d="M5 21h14"></path></svg>',
    insult: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-3 3-6-6z"></path><path d="M10 8l-6 6 3 3 6-6"></path><path d="M4 21h10"></path></svg>',
    crossing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9M9 21V9M15 21V9"></path><path d="M3 14h12"></path><path d="M13 5h8"></path><path d="M18 2l3 3-3 3"></path></svg>',
    aggression: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"></path></svg>',
    jealousy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    passiveagg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8.5 10h.01"></path><path d="M15.5 10h.01"></path><path d="M8 15l2-1.2 2 1.2 2-1.2 2 1.2"></path></svg>',
    silenttreat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"></path><path d="M16 9l5 6"></path><path d="M21 9l-5 6"></path></svg>',
    emoblackmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></svg>',
    resentment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.7 7.4 4 4 0 0 1 17 15z"></path><path d="M8 18l-1 3"></path><path d="M12 18l-1 3"></path><path d="M16 18l-1 3"></path></svg>',
    overcontrol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
    manipulation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16"></path><path d="M8 3v7"></path><path d="M16 3v7"></path><path d="M12 3v5"></path><circle cx="12" cy="12" r="3"></circle><path d="M12 15v6"></path></svg>',
    stalking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="2"></circle><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M2 12h4"></path><path d="M18 12h4"></path></svg>',
    psychopathy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v7a8 8 0 0 1-16 0z"></path><path d="M8 10h2"></path><path d="M14 10h2"></path><path d="M9 15c1.5 1 4.5 1 6 0"></path></svg>',
    doomscrolling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M12 8v6"></path><path d="M9.5 12l2.5 2.5 2.5-2.5"></path></svg>',
    hypocrisy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3v18"></path><path d="M6.5 15c1 1.2 3.5 1.2 4.5 0"></path><path d="M13 16.2c1-1.2 3.5-1.2 4.5 0"></path></svg>',
    hatred: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 14a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.7 6.4 4 4 0 0 1 17 14z"></path><path d="M12 11l-2 4h3l-2 4"></path></svg>',
    ambivalence: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3-3"></path><path d="M20 16H6l3 3"></path></svg>',
    ego: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="10" r="3"></circle><path d="M6.5 18c1-3 3-4 5.5-4s4.5 1 5.5 4"></path></svg>',
    thinking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 21h4"></path><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"></path></svg>',
    sameagain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14-4L4 9"></path><path d="M4 4v5h5"></path><path d="M4 13a8 8 0 0 0 14 4l2-2"></path><path d="M20 20v-5h-5"></path></svg>',
    meteo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><path d="M8 2v1"></path><path d="M2 8h1"></path><path d="M3.8 3.8l.7.7"></path><path d="M12.2 3.8l-.7.7"></path><path d="M9 20a4 4 0 0 1-.3-8 5 5 0 0 1 9.6 1.2A3.4 3.4 0 0 1 18 20z"></path></svg>',
    subjage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12"></path><path d="M6 21h12"></path><path d="M7 3c0 5 5 6 5 9s-5 4-5 9"></path><path d="M17 3c0 5-5 6-5 9s5 4 5 9"></path></svg>',
    pseudopreg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"></path><path d="M12 17h.01"></path></svg>',
    bwthinking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3v18"></path><path d="M15.5 8h.01"></path><path d="M16.5 12h.01"></path><path d="M15.5 16h.01"></path></svg>',
    aphantasia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><line x1="3" y1="3" x2="21" y2="21"></line></svg>',
    synesthesia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle></svg>',
    lucid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path><path d="M17 3v4"></path><path d="M15 5h4"></path></svg>',
    survivorship: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"></path><path d="M10 20V4"></path><path d="M16 20v-7"></path><path d="M21 20v-3" stroke-dasharray="2 2.5"></path></svg>',
    framing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><rect x="7" y="8" width="10" height="8" rx="1"></rect></svg>',
    empathy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path></svg>',
    neurodiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c-2-2.5-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.5 5.5-4z"></path><path d="M12 12c2 2.5 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.5-5.5 4z"></path></svg>',
    hyperfocus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>',
    capgras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3.5"></circle><circle cx="16" cy="9" r="3.5" stroke-dasharray="2 2"></circle><path d="M2 20c0-3 3-5 6-5"></path><path d="M22 20c0-3-3-5-6-5"></path></svg>',
    jamaisvu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"></path><line x1="12" y1="17" x2="12" y2="17.01"></line></svg>',
    warmglow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line><line x1="4.9" y1="4.9" x2="7" y2="7"></line><line x1="17" y1="17" x2="19.1" y2="19.1"></line><line x1="4.9" y1="19.1" x2="7" y2="17"></line><line x1="17" y1="7" x2="19.1" y2="4.9"></line></svg>',
    lossaversion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="20"></line><line x1="5" y1="20" x2="19" y2="20"></line><path d="M5 7h14"></path><path d="M5 7l-3 6a3 3 0 0 0 6 0z"></path><path d="M19 7l-3 6a3 3 0 0 0 6 0z"></path></svg>',
    cfs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="17" height="9" rx="2"></rect><line x1="22" y1="11" x2="22" y2="14"></line><line x1="6" y1="12" x2="6" y2="13"></line></svg>',
    decisionfatigue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8"></path><path d="M12 13L6 7"></path><path d="M12 13l6-6"></path><polyline points="6 11 6 7 10 7"></polyline><polyline points="14 7 18 7 18 11"></polyline></svg>',
    hyperacusis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 6a8.5 8.5 0 0 1 0 12"></path></svg>',
    gossip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path><path d="M18 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v3l-3-3"></path></svg>',
    slander: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path><line x1="9" y1="9" x2="9" y2="12"></line><line x1="9" y1="14.5" x2="9.01" y2="14.5"></line></svg>',
    aidep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="3"></rect><path d="M12 8V5"></path><circle cx="12" cy="4" r="1"></circle><circle cx="9.5" cy="13" r="1"></circle><circle cx="14.5" cy="13" r="1"></circle></svg>',
    doomscroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M10 7h4"></path><path d="M10 11h4"></path><path d="M12 15v3"></path><polyline points="10.5 16.5 12 18 13.5 16.5"></polyline></svg>',
    teenage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"></path><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"></path><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"></path></svg>',
    arachno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="3.2"></circle><path d="M12 9.8V7"></path><path d="M9 12L4 9"></path><path d="M9 14l-5 3"></path><path d="M15 12l5-3"></path><path d="M15 14l5 3"></path><path d="M10 15.5L7 20"></path><path d="M14 15.5l3 4.5"></path></svg>',
    claustro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6"></path><path d="M21 9V3h-6"></path><path d="M3 15v6h6"></path><path d="M21 15v6h-6"></path><rect x="9" y="9" width="6" height="6"></rect></svg>',
    aerophobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L3 11l7 3 3 7z"></path><path d="M10 14l11-11"></path></svg>',
    bloodphobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path></svg>',
    pdisorders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><path d="M3 20c0-3 2-5.5 5-5.5M21 20c0-3-2-5.5-5-5.5M9 20c0-2.5 1.3-4.5 3-4.5s3 2 3 4.5"></path></svg>',
    defense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"></path></svg>',
    maslow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4L3 20h18z"></path><path d="M7.5 12h9M5.5 16h13"></path></svg>',
    misreading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3z"></path><path d="M21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z"></path></svg>',
    workmem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="4" rx="1"></rect><rect x="4" y="10" width="16" height="4" rx="1"></rect><path d="M4 18h10"></path></svg>',
    mindwander: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5 4 4 0 0 1 17 18z"></path></svg>',
    confirmation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"></circle><path d="M21 21l-5-5M8.5 11l2 2 3-4"></path></svg>',
    falsememory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"></path></svg>',
    sleepparalysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"></path><circle cx="7" cy="11" r="1.5"></circle></svg>',
    midlife: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"></path></svg>',
    acrophobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l6-10 4 6 3-4 5 8z"></path></svg>',
    nyctophobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"></path><path d="M17 4v3M15.5 5.5h3"></path></svg>',
    cynophobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="9" r="1.7"></circle><circle cx="12" cy="6.5" r="1.7"></circle><circle cx="17" cy="9" r="1.7"></circle><path d="M8 17c0-2.5 2-4 4-4s4 1.5 4 4c0 1.5-1.3 2.2-4 2.2S8 18.5 8 17z"></path></svg>',
    technophobia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M11 18h2M10 8h4"></path></svg>',
    maleloneliness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path><path d="M20 5h.01"></path><path d="M4 4h.01"></path></svg>',
    youthfuture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"></path><path d="M5 20V10l7-5 7 5v10"></path><path d="M10 20v-5h4v5"></path></svg>',
    norelations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"></path><path d="M4 4l16 16"></path></svg>',
    datingtalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"></path><path d="M9 11h6"></path><path d="M9 14h4"></path></svg>',
    maturity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4v-4H4z"></path><path d="M10 20h4v-8h-4z"></path><path d="M16 20h4V6h-4z"></path></svg>',
    tulpa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"></circle><path d="M3 20a6 6 0 0 1 12 0"></path><circle cx="17" cy="8" r="2.5" stroke-dasharray="2 2"></circle><path d="M14.5 20a4.5 4.5 0 0 1 6.5-3.5" stroke-dasharray="2 2"></path></svg>',
    quadrobics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h13a3 3 0 0 1 3 3v2"></path><path d="M6 13v6"></path><path d="M15 13v6"></path><path d="M4 13V9l3-2 2 2"></path><circle cx="6" cy="10" r=".5"></circle></svg>',
    doom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 17H8a4 4 0 0 1-.7-7.94A5 5 0 0 1 17 8.5a4.25 4.25 0 0 1 .5 8.5z"></path><path d="M12 10l-2 3.5h3L11 17"></path></svg>',
    emptiness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"></circle></svg>',
    entrapment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 4v16"></path><path d="M15 4v16"></path></svg>',
    existential: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"></path><path d="M12 17h.01"></path></svg>',
    lifechange: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19v-6a3 3 0 0 1 3-3h8"></path><path d="M13 6l3.5 4-3.5 4"></path></svg>',
    lostcursed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M15.5 8.5l-2 5-5 2 2-5z"></path></svg>',
    selftalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>',
};

const ARTICLES = [
    { id: 'bar', title: 'БАР (биполярное аффективное расстройство)', tag: 'БАР', tagClass: 'mood', desc: 'Что такое биполярное расстройство, чем эпизоды мании отличаются от депрессивных и как с этим живут.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-bar.html' },
    { id: 'adhd', title: 'СДВГ', tag: 'СДВГ', tagClass: 'adhd', desc: 'Синдром дефицита внимания и гиперактивности у взрослых: как проявляется и почему его часто не замечают годами.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-adhd.html' },
    { id: 'depression', title: 'Депрессия', tag: 'Депрессия', tagClass: 'depression', desc: 'Чем клиническая депрессия отличается от плохого настроения, и какие симптомы стоит замечать.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-depression.html' },
    { id: 'anxiety', title: 'Тревожное расстройство', tag: 'Тревожность', tagClass: 'anxiety', desc: 'Почему тревога иногда перестаёт быть полезной реакцией и превращается в расстройство.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-anxiety.html' },
    { id: 'ocd', title: 'ОКР (обсессивно-компульсивное расстройство)', tag: 'ОКР', tagClass: 'ocd', desc: 'Навязчивые мысли и ритуалы — не «любовь к порядку», а изматывающий замкнутый круг.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-ocd.html' },
    { id: 'ras', title: 'РАС (расстройство аутистического спектра)', tag: 'РАС', tagClass: 'asd', desc: 'Как проявляется аутизм у детей и взрослых, откуда берутся мифы и что говорит наука.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-ras.html' },
    { id: 'dri', title: 'ДРИ (диссоциативное расстройство идентичности)', tag: 'ДРИ', tagClass: 'did', desc: 'То, что в быту называют «раздвоением личности» — на деле защитный механизм психики после травмы.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-dri.html' },
    { id: 'panic', title: 'Паническое расстройство', tag: 'Панические атаки', tagClass: 'panic', desc: 'Чем паническая атака отличается от обычного приступа тревоги и почему это не «просто нервы».', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-panic.html' },
    { id: 'ptsd', title: 'ПТСР', tag: 'ПТСР', tagClass: 'ptsd', desc: 'Посттравматическое стрессовое расстройство: как психика «застревает» в тяжёлом событии.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-ptsd.html' },
    { id: 'rpp', title: 'РПП (расстройства пищевого поведения)', tag: 'РПП', tagClass: 'eating', desc: 'Почему РПП встречается чаще, чем кажется, и далеко не всегда заметно по внешнему виду.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-rpp.html' },
    { id: 'bpd', title: 'ПРЛ (пограничное расстройство личности)', tag: 'ПРЛ', tagClass: 'bpd', desc: 'Резкие перепады в отношениях и самооценке — и как с ними можно научиться справляться.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-bpd.html' },
    { id: 'narc', title: 'Нарциссическое расстройство личности', tag: 'Нарциссизм', tagClass: 'narc', desc: 'Почему внешняя уверенность часто маскирует очень хрупкую самооценку.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-narc.html' },
    { id: 'sch', title: 'Шизофрения', tag: 'Шизофрения', tagClass: 'sch', desc: 'Почему шизофрения — это не «раздвоение личности», как проявляется расстройство и как с ним живут.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-sch.html' },
    { id: 'id', title: 'Задержка развития (умственная отсталость)', tag: 'Задержка развития', tagClass: 'id', desc: 'Что стоит за диагнозом «нарушение интеллектуального развития» и какая поддержка действительно помогает.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-id.html' },
    { id: 'klepto', title: 'Клептомания', tag: 'Клептомания', tagClass: 'klepto', desc: 'Почему клептомания — это не воровство ради выгоды, а изматывающий цикл напряжения и облегчения.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-klepto.html' },
    { id: 'dyscalc', title: 'Дискалькулия', tag: 'Дискалькулия', tagClass: 'dyscalc', desc: 'Специфическое расстройство обучения, из-за которого числа и счёт даются заметно труднее, чем остальное.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-dyscalc.html' },
    { id: 'dyslex', title: 'Дислексия', tag: 'Дислексия', tagClass: 'dyslex', desc: 'Самое частое расстройство обучения: почему чтение даётся тяжело и как с этим можно учиться.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-dyslex.html' },
    { id: 'psychosis', title: 'Психоз', tag: 'Психоз', tagClass: 'psychosis', desc: 'Чем психоз отличается от шизофрении и почему это симптом-состояние, а не отдельный диагноз.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-psychosis.html' },
    { id: 'szf', title: 'Шизофазия', tag: 'Шизофазия', tagClass: 'szf', desc: '«Словесная окрошка»: что это за симптом, чем он отличается от афазии и о чём сигнализирует.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-szf.html' },
    { id: 'sza', title: 'Шизоаффективное расстройство', tag: 'Шизоаффективное', tagClass: 'sza', desc: 'Когда психоз и расстройство настроения сочетаются в одном состоянии — и почему это не «два диагноза сразу».', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-sza.html' },
    { id: 'szt', title: 'Шизотипическое расстройство', tag: 'Шизотипическое', tagClass: 'szt', desc: 'Эксцентричное мышление, странные убеждения и трудности в близости — чем это отличается от шизофрении.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-szt.html' },
    { id: 'szd', title: 'Шизоидное расстройство личности', tag: 'Шизоидное', tagClass: 'szd', desc: 'Почему устойчивое предпочтение одиночества — это не социофобия и не депрессия.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-szd.html' },
    { id: 'munch', title: 'Синдром Мюнхгаузена (фиктивное расстройство)', tag: 'Синдром Мюнхгаузена', tagClass: 'munch', desc: 'Когда человек намеренно изображает или вызывает у себя болезнь — не ради выгоды, а ради роли больного и заботы вокруг.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-munch.html' },
    { id: 'misogyny', title: 'Мизогиния', tag: 'Мизогиния', tagClass: 'misogyny', desc: 'Не болезнь, а устойчивая установка враждебности к женщинам: чем мизогиния отличается от сексизма и как она влияет на людей.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-misogyny.html' },
    { id: 'misandry', title: 'Мизандрия', tag: 'Мизандрия', tagClass: 'misandry', desc: 'Враждебность к мужчинам как к группе: что об этом говорят исследователи, где заканчивается критика и начинается предубеждение.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-misandry.html' },
    { id: 'ableism', title: 'Эйблизм (эйбелизм)', tag: 'Эйблизм', tagClass: 'ableism', desc: 'Не только ненависть, но и жалость, снисходительность и недоступная среда: как устроена дискриминация людей с инвалидностью.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-ableism.html' },
    { id: 'xeno', title: 'Ксенофобия', tag: 'Ксенофобия', tagClass: 'xeno', desc: 'Страх и неприязнь к «чужим»: почему это не фобия в медицинском смысле и как психология объясняет деление на «свои» и «чужие».', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-xeno.html' },
    { id: 'racism', title: 'Расизм', tag: 'Расизм', tagClass: 'racism', desc: 'Как расовые предубеждения проявляются на разных уровнях и почему опыт дискриминации сказывается на психическом здоровье.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-racism.html' },
    { id: 'ageism', title: 'Эйджизм', tag: 'Эйджизм', tagClass: 'ageism', desc: 'Дискриминация по возрасту касается не только пожилых: как устроен эйджизм и что он делает с самочувствием.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-ageism.html' },
    { id: 'gaslight', title: 'Газлайтинг', tag: 'Газлайтинг', tagClass: 'gaslight', desc: 'Когда вас систематически заставляют сомневаться в собственной памяти и восприятии: как распознать и что делать.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-gaslight.html' },
    { id: 'codep', title: 'Созависимость', tag: 'Созависимость', tagClass: 'codep', desc: 'Когда чужие проблемы становятся важнее собственной жизни: что стоит за термином и чем он отличается от обычной заботы.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-codep.html' },
    { id: 'perfect', title: 'Перфекционизм', tag: 'Перфекционизм', tagClass: 'perfect', desc: 'Когда высокие стандарты превращаются в источник тревоги и самокритики: чем перфекционизм отличается от стремления к качеству.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-perfect.html' },
    { id: 'socphob', title: 'Социальная фобия (социальное тревожное расстройство)', tag: 'Социальная фобия', tagClass: 'socphob', desc: 'Сильный страх оценки и унижения в обществе: чем социофобия отличается от застенчивости и как с ней работают.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-socphob.html' },
    { id: 'phobia', title: 'Специфические фобии', tag: 'Специфические фобии', tagClass: 'phobia', desc: 'Выраженный страх конкретного объекта или ситуации: пауки, высота, самолёты, кровь. Как устроены фобии и как их лечат.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-phobia.html' },
    { id: 'insomnia', title: 'Бессонница (инсомния)', tag: 'Бессонница', tagClass: 'insomnia', desc: 'Когда трудно заснуть, спать всю ночь или проснуться отдохнувшим: чем инсомния отличается от обычного недосыпа и что помогает.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-insomnia.html' },
    { id: 'burnout', title: 'Эмоциональное выгорание', tag: 'Выгорание', tagClass: 'burnout', desc: 'Состояние истощения из-за долгого хронического стресса на работе или учёбе: признаки, причины и чем оно отличается от депрессии.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-burnout.html' },
    { id: 'impostor', title: 'Синдром самозванца', tag: 'Синдром самозванца', tagClass: 'impostor', desc: 'Когда достижения кажутся случайностью, а человек боится, что его «разоблачат»: как это устроено и что делать.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-impostor.html' },
    { id: 'bullying', title: 'Буллинг (травля)', tag: 'Буллинг', tagClass: 'bullying', desc: 'Систематическое унижение и давление на того, кто не может защититься: как отличить травлю от конфликта и что делать.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-bullying.html' },
    { id: 'ludo', title: 'Игровая зависимость (лудомания и игровое расстройство)', tag: 'Игровая зависимость', tagClass: 'ludo', desc: 'Азартные игры и видеоигры, которые вышли из-под контроля: как отличить увлечение от зависимости и как помочь себе или близкому.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-ludo.html' },
    { id: 'procrast', title: 'Прокрастинация', tag: 'Прокрастинация', tagClass: 'procrast', desc: 'Почему мы откладываем важное, хотя понимаем, что вредим себе: причины, связь с эмоциями и способы начать.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-procrast.html' },
    { id: 'apathy', title: 'Апатия', tag: 'Апатия', tagClass: 'apathy', desc: 'Когда ничего не хочется и всё безразлично: чем апатия отличается от депрессии и лени и когда нужно к врачу.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-apathy.html' },
    { id: 'psychosom', title: 'Психосоматические расстройства', tag: 'Психосоматика', tagClass: 'psychosom', desc: 'Как стресс и эмоции проявляются в теле и почему «все болезни от нервов» — упрощение: что такое психосоматика на самом деле.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-psychosom.html' },
    { id: 'anhedonia', title: 'Ангедония', tag: 'Ангедония', tagClass: 'anhedonia', desc: 'Когда то, что раньше радовало, перестаёт приносить удовольствие: виды ангедонии, причины и что помогает.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-anhedonia.html' },
    { id: 'alexithymia', title: 'Алекситимия', tag: 'Алекситимия', tagClass: 'alexithymia', desc: 'Когда трудно понять, что именно ты чувствуешь, и подобрать для этого слова: причины, связи с другими состояниями и как развивать эмоциональную грамотность.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-alexithymia.html' },
    { id: 'depers', title: 'Деперсонализация и дереализация', tag: 'Деперсонализация', tagClass: 'depers', desc: 'Ощущение, что вы наблюдаете за собой со стороны или мир стал «нереальным»: чем это вызвано, когда это норма и как помочь себе.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-depers.html' },
    { id: 'hypochondria', title: 'Ипохондрия (тревога о здоровье)', tag: 'Ипохондрия', tagClass: 'hypochondria', desc: 'Постоянный страх серьёзной болезни вопреки успокаивающим обследованиям: как устроен замкнутый круг и как из него выйти.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-hypochondria.html' },
    { id: 'bdd', title: 'Дисморфофобия (телесное дисморфическое расстройство)', tag: 'Дисморфофобия', tagClass: 'bdd', desc: 'Когда навязчиво тревожат мнимые или почти незаметные «изъяны» внешности: чем отличается от обычной неудовлетворённости и что помогает.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-bdd.html' },
    { id: 'tourette', title: 'Тики и синдром Туретта', tag: 'Синдром Туретта', tagClass: 'tourette', desc: 'Непроизвольные движения и звуки — тики: что это такое, почему это не «плохая привычка» и как с этим живут.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-tourette.html' },
    { id: 'grief', title: 'Горе и затяжное горе', tag: 'Горе', tagClass: 'grief', desc: 'Как проживается утрата близкого человека: почему нет «правильных» сроков и стадий и когда нужна профессиональная помощь.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-grief.html' },
    { id: 'mutism', title: 'Избирательный мутизм', tag: 'Избирательный мутизм', tagClass: 'mutism', desc: 'Когда человек нормально говорит дома, но не может говорить в школе или с чужими: это тревога, а не упрямство.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-mutism.html' },
    { id: 'attach', title: 'Теория привязанности', tag: 'Привязанность', tagClass: 'attach', desc: 'Как ранний опыт близости влияет на доверие и отношения во взрослом возрасте и почему «стиль привязанности» — не приговор.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-attach.html' },
    { id: 'abuse', title: 'Психологическое (эмоциональное) насилие', tag: 'Психологическое насилие', tagClass: 'abuse', desc: 'Систематическое унижение и контроль без физического насилия: как распознать и что делать, если это происходит с вами.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-abuse.html' },
    { id: 'avoidant', title: 'Избегающее (тревожное) расстройство личности', tag: 'Избегающее РЛ', tagClass: 'avoidant', desc: 'Постоянная социальная скованность, чувство неполноценности и страх отвержения при сильном желании близости: чем это отличается от застенчивости и социофобии.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-avoidant.html' },
    { id: 'agora', title: 'Агорафобия', tag: 'Агорафобия', tagClass: 'agora', desc: 'Страх ситуаций, откуда сложно выйти или где не помогут, если станет плохо: транспорт, очереди, открытые пространства.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-agora.html' },
    { id: 'sepanx', title: 'Тревожное расстройство разлуки', tag: 'Тревога разлуки', tagClass: 'sepanx', desc: 'Чрезмерный страх расставания с близкими: чем это отличается от обычной детской привязанности и как помочь ребёнку и себе.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-sepanx.html' },
    { id: 'adjust', title: 'Расстройство адаптации', tag: 'Расстройство адаптации', tagClass: 'adjust', desc: 'Тяжёлая реакция на жизненные перемены (переезд, потеря, развод, экзамены): чем отличается от нормальной тревоги и как переживается.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-adjust.html' },
    { id: 'paranoid', title: 'Параноидное расстройство личности', tag: 'Параноидное РЛ', tagClass: 'paranoid', desc: 'Устойчивая всепроникающая подозрительность и недоверие к людям: чем отличается от психоза и от здоровой осторожности.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-paranoid.html' },
    { id: 'parasomnia', title: 'Парасомнии и кошмары', tag: 'Парасомнии', tagClass: 'parasomnia', desc: 'Лунатизм, ночные ужасы, кошмары и сонный паралич: чем они различаются, почему возникают и когда нужна помощь.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-parasomnia.html' },
    { id: 'digital', title: 'Чрезмерное использование соцсетей и смартфона', tag: 'Соцсети и смартфон', tagClass: 'digital', desc: 'Когда телефон и соцсети отнимают сон, время и настроение: что известно науке и как вернуть контроль без паники и запретов.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-digital.html' },
    { id: 'lonely', title: 'Одиночество', tag: 'Одиночество', tagClass: 'lonely', desc: 'Тягостное чувство нехватки близких связей: чем оно отличается от уединения, почему влияет на здоровье и как из него выходить.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-lonely.html' },
    { id: 'trich', title: 'Трихотилломания (навязчивое выдёргивание волос)', tag: 'Трихотилломания', tagClass: 'trich', desc: 'Трудно сдерживаемая потребность выдёргивать волосы: почему возникает, чем отличается от привычки и как это лечат.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-trich.html' },
    { id: 'stress', title: 'Стресс', tag: 'Стресс', tagClass: 'stress', desc: 'Чем полезный стресс отличается от вредного, как организм реагирует на напряжение и что помогает не доводить себя до истощения.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-stress.html' },
    { id: 'dysthymia', title: 'Дистимия (персистирующее депрессивное расстройство)', tag: 'Дистимия', tagClass: 'dysthymia', desc: 'Многолетнее сниженное настроение, которое часто принимают за «просто такой характер»: чем оно отличается от депрессии и как с ним работают.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-dysthymia.html' },
    { id: 'seasonal', title: 'Сезонное аффективное расстройство (сезонная депрессия)', tag: 'Сезонная депрессия', tagClass: 'seasonal', desc: 'Когда настроение и силы падают каждую осень или зиму: почему так бывает, чем это отличается от обычной «осенней хандры» и что помогает.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-seasonal.html' },
    { id: 'testanx', title: 'Экзаменационная тревожность', tag: 'Тревога перед экзаменом', tagClass: 'testanx', desc: 'Почему голова пустеет именно на экзамене, чем волнение помогает, а чем мешает, и как подготовить не только знания, но и нервы.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-testanx.html' },
    { id: 'schoolref', title: 'Школьный отказ (невозможность ходить в школу из-за тревоги)', tag: 'Школьный отказ', tagClass: 'schoolref', desc: 'Когда ребёнок или подросток не может зайти в школу из-за страха и тревоги, а не из «лени»: чем это отличается от прогулов и как помочь.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-schoolref.html' },
    { id: 'odd', title: 'Оппозиционно-вызывающее расстройство (ОВР)', tag: 'ОВР', tagClass: 'odd', desc: 'Устойчивая злость, споры и протест против правил, выходящие за рамки «трудного возраста»: как отличить и как помочь ребёнку и семье.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-odd.html' },
    { id: 'anger', title: 'Гнев и вспышки ярости', tag: 'Гнев', tagClass: 'anger', desc: 'Гнев — нормальная эмоция, но вспышки, которые ломают отношения, можно понять и научиться с ними справляться.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-anger.html' },
    { id: 'dyspraxia', title: 'Диспраксия (расстройство координации развития)', tag: 'Диспраксия', tagClass: 'dyspraxia', desc: 'Когда трудности с координацией и мелкой моторикой не связаны ни с интеллектом, ни со зрением: как проявляется и как помогают детям и взрослым.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-dyspraxia.html' },
    { id: 'dysgraphia', title: 'Дисграфия', tag: 'Дисграфия', tagClass: 'dysgraphia', desc: 'Стойкие ошибки и трудности при письме, не связанные с невнимательностью или ленью: какие бывают виды, откуда берутся и чем помогают.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-dysgraphia.html' },
    { id: 'stutter', title: 'Заикание', tag: 'Заикание', tagClass: 'stutter', desc: 'Повторы, затяжки и «застревания» в речи: почему возникает заикание, почему совет «успокойся» не работает и как с ним справляются.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-stutter.html' },
    { id: 'misophonia', title: 'Мисофония', tag: 'Мисофония', tagClass: 'misophonia', desc: 'Когда определённые звуки — чавканье, дыхание, щёлканье ручки — вызывают сильный гнев или тревогу: что известно об этом состоянии и как с ним жить.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-misophonia.html' },
    { id: 'dsps', title: 'Синдром задержки фазы сна (хронотип «сова»)', tag: 'Задержка фазы сна', tagClass: 'dsps', desc: 'Когда внутренние часы упорно сдвинуты на поздний вечер и утром невозможно встать: чем это отличается от лени и как мягко сдвинуть режим.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-dsps.html' },
    { id: 'fomo', title: 'FOMO (страх упустить что-то важное)', tag: 'FOMO', tagClass: 'fomo', desc: 'Тревожное чувство, что у других жизнь интереснее, а вы что-то упускаете: откуда оно берётся, как связано с соцсетями и как его приглушить.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-fomo.html' },
    { id: 'cyberbully', title: 'Кибербуллинг (травля в интернете)', tag: 'Кибербуллинг', tagClass: 'cyberbully', desc: 'Травля в чатах и соцсетях идёт круглосуточно и видна многим: как её распознать, что делать пострадавшему, свидетелю и родителям.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-cyberbully.html' },
    { id: 'shame', title: 'Стыд и вина', tag: 'Стыд и вина', tagClass: 'shame', desc: 'Два похожих чувства с разным смыслом: вина говорит «я сделал плохо», стыд — «я плохой». Как их различать и что делать с тяжёлым стыдом.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-shame.html' },
    { id: 'peer', title: 'Давление сверстников (групповое давление)', tag: 'Давление сверстников', tagClass: 'peer', desc: 'Почему так трудно сказать «нет» друзьям и что известно о влиянии группы: как отличить поддержку от давления и сохранить собственное мнение.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-peer.html' },
    { id: 'cultshock', title: 'Культурный шок', tag: 'Культурный шок', tagClass: 'cultshock', desc: 'Растерянность и усталость, которые приходят, когда привычные правила исчезают: переезд, обмен, новая страна. Стадии адаптации и что помогает.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-cultshock.html' },
    { id: 'paris', title: 'Парижский синдром', tag: 'Парижский синдром', tagClass: 'paris', desc: 'Что бывает, когда реальный город совсем не похож на открытку: редкая острая реакция разочарования и тревоги у путешественников.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-paris.html' },
    { id: 'jerusalem', title: 'Иерусалимский синдром', tag: 'Иерусалимский синдром', tagClass: 'jerusalem', desc: 'Редкое острое состояние у туристов и паломников: как его описывают психиатры, чем оно объясняется и что делать, если оно возникло у спутника.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-jerusalem.html' },
    { id: 'stendhal', title: 'Синдром Стендаля', tag: 'Синдром Стендаля', tagClass: 'stendhal', desc: 'Головокружение, сердцебиение и слабость от переизбытка красоты: что описали во Флоренции и как отличить такую реакцию от обычной усталости.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-stendhal.html' },
    { id: 'spanshame', title: 'Испанский стыд (заместительное смущение)', tag: 'Испанский стыд', tagClass: 'spanshame', desc: 'Неловкость за чужой поступок — «кринж»: что это за чувство, почему оно связано с эмпатией и как относиться к нему без насмешек над другими.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-spanshame.html' },
    { id: 'rumination', title: 'Руминация (мысленная «жвачка»)', tag: 'Руминация', tagClass: 'rumination', desc: 'Когда одни и те же мысли крутятся по кругу и не дают покоя: чем руминация отличается от полезных раздумий и как выйти из замкнутого круга.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-rumination.html' },
    { id: 'helpless', title: 'Выученная беспомощность', tag: 'Выученная беспомощность', tagClass: 'helpless', desc: 'Когда кажется, что «всё равно ничего не изменить»: откуда берётся привычка сдаваться и как вернуть ощущение, что вы влияете на свою жизнь.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-helpless.html' },
    { id: 'toxicpos', title: 'Токсичная позитивность', tag: 'Токсичная позитивность', tagClass: 'toxicpos', desc: '«Не грусти, всё к лучшему»: почему постоянное требование позитива ранит и как поддерживать себя и других, не обесценивая чувства.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-toxicpos.html' },
    { id: 'hikikomori', title: 'Хикикомори (социальная самоизоляция)', tag: 'Хикикомори', tagClass: 'hikikomori', desc: 'Когда человек месяцами не выходит из комнаты и избегает людей: что такое хикикомори, откуда оно берётся и как поддерживать себя и близких без давления.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-hikikomori.html' },
    { id: 'nostalgia', title: 'Ностальгия', tag: 'Ностальгия', tagClass: 'nostalgia', desc: 'Тёплая тоска по прошлому: откуда пришло слово, чем ностальгия помогает и как не застрять в воспоминаниях.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-nostalgia.html' },
    { id: 'duckling', title: 'Синдром утёнка (импринтинг и «первый авторитет»)', tag: 'Синдром утёнка', tagClass: 'duckling', desc: 'Привязанность к «первому встречному» у птенцов и привычка слепо верить первому авторитету у людей: что известно науке и как сохранять собственное мнение.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-duckling.html' },
    { id: 'mandela', title: 'Эффект Манделы', tag: 'Эффект Манделы', tagClass: 'mandela', desc: 'Когда множество людей одинаково «помнят» то, чего не было: почему память достраивает прошлое и как проверить собственные воспоминания.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-mandela.html' },
    { id: 'dejavu', title: 'Дежавю', tag: 'Дежавю', tagClass: 'dejavu', desc: 'Ощущение «это уже было»: что известно о дежавю, почему оно возникает у большинства людей и в каких случаях стоит обратиться к врачу.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-dejavu.html' },
    { id: 'ecoanx', title: 'Экотревога и тревога о будущем', tag: 'Экотревога', tagClass: 'ecoanx', desc: 'Тревога из-за будущего планеты и общее ощущение его «зыбкости»: откуда она берётся и как не потерять опору, не отрицая реальных проблем.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-ecoanx.html' },
    { id: 'boredom', title: 'Скука', tag: 'Скука', tagClass: 'boredom', desc: 'Когда скучно и ничего не хочется: чем скука отличается от лени и апатии, чем она полезна и что делать с хронической скукой.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-boredom.html' },
    { id: 'excellent', title: 'Синдром отличника', tag: 'Синдром отличника', tagClass: 'excellent', desc: 'Когда самооценка держится на пятёрках: чем «синдром отличника» отличается от здорового стремления учиться и как научиться отдыхать и ошибаться.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-excellent.html' },
    { id: 'emoreg', title: 'Эмоциональная саморегуляция', tag: 'Саморегуляция', tagClass: 'emoreg', desc: 'Как замечать эмоции и справляться с ними, не подавляя: стратегии регуляции по Гроссу и простые приёмы, которые работают.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-emoreg.html' },
    { id: 'dunning', title: 'Эффект Даннинга — Крюгера', tag: 'Даннинг — Крюгер', tagClass: 'dunning', desc: 'Почему новичкам часто кажется, что они разбираются лучше, чем есть на самом деле: что показало исследование 1999 года и о чём до сих пор спорят учёные.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-dunning.html' },
    { id: 'bedtimeproc', title: '«Месть» отложенного сна (откладывание отхода ко сну)', tag: '«Месть» сну', tagClass: 'bedtimeproc', desc: 'Почему мы не ложимся спать, хотя знаем, что утром будет тяжело: как «отвоёвывание» личного времени съедает сон и что с этим делать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-bedtimeproc.html' },
    { id: 'timepress', title: 'Синдром упущенного времени (страх не успеть и дедлайны)', tag: 'Упущенное время', tagClass: 'timepress', desc: 'Ощущение «я всё время опаздываю»: почему мы недооцениваем, сколько нужно времени, как работает давление дедлайнов и что делать с чувством «я отстал от жизни».', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-timepress.html' },
    { id: 'smalltalk', title: 'Тревога перед small talk (неловкость в разговоре)', tag: 'Small talk', tagClass: 'smalltalk', desc: 'Почему короткий разговор «ни о чём» иногда кажется испытанием, что показывают исследования об иллюзии прозрачности и «разрыве симпатии» и как с этим справляться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-smalltalk.html' },
    { id: 'eq', title: 'Эмоциональный интеллект', tag: 'Эмоциональный интеллект', tagClass: 'eq', desc: 'Умение замечать, понимать и учитывать эмоции — свои и чужие: из каких навыков он состоит, что про него доказано, а что преувеличено, и как его развивать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-eq.html' },
    { id: 'spotlight', title: 'Эффект прожектора', tag: 'Эффект прожектора', tagClass: 'spotlight', desc: 'Почему кажется, что окружающие замечают каждое наше неловкое слово, пятно на футболке или ошибку, хотя на деле они замечают гораздо меньше.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-spotlight.html' },
    { id: 'cogdist', title: 'Когнитивные искажения (ловушки мышления)', tag: 'Когнитивные искажения', tagClass: 'cogdist', desc: 'Привычные автоматические мысли, которые искажают реальность и усиливают тревогу и плохое настроение: самые частые ловушки и способы их проверять.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-cogdist.html' },
    { id: 'selfcomp', title: 'Самосострадание (доброта к себе)', tag: 'Самосострадание', tagClass: 'selfcomp', desc: 'Как относиться к себе в трудный момент так же тепло, как к близкому другу: три компонента самосострадания, чем оно не является и как его тренировать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-selfcomp.html' },
    { id: 'boundaries', title: 'Личные границы', tag: 'Личные границы', tagClass: 'boundaries', desc: 'Что можно и чего нельзя в общении с тобой: какие бывают границы, почему их трудно выстраивать и как говорить «нет», не разрушая отношений.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-boundaries.html' },
    { id: 'barnum', title: 'Эффект Барнума (эффект Форера)', tag: 'Эффект Барнума', tagClass: 'barnum', desc: 'Почему гороскопы, «разборы личности» и некоторые онлайн-тесты кажутся точными именно про нас, и как отличить конкретное описание от расплывчатого.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-barnum.html' },
    { id: 'failfear', title: 'Страх неудачи', tag: 'Страх неудачи', tagClass: 'failfear', desc: 'Когда страх ошибиться важнее желания попробовать: откуда он берётся, как проявляется (откладывание, самосаботаж) и как менять отношение к неудаче.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-failfear.html' },
    { id: 'choiceparal', title: 'Паралич выбора (перегрузка выбором)', tag: 'Паралич выбора', tagClass: 'choiceparal', desc: 'Почему при множестве вариантов выбрать труднее, что показал знаменитый эксперимент с вареньем, о чём спорят исследователи и как принимать решения спокойнее.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-choiceparal.html' },
    { id: 'freudslip', title: 'Оговорка по Фрейду (парапраксис)', tag: 'Оговорка по Фрейду', tagClass: 'freudslip', desc: 'Почему мы иногда говорим не то слово: что думал об оговорках Фрейд, как объясняют их современные учёные и когда речевые ошибки — повод к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-freudslip.html' },
    { id: 'sleepwalk', title: 'Сомнамбулизм (лунатизм)', tag: 'Лунатизм', tagClass: 'sleepwalk', desc: 'Хождение и действия во сне: почему это не связано с Луной, что происходит с мозгом, как обезопасить дом и когда нужно к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-sleepwalk.html' },
    { id: 'intrusive', title: 'Навязчивые мысли (интрузии)', tag: 'Навязчивые мысли', tagClass: 'intrusive', desc: 'Почему в голову приходят пугающие, «неправильные» мысли, хотя человек этого совсем не хочет: чем они отличаются от намерений, когда это ОКР и как с ними жить.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-intrusive.html' },
    { id: 'daydream', title: 'Синдром навязчивых грёз (дезадаптивные грёзы)', tag: 'Навязчивые грёзы', tagClass: 'daydream', desc: 'Когда яркие фантазии «в голове» занимают часы и мешают учёбе и жизни: чем это отличается от обычных мечтаний, как о нём говорят учёные и что помогает.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-daydream.html' },
    { id: 'maincharacter', title: 'Синдром главного героя', tag: 'Главный герой', tagClass: 'maincharacter', desc: 'Популярный интернет-термин о привычке видеть себя героем фильма, а других — массовкой: чем это полезно, когда вредит и чем отличается от нарциссизма.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-maincharacter.html' },
    { id: 'doorway', title: 'Эффект дверного проёма', tag: 'Дверной проём', tagClass: 'doorway', desc: 'Почему мы забываем, зачем пошли в другую комнату: что показали эксперименты, как это связано с «границами событий» в памяти и как вернуть мысль.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-doorway.html' },
    { id: 'phantomvib', title: 'Фантомная вибрация телефона', tag: 'Фантомная вибрация', tagClass: 'phantomvib', desc: 'Ощущение, что телефон завибрировал, хотя ему никто не писал: сколько людей с этим сталкивается, почему мозг «додумывает» сигнал и что с этим делать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-phantomvib.html' },
    { id: 'satiation', title: 'Семантическое насыщение (слово «теряет смысл»)', tag: 'Семантическое насыщение', tagClass: 'satiation', desc: 'Почему слово, повторённое десять раз подряд, начинает звучать странно и «пустеет»: что это за эффект, что известно о его причинах и где он применяется.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-satiation.html' },
    { id: 'innerspeech', title: 'Внутренняя речь («разговор с самим собой»)', tag: 'Внутренняя речь', tagClass: 'innerspeech', desc: 'Что такое «голос в голове», зачем мы говорим сами с собой вслух и про себя, чем полезен и вреден внутренний монолог и чем он отличается от «голосов» при психозе.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-innerspeech.html' },
    { id: 'tiptongue', title: 'Феномен «вертится на языке»', tag: 'Вертится на языке', tagClass: 'tiptongue', desc: 'Когда точно знаешь слово, но не можешь его произнести: почему это случается, что человек помнит о забытом слове и как «достать» его из памяти.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-tiptongue.html' },
    { id: 'frequencyill', title: 'Иллюзия частоты (эффект Баадера — Майнхоф)', tag: 'Иллюзия частоты', tagClass: 'frequencyill', desc: 'Узнал новое слово, марку машины или песню и вдруг стал встречать их повсюду: почему так кажется и при чём тут избирательное внимание.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-frequencyill.html' },
    { id: 'hypnicjerk', title: 'Вздрагивание при засыпании (гипнические подёргивания)', tag: 'Вздрагивание при засыпании', tagClass: 'hypnicjerk', desc: 'Резкое подёргивание тела и ощущение падения в момент засыпания: что это такое, почему возникает, при чём тут кофе и стресс и когда стоит обратиться к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-hypnicjerk.html' },
    { id: 'hoarding', title: 'Синдром Плюшкина (патологическое накопительство)', tag: 'Синдром Плюшкина', tagClass: 'hoarding', desc: 'Когда выбросить вещи невыносимо трудно, а дом заполняется до непригодности для жизни: чем накопительство отличается от коллекционирования и неряшливости и как помогают.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-hoarding.html' },
    { id: 'dissonance', title: 'Когнитивный диссонанс', tag: 'Когнитивный диссонанс', tagClass: 'dissonance', desc: 'Неприятное чувство, когда поступки расходятся с убеждениями: как мы себя оправдываем, что показал знаменитый эксперимент с одним и двадцатью долларами и что с этим делать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-dissonance.html' },
    { id: 'bystander', title: 'Эффект наблюдателя (диффузия ответственности)', tag: 'Эффект наблюдателя', tagClass: 'bystander', desc: 'Почему в толпе люди реже приходят на помощь и как преодолеть «пусть сделает кто-то другой»: что показали исследования и как действовать самому.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-bystander.html' },
    { id: 'zeigarnik', title: 'Эффект Зейгарник (незавершённые дела)', tag: 'Эффект Зейгарник', tagClass: 'zeigarnik', desc: 'Почему незаконченные дела «крутятся в голове» и как этим пользоваться: от остановки на самом интересном месте до плана, который снимает тревогу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-zeigarnik.html' },
    { id: 'introversion', title: 'Интроверсия и «социальная батарейка»', tag: 'Интроверсия', tagClass: 'introversion', desc: 'Чем интроверсия отличается от застенчивости и социальной фобии, откуда взялась метафора «социальной батарейки» и как заботиться о себе, если от общения устаёшь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-introversion.html' },
    { id: 'innercritic', title: 'Внутренний критик', tag: 'Внутренний критик', tagClass: 'innercritic', desc: 'Что такое «голос в голове», который ругает и обесценивает: откуда он берётся, зачем он нам нужен и как сделать его союзником, а не врагом.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-innercritic.html' },
    { id: 'envy', title: 'Зависть', tag: 'Зависть', tagClass: 'envy', desc: 'Что такое зависть и чем она отличается от ревности, бывает ли «белая» зависть, как соцсети её усиливают и как превратить её в полезный сигнал.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-envy.html' },
    { id: 'flow', title: 'Состояние потока', tag: 'Состояние потока', tagClass: 'flow', desc: 'Когда время летит, а дело поглощает целиком: что такое «поток», при каких условиях он появляется, чем отличается от скуки и тревоги и как не потерять контроль.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-flow.html' },
    { id: 'hedonic', title: 'Гедонистическая адаптация («беговая дорожка счастья»)', tag: 'Гедонистическая адаптация', tagClass: 'hedonic', desc: 'Почему новая вещь или достижение радуют недолго: что такое «беговая дорожка счастья», насколько она реальна и как сохранять радость.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-hedonic.html' },
    { id: 'sunkcost', title: 'Ошибка невозвратных затрат', tag: 'Невозвратные затраты', tagClass: 'sunkcost', desc: 'Почему мы упорно продолжаем то, что уже не нужно, потому что «столько вложено»: как работает эта ловушка и как отличить настойчивость от упрямства.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-sunkcost.html' },
    { id: 'placebo', title: 'Эффект плацебо и ноцебо', tag: 'Плацебо и ноцебо', tagClass: 'placebo', desc: 'Как ожидания влияют на самочувствие: что такое плацебо и ноцебо, что у них доказано и почему это не повод отказываться от настоящего лечения.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-placebo.html' },
    { id: 'uncanny', title: 'Эффект зловещей долины', tag: 'Зловещая долина', tagClass: 'uncanny', desc: 'Почему почти-человеческие роботы, куклы и анимация иногда кажутся жуткими: гипотеза Масахиро Мори, версии объяснений и что известно на самом деле.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-uncanny.html' },
    { id: 'socialjetlag', title: 'Социальный джетлаг (разница сна в будни и выходные)', tag: 'Социальный джетлаг', tagClass: 'socialjetlag', desc: 'Почему в понедельник так тяжело вставать: что такое социальный джетлаг, как он связан с подростковым возрастом и школьным расписанием и как смягчить его.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-socialjetlag.html' },
    { id: 'shopping', title: 'Шопоголизм (компульсивные покупки)', tag: 'Шопоголизм', tagClass: 'shopping', desc: 'Когда покупки приносят лишь короткое облегчение, а потом остаются вина и вещи, лежащие без дела: признаки, причины, отличие от обычных трат и способы удержаться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-shopping.html' },
    { id: 'sleepinertia', title: 'Сонная инерция (разбитость после пробуждения)', tag: 'Сонная инерция', tagClass: 'sleepinertia', desc: 'Почему сразу после пробуждения мозг «не включается»: что такое сонная инерция, сколько она длится и как помочь себе проснуться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-sleepinertia.html' },
    { id: 'anchoring', title: 'Эффект якоря', tag: 'Эффект якоря', tagClass: 'anchoring', desc: 'Почему первая услышанная цифра влияет на наши решения: от ценников со скидкой до оценки себя, и как не поддаваться «якорю».', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-anchoring.html' },
    { id: 'pygmalion', title: 'Самоисполняющееся пророчество (эффект Пигмалиона)', tag: 'Эффект Пигмалиона', tagClass: 'pygmalion', desc: 'Как ожидания окружающих и наши собственные ожидания влияют на результат: что показал опыт в школе, о чём спорят учёные и как с этим жить.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-pygmalion.html' },
    { id: 'rescuer', title: 'Синдром спасателя (треугольник Карпмана)', tag: 'Синдром спасателя', tagClass: 'rescuer', desc: 'Когда желание помочь превращается в привычку спасать всех, забывая о себе: чем помощь отличается от «спасательства» и что такое треугольник Карпмана.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-rescuer.html' },
    { id: 'ikea', title: 'Эффект IKEA', tag: 'Эффект IKEA', tagClass: 'ikea', desc: 'Почему то, что мы сделали сами, нам кажется ценнее: что показал эксперимент с оригами и мебелью, чем этот эффект полезен и когда мешает.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-ikea.html' },
    { id: 'halo', title: 'Эффект ореола (гало-эффект)', tag: 'Эффект ореола', tagClass: 'halo', desc: 'Почему одно яркое качество человека заставляет нас приписывать ему и другие: как работает «ореол», как он влияет на оценки и как смотреть на людей объективнее.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-halo.html' },
    { id: 'forgetting', title: 'Кривая забывания и интервальные повторения', tag: 'Кривая забывания', tagClass: 'forgetting', desc: 'Как мы забываем выученное и как запоминать надолго: кривая Эббингауза, интервальные повторения и самопроверка — что подтверждено исследованиями.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-forgetting.html' },
    { id: 'loafing', title: 'Социальная лень (эффект Рингельмана)', tag: 'Социальная лень', tagClass: 'loafing', desc: 'Почему в группе мы работаем меньше, чем в одиночку: что показали опыты с канатом и аплодисментами и как делать командные проекты справедливо.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-loafing.html' },
    { id: 'mereexposure', title: 'Эффект простого воздействия (эффект знакомства)', tag: 'Эффект знакомства', tagClass: 'mereexposure', desc: 'Почему то, что мы видим или слышим часто, начинает нам нравиться: что показал Зайонц, почему песня «прилипает» и как это использует реклама.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-mereexposure.html' },
    { id: 'identity', title: 'Кризис идентичности в подростковом возрасте («кто я?»)', tag: 'Кризис идентичности', tagClass: 'identity', desc: 'Вопрос «кто я и чего хочу?» в подростковом возрасте: что такое идентичность по Эриксону и Марсиа, почему неопределённость — нормальный этап и как себе помочь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-identity.html' },
    { id: 'infantamnesia', title: 'Детская амнезия (почему мы не помним раннее детство)', tag: 'Детская амнезия', tagClass: 'infantamnesia', desc: 'Почему почти никто не помнит себя до 3–4 лет, хотя это время важно для развития: что известно о причинах и почему это не болезнь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-infantamnesia.html' },
    { id: 'paranoia', title: 'Паранойя и бредовое расстройство (бред преследования)', tag: 'Паранойя', tagClass: 'paranoia', desc: 'Чем бытовая подозрительность отличается от паранойи как симптома и бредового расстройства, какие бывают виды бреда и как помогать себе и близким.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-paranoia.html' },
    { id: 'pica', title: 'Пикацизм (поедание несъедобного)', tag: 'Пикацизм', tagClass: 'pica', desc: 'Устойчивая тяга есть несъедобное: что это за расстройство, почему возникает (в том числе из-за дефицита железа), чем опасно и как лечится.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-pica.html' },
    { id: 'dementia', title: 'Деменция (слабоумие)', tag: 'Деменция', tagClass: 'dementia', desc: 'Что такое деменция, чем она отличается от обычной забывчивости, какие бывают виды, можно ли что-то предотвратить и как общаться с близким человеком.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-dementia.html' },
    { id: 'alzheimer', title: 'Болезнь Альцгеймера', tag: 'Болезнь Альцгеймера', tagClass: 'alzheimer', desc: 'Самая частая причина деменции: первые признаки, что происходит в мозге, как ставят диагноз, какая помощь существует и как относиться к больному и его семье.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-alzheimer.html' },
    { id: 'cotard', title: 'Синдром Котара (бред отрицания)', tag: 'Синдром Котара', tagClass: 'cotard', desc: 'Редкое состояние, при котором человек уверен, что его тело или он сам перестали существовать: чем оно вызвано, как проявляется и почему нужна срочная помощь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-cotard.html' },
    { id: 'prosopagnosia', title: 'Прозопагнозия (лицевая слепота)', tag: 'Прозопагнозия', tagClass: 'prosopagnosia', desc: 'Невозможность узнавать лица при нормальном зрении: бывает врождённой и приобретённой, встречается чаще, чем кажется, и не связана с интеллектом.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-prosopagnosia.html' },
    { id: 'alicewonder', title: 'Синдром Алисы в Стране чудес (микропсия и макропсия)', tag: 'Синдром Алисы', tagClass: 'alicewonder', desc: 'Временные искажения размеров предметов и собственного тела: что такое микро- и макропсия, чем они вызваны и когда это повод к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-alicewonder.html' },
    { id: 'lycanthropy', title: 'Клиническая ликантропия (зооантропия)', tag: 'Ликантропия', tagClass: 'lycanthropy', desc: 'Очень редкий психиатрический синдром, при котором человек уверен, что превратился в животное: чем он отличается от легенд и увлечений и как его лечат.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-lycanthropy.html' },
    { id: 'alienhand', title: 'Синдром чужой руки', tag: 'Синдром чужой руки', tagClass: 'alienhand', desc: 'Редкое неврологическое состояние, при котором рука совершает действия против воли человека: виды, причины и что делать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-alienhand.html' },
    { id: 'doubles', title: 'Синдромы двойников (Капгра, Фреголи и другие)', tag: 'Синдромы двойников', tagClass: 'doubles', desc: 'Редкие расстройства узнавания людей: когда близкий кажется подменённым (Капгра) или чужие кажутся одним переодетым человеком (Фреголи). Причины и помощь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-doubles.html' },
    { id: 'presence', title: 'Ощущение чужого присутствия (феномен «третьего»)', tag: 'Ощущение присутствия', tagClass: 'presence', desc: 'Уверенность, что рядом кто-то есть, хотя там никого нет: как часто это бывает, при каких условиях возникает и когда стоит обратиться к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-presence.html' },
    { id: 'confusional', title: 'Просоночные состояния (спутанное пробуждение)', tag: 'Просоночные состояния', tagClass: 'confusional', desc: 'Спутанность и странное поведение сразу после внезапного пробуждения: что это за парасомния, чем она отличается от сонной инерции и как помочь себе и близким.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-confusional.html' },
    { id: 'kleinelevin', title: 'Синдром Клейне — Левина («спящая красавица»)', tag: 'Синдром Клейне — Левина', tagClass: 'kleinelevin', desc: 'Очень редкое расстройство, при котором подросток периодически «проваливается» в сон на дни и недели: как проявляется, чем отличается от лени и депрессии и что известно о лечении.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-kleinelevin.html' },
    { id: 'ffi', title: 'Фатальная семейная бессонница', tag: 'Фатальная семейная бессонница', tagClass: 'ffi', desc: 'Крайне редкая наследственная болезнь мозга, при которой прогрессирует бессонница: что это за прионное заболевание и почему обычная бессонница с ней не связана.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-ffi.html' },
    { id: 'ekbom', title: 'Дерматозойный бред (синдром Экбома)', tag: 'Дерматозойный бред', tagClass: 'ekbom', desc: 'Устойчивая уверенность, что в коже живут паразиты или насекомые, хотя врачи их не находят: как проявляется, откуда берётся и как помочь без споров.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-ekbom.html' },
    { id: 'urbach', title: 'Болезнь Урбаха — Вите (липоидный протеиноз)', tag: 'Болезнь Урбаха — Вите', tagClass: 'urbach', desc: 'Редкая наследственная болезнь, из-за которой в мозге может повреждаться миндалевидное тело: как она проявляется и что показали исследования о страхе.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-urbach.html' },
    { id: 'akinetopsia', title: 'Акинетопсия (слепота к движению)', tag: 'Акинетопсия', tagClass: 'akinetopsia', desc: 'Редкое нарушение зрения, при котором человек видит неподвижные предметы нормально, а движение — как набор отдельных «кадров»: причины, проявления и помощь.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-akinetopsia.html' },
    { id: 'savant', title: 'Синдром саванта', tag: 'Синдром саванта', tagClass: 'savant', desc: 'Редкое сочетание особенностей развития с исключительными способностями в узкой области — памяти, музыке, рисунку или счёту: что известно и каковы мифы.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-savant.html' },
    { id: 'survivor', title: 'Чувство вины выжившего', tag: 'Вина выжившего', tagClass: 'survivor', desc: '«Почему я, а не он?»: откуда берётся вина за то, что остался жив или невредим, чем она отличается от настоящей ответственности и что помогает.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-survivor.html' },
    { id: 'sportplacebo', title: 'Эффект плацебо в спорте (ожидание результата)', tag: 'Плацебо в спорте', tagClass: 'sportplacebo', desc: 'Как вера в «волшебный» напиток, ритуал или талисман влияет на результат и чем опасны негативные ожидания: что показывают исследования и как использовать настрой честно.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-sportplacebo.html' },
    { id: 'lakewobegon', title: 'Эффект Лейк-Вобегон (иллюзия превосходства)', tag: 'Эффект Лейк-Вобегон', tagClass: 'lakewobegon', desc: 'Почему большинство людей считают себя умнее, добрее и водят лучше «среднего»: откуда название, что показывают исследования и как оценивать себя трезво.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-lakewobegon.html' },
    { id: 'stagefright', title: 'Страх публичных выступлений', tag: 'Страх выступлений', tagClass: 'stagefright', desc: 'Дрожь в голосе, «пустая голова» и желание провалиться сквозь землю перед классом: откуда берётся страх выступлений и какие приёмы реально помогают.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-stagefright.html' },
    { id: 'detox', title: 'Цифровой детокс', tag: 'Цифровой детокс', tagClass: 'detox', desc: 'Перерыв от телефона и соцсетей без самонаказания: что известно из исследований, когда он полезен и как сделать его мягким и выполнимым.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-detox.html' },
    { id: 'watchman', title: '«Синдром вахтёра» в соцсетях (контроль чужого поведения)', tag: '«Синдром вахтёра»', tagClass: 'watchman', desc: 'Привычка «охранять порядок» в комментариях и проверять чужие страницы: откуда берётся, чем вредит и как отличить заботу от контроля.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-watchman.html' },
    { id: 'streisand', title: 'Эффект Стрейзанд', tag: 'Эффект Стрейзанд', tagClass: 'streisand', desc: 'Почему попытка удалить что-то из интернета иногда лишь привлекает больше внимания: откуда название, как это работает и что делать, если неприятное появилось в сети.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-streisand.html' },
    { id: 'laststraw', title: 'Эффект «последней капли» (накопленный стресс)', tag: '«Последняя капля»', tagClass: 'laststraw', desc: 'Почему человек срывается из-за мелочи после долгого терпения: как накапливается стресс и как «сливать» напряжение, не дожидаясь переполнения.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-laststraw.html' },
    { id: 'fas', title: 'Синдром иностранного акцента', tag: 'Иностранный акцент', tagClass: 'fas', desc: 'Когда речь вдруг начинает звучать «как у иностранца»: что это за редкое состояние, из-за чего оно возникает и почему при внезапных изменениях речи нужна срочная помощь.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-fas.html' },
    { id: 'lark', title: 'Хронотип «жаворонок»', tag: 'Жаворонок', tagClass: 'lark', desc: 'Что такое хронотип «жаворонок», как он связан с генами и возрастом и как строить день, чтобы режим работал на вас, а не против.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-lark.html' },
    { id: 'illusions', title: 'Оптические иллюзии', tag: 'Оптические иллюзии', tagClass: 'illusions', desc: 'Почему мы видим то, чего нет, и не замечаем то, что есть: как работают оптические иллюзии, чем они отличаются от галлюцинаций и когда зрение нужно проверить у врача.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-illusions.html' },
    { id: 'pareidolia', title: 'Пареидолия (лица в облаках и розетках)', tag: 'Пареидолия', tagClass: 'pareidolia', desc: 'Почему в облаках, розетках и пятнах мерещатся лица: что такое пареидолия, чем она отличается от галлюцинаций и когда это повод обратиться к врачу.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-pareidolia.html' },
    { id: 'toxic', title: 'Токсичные люди и токсичное поведение', tag: 'Токсичность', tagClass: 'toxic', desc: 'Что на самом деле стоит за словом «токсик», чем токсичное поведение отличается от трудного периода и что делать, если оно рядом с вами или в вас.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-toxic.html' },
    { id: 'toxparents', title: 'Токсичные или проблемные родители', tag: 'Токсичные родители', tagClass: 'toxparents', desc: 'Как проявляются токсичные родители, к чему это приводит и как понять произошедшее, не повторив его в собственной жизни и семье.', readTime: '9 мин', available: true, href: 'Wiki/wiki-article-toxparents.html' },
    { id: 'infidelity', title: 'Измена (предательство в отношениях)', tag: 'Измена', tagClass: 'infidelity', desc: 'Что происходит, когда тебе изменили, что делать в первые дни, как не навредить себе и другим и как решить: остаться или уйти.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-infidelity.html' },
    { id: 'divorce', title: 'Развод: как пережить и что делать', tag: 'Развод', tagClass: 'divorce', desc: 'Какие чувства нормальны при разводе, что помогает пережить его, что важно знать о праве и как поддержать детей (и что знать подростку).', readTime: '9 мин', available: true, href: 'Wiki/wiki-article-divorce.html' },
    { id: 'breakup', title: 'Расставание: как пережить разрыв отношений', tag: 'Расставание', tagClass: 'breakup', desc: 'Почему расставание болит так сильно, сколько это длится в норме, что помогает, чего не стоит делать и когда нужна помощь.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-breakup.html' },
    { id: 'humiliation', title: 'Унижение', tag: 'Унижение', tagClass: 'humiliation', desc: 'Чем унижение отличается от критики и шутки, почему оно так ранит, что делать, если унижают вас, и как остановиться, если унижаете вы.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-humiliation.html' },
    { id: 'insult', title: 'Оскорбление и ответственность за него (ст. 5.61 КоАП РФ)', tag: 'Оскорбление', tagClass: 'insult', desc: 'Что такое оскорбление, почему люди срываются, чем это грозит по ст. 5.61 КоАП РФ и что делать, если оскорбили вас или сорвались вы.', readTime: '9 мин', available: true, href: 'Wiki/wiki-article-insult.html' },
    { id: 'crossing', title: 'Нарушение чужих границ: когда мы переступаем черту', tag: 'Чужие границы', tagClass: 'crossing', desc: 'Что делать, когда вы нарушили чужие границы: как это заметить, почему так получается, чем это грозит и как извиниться и вести себя иначе.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-crossing.html' },
    { id: 'aggression', title: 'Агрессия: виды, причины и последствия', tag: 'Агрессия', tagClass: 'aggression', desc: 'Чем агрессия отличается от гнева, какие бывает, откуда берётся, что реально помогает остановиться и чем грозит по закону.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-aggression.html' },
    { id: 'jealousy', title: 'Ревность', tag: 'Ревность', tagClass: 'jealousy', desc: 'Чем ревность отличается от зависти, откуда берётся, когда она нормальна, а когда становится контролем, и что с ней делать.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-jealousy.html' },
    { id: 'passiveagg', title: 'Пассивная агрессия', tag: 'Пассивная агрессия', tagClass: 'passiveagg', desc: 'Что такое пассивная агрессия, как её распознать, почему недовольство выражают косвенно и как отвечать на неё и меняться самому.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-passiveagg.html' },
    { id: 'silenttreat', title: 'Игнорирование и бойкот (молчаливое наказание)', tag: 'Игнорирование и бойкот', tagClass: 'silenttreat', desc: 'Чем молчаливое наказание отличается от паузы, как игнор действует на человека и что делать, если вас игнорируют или бойкотируют.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-silenttreat.html' },
    { id: 'emoblackmail', title: 'Эмоциональный шантаж', tag: 'Эмоциональный шантаж', tagClass: 'emoblackmail', desc: 'Как работает давление через страх, долг и вину, как его распознать, как отвечать и когда это уже вымогательство.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-emoblackmail.html' },
    { id: 'resentment', title: 'Обида и прощение', tag: 'Обида', tagClass: 'resentment', desc: 'Что такое обида, почему мы «застреваем» в ней, как её проговаривать, что такое прощение и когда прощать не нужно.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-resentment.html' },
    { id: 'overcontrol', title: 'Гиперопека и жёсткий контроль со стороны родителей', tag: 'Гиперопека и контроль', tagClass: 'overcontrol', desc: 'Чем разумная забота отличается от гиперопеки и контроля, что это делает с подростком и как поговорить с родителями (и что делать самим родителям).', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-overcontrol.html' },
    { id: 'manipulation', title: 'Манипуляции в общении', tag: 'Манипуляции', tagClass: 'manipulation', desc: 'Как распознать манипуляцию, чем она отличается от честного влияния, какие приёмы встречаются чаще всего (в том числе у мошенников) и как защититься.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-manipulation.html' },
    { id: 'stalking', title: 'Сталкинг (навязчивое преследование)', tag: 'Сталкинг', tagClass: 'stalking', desc: 'Что такое сталкинг, как он выглядит офлайн и в сети, что делать, если вас преследуют, и что делать, если вы замечаете такое поведение у себя.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-stalking.html' },
    { id: 'psychopathy', title: 'Психопатия (психопатические черты)', tag: 'Психопатия', tagClass: 'psychopathy', desc: 'Что на самом деле означает слово «психопатия», чем оно отличается от диагнозов и нарциссизма, что известно о причинах и лечении и как защитить себя.', readTime: '9 мин', available: true, href: 'Wiki/wiki-article-psychopathy.html' },
    { id: 'doomscrolling', title: 'Думскроллинг (бесконечное листание плохих новостей)', tag: 'Думскроллинг', tagClass: 'doomscrolling', desc: 'Почему мы не можем оторваться от ленты с тревожными новостями, как это влияет на настроение и сон и что помогает остановиться.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-doomscrolling.html' },
    { id: 'hypocrisy', title: 'Лицемерие', tag: 'Лицемерие', tagClass: 'hypocrisy', desc: 'Что такое лицемерие, чем оно отличается от вежливости, почему мы замечаем его у других, но не у себя, и как жить рядом с ним и не стать циником.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-hypocrisy.html' },
    { id: 'hatred', title: 'Ненависть', tag: 'Ненависть', tagClass: 'hatred', desc: 'Чем ненависть отличается от гнева, откуда берётся, чем вредит, что об этом говорит закон и как с ней справляться.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-hatred.html' },
    { id: 'ambivalence', title: 'Двойственные мысли и внутренний конфликт («ангел и дьявол»)', tag: 'Внутренний конфликт', tagClass: 'ambivalence', desc: 'Почему в голове словно «ангел и дьявол», что такое амбивалентность, чем это отличается от «голосов» при психозе и как принимать решения.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-ambivalence.html' },
    { id: 'ego', title: 'Эго (психологическое «Я» и «большое эго»)', tag: 'Эго', tagClass: 'ego', desc: 'Что означает «эго» в психологии и в быту, чем оно отличается от эгоизма и нарциссизма, что такое здоровое и раздутое эго и как с ним ладить.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-ego.html' },
    { id: 'thinking', title: 'Как работает мышление: интуиция и рассудок', tag: 'Мышление и рассудок', tagClass: 'thinking', desc: 'Как мы думаем: быстрая интуиция и медленное обдумывание, почему рассудок «отключается» в стрессе и как принимать более взвешенные решения.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-thinking.html' },
    { id: 'sameagain', title: 'Повторять одно и то же и ждать другого результата («безумие»)', tag: 'Повторение одного и того же', tagClass: 'sameagain', desc: 'Почему мы снова и снова делаем то, что не работает, откуда берутся повторяющиеся сценарии и как выйти из круга, не браня себя.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-sameagain.html' },
    { id: 'meteo', title: 'Метеочувствительность («метеозависимость»)', tag: 'Метеочувствительность', tagClass: 'meteo', desc: 'Что известно о влиянии погоды на самочувствие и настроение, что подтверждается исследованиями, а что нет, и что делать, если вы чувствуете погоду.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-meteo.html' },
    { id: 'subjage', title: 'Субъективный возраст («на сколько лет я себя чувствую»)', tag: 'Субъективный возраст', tagClass: 'subjage', desc: 'Что такое субъективный возраст, почему после 25–30 лет мы чаще чувствуем себя моложе паспорта и как возрастные установки влияют на жизнь.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-subjage.html' },
    { id: 'pseudopreg', title: 'Ложная беременность (псевдоциез)', tag: 'Ложная беременность', tagClass: 'pseudopreg', desc: 'Когда человек искренне верит в беременность и ощущает её признаки, но врач её не находит: что такое псевдоциез, почему он возникает и как помогают.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-pseudopreg.html' },
    { id: 'bwthinking', title: 'Чёрно-белое мышление (мышление «всё или ничего»)', tag: 'Чёрно-белое мышление', tagClass: 'bwthinking', desc: 'Когда всё либо идеально, либо ужасно: откуда берётся мышление «всё или ничего», чем оно мешает и как научиться видеть оттенки, а не только чёрное и белое.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-bwthinking.html' },
    { id: 'aphantasia', title: 'Афантазия (когда не получается «увидеть» картинку в уме)', tag: 'Афантазия', tagClass: 'aphantasia', desc: 'Что такое афантазия: почему некоторые люди не могут «увидеть» яблоко или лицо в уме, чем это отличается от отсутствия воображения и как с этим жить.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-aphantasia.html' },
    { id: 'synesthesia', title: 'Синестезия («слышать цвета» и «видеть звуки»)', tag: 'Синестезия', tagClass: 'synesthesia', desc: 'Когда буквы имеют цвет, а звуки — вкус: что такое синестезия, какие виды бывают, чем она отличается от метафор и галлюцинаций и опасна ли она.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-synesthesia.html' },
    { id: 'lucid', title: 'Люцидные (осознанные) сны', tag: 'Осознанные сны', tagClass: 'lucid', desc: 'Когда во сне понимаешь, что спишь: что такое люцидные сны, как часто они бывают, что о них известно науке и почему сон важнее любых экспериментов.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-lucid.html' },
    { id: 'survivorship', title: 'Ошибка выжившего', tag: 'Ошибка выжившего', tagClass: 'survivorship', desc: 'Почему истории успеха обманывают: что такое ошибка выжившего, как она работает на примерах (от самолётов до «бросил вуз — стал миллиардером») и как не попадаться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-survivorship.html' },
    { id: 'framing', title: 'Эффект рамки (эффект фрейминга)', tag: 'Эффект рамки', tagClass: 'framing', desc: 'Почему от формулировки зависит выбор: что такое эффект рамки, как его показали Канеман и Тверски, где мы с ним сталкиваемся каждый день и как смотреть на информацию в обе стороны.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-framing.html' },
    { id: 'empathy', title: 'Эмпатия и эмоциональное заражение', tag: 'Эмпатия', tagClass: 'empathy', desc: 'Чем эмпатия отличается от сочувствия и эмоционального заражения, почему чужое настроение «передаётся», что такое усталость от сострадания и как помогать, не растворяясь в чужих чувствах.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-empathy.html' },
    { id: 'neurodiv', title: 'Нейроразнообразие', tag: 'Нейроразнообразие', tagClass: 'neurodiv', desc: 'Что значит «нейроотличный» и «нейротипичный»: идея нейроразнообразия, каких людей к нему относят, чем она полезна, о чём спорят и почему поддержка и принятие не противоречат друг другу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-neurodiv.html' },
    { id: 'hyperfocus', title: 'Гиперфокус', tag: 'Гиперфокус', tagClass: 'hyperfocus', desc: 'Когда увлечённость превращается в «выпадение» из реальности: что такое гиперфокус, чем он отличается от состояния потока, как связан с СДВГ и аутизмом и как научиться вовремя останавливаться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-hyperfocus.html' },
    { id: 'capgras', title: 'Синдром Капгра (бред «двойников»)', tag: 'Синдром Капгра', tagClass: 'capgras', desc: 'Когда близкий человек кажется «подменённым двойником»: что такое синдром Капгра, при каких состояниях он встречается, почему это не «странность характера» и как вести себя рядом с таким человеком.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-capgras.html' },
    { id: 'jamaisvu', title: 'Жамевю («никогда не виденное»)', tag: 'Жамевю', tagClass: 'jamaisvu', desc: 'Когда знакомое вдруг кажется чужим: что такое жамевю, чем оно отличается от дежавю, почему слово при многократном повторении теряет смысл и когда стоит обратиться к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-jamaisvu.html' },
    { id: 'warmglow', title: 'Альтруизм и эффект «тёплого свечения»', tag: 'Тёплое свечение', tagClass: 'warmglow', desc: 'Почему помощь другим приятна: что такое эффект «тёплого свечения», бывает ли «чистый» альтруизм, как не превратить помощь в самоцель и не попасться на уловки.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-warmglow.html' },
    { id: 'lossaversion', title: 'Страх потери и страх упущенной выгоды (неприятие потерь)', tag: 'Страх потери', tagClass: 'lossaversion', desc: 'Почему потерять больнее, чем найти, и чем страх потерять своё отличается от страха упустить возможность: что такое неприятие потерь, эффект владения и как принимать решения спокойнее.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-lossaversion.html' },
    { id: 'cfs', title: 'Синдром хронической усталости (миалгический энцефаломиелит)', tag: 'Хроническая усталость', tagClass: 'cfs', desc: 'Когда усталость не проходит после отдыха месяцами: что такое синдром хронической усталости, чем он отличается от обычной усталости, выгорания и депрессии, как его диагностируют и что помогает.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-cfs.html' },
    { id: 'decisionfatigue', title: 'Ментальная усталость от решений', tag: 'Усталость от решений', tagClass: 'decisionfatigue', desc: 'Почему к вечеру трудно решить даже простое: что такое усталость от решений, что в этой идее доказано, а что нет, и как упростить себе выбор.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-decisionfatigue.html' },
    { id: 'hyperacusis', title: 'Звукочувствительность (гиперакузия)', tag: 'Звукочувствительность', tagClass: 'hyperacusis', desc: 'Когда обычные звуки кажутся слишком громкими и неприятными: что такое гиперакузия, чем она отличается от мисофонии, как беречь слух в наушниках и когда пора к врачу.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-hyperacusis.html' },
    { id: 'gossip', title: 'Сплетни и слухи', tag: 'Сплетни', tagClass: 'gossip', desc: 'Почему люди обсуждают других и как слухи искажаются по дороге: чем сплетни отличаются от клеветы, когда они вредят и что делать, если сплетничают о вас.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-gossip.html' },
    { id: 'slander', title: 'Клевета', tag: 'Клевета', tagClass: 'slander', desc: 'Чем клевета отличается от оскорбления, критики и сплетен, как она влияет на человека и что делать: сохранить доказательства, не отвечать тем же, обратиться за помощью.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-slander.html' },
    { id: 'aidep', title: 'ИИ вместо людей: когда общение с нейросетью вытесняет живое', tag: 'ИИ вместо людей', tagClass: 'aidep', desc: 'Когда общение с нейросетью помогает, а когда начинает вытеснять живые отношения: чем это отличается от зависимости, на какие признаки смотреть и как вернуть баланс.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-aidep.html' },
    { id: 'doomscroll', title: 'Думскроллинг (бесконечная лента тревожных новостей)', tag: 'Думскроллинг', tagClass: 'doomscroll', desc: 'Почему так трудно оторваться от тревожных новостей и чем это плохо для сна и настроения: как работает бесконечная лента и что помогает читать новости спокойнее.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-doomscroll.html' },
    { id: 'teenage', title: 'Переходный возраст', tag: 'Переходный возраст', tagClass: 'teenage', desc: 'Что на самом деле происходит с психикой подростка: зачем нужны бунт и друзья, что нормально, а что повод обратиться к психологу, и как родителям сохранить контакт.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-teenage.html' },
    { id: 'arachno', title: 'Арахнофобия (страх пауков)', tag: 'Арахнофобия', tagClass: 'arachno', desc: 'Почему одни люди боятся пауков до паники: как проявляется арахнофобия, откуда она берётся и как с ней справляются, в том числе за одну длительную сессию терапии.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-arachno.html' },
    { id: 'claustro', title: 'Клаустрофобия (страх замкнутых пространств)', tag: 'Клаустрофобия', tagClass: 'claustro', desc: 'Что такое клаустрофобия: как проявляется страх лифта, метро и МРТ, чем он питается и что помогает, в том числе при обследовании в томографе.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-claustro.html' },
    { id: 'aerophobia', title: 'Аэрофобия (страх полётов)', tag: 'Страх полётов', tagClass: 'aerophobia', desc: 'Откуда берётся страх летать и из чего он складывается: что говорят факты о безопасности полётов, какие приёмы помогают в самолёте и когда нужен психолог.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-aerophobia.html' },
    { id: 'bloodphobia', title: 'Страх крови, ран и уколов (гемофобия, трипанофобия)', tag: 'Страх крови и уколов', tagClass: 'bloodphobia', desc: 'Почему от вида крови или укола кружится голова и можно потерять сознание: чем этот страх отличается от других фобий и какие приёмы помогают сдать анализы и сделать прививку.', readTime: '3 мин', available: true, href: 'Wiki/wiki-article-bloodphobia.html' },
    { id: 'pdisorders', title: 'Расстройства личности (обзор: типы и кластеры)', tag: 'Расстройства личности', tagClass: 'pdisorders', desc: 'Что такое расстройства личности, на какие группы (кластеры) их делят и почему это не «плохой характер».', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-pdisorders.html' },
    { id: 'defense', title: 'Защитные механизмы психики', tag: 'Защитные механизмы', tagClass: 'defense', desc: 'Как психика бессознательно защищает от тревоги и боли: вытеснение, отрицание, проекция, рационализация и другие.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-defense.html' },
    { id: 'maslow', title: 'Пирамида потребностей Маслоу', tag: 'Пирамида Маслоу', tagClass: 'maslow', desc: 'Пять уровней человеческих потребностей: от еды и безопасности до самореализации — и что из этого верно, а что нет.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-maslow.html' },
    { id: 'misreading', title: '«Мисридинг»: ошибки при чтении (когда читаешь не то, что написано)', tag: 'Ошибки при чтении', tagClass: 'misreading', desc: 'Почему мы иногда читаем «плохих» вместо «похожих»: как мозг угадывает слова, при чём тут настроение и чем это отличается от дислексии.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-misreading.html' },
    { id: 'workmem', title: 'Рабочая память', tag: 'Рабочая память', tagClass: 'workmem', desc: 'Память «здесь и сейчас»: почему можно хорошо помнить факты, но терять нить прочитанного или услышанного.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-workmem.html' },
    { id: 'mindwander', title: 'Блуждание ума (когда во время чтения или слушания мысли «уходят в сторону»)', tag: 'Блуждание ума', tagClass: 'mindwander', desc: 'Почему мы можем «прочитать» страницу и не понять, о чём она: что такое блуждание ума, чем оно полезно и как возвращаться к тексту.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-mindwander.html' },
    { id: 'confirmation', title: 'Склонность к подтверждению (confirmation bias)', tag: 'Склонность к подтверждению', tagClass: 'confirmation', desc: 'Почему мы замечаем факты, которые подтверждают наше мнение, и не замечаем остальные — и как научиться проверять себя.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-confirmation.html' },
    { id: 'falsememory', title: 'Ложные воспоминания', tag: 'Ложные воспоминания', tagClass: 'falsememory', desc: 'Почему можно уверенно «помнить» то, чего не было, и что показали опыты Элизабет Лофтус.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-falsememory.html' },
    { id: 'sleepparalysis', title: 'Сонный паралич', tag: 'Сонный паралич', tagClass: 'sleepparalysis', desc: 'Почему при пробуждении можно на несколько секунд «застрять» без возможности пошевелиться — и почему это пугающе, но не опасно.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-sleepparalysis.html' },
    { id: 'midlife', title: 'Кризис среднего возраста', tag: 'Кризис среднего возраста', tagClass: 'midlife', desc: 'Что такое кризис середины жизни, бывает ли он у всех и как отличить его от депрессии.', readTime: '5 мин', available: true, href: 'Wiki/wiki-article-midlife.html' },
    { id: 'acrophobia', title: 'Акрофобия (страх высоты)', tag: 'Страх высоты', tagClass: 'acrophobia', desc: 'Почему при взгляде вниз кружится голова и дрожат ноги, чем страх высоты отличается от фобии и как с ним справляться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-acrophobia.html' },
    { id: 'nyctophobia', title: 'Никтофобия (страх темноты)', tag: 'Страх темноты', tagClass: 'nyctophobia', desc: 'Почему в темноте становится тревожно, когда это нормально для детей и взрослых и что помогает спокойно засыпать.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-nyctophobia.html' },
    { id: 'cynophobia', title: 'Кинофобия (страх собак)', tag: 'Страх собак', tagClass: 'cynophobia', desc: 'Откуда берётся страх собак, как вести себя при встрече с незнакомой собакой и как постепенно перестать бояться.', readTime: '4 мин', available: true, href: 'Wiki/wiki-article-cynophobia.html' },
    { id: 'technophobia', title: 'Технофобия и тревога перед технологиями (страх пользоваться смартфоном и компьютером)', tag: 'Технофобия', tagClass: 'technophobia', desc: 'Почему одни люди боятся нажать «не туда» на смартфоне или компьютере, чем это отличается от фобии и от простого нежелания пользоваться техникой.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-technophobia.html' },
    { id: 'maleloneliness', title: 'Мужское одиночество (когда не с кем поговорить по душам)', tag: 'Мужское одиночество', tagClass: 'maleloneliness', desc: 'Когда рядом есть люди, но не с кем поговорить откровенно: что такое мужское одиночество, что известно из исследований и как постепенно выстраивать близкие связи.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-maleloneliness.html' },
    { id: 'youthfuture', title: 'Молодые взрослые и тревога о будущем (работа, жильё, самостоятельность)', tag: 'Молодёжь и будущее', tagClass: 'youthfuture', desc: 'Работа, жильё, цены и ощущение, что «всё сложнее, чем у родителей»: что в тревоге молодых людей (зумеров) о будущем правда, что преувеличение и что помогает справляться.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-youthfuture.html' },
    { id: 'norelations', title: 'Отказ от отношений: осознанный выбор или избегание?', tag: 'Отказ от отношений', tagClass: 'norelations', desc: 'Почему многие молодые люди откладывают отношения или не хотят их: как отличить осознанный выбор от страха близости и что делать, если одиночество стало болезненным.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-norelations.html' },
    { id: 'datingtalk', title: 'Знакомство и общение с человеком, который нравится (психология разговора)', tag: 'Знакомство и общение', tagClass: 'datingtalk', desc: 'Как начать разговор, слушать, писать без навязчивости, принимать отказ и справляться со стеснением: ключевые психологические принципы знакомства без «секретных приёмов».', readTime: '9 мин', available: true, href: 'Wiki/wiki-article-datingtalk.html' },
    { id: 'maturity', title: 'Психологическая зрелость и позднее взросление (почему люди взрослеют в разном темпе)', tag: 'Психологическая зрелость', tagClass: 'maturity', desc: 'Почему в 20 и даже в 30 лет человек может чувствовать себя «как подросток»: что такое психологическая зрелость, от чего зависит её темп и как развивать самостоятельность без стыда.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-maturity.html' },
    { id: 'tulpa', title: 'Тульпа и воображаемые собеседники (что это и когда стоит обратиться к специалисту)', tag: 'Тульпа', tagClass: 'tulpa', desc: 'Что такое тульпа, откуда пришло это слово, что об этом известно науке, чем практика отличается от расстройств и когда стоит обратиться к специалисту.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-tulpa.html' },
    { id: 'quadrobics', title: 'Квадробика и квадроберы (что это и когда стоит обратиться к специалисту)', tag: 'Квадроберы', tagClass: 'quadrobics', desc: 'Что такое квадробика и квадроберство, чем это отличается от клинической ликантропии, почему увлекает подростков и когда стоит обратиться к специалисту.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-quadrobics.html' },
    { id: 'doom', title: 'Предчувствие беды и чувство обречённости («что-то случится»)', tag: 'Предчувствие беды', tagClass: 'doom', desc: 'Почему появляется ощущение, что вот-вот случится что-то плохое: тревога, паника, травма и «магическое мышление». Как отличить чувство от факта и как успокоиться.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-doom.html' },
    { id: 'emptiness', title: 'Чувство внутренней пустоты («внутри ничего нет»)', tag: 'Внутренняя пустота', tagClass: 'emptiness', desc: 'Откуда берётся ощущение внутренней пустоты, как оно связано с депрессией, эмоциональным онемением и выгоранием и что помогает вернуть контакт с собой.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-emptiness.html' },
    { id: 'entrapment', title: 'Ощущение замкнутости и безвыходности («я в ловушке»)', tag: 'Безвыходность', tagClass: 'entrapment', desc: '«Стены давят», «замкнутый круг», «некуда деться»: откуда берётся чувство ловушки, чем оно отличается от клаустрофобии и что помогает найти выход.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-entrapment.html' },
    { id: 'existential', title: 'Экзистенциальный кризис (потеря смысла и вопрос «зачем всё это?»)', tag: 'Экзистенциальный кризис', tagClass: 'existential', desc: 'Когда возникает экзистенциальный кризис, чем он отличается от депрессии, как вернуть ощущение смысла и когда стоит обратиться к специалисту.', readTime: '6 мин', available: true, href: 'Wiki/wiki-article-existential.html' },
    { id: 'lifechange', title: 'Перемены в жизни: как пережить их, если они тяжело ударили', tag: 'Перемены в жизни', tagClass: 'lifechange', desc: 'Почему даже перемены к лучшему выбивают из колеи, как восстановить опору, сколько длится адаптация и когда пора обратиться за помощью.', readTime: '7 мин', available: true, href: 'Wiki/wiki-article-lifechange.html' },
    { id: 'lostcursed', title: 'Ощущение потерянности и «проклятости» мира (когда всё кажется обречённым)', tag: 'Потерянность и «проклятость»', tagClass: 'lostcursed', desc: 'Что стоит за чувством «я потерялся» и «мир проклят»: чем оно отличается от депрессии, дереализации и бредовых идей, как вернуть опору.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-lostcursed.html' },
    { id: 'selftalk', title: 'Разговор с самим собой вслух (и почему это не шизофрения)', tag: 'Разговор с собой', tagClass: 'selftalk', desc: 'Нормально ли разговаривать с собой вслух, зачем мы это делаем, чем это отличается от «голосов» и когда стоит обратиться к специалисту.', readTime: '8 мин', available: true, href: 'Wiki/wiki-article-selftalk.html' },
];

/* ══════════════════════════════════════════════════════════════
   РЕНДЕР КАРТОЧЕК + ПАГИНАЦИЯ
══════════════════════════════════════════════════════════════ */
const grid = document.getElementById('wikiGrid');
const emptyState = document.getElementById('emptyState');
const resultsCount = document.getElementById('resultsCount');
const pagination = document.getElementById('pagination');

const PAGE_SIZE = 20;
let currentQuery = '';
let currentPage = 1;

function cardMarkup(a) {
    const inner = `
    <div class="wiki-card-icon icon-${a.tagClass}">${ICONS[a.tagClass] || ''}</div>
    <span class="wiki-card-tag tag-${a.tagClass}">${a.tag}</span>
    <h2>${a.title}</h2>
    <p>${a.desc}</p>
    <div class="wiki-card-meta">
      <span>${a.readTime} на чтение</span>
      ${a.available ? '<span class="wiki-card-cta">Читать <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>' : ''}
    </div>
    ${!a.available ? '<span class="soon-badge">Скоро</span>' : ''}
  `;
    const el = document.createElement(a.available ? 'a' : 'div');
    if (a.available) el.href = a.href;
    el.className = 'wiki-card' + (a.available ? '' : ' is-soon');
    el.dataset.id = a.id;
    el.innerHTML = inner;
    return el;
}

function updateResultsCount(visibleCount) {
    resultsCount.textContent = visibleCount === ARTICLES.length
        ? `Всего статей: ${ARTICLES.length}`
        : `Найдено: ${visibleCount} из ${ARTICLES.length}`;
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
            document.querySelector('.wiki-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function getFilteredArticles(q) {
    return q ? ARTICLES.filter(a => matchesQuery(a, q)) : ARTICLES;
}

function renderPage() {
    const filtered = getFilteredArticles(currentQuery);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    grid.innerHTML = '';
    pageItems.forEach(a => grid.appendChild(cardMarkup(a)));

    emptyState.classList.toggle('show', filtered.length === 0);
    updateResultsCount(filtered.length);
    renderPagination(totalPages);
}

renderPage();


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

function matchesQuery(a, q) {
    return normalize(a.title).includes(q) || normalize(a.tag).includes(q) || normalize(a.desc).includes(q);
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
    const matches = ARTICLES.filter(a => matchesQuery(a, q)).slice(0, 6);
    currentSuggestions = matches;
    activeSuggestIndex = -1;

    if (matches.length === 0) {
        suggestPanel.innerHTML = '<div class="suggest-empty">Совпадений не найдено</div>';
        suggestPanel.classList.add('open');
        return;
    }

    suggestPanel.innerHTML = matches.map((a, i) => `
    <div class="suggest-item" data-index="${i}">
      <span>${highlight(a.title, q)}</span>
      <span class="suggest-tag">${a.tag}</span>
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
    const a = currentSuggestions[i];
    if (!a) return;
    searchInput.value = a.title;
    searchBox.classList.add('has-value');
    currentQuery = normalize(a.title);
    currentPage = 1;
    renderPage();
    closeSuggestions();

    const card = grid.querySelector(`[data-id="${a.id}"]`);
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
   ВОЗВРАТ К СПИСКУ ИЗ СТАТЬИ: та же страница, поиск и прокрутка
   ──────────────────────────────────────────────────────────────
   При клике на карточку статьи запоминаем в sessionStorage номер
   страницы, поисковый запрос и положение прокрутки. Восстанавливаем
   их, только если пользователь ВЕРНУЛСЯ из статьи: кнопкой «Назад»
   браузера (тип навигации back_forward) или кнопкой «Назад на сайт»
   в статье (js/wiki-back.js ставит флаг wikiReturn). Обычный заход
   на wiki.html из меню по-прежнему открывает список с начала.
══════════════════════════════════════════════════════════════ */
const WIKI_STATE_KEY = 'wikiListState';
const WIKI_RETURN_KEY = 'wikiReturn';
const WIKI_STATE_TTL = 6 * 60 * 60 * 1000; // 6 часов

function saveWikiListState() {
    try {
        sessionStorage.setItem(WIKI_STATE_KEY, JSON.stringify({
            page: currentPage,
            query: searchInput.value.trim(),
            scrollY: window.scrollY || document.documentElement.scrollTop || 0,
            ts: Date.now()
        }));
    } catch (e) { /* sessionStorage может быть недоступен — не критично */ }
}

function cameBackToList() {
    let viaFlag = false;
    try {
        viaFlag = sessionStorage.getItem(WIKI_RETURN_KEY) === '1';
        sessionStorage.removeItem(WIKI_RETURN_KEY);
    } catch (e) { }
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    return viaFlag || (nav && nav.type === 'back_forward');
}

function restoreWikiListState() {
    if (!cameBackToList()) return;
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(WIKI_STATE_KEY) || 'null'); } catch (e) { }
    if (!st || !st.ts || Date.now() - st.ts > WIKI_STATE_TTL) return;

    if (st.query) {
        searchInput.value = st.query;
        searchBox.classList.add('has-value');
        currentQuery = normalize(st.query);
    }
    currentPage = st.page || 1;
    renderPage();

    // Браузер сам пытается вернуть прокрутку при «Назад», но до отрисовки
    // списка высота страницы мала — поэтому выставляем её вручную.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const y = st.scrollY || 0;
    const apply = () => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    apply();
    requestAnimationFrame(apply);
    window.addEventListener('load', apply, { once: true });
    // Шрифты/стили могут чуть изменить высоту страницы уже после отрисовки.
    setTimeout(apply, 150);
    setTimeout(apply, 500);
}

grid.addEventListener('click', (e) => {
    if (e.target.closest('a.wiki-card')) saveWikiListState();
});
// Средняя кнопка / Ctrl+клик открывают статью в новой вкладке — список остаётся как есть.

restoreWikiListState();
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