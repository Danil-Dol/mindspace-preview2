(function () {
    const fab = document.getElementById('tocFab');
    const panel = document.getElementById('tocPanel');
    const hint = document.getElementById('tocHint');
    const links = [...panel.querySelectorAll('a')];

    function openPanel() {
        panel.classList.add('open');
        fab.classList.add('open');
        fab.setAttribute('aria-expanded', 'true');
        dismissHint();
    }
    function closePanel() {
        panel.classList.remove('open');
        fab.classList.remove('open');
        fab.setAttribute('aria-expanded', 'false');
    }

    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.contains('open') ? closePanel() : openPanel();
    });

    // клик по ссылке — закрываем панель и плавно скроллим (scroll-behavior:smooth уже это делает)
    links.forEach(link => link.addEventListener('click', closePanel));

    // клик снаружи или Escape — закрыть
    document.addEventListener('click', (e) => {
        if (panel.classList.contains('open') && !panel.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePanel();
    });

    // подсветка активного раздела при прокрутке (scroll-spy)
    const headings = links
        .map(a => document.getElementById(a.getAttribute('href').slice(1)))
        .filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const link = panel.querySelector(`a[href="#${entry.target.id}"]`);
            if (!link) return;
            if (entry.isIntersecting) {
                links.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }, { rootMargin: '-100px 0px -70% 0px', threshold: 0 });

    headings.forEach(h => observer.observe(h));

    /* ── разовая подсказка при первом визите ──
       Показываем один раз на устройство/браузер, чтобы человек, впервые
       зашедший на сайт, сразу понял, что означает эта кнопка. */
    const HINT_KEY = 'ms_toc_hint_seen';

    function dismissHint() {
        hint.classList.remove('visible');
        localStorage.setItem(HINT_KEY, '1');
    }

    if (!localStorage.getItem(HINT_KEY)) {
        setTimeout(() => hint.classList.add('visible'), 1200);
        setTimeout(dismissHint, 8000);
    } else {
        hint.style.display = 'none';
    }
})();

/* ══════════════════════════════════════════════════════════════════
   ВОЗВРАТ В СПИСОК ВИКИ
   ──────────────────────────────────────────────────────────────────
   Если статью открыли из списка wiki.html, то «Назад на сайт» и
   крошки «Вики» / название категории ведут обратно в список — на ту же
   страницу пагинации, с тем же поиском и тем же положением прокрутки
   (их запоминает js/wiki.js при клике на карточку и восстанавливает по
   флагу wikiReturn). Если статью открыли иначе (карусель на главной,
   прямая ссылка, поисковик) — «Назад на сайт» остаётся ссылкой на
   главную, как и раньше.
   ══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    var LIST_URL = '../wiki.html';

    function openedFromWikiList() {
        if (!document.referrer) return false;
        try {
            var ref = new URL(document.referrer);
            return ref.origin === location.origin && /\/wiki\.html$/i.test(ref.pathname);
        } catch (e) { return false; }
    }

    function goBackToList(e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        try { sessionStorage.setItem('wikiReturn', '1'); } catch (err) { }
        location.href = LIST_URL;
    }

    if (!openedFromWikiList()) return;

    var links = document.querySelectorAll('.back-link, .breadcrumbs a[href$="wiki.html"]');
    Array.prototype.forEach.call(links, function (a) {
        a.setAttribute('href', LIST_URL);
        a.addEventListener('click', goBackToList);
    });
})();