/*!
 * accessibility.js — режим для слабовидящих (и частично слабослышащих)
 * ──────────────────────────────────────────────────────────────────
 * Подключается одной строкой на любой странице сайта:
 *   <link rel="stylesheet" href="css/accessibility.css">
 *   <script src="js/accessibility.js" defer></script>
 * Ничего больше не требует — сам создаёт кнопку и панель, сам
 * применяет настройки к <html> и сохраняет их в localStorage под
 * ключом ms_a11y_settings (согласно принятому в проекте префиксу
 * "ms_" — см. auth.js/who-are-you.js), так что настройки одинаковы
 * на всех страницах и переживают переход между ними.
 *
 * Возможности:
 *  1. Крупный текст (4 шага, через CSS zoom — см. accessibility.css,
 *     там объяснено, почему не font-size).
 *  2. Высокий контраст (чёрный на белом) с отдельной обработкой
 *     пузырей чата, чтобы не терялось «моё сообщение / чужое».
 *  3. Усиленная обводка фокуса при навигации по Tab.
 *  4. Увеличенный курсор.
 *  5. Голосовой ассистент: читает элемент под фокусом (Tab) или под
 *     курсором мыши через встроенный в браузер синтез речи,
 *     умеет прочитать страницу целиком, регулируется скорость речи,
 *     останавливается по Esc или кнопкой «Стоп».
 *  6. Режим для слабослышащих: подписывает голосовые сообщения в
 *     чате видимой пометкой «🔊 аудио», включает субтитры у <video>,
 *     если для них есть текстовая дорожка.
 *  7. Ссылка «Перейти к основному содержимому» — для тех, кто идёт
 *     по Tab и не хочет каждый раз проходить всё меню сначала.
 *  8. Синхронизация с аккаунтом. Гость хранит настройки только в
 *     localStorage. У залогиненного пользователя они дополнительно
 *     лежат на сервере (GET/PUT /api/settings/accessibility) и
 *     применяются при входе с любого устройства. По умолчанию всё
 *     выключено. Правила слияния — в reconcile() ниже.
 *  9. Видимость кнопки. Гость (не вошёл в аккаунт) видит кнопку всегда —
 *     экран входа тоже должен быть доступен. Залогиненный пользователь
 *     видит её, только если включил «Показывать кнопку» в панели ИЛИ у
 *     него включён любой из режимов; иначе кнопки на экране нет, а панель
 *     открывается клавишами Alt+A, ссылкой в начале страницы (по Tab) или
 *     любым элементом с атрибутом data-a11y-open (например, пункт в
 *     «Настройках»).
 *
 * Про шрифт Брайля: не реализован намеренно — обычный экран не
 * может физически выдавливать точки, а имитация точек на плоскости
 * ничего не добавляет к тому, что уже даёт голосовой ассистент +
 * поддержка внешних брайлевских дисплеев (они работают через
 * штатный screen reader операционной системы и не требуют ничего
 * специального от сайта).
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'ms_a11y_settings';
    // id аккаунта, чьи настройки сейчас лежат в кэше. Нет ключа — кэш
    // «гостевой» (настроен без входа). Нужен, чтобы при входе другого
    // человека на общем устройстве не перенести ему чужие настройки.
    var OWNER_KEY = 'ms_a11y_owner';
    // '1' — есть изменения, которые ещё не дошли до сервера
    var DIRTY_KEY = 'ms_a11y_dirty';
    var API_URL = '/api/settings/accessibility';
    var PUSH_DELAY_MS = 600;

    var defaults = {
        textStep: 0,       // 0..4 — шаг увеличения текста
        contrast: false,   // высокий контраст
        focus: false,       // усиленный фокус для Tab-навигации
        cursor: false,       // увеличенный курсор
        voice: false,       // голосовой ассистент (озвучка)
        voiceRate: 1,        // скорость речи 0.7..1.6
        hearing: false,       // режим для слабослышащих
        showButton: false     // показывать кнопку на экране (только залогиненным; гости видят её всегда)
    };

    var settings = loadSettings();
    var synth = window.speechSynthesis || null;
    var voiceHoverTimer = null;
    var lastSpokenEl = null;
    var ruVoice = null;

    // ------------------------------------------------------------------
    // Хранилище настроек
    // ------------------------------------------------------------------
    // Приводит любой объект (из localStorage, с сервера) к валидному виду —
    // только известные поля, значения в допустимых диапазонах.
    function normalize(src) {
        src = src || {};
        var rate = (src.voiceRate === undefined || src.voiceRate === null) ? 1 : src.voiceRate;
        return {
            textStep: Math.round(clamp(src.textStep, 0, 4)),
            contrast: !!src.contrast,
            focus: !!src.focus,
            cursor: !!src.cursor,
            voice: !!src.voice,
            voiceRate: Math.round(clamp(rate, 0.7, 1.6) * 10) / 10,
            hearing: !!src.hearing,
            showButton: !!src.showButton
        };
    }

    function same(a, b) {
        return Object.keys(defaults).every(function (k) { return a[k] === b[k]; });
    }

    // Включён ли хоть один режим (сама кнопка «показывать» режимом не считается).
    function anyModeActive(s) {
        return s.textStep > 0 || s.contrast || s.focus || s.cursor || s.voice || s.hearing;
    }

    function loadSettings() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return normalize(raw ? JSON.parse(raw) : null);
        } catch (e) {
            return normalize(null);
        }
    }

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* приватный режим и т.п. */ }
    }
    function storageRemove(key) {
        try { localStorage.removeItem(key); } catch (e) { }
    }

    // Только localStorage — без отправки на сервер. Им же пользуется
    // синхронизация, когда сама подтягивает настройки с сервера.
    function writeLocal() {
        storageSet(STORAGE_KEY, JSON.stringify(settings));
    }

    // Вызывается при каждом изменении пользователем.
    function saveSettings() {
        writeLocal();
        // Кэш принадлежит аккаунту, который его правил; после выхода из
        // аккаунта гость правит уже «ничьи» настройки.
        if (isLoggedIn()) storageSet(OWNER_KEY, getUserId());
        else storageRemove(OWNER_KEY);
        schedulePush();
    }

    function clamp(v, min, max) {
        v = Number(v);
        if (isNaN(v)) return min;
        return Math.max(min, Math.min(max, v));
    }

    // ------------------------------------------------------------------
    // Синхронизация с аккаунтом
    // ------------------------------------------------------------------
    // Сервер — источник правды для залогиненного пользователя, но страница
    // всегда сначала применяет кэш из localStorage (без ожидания сети), а
    // потом сверяется с сервером. Так экран не «мигает» и работает офлайн.
    function getToken() { return storageGet('token'); }

    function getUserId() {
        try {
            var u = JSON.parse(storageGet('user') || 'null');
            return u && u.id !== undefined && u.id !== null ? String(u.id) : null;
        } catch (e) { return null; }
    }

    function isLoggedIn() { return !!(getToken() && getUserId()); }

    // Запрос к API с одним повтором после тихого обновления токена
    // (access-токен живёт 15 минут, см. token-refresh.js). Ошибки не
    // перенаправляют на страницу входа: настройки — не повод разлогинивать.
    function apiCall(method, body) {
        function send(token) {
            return fetch(API_URL, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: body ? JSON.stringify(body) : undefined,
                keepalive: !!body // PUT доедет, даже если человек тут же перейдёт на другую страницу
            });
        }
        var token = getToken();
        if (!token) return Promise.reject(new Error('not-logged-in'));

        return send(token).then(function (resp) {
            if (resp.status === 401 && window.MsTokenRefresh && window.MsTokenRefresh.ensureFresh) {
                return window.MsTokenRefresh.ensureFresh().then(function () {
                    var fresh = getToken();
                    return fresh ? send(fresh) : resp;
                });
            }
            return resp;
        }).then(function (resp) {
            if (!resp.ok) throw new Error('http-' + resp.status);
            return resp.json();
        });
    }

    var pushTimer = null;

    // Отправка с задержкой: ползунок скорости речи шлёт событие на каждый
    // пиксель, а на сервер нужно одно сохранение по итогу.
    function schedulePush() {
        if (!isLoggedIn()) return; // гость — только localStorage
        storageSet(DIRTY_KEY, '1');
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(pushNow, PUSH_DELAY_MS);
    }

    function pushNow() {
        pushTimer = null;
        if (!isLoggedIn()) return Promise.resolve(false);
        var snapshot = normalize(settings);
        return apiCall('PUT', snapshot).then(function () {
            // если пока шёл запрос, человек успел что-то ещё поменять,
            // флаг остаётся — уже запланирована следующая отправка
            if (same(snapshot, normalize(settings))) storageRemove(DIRTY_KEY);
            return true;
        }).catch(function () {
            return false; // флаг «не отправлено» остаётся — уйдёт при следующем заходе
        });
    }

    // Сверка с сервером. Правила:
    //  1. На сервере есть сохранённые настройки → они главнее кэша, кроме
    //     случая «в кэше несохранённые правки этого же аккаунта» (например,
    //     не было сети) — тогда новее локальные, и они уходят на сервер.
    //  2. На сервере пусто, а на устройстве что-то настроено:
    //     – кэш «гостевой» или этого же аккаунта → заливаем на сервер
    //       (человек настроил до входа — не теряем);
    //     – кэш другого аккаунта (общий компьютер) → не переносим,
    //       сбрасываем к значениям по умолчанию.
    //  3. Везде пусто/по умолчанию → ничего не делаем.
    function reconcile(remote, uid) {
        var owner = storageGet(OWNER_KEY);
        var mine = owner === uid;
        var dirty = storageGet(DIRTY_KEY) === '1';
        var local = normalize(settings);
        var changed = false;
        var pending = null;

        if (remote && remote.configured) {
            if (dirty && mine) {
                pending = pushNow();
            } else {
                settings = normalize(remote);
                changed = !same(local, settings);
                writeLocal();
                storageSet(OWNER_KEY, uid);
                storageRemove(DIRTY_KEY);
            }
        } else if (!same(local, defaults)) {
            if (owner === null || mine) {
                storageSet(OWNER_KEY, uid);
                storageSet(DIRTY_KEY, '1');
                pending = pushNow();
            } else {
                settings = normalize(null);
                changed = true;
                writeLocal();
                storageSet(OWNER_KEY, uid);
                storageRemove(DIRTY_KEY);
            }
        } else {
            storageSet(OWNER_KEY, uid);
        }

        if (changed) { applyAll(); refreshPanel(); }
        return Promise.resolve(pending).then(function () { return changed; });
    }

    // Подтянуть настройки аккаунта. timeoutMs — сколько максимум ждать
    // (нужно странице входа: она не должна зависать из-за этого запроса).
    // Промис никогда не отклоняется; результат — «настройки изменились».
    function pullFromServer(timeoutMs) {
        var uid = getUserId();
        if (!getToken() || !uid) return Promise.resolve(false);

        var work = apiCall('GET').then(function (remote) {
            return reconcile(remote, uid);
        }).catch(function () { return false; });

        if (!timeoutMs) return work;
        return Promise.race([work, new Promise(function (resolve) {
            setTimeout(function () { resolve(false); }, timeoutMs);
        })]);
    }

    // Страница входа вызывает это сразу после успешного логина, до
    // перехода на главную (см. applySession в auth.js).
    window.MsA11y = { pullFromServer: pullFromServer, open: function () { if (panelEl) togglePanel(true); } };

    // ------------------------------------------------------------------
    // Skip-link — переход сразу к содержимому по клавише Tab
    // ------------------------------------------------------------------
    function injectSkipLink() {
        if (document.querySelector('.a11y-skip-link')) return;
        var main = document.querySelector('main, [role="main"], #main-content');
        if (!main) return;
        if (!main.id) main.id = 'a11y-main-content';
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

        var link = document.createElement('a');
        link.href = '#' + main.id;
        link.className = 'a11y-skip-link';
        link.textContent = 'Перейти к основному содержимому';
        document.body.insertBefore(link, document.body.firstChild);
    }

    // Вторая ссылка в начале страницы (появляется по Tab, как и первая):
    // открывает панель, когда кнопки на экране нет. Показывается только
    // при скрытой кнопке — см. updateFabVisibility().
    var openLinkEl = null;
    function injectOpenPanelLink() {
        if (openLinkEl || document.querySelector('.a11y-skip-open')) return;
        openLinkEl = document.createElement('a');
        openLinkEl.href = '#';
        openLinkEl.className = 'a11y-skip-link a11y-skip-open';
        openLinkEl.setAttribute('data-a11y-open', '');
        openLinkEl.textContent = 'Открыть специальные возможности (Alt+A)';
        var first = document.querySelector('.a11y-skip-link');
        if (first) first.after(openLinkEl);
        else document.body.insertBefore(openLinkEl, document.body.firstChild);
    }

    // ------------------------------------------------------------------
    // Живая область для скрытых объявлений (для «настоящих» screen reader'ов)
    // ------------------------------------------------------------------
    var liveRegion;
    function announce(text) {
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.className = 'a11y-live';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('role', 'status');
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = '';
        window.setTimeout(function () { liveRegion.textContent = text; }, 30);
    }

    // ------------------------------------------------------------------
    // Голосовой ассистент (Web Speech API — встроенный в браузер синтез речи)
    // ------------------------------------------------------------------
    function pickRuVoice() {
        if (!synth) return null;
        var list = synth.getVoices() || [];
        if (!list.length) return null;
        return list.find(function (v) { return /^ru/i.test(v.lang); }) || null;
    }

    if (synth && 'onvoiceschanged' in synth) {
        synth.addEventListener('voiceschanged', function () {
            ruVoice = pickRuVoice();
        });
    }

    function speak(text) {
        if (!synth || !text) return;
        synth.cancel();
        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = document.documentElement.lang || 'ru-RU';
        utter.rate = settings.voiceRate || 1;
        if (!ruVoice) ruVoice = pickRuVoice();
        if (ruVoice) utter.voice = ruVoice;
        synth.speak(utter);
    }

    function stopSpeaking() {
        if (synth) synth.cancel();
        if (lastSpokenEl) {
            lastSpokenEl.classList.remove('a11y-speaking');
            lastSpokenEl = null;
        }
    }

    // Определяем «доступное имя» элемента примерно так же, как это
    // делают настоящие screen reader'ы (aria-label -> aria-labelledby ->
    // alt для картинок -> label/placeholder для полей -> текст)
    function getAccessibleText(el) {
        if (!el || el === document.body || el === document.documentElement) return '';

        var label = el.getAttribute && el.getAttribute('aria-label');
        if (label && label.trim()) return prefixByRole(el, label.trim());

        var labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
        if (labelledby) {
            var ref = document.getElementById(labelledby);
            if (ref && ref.textContent.trim()) return prefixByRole(el, ref.textContent.trim());
        }

        if (el.tagName === 'IMG') {
            var alt = el.getAttribute('alt');
            return alt ? 'Изображение: ' + alt.trim() : '';
        }

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            var ph = el.getAttribute('placeholder') || '';
            var val = el.value || '';
            var type = el.getAttribute('type') || 'текст';
            var byLabel = '';
            if (el.id) {
                var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
                if (l) byLabel = l.textContent.trim();
            }
            var base = byLabel || ph || 'поле ввода';
            return 'Поле «' + base + '»' + (val ? ', введено: ' + val : ', пусто') +
                (type === 'password' ? ' (пароль)' : '');
        }

        if (el.classList && el.classList.contains('voice-msg')) {
            var author = el.getAttribute('data-audio-author') || '';
            return 'Голосовое сообщение' + (author ? ' от ' + author : '');
        }

        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 220) text = text.slice(0, 220) + '…';
        return prefixByRole(el, text);
    }

    function prefixByRole(el, text) {
        if (!text) return '';
        var tag = el.tagName;
        var role = el.getAttribute && el.getAttribute('role');
        if (tag === 'A' || role === 'link') return 'Ссылка: ' + text;
        if (tag === 'BUTTON' || role === 'button') return 'Кнопка: ' + text;
        if (/^H[1-6]$/.test(tag)) return 'Заголовок: ' + text;
        if (tag === 'NAV') return 'Меню навигации: ' + text;
        return text;
    }

    function onFocusForVoice(e) {
        if (!settings.voice) return;
        var el = e.target;
        if (el === document.body) return;
        var text = getAccessibleText(el);
        if (!text) return;
        if (lastSpokenEl) lastSpokenEl.classList.remove('a11y-speaking');
        el.classList.add('a11y-speaking');
        lastSpokenEl = el;
        speak(text);
    }

    function onHoverForVoice(e) {
        if (!settings.voice) return;
        var el = e.target.closest('a, button, [role="button"], h1, h2, h3, h4, img, p, li, label, span, td, th, .voice-msg');
        if (!el || el === lastSpokenEl) return;
        window.clearTimeout(voiceHoverTimer);
        voiceHoverTimer = window.setTimeout(function () {
            var text = getAccessibleText(el);
            if (!text) return;
            if (lastSpokenEl) lastSpokenEl.classList.remove('a11y-speaking');
            el.classList.add('a11y-speaking');
            lastSpokenEl = el;
            speak(text);
        }, 380); // небольшая задержка, чтобы не читать всё подряд при быстром движении мыши
    }

    function readWholePage() {
        if (!synth) return;
        var main = document.querySelector('main, [role="main"]') || document.body;
        var text = (main.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) { announce('На странице нет текста для чтения'); return; }
        speak(text.slice(0, 6000));
    }

    // ------------------------------------------------------------------
    // Режим для слабослышащих: субтитры видео + видимые звуковые метки
    // ------------------------------------------------------------------
    function applyHearingMode(on) {
        // показ субтитров у всех <video>, где есть дорожка track с captions/subtitles
        document.querySelectorAll('video').forEach(function (video) {
            var tracks = video.textTracks;
            if (!tracks) return;
            for (var i = 0; i < tracks.length; i++) {
                if (on && (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles')) {
                    tracks[i].mode = 'showing';
                }
            }
        });

        // голосовые сообщения в чате (.voice-msg — см. chat.js) получают
        // видимую пометку "🔊 аудио" через CSS (html.a11y-hearing ...),
        // здесь только проставляем атрибут-подпись
        document.querySelectorAll('.voice-msg').forEach(function (el) {
            if (on && !el.hasAttribute('data-a11y-sound')) {
                el.setAttribute('data-a11y-sound', '🔊 аудио');
            }
        });
    }

    // Голосовые сообщения могут появляться в чате уже после включения
    // режима (новое сообщение, подгрузка истории) — следим за чатом
    // без тяжёлого MutationObserver по всему документу: он вешается
    // только один раз и только если на странице вообще есть чат.
    function watchForNewVoiceMessages() {
        var chatBody = document.querySelector('#chatMessages, .chat-messages, .messages-list, .chat-body');
        if (!chatBody || !window.MutationObserver) return;
        var mo = new MutationObserver(function () {
            if (settings.hearing) applyHearingMode(true);
        });
        mo.observe(chatBody, { childList: true, subtree: true });
    }

    // ------------------------------------------------------------------
    // Применение всех настроек к <html>
    // ------------------------------------------------------------------
    function applyAll() {
        var html = document.documentElement;
        html.classList.remove('a11y-text-1', 'a11y-text-2', 'a11y-text-3', 'a11y-text-4');
        if (settings.textStep > 0) html.classList.add('a11y-text-' + settings.textStep);

        html.classList.toggle('a11y-contrast', settings.contrast);
        html.classList.toggle('a11y-focus', settings.focus);
        html.classList.toggle('a11y-cursor', settings.cursor);
        html.classList.toggle('a11y-voice', settings.voice);
        html.classList.toggle('a11y-hearing', settings.hearing);

        applyHearingMode(settings.hearing);

        if (!settings.voice) stopSpeaking();

        if (fabEl) fabEl.classList.toggle('a11y-fab-active', anyModeActive(settings));
        updateFabVisibility();
    }

    // Гость видит кнопку всегда. Залогиненный — если включил «Показывать
    // кнопку» или если включён любой режим (чтобы его можно было выключить).
    function updateFabVisibility() {
        if (!fabEl) return;
        var visible = !isLoggedIn() || settings.showButton || anyModeActive(settings);
        fabEl.hidden = !visible;
        // Когда кнопки нет, вход в панель по Tab — ссылка в начале страницы.
        if (openLinkEl) openLinkEl.hidden = visible;
    }

    // ------------------------------------------------------------------
    // Панель управления
    // ------------------------------------------------------------------
    function buildSwitchRow(id, title, desc, checked, onToggle) {
        var row = document.createElement('div');
        row.className = 'a11y-row';

        var textWrap = document.createElement('div');
        textWrap.className = 'a11y-row-text';
        var b = document.createElement('b');
        b.id = id + '-label';
        b.textContent = title;
        var span = document.createElement('span');
        span.textContent = desc;
        textWrap.appendChild(b);
        textWrap.appendChild(span);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'a11y-switch';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(checked));
        btn.setAttribute('aria-pressed', String(checked));
        btn.setAttribute('aria-labelledby', id + '-label');
        btn.addEventListener('click', function () {
            var next = btn.getAttribute('aria-pressed') !== 'true';
            btn.setAttribute('aria-pressed', String(next));
            btn.setAttribute('aria-checked', String(next));
            onToggle(next);
        });

        row.appendChild(textWrap);
        row.appendChild(btn);
        return row;
    }

    function buildSectionTitle(text) {
        var h = document.createElement('div');
        h.className = 'a11y-section-title';
        h.textContent = text;
        return h;
    }

    function buildPanel() {
        var panel = document.createElement('div');
        panel.className = 'a11y-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-labelledby', 'a11y-panel-title');
        panel.hidden = true;

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'a11y-close';
        close.setAttribute('aria-label', 'Закрыть панель специальных возможностей');
        close.textContent = '✕';
        close.addEventListener('click', function () { togglePanel(false); });
        panel.appendChild(close);

        var h2 = document.createElement('h2');
        h2.id = 'a11y-panel-title';
        h2.textContent = 'Специальные возможности';
        panel.appendChild(h2);

        var sub = document.createElement('p');
        sub.className = 'a11y-sub';
        sub.textContent = (isLoggedIn()
            ? 'Настройки сохраняются в вашем аккаунте и действуют на всех страницах и устройствах.'
            : 'Настройки сохраняются на этом устройстве. После входа в аккаунт они будут сохраняться и для других устройств.') +
            ' Быстрый вызов панели — Alt+A.';
        panel.appendChild(sub);

        panel.appendChild(buildSectionTitle('Зрение'));

        // --- размер текста (шаги) ---
        var textRow = document.createElement('div');
        textRow.className = 'a11y-row';
        var textWrap = document.createElement('div');
        textWrap.className = 'a11y-row-text';
        var tb = document.createElement('b');
        tb.textContent = 'Размер текста';
        var ts = document.createElement('span');
        ts.textContent = 'Увеличивает всю страницу целиком: текст, кнопки, отступы';
        textWrap.appendChild(tb); textWrap.appendChild(ts);

        var stepper = document.createElement('div');
        stepper.className = 'a11y-stepper';
        var minus = document.createElement('button');
        minus.type = 'button'; minus.setAttribute('aria-label', 'Уменьшить размер текста'); minus.textContent = '–';
        var count = document.createElement('span');
        count.textContent = settings.textStep + '/4';
        var plus = document.createElement('button');
        plus.type = 'button'; plus.setAttribute('aria-label', 'Увеличить размер текста'); plus.textContent = '+';

        function refreshStepper() {
            count.textContent = settings.textStep + '/4';
            minus.disabled = settings.textStep === 0;
            plus.disabled = settings.textStep === 4;
        }
        minus.addEventListener('click', function () {
            settings.textStep = Math.max(0, settings.textStep - 1);
            saveSettings(); applyAll(); refreshStepper();
            announce('Размер текста: шаг ' + settings.textStep + ' из 4');
        });
        plus.addEventListener('click', function () {
            settings.textStep = Math.min(4, settings.textStep + 1);
            saveSettings(); applyAll(); refreshStepper();
            announce('Размер текста: шаг ' + settings.textStep + ' из 4');
        });
        refreshStepper();

        stepper.appendChild(minus); stepper.appendChild(count); stepper.appendChild(plus);
        textRow.appendChild(textWrap); textRow.appendChild(stepper);
        panel.appendChild(textRow);

        // --- высокий контраст ---
        panel.appendChild(buildSwitchRow(
            'a11y-contrast', 'Высокий контраст',
            'Чёрный текст на белом фоне, подчёркнутые ссылки и обводка кнопок',
            settings.contrast,
            function (v) { settings.contrast = v; saveSettings(); applyAll(); announce('Высокий контраст ' + (v ? 'включён' : 'выключен')); }
        ));

        // --- усиленный фокус ---
        panel.appendChild(buildSwitchRow(
            'a11y-focus', 'Заметный фокус при Tab',
            'Яркая рамка вокруг элемента при переходе клавишей Tab',
            settings.focus,
            function (v) { settings.focus = v; saveSettings(); applyAll(); announce('Заметный фокус ' + (v ? 'включён' : 'выключен')); }
        ));

        // --- крупный курсор ---
        panel.appendChild(buildSwitchRow(
            'a11y-cursor', 'Крупный курсор',
            'Увеличенная стрелка мыши, синяя над кликабельными элементами',
            settings.cursor,
            function (v) { settings.cursor = v; saveSettings(); applyAll(); announce('Крупный курсор ' + (v ? 'включён' : 'выключен')); }
        ));

        panel.appendChild(buildSectionTitle('Озвучивание'));

        // --- голосовой ассистент ---
        var voiceRow = buildSwitchRow(
            'a11y-voice', 'Голосовой ассистент',
            synth ? 'Озвучивает элемент под фокусом (Tab) или под курсором мыши'
                : 'Не поддерживается этим браузером',
            settings.voice,
            function (v) {
                settings.voice = v; saveSettings(); applyAll();
                announce('Голосовой ассистент ' + (v ? 'включён' : 'выключен'));
                if (v) speak('Голосовой ассистент включён. Перемещайтесь по странице клавишей Tab или наводите курсор — текст будет озвучен.');
            }
        );
        if (!synth) {
            voiceRow.querySelector('.a11y-switch').disabled = true;
        }
        panel.appendChild(voiceRow);

        var voiceActions = document.createElement('div');
        voiceActions.className = 'a11y-actionrow';
        var readAllBtn = document.createElement('button');
        readAllBtn.type = 'button';
        readAllBtn.textContent = '▶ Прочитать страницу';
        readAllBtn.addEventListener('click', readWholePage);
        var stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.textContent = '⏹ Остановить';
        stopBtn.addEventListener('click', stopSpeaking);
        if (!synth) { readAllBtn.disabled = true; stopBtn.disabled = true; }
        voiceActions.appendChild(readAllBtn);
        voiceActions.appendChild(stopBtn);
        panel.appendChild(voiceActions);

        // --- скорость речи ---
        var rateRow = document.createElement('div');
        rateRow.className = 'a11y-rate-row';
        var rateLabel = document.createElement('span');
        rateLabel.id = 'a11y-rate-label';
        rateLabel.textContent = 'Скорость речи: ' + settings.voiceRate.toFixed(1) + '×';
        var rateInput = document.createElement('input');
        rateInput.type = 'range';
        rateInput.min = '0.7';
        rateInput.max = '1.6';
        rateInput.step = '0.1';
        rateInput.value = String(settings.voiceRate);
        rateInput.setAttribute('aria-labelledby', 'a11y-rate-label');
        if (!synth) rateInput.disabled = true;
        rateInput.addEventListener('input', function () {
            settings.voiceRate = clamp(rateInput.value, 0.7, 1.6);
            rateLabel.textContent = 'Скорость речи: ' + settings.voiceRate.toFixed(1) + '×';
            saveSettings();
        });
        rateRow.appendChild(rateLabel);
        rateRow.appendChild(rateInput);
        panel.appendChild(rateRow);

        panel.appendChild(buildSectionTitle('Слух'));

        // --- режим для слабослышащих ---
        panel.appendChild(buildSwitchRow(
            'a11y-hearing', 'Режим для слабослышащих',
            'Субтитры для видео и видимые пометки у голосовых сообщений',
            settings.hearing,
            function (v) { settings.hearing = v; saveSettings(); applyAll(); announce('Режим для слабослышащих ' + (v ? 'включён' : 'выключен')); }
        ));

        // --- видимость кнопки (только для вошедших: гость видит её всегда) ---
        if (isLoggedIn()) {
            panel.appendChild(buildSectionTitle('Кнопка на экране'));
            panel.appendChild(buildSwitchRow(
                'a11y-showbtn', 'Показывать кнопку',
                'Если выключено, кнопки на экране нет: панель открывается из «Настроек» или клавишами Alt+A. Пока включён любой режим выше, кнопка остаётся.',
                settings.showButton,
                function (v) { settings.showButton = v; saveSettings(); applyAll(); announce('Кнопка на экране ' + (v ? 'показывается' : 'скрыта')); }
            ));
        }

        // --- сброс ---
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'a11y-reset';
        reset.textContent = 'Сбросить все настройки';
        reset.addEventListener('click', function () {
            // «Показывать кнопку» — не режим, а способ вызова панели: сброс
            // режимов его не трогает (иначе кнопка пропадала бы под рукой).
            var keepButton = settings.showButton;
            settings = normalize(null);
            settings.showButton = keepButton;
            saveSettings(); applyAll();
            panel.querySelectorAll('.a11y-switch').forEach(function (sw) {
                var isButtonSwitch = sw.getAttribute('aria-labelledby') === 'a11y-showbtn-label';
                var on = isButtonSwitch && keepButton;
                sw.setAttribute('aria-pressed', String(on)); sw.setAttribute('aria-checked', String(on));
            });
            rateInput.value = String(settings.voiceRate);
            rateLabel.textContent = 'Скорость речи: ' + settings.voiceRate.toFixed(1) + '×';
            refreshStepper();
            announce('Настройки сброшены');
        });
        panel.appendChild(reset);

        return panel;
    }

    // ------------------------------------------------------------------
    // Позиция кнопки: если на странице внизу есть закреплённая панель
    // (например .chat-input-bar — поле ввода сообщения в чате, во всех
    // трёх его режимах: обычный чат / Избранное / Новости), поднимаем
    // кнопку выше неё, чтобы не перекрывать отправку сообщения. На
    // страницах без такой панели ничего не меняется (20px от края, как
    // задано в accessibility.css по умолчанию).
    var FAB_BOTTOM_SELECTORS = '.chat-input-bar';
    var fabPositionRaf = null;

    function adjustFabPosition() {
        var bars = document.querySelectorAll(FAB_BOTTOM_SELECTORS);
        var needed = 0;
        bars.forEach(function (bar) {
            var style = window.getComputedStyle(bar);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            var rect = bar.getBoundingClientRect();
            if (rect.height === 0 || rect.bottom <= 0) return;
            var clearance = window.innerHeight - rect.top;
            if (clearance > needed) needed = clearance;
        });
        var bottom = needed > 0 ? Math.round(needed + 12) : 20;
        document.documentElement.style.setProperty('--a11y-fab-bottom', bottom + 'px');
    }

    function scheduleFabPositionUpdate() {
        if (fabPositionRaf) return;
        fabPositionRaf = window.requestAnimationFrame(function () {
            fabPositionRaf = null;
            adjustFabPosition();
        });
    }

    function watchFabPosition() {
        adjustFabPosition();
        window.addEventListener('resize', scheduleFabPositionUpdate);
        window.addEventListener('orientationchange', scheduleFabPositionUpdate);
        // .chat-input-bar появляется/скрывается при переключении между
        // обычным чатом, Избранным и Новостями — а не при полной
        // перезагрузке страницы, поэтому следим через MutationObserver.
        // Пересчёт лёгкий (пара getBoundingClientRect), а вызовы схлопнуты
        // через requestAnimationFrame, так что нагрузку это не создаёт
        // даже при частом обновлении списка сообщений.
        if (window.MutationObserver) {
            var mo = new MutationObserver(scheduleFabPositionUpdate);
            mo.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden'],
                childList: true,
                subtree: true
            });
        }
    }

    var panelEl, fabEl;

    // Перерисовывает панель по актуальным settings — нужно, когда настройки
    // пришли с сервера или из соседней вкладки уже после того, как панель
    // была построена.
    function refreshPanel() {
        if (!panelEl) return;
        var wasHidden = panelEl.hidden;
        var hadFocus = panelEl.contains(document.activeElement);
        var fresh = buildPanel();
        fresh.hidden = wasHidden;
        panelEl.replaceWith(fresh);
        panelEl = fresh;
        if (!wasHidden && hadFocus) {
            var first = panelEl.querySelector('button, [href], input, select, textarea, [tabindex]');
            if (first) first.focus();
        }
    }
    // Куда вернуть фокус при закрытии, если самой кнопки на экране нет
    // (панель открыли по Alt+A, ссылкой в начале страницы или из «Настроек»).
    var panelReturnFocusEl = null;

    function togglePanel(force) {
        var next = typeof force === 'boolean' ? force : panelEl.hidden;
        if (next && panelEl.hidden && !panelEl.contains(document.activeElement)) {
            panelReturnFocusEl = document.activeElement;
        }
        panelEl.hidden = !next;
        fabEl.setAttribute('aria-expanded', String(next));
        if (next) {
            var firstFocusable = panelEl.querySelector('button, [href], input, select, textarea, [tabindex]');
            if (firstFocusable) firstFocusable.focus();
        } else {
            var back = !fabEl.hidden ? fabEl : panelReturnFocusEl;
            if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
            panelReturnFocusEl = null;
        }
    }

    function buildFab() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'a11y-fab';
        btn.setAttribute('aria-label', 'Специальные возможности');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.title = 'Специальные возможности (для слабовидящих и слабослышащих) — Alt+A';
        // Иконка «универсальный доступ» (человечек в круге): белый диск с
        // кольцом и фигурой цвета currentColor — то есть цвет кнопки задаётся
        // в CSS (--brand по умолчанию, чёрный в режиме высокого контраста).
        // Сама кнопка прозрачная: круг рисует SVG.
        btn.innerHTML = '<svg viewBox="0 0 394 394" fill="none" xmlns="http://www.w3.org/2000/svg" ' +
            'aria-hidden="true" focusable="false">' +
            '<circle cx="197" cy="197" r="185" fill="#fff" stroke="currentColor" stroke-width="24"></circle>' +
            '<path fill="currentColor" d="M98.1956 134.343C99.3871 127.824 105.638 123.504 112.158 124.695C174.89 136.161 209.067 136.201 281.693 125.137C288.244 124.139 294.365 128.641 295.364 135.192C296.362 141.744 291.86 147.865 285.308 148.863C265.042 151.951 247.559 154.204 231.533 155.613C230.184 155.911 228.708 156.777 227.479 157.932C226.722 158.643 226.081 159.443 225.641 160.244C225.203 161.041 224.978 161.81 225 162.479V217.72L247.152 307.629C248.737 314.064 244.806 320.566 238.371 322.151C231.937 323.737 225.435 319.806 223.849 313.371L205.089 237.23L203.456 233.731C202.591 231.878 201.125 230.372 199.296 229.457L198.286 228.952C197.692 228.655 197.036 228.5 196.371 228.5C195.569 228.5 194.783 228.725 194.103 229.15L193.297 229.654C192.053 230.432 191.061 231.553 190.441 232.883L188.41 237.23L169.652 313.371C168.066 319.806 161.564 323.737 155.129 322.151C148.695 320.566 144.764 314.064 146.349 307.629L169 215.69V162.496C169 162.491 168.999 162.485 168.999 162.479C169.056 161.073 168.275 159.45 167.007 158.157C165.957 157.087 164.634 156.31 163.311 156.075C146.287 154.66 128.488 152.078 107.843 148.305C101.324 147.113 97.0043 140.862 98.1956 134.343ZM197 71C210.807 71 222 82.1929 222 96C222 109.807 210.807 121 197 121C183.193 121 172 109.807 172 96C172 82.193 183.193 71.0002 197 71Z"></path>' +
            '</svg>';
        btn.addEventListener('click', function () { togglePanel(); });
        return btn;
    }

    function mountWidget() {
        fabEl = buildFab();
        panelEl = buildPanel();
        document.body.appendChild(panelEl);
        document.body.appendChild(fabEl);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (!panelEl.hidden) togglePanel(false);
                stopSpeaking();
            }
            // Alt+A — быстрый доступ к панели с любой точки страницы
            if (e.altKey && (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф')) {
                e.preventDefault();
                togglePanel(true);
            }
        });

        // Любой элемент с data-a11y-open открывает панель (пункт в
        // «Настройках», ссылка в начале страницы и т.п.).
        document.addEventListener('click', function (e) {
            var opener = e.target.closest && e.target.closest('[data-a11y-open]');
            if (!opener) return;
            e.preventDefault();
            togglePanel(true);
        });

        document.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('[data-a11y-open]')) return; // это открытие, а не клик «мимо»
            if (!panelEl.hidden && !panelEl.contains(e.target) && e.target !== fabEl && !fabEl.contains(e.target)) {
                togglePanel(false);
            }
        });
    }

    // ------------------------------------------------------------------
    // Инициализация
    // ------------------------------------------------------------------
    function init() {
        injectSkipLink();
        injectOpenPanelLink();
        mountWidget();
        applyAll();
        watchForNewVoiceMessages();
        watchFabPosition();

        // кэш уже применён (applyAll выше) — теперь сверяемся с аккаунтом
        pullFromServer();

        // не терять последнее изменение, если человек сразу закрыл/сменил страницу
        window.addEventListener('pagehide', function () {
            if (pushTimer) { clearTimeout(pushTimer); pushNow(); }
        });

        document.addEventListener('focusin', onFocusForVoice, true);
        document.addEventListener('mouseover', onHoverForVoice, true);

        // на случай если пользователь открыл несколько вкладок сайта —
        // синхронизируем настройки между ними
        window.addEventListener('storage', function (e) {
            if (e.key === 'token' || e.key === 'user') {
                // вошли/вышли в другой вкладке — от этого зависит видимость кнопки
                applyAll();
                refreshPanel();
                return;
            }
            if (e.key !== STORAGE_KEY) return;
            settings = loadSettings();
            applyAll();
            refreshPanel();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();