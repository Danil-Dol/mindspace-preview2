/* ══════════════════════════════════════════════════════════════
   ПОИСК ПО САЙТУ («умный», без нейросети)
   ══════════════════════════════════════════════════════════════
   Ищет по всему сайту сразу — страницам, статьям вики, тестам и
   разделам настроек — с любой страницы. Открывается кнопкой-лупой
   в шапке, по Ctrl+K (⌘K) или по клавише «/».

   Данные берёт из js/search-index.js (window.MS_SEARCH_INDEX),
   его собирает tools/build-search-index.py. Индекс (≈110 КБ) и стили
   (css/site-search.css) подгружаются сами — стили сразу после загрузки
   страницы, индекс в простое браузера или при первом открытии поиска, —
   поэтому на страницах достаточно одной строки:
       <script src="js/site-search.js" defer></script>

   Что умеет:
     • не требует точного совпадения слов: «поменять пароль» найдёт
       «Логин и пароль», «настроить звук» — «Звук сообщений»;
     • учитывает окончания (упрощённый русский стеммер Snowball);
     • прощает опечатки («двухфакторка», «бессонца»);
     • понимает синонимы («тоска» → «Депрессия», «травля» → «Буллинг»);
     • понимает неправильную раскладку («gfhjkm» → «пароль»);
     • скрывает то, что недоступно: настройки — гостям, раздел
       «Не беспокоить» — не специалистам.

   Работает полностью в браузере, никуда ничего не отправляет.
   ══════════════════════════════════════════════════════════════ */

