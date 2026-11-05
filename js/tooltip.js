/* ══════════════════════════════════════════════════════════════════
   tooltip.js — кастомные подсказки при наведении (как в Claude)
   ────────────────────────────────────────────────────────────────
   Подключается на каждой странице вместе с css/tooltip.css.

   КАК ЭТО РАБОТАЕТ
   • Разметку менять не нужно: подсказка берётся из обычного атрибута
     title. В момент наведения скрипт на время «прячет» title (чтобы не
     показалась ещё и родная подсказка браузера), а при уходе курсора
     возвращает на место. Поэтому DOM в покое остаётся как был, а
     динамически созданные элементы работают сами, без наблюдателей.
   • Запасной источник — data-tip. А у кнопок/ссылок без видимого
     текста (иконки) без title подсказкой станет aria-label.
   • data-shortcut="Ctrl+B" — приглушённая горячая клавиша справа.
     Хвост вида « — Alt+A» в самом title тоже выносится в неё.
   • data-tip-pos="top|bottom|left|right" — принудительная сторона
     (по умолчанию — сверху, а если места нет, то снизу).
   • data-no-tip — не показывать подсказку на элементе и внутри него.

   ПОВЕДЕНИЕ
   • Показ через ~0,45 с после наведения; если только что была
     подсказка на соседнем элементе — почти сразу.
   • С клавиатуры — при фокусе через Tab (:focus-visible).
   • Скрывается при клике, прокрутке, Esc, уходе курсора/фокуса.
   • На сенсорном вводе не работает (там title и так не показывается).

   РЕЖИМ «СПЕЦИАЛЬНЫЕ ВОЗМОЖНОСТИ»
   Если на <html> есть класс любого режима панели (js/accessibility.js:
   a11y-text-N, a11y-contrast, a11y-focus, a11y-cursor, a11y-voice,
   a11y-hearing), скрипт полностью выключается: title не трогается,
   работают стандартные подсказки браузера. Список режимов — в A11Y_RE.
   ══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    if (window.MSTooltip) return;

    var SHOW_DELAY = 450;    // задержка перед первым показом, мс
    var FOCUS_DELAY = 200;   // при фокусе с клавиатуры
    var QUICK_WINDOW = 400;  // после скрытия столько мс следующая подсказка появляется сразу
    var GAP = 8;             // зазор до элемента
    var EDGE = 8;            // минимальный отступ от края окна
    var WIDE = 220;          // у более широких элементов подсказка встаёт под курсор

    var A11Y_RE = /(^|\s)a11y-(text-\d|contrast|focus|cursor|voice|hearing)(\s|$)/;
    // « — Alt+A» или « (Ctrl+B)» в конце title — это горячая клавиша
    var KEYS = '(?:Ctrl|Alt|Shift|Cmd|Meta|⌘|⌥)(?:\\s*\\+\\s*[^\\s+()]+)+';
    var SHORTCUT_RE = new RegExp('(?:\\s+[—–-]\\s+(' + KEYS + ')|\\s*\\((' + KEYS + ')\\))\\s*$', 'i');

    var tipEl = null;
    var current = null;      // элемент, для которого сейчас (или скоро) показана подсказка
    var via = '';            // 'pointer' | 'focus'
    var pointerX = null;
    var suppressed = false;  // подсказку закрыли (клик/Esc) — до ухода с элемента не показываем
    var showTimer = 0;
    var lastHideAt = 0;
    var swapped = new WeakMap(); // el -> { title, addedAria }

    function a11yOn() {
        return A11Y_RE.test(document.documentElement.className);
    }

    // ── Источник текста ──────────────────────────────────────────
    function isIconOnlyControl(el) {
        if (!el.matches('button, a[href], [role="button"], summary')) return false;
        if (!el.hasAttribute('aria-label')) return false;
        return !(el.textContent || '').replace(/[\s×✕✖]/g, '');
    }

    function rawText(el) {
        var s = swapped.get(el);
        if (s) return s.title;
        var t = el.getAttribute('title');
        if (t && t.trim()) return t;
        t = el.getAttribute('data-tip');
        if (t && t.trim()) return t;
        if (isIconOnlyControl(el)) return el.getAttribute('aria-label');
        return '';
    }

    function tipData(el) {
        var text = (rawText(el) || '').trim();
        if (!text) return null;
        var kbd = el.getAttribute('data-shortcut') || '';
        if (!kbd) {
            var m = SHORTCUT_RE.exec(text);
            if (m) { kbd = (m[1] || m[2]).replace(/\s+/g, ''); text = text.slice(0, m.index).trim(); }
        }
        return { text: text, kbd: kbd };
    }

    function findTarget(node) {
        if (!node || node.nodeType !== 1) node = node && node.parentElement;
        if (current && swapped.has(current) && current.contains(node)) return current;
        for (var el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            if (el.hasAttribute('data-no-tip')) return null;
            if (rawText(el)) return el;
        }
        return null;
    }

    // ── Подмена title на время показа ────────────────────────────
    function swapOut(el) {
        if (swapped.has(el)) return;
        var t = el.getAttribute('title');
        if (!t || !t.trim()) return;
        var addedAria = false;
        // Если у элемента нет другого имени, title был его доступным именем —
        // пока он снят, подставляем его в aria-label.
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') &&
            !(el.textContent || '').trim() && el.matches('button, a, [role]')) {
            el.setAttribute('aria-label', t);
            addedAria = true;
        }
        swapped.set(el, { title: t, addedAria: addedAria });
        el.removeAttribute('title');
    }

    function swapIn(el) {
        var s = swapped.get(el);
        if (!s) return;
        swapped.delete(el);
        if (!el.hasAttribute('title')) el.setAttribute('title', s.title);
        if (s.addedAria) el.removeAttribute('aria-label');
    }

    // ── Показ / скрытие ──────────────────────────────────────────
    function ensureTip() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.className = 'ms-tooltip';
        tipEl.setAttribute('role', 'tooltip');
        tipEl.setAttribute('aria-hidden', 'true'); // имя у элемента остаётся в title/aria-label
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function place(el) {
        var tip = tipEl;
        var r = el.getBoundingClientRect();
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        var pos = (el.getAttribute('data-tip-pos') || 'auto').toLowerCase();
        var side = pos;

        if (side === 'auto' || (side !== 'top' && side !== 'bottom' && side !== 'left' && side !== 'right')) {
            side = (r.top - th - GAP >= EDGE || r.bottom + th + GAP > vh - EDGE) ? 'top' : 'bottom';
        }

        var left, top;
        if (side === 'top' || side === 'bottom') {
            var cx = r.left + r.width / 2;
            if (r.width > WIDE && via === 'pointer' && pointerX !== null) cx = pointerX;
            left = cx - tw / 2;
            top = side === 'top' ? r.top - th - GAP : r.bottom + GAP;
        } else {
            top = r.top + r.height / 2 - th / 2;
            left = side === 'left' ? r.left - tw - GAP : r.right + GAP;
        }
        left = Math.max(EDGE, Math.min(left, vw - tw - EDGE));
        top = Math.max(EDGE, Math.min(top, vh - th - EDGE));

        tip.style.left = Math.round(left) + 'px';
        tip.style.top = Math.round(top) + 'px';
        tip.setAttribute('data-side', side);
    }

    function show() {
        showTimer = 0;
        if (!current || suppressed || a11yOn() || !document.documentElement.contains(current)) return;
        var d = tipData(current);
        if (!d) return;

        var tip = ensureTip();
        tip.textContent = '';
        var txt = document.createElement('span');
        txt.className = 'ms-tip-text';
        txt.textContent = d.text;
        tip.appendChild(txt);
        if (d.kbd) {
            var k = document.createElement('span');
            k.className = 'ms-tip-kbd';
            k.textContent = d.kbd;
            tip.appendChild(k);
        }
        place(current);
        tip.classList.add('is-visible');
    }

    function hideTip() {
        if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
        if (tipEl && tipEl.classList.contains('is-visible')) {
            tipEl.classList.remove('is-visible');
            lastHideAt = Date.now();
        }
    }

    function begin(el, how) {
        current = el;
        via = how;
        suppressed = false;
        if (how === 'pointer') swapOut(el);
        var quick = Date.now() - lastHideAt < QUICK_WINDOW;
        var delay = quick ? 40 : (how === 'focus' ? FOCUS_DELAY : SHOW_DELAY);
        if (showTimer) clearTimeout(showTimer);
        showTimer = setTimeout(show, delay);
    }

    function release() {
        hideTip();
        if (current) swapIn(current);
        current = null;
        via = '';
        suppressed = false;
    }

    // Закрыть подсказку, но title пока не возвращать (курсор ещё над
    // элементом — иначе браузер тут же покажет свою родную подсказку).
    function dismiss() {
        hideTip();
        if (current) suppressed = true;
    }

    // ── События ──────────────────────────────────────────────────
    document.addEventListener('pointerover', function (e) {
        if (e.pointerType === 'touch') return;
        if (a11yOn()) { if (current) release(); return; }
        pointerX = e.clientX;
        var el = findTarget(e.target);
        if (el === current) {
            // подсказка уже показана по фокусу, а теперь навели курсор:
            // прячем родной title, чтобы он не появился поверх нашей
            if (via === 'focus') { swapOut(el); via = 'pointer'; }
            return;
        }
        if (current) release();
        if (el) begin(el, 'pointer');
    }, true);

    document.addEventListener('pointerout', function (e) {
        if (!current || via !== 'pointer') return;
        if (e.relatedTarget && current.contains(e.relatedTarget)) return;
        release();
    }, true);

    document.addEventListener('focusin', function (e) {
        if (a11yOn()) return;
        var t = e.target;
        if (!t || t.nodeType !== 1 || !t.matches || !t.matches(':focus-visible')) return;
        if (t.closest('[data-no-tip]') || !rawText(t)) return;
        if (current === t) return;
        if (current) release();
        begin(t, 'focus');
    }, true);

    document.addEventListener('focusout', function (e) {
        if (current && via === 'focus' && e.target === current) release();
    }, true);

    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('click', dismiss, true);
    document.addEventListener('wheel', dismiss, { capture: true, passive: true });
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', function () { if (current) release(); });
    // курсор ушёл за пределы окна (в том числе с отключённой кнопки, у которой
    // pointerout может не прийти) — убираем подсказку и возвращаем title
    document.documentElement.addEventListener('pointerleave', function () { if (current && via === 'pointer') release(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && current) release(); });

    document.addEventListener('keydown', function (e) {
        if (!current) return;
        if (e.key === 'Escape') { dismiss(); return; }
        if (e.key !== 'Tab' && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') dismiss();
    }, true);

    // Режим «Специальные возможности» включили при видимой подсказке —
    // возвращаем title и переходим на стандартные подсказки браузера.
    new MutationObserver(function () {
        if (current && a11yOn()) release();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Скрипты страницы (чат, новости) меняют title на лету, например
    // «Пауза» → «Продолжить». Пока элемент под курсором, новый title
    // перехватываем так же, как исходный, и обновляем видимую подсказку.
    new MutationObserver(function (records) {
        if (!current || a11yOn()) return;
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.target !== current || !current.hasAttribute('title')) continue;
            var t = current.getAttribute('title');
            var st = swapped.get(current);
            if (st) { st.title = t; current.removeAttribute('title'); }
            else swapOut(current);
            if (tipEl && tipEl.classList.contains('is-visible') && !suppressed) show();
            break;
        }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['title'], subtree: true });

    window.MSTooltip = {
        hide: function () { if (current) release(); },
        isActive: function () { return !a11yOn(); }
    };
})();