(function (root) {
    'use strict';

    /* ───────────────────────── Нормализация и стемминг ───────────────────────── */

    var VOWELS = 'аеиоуыэюя';

    function norm(s) {
        return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е');
    }

    function tokenize(s) {
        var t = norm(s).replace(/[^a-zа-я0-9]+/g, ' ').trim();
        return t ? t.split(' ') : [];
    }

    function isCyr(w) { return /[а-я]/.test(w); }

    function regionAfter(w, start) {
        for (var i = start + 1; i < w.length; i++) {
            if (VOWELS.indexOf(w.charAt(i)) < 0 && VOWELS.indexOf(w.charAt(i - 1)) >= 0) return i + 1;
        }
        return w.length;
    }

    // Окончание из списка (самое длинное), целиком лежащее в области RV.
    // needAYa — перед окончанием должна стоять «а» или «я» (она остаётся в слове).
    function cut(w, list, rv, needAYa) {
        var best = null;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (w.length - e.length < rv) continue;
            if (w.slice(w.length - e.length) !== e) continue;
            if (needAYa) {
                var p = w.length - e.length - 1;
                if (p < rv) continue;
                var ch = w.charAt(p);
                if (ch !== 'а' && ch !== 'я') continue;
            }
            if (best === null || e.length > best.length) best = e;
        }
        return best === null ? null : w.slice(0, w.length - best.length);
    }

    var PERF1 = ['авшись', 'авши', 'ав'];
    var PERF2 = ['ившись', 'ывшись', 'ивши', 'ывши', 'ив', 'ыв'];
    var REFL = ['ся', 'сь'];
    var ADJ = ['ими', 'ыми', 'его', 'ого', 'ему', 'ому', 'ее', 'ие', 'ые', 'ое', 'ей', 'ий', 'ый', 'ой',
        'ем', 'им', 'ым', 'ом', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею'];
    var PART1 = ['ем', 'нн', 'вш', 'ющ', 'щ'];
    var PART2 = ['ивш', 'ывш', 'ующ'];
    var VERB1 = ['ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно'];
    var VERB2 = ['ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен',
        'ило', 'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю'];
    var NOUN = ['а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й',
        'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я'];

    var stemCache = {};

    function stem(word) {
        if (!isCyr(word)) return word;
        if (stemCache.hasOwnProperty(word)) return stemCache[word];
        var w = word;
        if (w.length > 3) {
            var rv = 0;
            for (var i = 0; i < w.length; i++) {
                if (VOWELS.indexOf(w.charAt(i)) >= 0) { rv = i + 1; break; }
                rv = w.length;
            }
            var r2 = regionAfter(w, regionAfter(w, 0));

            // Шаг 1
            var t = cut(w, PERF1, rv, true);
            if (t === null) t = cut(w, PERF2, rv, false);
            if (t !== null) {
                w = t;
            } else {
                t = cut(w, REFL, rv, false);
                if (t !== null) w = t;
                var a = cut(w, ADJ, rv, false);
                if (a !== null) {
                    w = a;
                    var p = cut(w, PART1, rv, true);
                    if (p === null) p = cut(w, PART2, rv, false);
                    if (p !== null) w = p;
                } else {
                    var v = cut(w, VERB1, rv, true);
                    if (v === null) v = cut(w, VERB2, rv, false);
                    if (v !== null) {
                        w = v;
                    } else {
                        var n = cut(w, NOUN, rv, false);
                        if (n !== null) w = n;
                    }
                }
            }
            // Шаг 2
            if (w.length > rv && w.charAt(w.length - 1) === 'и') w = w.slice(0, -1);
            // Шаг 3
            if (w.length - 3 >= r2 && w.slice(-3) === 'ост') w = w.slice(0, -3);
            else if (w.length - 4 >= r2 && w.slice(-4) === 'ость') w = w.slice(0, -4);
            // Шаг 4
            if (w.charAt(w.length - 1) === 'ь') {
                w = w.slice(0, -1);
            } else {
                if (w.length - 3 >= rv && w.slice(-3) === 'ейш') w = w.slice(0, -3);
                else if (w.length - 4 >= rv && w.slice(-4) === 'ейше') w = w.slice(0, -4);
                if (w.slice(-2) === 'нн') w = w.slice(0, -1);
            }
        }
        stemCache[word] = w;
        return w;
    }

    /* ───────────────────────── Синонимы и стоп-слова ───────────────────────── */

    var SYNONYM_GROUPS = [
        ['поменять', 'сменить', 'изменить', 'заменить', 'переименовать', 'обновить', 'редактировать', 'поправить'],
        ['удалить', 'стереть', 'убрать', 'снести', 'закрыть', 'ликвидировать'],
        ['выключить', 'отключить', 'отменить', 'деактивировать'],
        ['включить', 'подключить', 'активировать'],
        ['пароль', 'пароли', 'password', 'пассворд'],
        ['почта', 'email', 'имейл', 'мейл', 'емейл'],
        ['телефон', 'номер', 'смартфон', 'мобильный', 'сотовый'],
        ['фото', 'фотография', 'картинка', 'изображение', 'аватар', 'аватарка', 'снимок', 'фотка'],
        ['имя', 'ник', 'никнейм', 'псевдоним'],
        ['оформление', 'внешний', 'дизайн', 'стиль', 'персонализация'],
        ['фон', 'обои'],
        ['звук', 'мелодия', 'сигнал'],
        ['безопасность', 'защита', 'безопасный'],
        ['тревога', 'тревожность', 'беспокойство', 'волнение', 'нервозность', 'переживание'],
        ['депрессия', 'грусть', 'тоска', 'печаль', 'уныние', 'подавленность', 'хандра'],
        ['выгорание', 'истощение', 'усталость', 'переутомление'],
        ['бессонница', 'инсомния', 'недосып'],
        ['откладывать', 'прокрастинация', 'лень'],
        ['одиночество', 'одинокий', 'изоляция'],
        ['травля', 'буллинг', 'издевательство', 'кибербуллинг'],
        ['страх', 'фобия', 'боязнь', 'испуг'],
        ['самооценка', 'неуверенность', 'самоуважение'],
        ['стресс', 'напряжение', 'нервы', 'перегрузка'],
        ['тест', 'опрос', 'опросник', 'анкета', 'скрининг', 'самодиагностика'],
        ['статья', 'материал', 'вики', 'энциклопедия', 'справочник'],
        ['вопрос', 'спросить', 'обсуждение', 'форум'],
        ['чат', 'сообщение', 'переписка', 'диалог', 'написать', 'мессенджер'],
        ['поддержка', 'техподдержка', 'помощь', 'проблема', 'ошибка', 'баг', 'неполадки'],
        ['оплата', 'оплатить', 'перевод', 'платеж', 'сбп', 'реквизиты'],
        ['отзыв', 'рейтинг', 'оценка'],
        ['вход', 'войти', 'авторизация', 'залогиниться'],
        ['регистрация', 'зарегистрироваться'],
        ['выход', 'выйти', 'разлогиниться'],
        ['сеанс', 'сессия', 'устройство'],
        ['qr', 'куар', 'кюар', 'кьюар'],
        ['уведомление', 'оповещение', 'пуш', 'push', 'напоминание']
    ];

    var STOP = {};
    ('как что где мне мой моя мои это для при про или ли не на по из от до за со во об обо вот так же бы ' +
        'можно нужно хочу хочется надо найти найди покажи показать куда какой какая какие есть быть ' +
        'мы вы он она оно они мне меня нам вам сайт сайте страница страницу раздел ' +
        'кто то чтобы чтоб там тут свой свою свои зачем почему когда если уже еще очень').split(' ')
        .forEach(function (w) { STOP[w] = 1; });

    var synByStem = null; // stem -> массив stem-ов синонимов (без самого себя)

    function buildSynonyms() {
        synByStem = {};
        SYNONYM_GROUPS.forEach(function (group) {
            var stems = [];
            group.forEach(function (w) {
                var s = stem(norm(w));
                if (stems.indexOf(s) < 0) stems.push(s);
            });
            stems.forEach(function (s) {
                var others = stems.filter(function (x) { return x !== s; });
                synByStem[s] = (synByStem[s] || []).concat(others);
            });
        });
    }

    /* ───────────────────────── Сравнение слов ───────────────────────── */

    // Расстояние Левенштейна с отсечкой: возвращает maxD+1, если больше maxD.
    function lev(a, b, maxD) {
        if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
        var prev = [], cur = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur[0] = i;
            var rowMin = cur[0];
            for (j = 1; j <= b.length; j++) {
                var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                if (cur[j] < rowMin) rowMin = cur[j];
            }
            if (rowMin > maxD) return maxD + 1;
            var tmp = prev; prev = cur; cur = tmp;
        }
        return prev[b.length];
    }

    // Насколько слово запроса (qs — основа, qr — как набрано) подходит слову документа.
    function tokenMatch(qs, qr, ds, dr) {
        if (qs === ds) return 1;
        if (qr.length >= 3 && dr.indexOf(qr) === 0) return 0.9;   // «двухфак…» — ещё печатают
        if (qs.length >= 4 && ds.length >= 4 && (ds.indexOf(qs) === 0 || qs.indexOf(ds) === 0)) return 0.85;
        if (qs.length >= 5 && ds.length >= 5) {
            var d = lev(qs, ds, 2);
            if (d <= 1) return 0.7;
            if (d <= 2 && qs.length >= 9 && ds.length >= 9) return 0.6;
        }
        return 0;
    }

    /* ───────────────────────── Раскладка клавиатуры ───────────────────────── */

    // Клавиши ЙЦУКЕН ↔ QWERTY. В конце — символы, которые получаются с Shift
    // (< > { } : " ~) и в русской раскладке дают заглавные Б Ю Х Ъ Ж Э Ё:
    // без них «<tpjgfcyjcnm» превращалось в «<езопасность» (терялась «Б»).
    var EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`<>{}:"~';
    var RU = 'йцукенгшщзхъфывапролджэячсмитьбюёбюхъжэё';

    function fixLayout(s) {
        var out = '', changed = false;
        s = String(s).toLowerCase();
        for (var i = 0; i < s.length; i++) {
            var idx = EN.indexOf(s.charAt(i));
            if (idx >= 0) { out += RU.charAt(idx); changed = true; } else out += s.charAt(i);
        }
        return changed ? out : null;
    }

    /* ───────────────────────── Индекс ───────────────────────── */

    var docs = null;

    function fieldTokens(text) {
        var raw = tokenize(text), seen = {}, out = [];
        raw.forEach(function (r) {
            var s = stem(r), key = s + '|' + r;
            if (seen[key]) return;
            seen[key] = 1;
            out.push({ r: r, s: s });
        });
        return out;
    }

    function buildIndex(entries) {
        if (!synByStem) buildSynonyms();
        docs = (entries || []).map(function (e) {
            var section = (e.s || '') + ' ' + (e.c || '');
            return {
                e: e,
                title: norm(e.t),
                titleWords: tokenize(e.t).length,
                f: [
                    { w: 3, tok: fieldTokens(e.t) },
                    { w: 2.4, tok: fieldTokens(e.k || '') },
                    { w: 2, tok: fieldTokens((e.g || '') + ' ' + section) },
                    { w: 1, tok: fieldTokens(e.d || '') }
                ]
            };
        });
    }

    /* ───────────────────────── Поиск ───────────────────────── */

    function queryTokens(query) {
        var all = tokenize(query);
        var words = all.filter(function (w) { return !STOP[w] && (w.length > 1 || /\d/.test(w)); });
        if (!words.length) words = all.filter(function (w) { return w.length > 1; });
        return words.map(function (w) {
            var s = stem(w);
            return {
                r: w, s: s,
                alt: (synByStem[s] || []).map(function (x) { return { r: x, s: x }; })
            };
        });
    }

    function scoreDoc(doc, qt, qNorm) {
        var total = 0, matched = 0, i, j, k, a;
        for (i = 0; i < qt.length; i++) {
            var q = qt[i], best = 0, second = 0;
            for (j = 0; j < doc.f.length; j++) {
                var fld = doc.f[j], fbest = 0;
                for (k = 0; k < fld.tok.length; k++) {
                    var m = tokenMatch(q.s, q.r, fld.tok[k].s, fld.tok[k].r);
                    for (a = 0; a < q.alt.length; a++) {
                        var ma = tokenMatch(q.alt[a].s, q.alt[a].r, fld.tok[k].s, fld.tok[k].r) * 0.95;
                        if (ma > m) m = ma;
                    }
                    if (m * fld.w > fbest) fbest = m * fld.w;
                }
                // слово нашлось сразу в нескольких полях — это надёжнее, чем в одном
                if (fbest > best) { second = best; best = fbest; }
                else if (fbest > second) second = fbest;
            }
            if (best > 0) { matched++; total += best + 0.3 * second; }
        }
        if (!matched) return 0;

        var coverage = matched / qt.length;
        total *= 0.55 + 0.45 * coverage;

        // запрос целиком совпал с началом/частью названия
        if (qNorm.length >= 3) {
            var pos = doc.title.indexOf(qNorm);
            if (pos >= 0) total += doc.titleWords <= 3 ? (pos === 0 ? 2.5 : 1.5) : 0.8;
        }
        // запрос целиком совпал с отдельным словом названия или с тегом статьи —
        // так находятся аббревиатуры (РАС, СДВГ, ОКР, ПТСР): иначе «рас» тонет среди
        // десятков слов на «расстройство…», которые подходят по началу слова
        if (qNorm.length >= 2 && qNorm.indexOf(' ') < 0) {
            for (k = 0; k < doc.f[0].tok.length; k++) {
                if (doc.f[0].tok[k].r === qNorm) { total += 4; break; }
            }
            if (norm(doc.e.g || '') === qNorm) total += 3;
        }
        // короткое название — это, как правило, сама тема, а не упоминание в длинном заголовке
        total += 1.2 / Math.max(1, doc.titleWords);
        // страницы и настройки — «навигация», при равенстве выше статей
        if (doc.e.s === 'Настройки' || doc.e.s === 'Страницы') total += 0.4;

        // часть слов запроса не нашлась — берём только действительно сильные совпадения
        return coverage < 1 && total < 2.6 ? 0 : total;
    }

    function getAccess() {
        var token = null, user = null;
        try { token = localStorage.getItem('token'); } catch (e) { /* storage недоступен */ }
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e2) { user = null; }
        return { auth: !!token, spec: !!(user && user.isSpecialist) };
    }

    function allowed(e, acc) {
        if (e.f === 'auth') return acc.auth;
        if (e.f === 'spec') return acc.auth && acc.spec;
        if (e.f === 'guest') return !acc.auth;
        return true;
    }

    function runSearch(query, acc, limit) {
        if (!docs) buildIndex(root.MS_SEARCH_INDEX || []);
        var qt = queryTokens(query);
        var qNorm = norm(query).replace(/\s+/g, ' ').trim();
        var hits = [], hiddenCount = 0;
        if (!qt.length) return { hits: hits, hidden: 0 };
        for (var i = 0; i < docs.length; i++) {
            var sc = scoreDoc(docs[i], qt, qNorm);
            if (sc < 0.9) continue;
            if (!allowed(docs[i].e, acc)) { hiddenCount++; continue; }
            hits.push({ e: docs[i].e, score: sc });
        }
        hits.sort(function (a, b) { return b.score - a.score; });
        return { hits: hits.slice(0, limit || 8), hidden: hiddenCount };
    }

    // Основная функция: сама пробует исправить раскладку, если ничего не нашлось.
    function search(query, acc, limit) {
        acc = acc || getAccess();
        var res = runSearch(query, acc, limit);
        res.query = query;
        res.fixed = null;
        // Есть латиница и нет кириллицы — возможно, забыли переключить раскладку.
        // Пробуем «исправленный» вариант и берём тот, где найдено лучше: так
        // «gfhjkm» → «пароль» работает, даже если латинский запрос нашёл что-то
        // случайное, а настоящие латинские запросы («qr», «2fa») не портятся.
        if (/[a-z]/i.test(query) && !/[а-яё]/i.test(query)) {
            var alt = fixLayout(query);
            if (alt && alt !== query) {
                var r2 = runSearch(alt, acc, limit);
                if (r2.hits.length) {
                    var top1 = res.hits.length ? res.hits[0].score : 0;
                    if (r2.hits[0].score > top1) { r2.query = query; r2.fixed = alt; return r2; }
                }
            }
        }
        return res;
    }

    var core = { search: search, stem: stem, tokenize: tokenize, buildIndex: buildIndex, fixLayout: fixLayout };
    root.MSSearch = core;
    if (typeof module !== 'undefined' && module.exports) module.exports = core;

    /* ───────────────────────── Интерфейс ───────────────────────── */

    if (typeof document === 'undefined') return;

    var SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

    var SECTION_CLASS = { 'Настройки': 'ss-sec-settings', 'Страницы': 'ss-sec-pages', 'Вики': 'ss-sec-wiki', 'Тесты': 'ss-sec-tests' };

    var QUICK = [
        { t: 'Вики', s: 'Страницы', u: 'wiki.html', d: 'Статьи о ментальном здоровье' },
        { t: 'Тесты', s: 'Страницы', u: 'tests.html', d: 'Самодиагностика' },
        { t: 'Сообщество', s: 'Страницы', u: 'community.html', d: 'Вопросы и обсуждения' },
        { t: 'Настройки', s: 'Настройки', u: 'settings.html', d: 'Аккаунт, безопасность, персонализация', f: 'auth' },
        { t: 'Техподдержка', s: 'Страницы', u: 'chat.html?contact=admin', d: 'Написать администратору', f: 'auth' }
    ];

    /* ───────────────────────── Подгрузка стилей и индекса ───────────────────────── */

    // Папка и версия (?v=…) берутся у самого скрипта — так css/ и индекс
    // находятся при любой глубине страницы и получают тот же хэш версии.
    var selfSrc = (document.currentScript && document.currentScript.src) || '';
    var JS_BASE = selfSrc ? selfSrc.replace(/[^\/]*(\?.*)?$/, '') : 'js/';
    var SITE_ROOT = JS_BASE.replace(/js\/$/, '');   // корень сайта: ссылки из индекса даны от него
    var VER = (selfSrc.match(/\?.*$/) || [''])[0];
    var CSS_URL = SITE_ROOT + 'css/site-search.css' + VER;
    var INDEX_URL = JS_BASE + 'search-index.js' + VER;

    // «wiki.html», «Wiki/x.html#a» → от корня сайта, чтобы работало и из подпапок (Wiki/, Tests/)
    function fullUrl(u) {
        return /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(u) ? u : SITE_ROOT + u;
    }

    var indexState = root.MS_SEARCH_INDEX ? 'ready' : 'idle';   // idle | loading | ready | failed
    var indexWaiters = [];

    function loadStyles() {
        if (document.getElementById('ssStyles')) return;
        var l = document.createElement('link');
        l.id = 'ssStyles';
        l.rel = 'stylesheet';
        l.href = CSS_URL;
        document.head.appendChild(l);
    }

    function loadIndex(cb) {
        if (indexState === 'ready') { if (cb) cb(true); return; }
        if (cb) indexWaiters.push(cb);
        if (indexState === 'loading') return;
        indexState = 'loading';
        var sc = document.createElement('script');
        sc.src = INDEX_URL;
        sc.async = true;
        sc.onload = function () { finish(!!root.MS_SEARCH_INDEX); };
        sc.onerror = function () { finish(false); };
        document.head.appendChild(sc);
        function finish(ok) {
            indexState = ok ? 'ready' : 'failed';
            var w = indexWaiters; indexWaiters = [];
            w.forEach(function (fn) { fn(ok); });
        }
    }

    function preloadIndexWhenIdle() {
        var go = function () { loadIndex(); };
        if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 4000 });
        else setTimeout(go, 2500);
    }

    var overlay, dialog, input, list, status, closeBtn;
    var current = [];       // отображаемые результаты
    var activeIdx = -1;
    var lastFocus = null;
    var prevOverflow = '';
    var debounceTimer = null;
    var isOpen = false;

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function build() {
        overlay = el('div', 'ss-overlay');
        overlay.hidden = true;
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

        dialog = el('div', 'ss-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'Поиск по сайту');

        var top = el('div', 'ss-top');
        var icon = el('span', 'ss-top-icon');
        icon.innerHTML = SVG_SEARCH;

        input = el('input', 'ss-input');
        input.type = 'search';
        input.placeholder = 'Поиск по сайту: настройки, статьи, тесты…';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('enterkeyhint', 'go');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-controls', 'ssList');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-label', 'Поисковый запрос');

        closeBtn = el('button', 'ss-close', 'Закрыть');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', close);

        top.appendChild(icon);
        top.appendChild(input);
        top.appendChild(closeBtn);

        list = el('ul', 'ss-list');
        list.id = 'ssList';
        list.setAttribute('role', 'listbox');

        status = el('div', 'ss-status');
        status.setAttribute('aria-live', 'polite');

        var foot = el('div', 'ss-foot');
        foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span>';

        dialog.appendChild(top);
        dialog.appendChild(list);
        dialog.appendChild(status);
        dialog.appendChild(foot);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(update, 60);
        });
        input.addEventListener('keydown', onInputKey);
        dialog.addEventListener('keydown', trapTab);
    }

    function setActive(i, scroll) {
        var items = list.children;
        if (activeIdx >= 0 && items[activeIdx]) {
            items[activeIdx].classList.remove('ss-active');
            items[activeIdx].setAttribute('aria-selected', 'false');
        }
        activeIdx = i;
        if (i >= 0 && items[i]) {
            items[i].classList.add('ss-active');
            items[i].setAttribute('aria-selected', 'true');
            input.setAttribute('aria-activedescendant', items[i].id);
            if (scroll !== false && items[i].scrollIntoView) items[i].scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function crumb(e) {
        if (e.s === 'Настройки') return 'Настройки' + (e.c ? ' · ' + e.c : '');
        return e.s + (e.g && e.s !== 'Страницы' ? ' · ' + e.g : '');
    }

    function snippet(s) {
        s = String(s || '');
        return s.length > 120 ? s.slice(0, 117).replace(/\s+\S*$/, '') + '…' : s;
    }

    function render(entries) {
        list.textContent = '';
        current = entries;
        entries.forEach(function (e, i) {
            var li = el('li', 'ss-item');
            li.id = 'ssItem' + i;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');

            var a = el('a', 'ss-link');
            a.href = fullUrl(e.u);
            a.tabIndex = -1;

            var badge = el('span', 'ss-badge ' + (SECTION_CLASS[e.s] || ''), e.s);
            var body = el('span', 'ss-body');
            body.appendChild(el('span', 'ss-title', e.t));
            var meta = crumb(e);
            if (meta) body.appendChild(el('span', 'ss-crumb', meta));
            if (e.d) body.appendChild(el('span', 'ss-desc', snippet(e.d)));

            a.appendChild(badge);
            a.appendChild(body);
            li.appendChild(a);
            a.addEventListener('click', function (ev) {
                if (e.a) { ev.preventDefault(); go(e); } else close(true);
            });
            li.addEventListener('mousemove', function () { if (activeIdx !== i) setActive(i, false); });
            list.appendChild(li);
        });
        setActive(entries.length ? 0 : -1, false);
    }

    function update() {
        var q = input.value.trim();
        var acc = getAccess();

        if (!q) {
            var quick = QUICK.filter(function (e) { return allowed(e, acc); });
            render(quick);
            status.textContent = 'Быстрые переходы. Начните вводить — поиск идёт по всему сайту.';
            return;
        }

        if (indexState !== 'ready') {
            render([]);
            if (indexState === 'failed') {
                status.textContent = 'Не удалось загрузить данные поиска. Проверьте соединение и попробуйте ещё раз.';
                loadIndex();   // повторная попытка при следующем вводе
            } else {
                status.textContent = 'Загрузка…';
                loadIndex(function () { if (isOpen) update(); });
            }
            return;
        }

        var res = search(q, acc, 8);
        render(res.hits.map(function (h) { return h.e; }));

        if (res.hits.length) {
            status.textContent = (res.fixed ? 'Показаны результаты для «' + res.fixed + '» (раскладка). ' : '') +
                'Найдено: ' + res.hits.length +
                (res.hidden && !acc.auth ? '. Ещё есть разделы, доступные после входа в аккаунт.' : '');
        } else if (res.hidden && !acc.auth) {
            status.textContent = 'Подходящие разделы доступны после входа в аккаунт.';
        } else {
            status.textContent = 'Ничего не найдено по запросу «' + q + '». Попробуйте другими словами.';
        }
    }

    function onInputKey(e) {
        var n = current.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (n) setActive((activeIdx + 1) % n);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (n) setActive((activeIdx - 1 + n) % n);
        } else if (e.key === 'Enter') {
            if (activeIdx >= 0 && current[activeIdx]) {
                e.preventDefault();
                go(current[activeIdx]);
            }
        } else if (e.key === 'Home' && n && !input.value) {
            e.preventDefault(); setActive(0);
        }
    }

    function trapTab(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        var focusables = [input, closeBtn];
        var i = focusables.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); closeBtn.focus(); }
        else if (!e.shiftKey && i === focusables.length - 1) { e.preventDefault(); input.focus(); }
    }

    function go(entry) {
        close(true);
        if (entry.a === 'a11y' && !document.querySelector('.a11y-fab')) {
            // на этой странице панели нет (статьи вики, тесты) — открываем
            // главную с хэшем #a11y, там её откроет openA11yFromHash()
            window.location.href = SITE_ROOT + 'index.html#a11y';
            return;
        }
        if (entry.a === 'a11y') {
            // панель «Специальные возможности» (js/accessibility.js) открывается
            // кликом по любому элементу с data-a11y-open
            clickA11yOpener();
            return;
        }
        // переход внутри settings.html (смена #хэша) обрабатывает settings-groups.js
        window.location.href = fullUrl(entry.u);
    }

    function open() {
        if (isOpen) return;
        loadStyles();
        loadIndex();
        if (!overlay) build();
        isOpen = true;
        lastFocus = document.activeElement;
        prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        overlay.hidden = false;
        document.documentElement.classList.add('ss-open');
        input.value = '';
        update();
        // небольшой отложенный фокус — чтобы не «съесть» клавишу, открывшую поиск
        setTimeout(function () { input.focus(); }, 0);
    }

    function close(skipRestoreFocus) {
        if (!isOpen) return;
        isOpen = false;
        overlay.hidden = true;
        document.documentElement.classList.remove('ss-open');
        document.body.style.overflow = prevOverflow;
        if (skipRestoreFocus !== true && lastFocus && lastFocus.focus) {
            try { lastFocus.focus(); } catch (e) { /* элемента уже нет */ }
        }
    }

    function isTyping(t) {
        if (!t) return false;
        var tag = (t.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    }

    function onGlobalKey(e) {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
            e.preventDefault();
            if (isOpen) close(); else open();
            return;
        }
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isOpen && !isTyping(e.target)) {
            e.preventDefault();
            open();
        }
    }

    function makeTrigger() {
        var b = el('button', 'ss-trigger');
        b.type = 'button';
        b.setAttribute('aria-label', 'Поиск по сайту');
        b.setAttribute('aria-haspopup', 'dialog');
        b.title = 'Поиск по сайту (Ctrl+K)';
        b.innerHTML = SVG_SEARCH;
        b.addEventListener('click', open);
        return b;
    }

    function clickA11yOpener() {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-a11y-open', '');
        b.hidden = true;
        document.body.appendChild(b);
        b.click();
        document.body.removeChild(b);
    }

    // index.html#a11y — открыть панель «Специальные возможности» после загрузки
    function openA11yFromHash() {
        if (location.hash !== '#a11y') return;
        var tries = 0;
        (function wait() {
            if (document.querySelector('.a11y-fab')) {
                try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
                clickA11yOpener();
            } else if (++tries < 30) {
                setTimeout(wait, 100);
            }
        }());
    }

    function mountTrigger() {
        openA11yFromHash();
        loadStyles();
        preloadIndexWhenIdle();
        if (document.querySelector('.ss-trigger')) return;
        var actions = document.querySelector('.header-actions');
        var pageHeader = document.getElementById('pageHeader') ||
            document.querySelector('.topbar-inner, .site-topbar');   // статьи вики и тесты
        if (actions) {
            actions.insertBefore(makeTrigger(), actions.firstChild);
        } else if (pageHeader) {
            var b = makeTrigger();
            b.classList.add('ss-trigger--page');
            pageHeader.appendChild(b);
        }
        // любые свои кнопки можно пометить data-site-search
        var custom = document.querySelectorAll('[data-site-search]');
        for (var i = 0; i < custom.length; i++) custom[i].addEventListener('click', function (e) { e.preventDefault(); open(); });
    }

    document.addEventListener('keydown', onGlobalKey);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTrigger);
    else mountTrigger();

    core.open = open;
    core.close = close;

}(typeof window !== 'undefined' ? window : globalThis));