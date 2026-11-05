/*
 * Общий движок тестов. Подключается ПОСЛЕ файла с данными конкретного теста
 * (js/Test/test-<имя>.js), который задаёт window.TEST_CONFIG:
 *
 *   slug          — slug теста в БД; если задан, результат сохраняется на сервере
 *                   и доступно скачивание в Word (иначе кнопка-заглушка)
 *   title         — заголовок на экране вступления
 *   headerTitle   — заголовок в шапке вопросов (по умолчанию = title)
 *   itemWord      — «Вопрос» | «Утверждение» (подпись «… 3 из 10»)
 *   introIcon     — SVG-иконка вступления
 *   introText     — текст вступления (HTML)
 *   meta          — [время, количество] для строки «~3 минуты · 10 вопросов»
 *   disclaimer    — примечание внизу карточки
 *   questions     — массив вопросов
 *   options       — [{ label, value }, ...]
 *   bands         — диапазоны результата: { max, label, color, bg, desc },
 *                   последний — без max (всё, что выше предыдущего порога)
 *   meterLabels   — подписи под шкалой [левая, правая]
 *   view          — 'spectrum' для шкалы-спектра (интроверт); тогда band берётся
 *                   по % позиции, в бейдже — band.emoji, подписи — spectrumLabels
 *   spectrumLabels— подписи под спектром (только для view: 'spectrum')
 *
 * Мин./макс. балл считаются автоматически по значениям в options.
 */
(function () {
    const cfg = window.TEST_CONFIG;
    if (!cfg) { console.error('test-engine: не найден window.TEST_CONFIG'); return; }

    const QUESTIONS = cfg.questions;
    const OPTIONS = cfg.options;
    const HEADER_TITLE = cfg.headerTitle || cfg.title;
    const HAS_BACKEND = !!cfg.slug;
    const SPECTRUM = cfg.view === 'spectrum';

    const API_BASE = ''; // бэкенд на том же хосте — см. js/auth.js

    const optValues = OPTIONS.map(o => o.value);
    const MIN_PER_Q = Math.min(...optValues);
    const MAX_PER_Q = Math.max(...optValues);

    const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
    const BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    const card = document.getElementById('card');
    const answers = new Array(QUESTIONS.length).fill(null);
    let step = -1; // -1 = вступление, 0..N-1 = вопросы, N = результат

    // Состояние сохранения результата на сервере (только если задан slug):
    // 'idle' — ещё не пробовали; 'saving' — запрос в процессе;
    // 'saved' — есть resultId, можно скачивать; 'error' — попытка не удалась,
    // повторится по клику на кнопку скачивания.
    let saveState = 'idle';
    let resultId = null;

    // С бэкендом авторизация — это JWT в localStorage('token'); у тестов без бэкенда
    // сохранена прежняя проверка по флагу ms_authenticated.
    function isAuthenticated() {
        return HAS_BACKEND
            ? !!localStorage.getItem('token')
            : localStorage.getItem('ms_authenticated') === '1';
    }

    function render() {
        if (step === -1) return renderIntro();
        if (step === QUESTIONS.length) return renderResult();
        return renderQuestion(step);
    }

    function renderIntro() {
        card.innerHTML = `
    <div class="intro-icon">${cfg.introIcon}</div>
    <h1 class="intro-title">${cfg.title}</h1>
    <p class="intro-text">${cfg.introText}</p>
    <div class="intro-meta">
      <span>${ICON_CLOCK} ${cfg.meta[0]}</span>
      <span>${ICON_CHECK} ${cfg.meta[1]}</span>
    </div>
    <button class="btn-start" id="startBtn">Начать тест</button>
    <div class="card-footer">
      <div class="disclaimer">${cfg.disclaimer}</div>
    </div>
  `;
        document.getElementById('startBtn').addEventListener('click', () => { step = 0; render(); });
    }

    function renderQuestion(i) {
        const progress = Math.round((i / QUESTIONS.length) * 100);
        card.innerHTML = `
    <div class="card-top">
      <button class="back-btn" id="backBtn" aria-label="Назад">${BACK_ICON}</button>
      <h1>${HEADER_TITLE}</h1>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
    <div class="progress-label">${cfg.itemWord} ${i + 1} из ${QUESTIONS.length}</div>
    <div class="question-text">${QUESTIONS[i]}</div>
    <div class="options" id="options">
      ${OPTIONS.map(o => `
        <button class="option-btn${answers[i] === o.value ? ' selected' : ''}" data-value="${o.value}">
          ${o.label}<span class="option-dot"></span>
        </button>
      `).join('')}
    </div>
  `;

        document.getElementById('backBtn').addEventListener('click', () => {
            step = i === 0 ? -1 : i - 1;
            render();
        });

        document.getElementById('options').querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                answers[i] = parseInt(btn.dataset.value, 10);
                btn.classList.add('selected');
                setTimeout(() => { step = i + 1; render(); }, 280);
            });
        });
    }

    // Первый диапазон, у которого value <= max; последний (без max) — запасной.
    function pickBand(value) {
        return cfg.bands.find(b => b.max === undefined || value <= b.max);
    }

    function renderResult() {
        const authed = isAuthenticated();
        const total = answers.reduce((sum, v) => sum + (v || 0), 0);
        const min = QUESTIONS.length * MIN_PER_Q;
        const max = QUESTIONS.length * MAX_PER_Q;

        let top;
        if (SPECTRUM) {
            const pct = Math.round(((total - min) / (max - min)) * 100);
            const band = pickBand(pct);
            top = `
    <div class="result-badge" style="background:${band.bg}">${band.emoji}</div>
    <div class="result-title">${band.label}</div>
    <div class="result-score">Позиция на шкале: ${pct}%</div>

    <div class="spectrum">
      <div class="spectrum-track"></div>
      <div class="spectrum-marker" style="left:${pct}%"></div>
    </div>
    <div class="spectrum-labels">${cfg.spectrumLabels.map(l => `<span>${l}</span>`).join('')}</div>

    <p class="result-text">${band.desc}</p>`;
        } else {
            const pct = Math.round((total / max) * 100);
            const band = pickBand(total);
            top = `
    <div class="result-badge" style="background:${band.color}">${total}</div>
    <div class="result-title">${band.label}</div>
    <div class="result-score">Ваш результат: ${total} из ${max}</div>

    <div class="meter-track"><div class="meter-fill" style="width:${pct}%; background:${band.color}"></div></div>
    <div class="meter-labels"><span>${cfg.meterLabels[0]}</span><span>${cfg.meterLabels[1]}</span></div>

    <p class="result-text">${band.desc}</p>`;
        }

        const downloadBlock = HAS_BACKEND
            ? `<button class="btn-secondary" id="downloadBtn">Скачать результат в Word</button>
      <div class="future-note" id="downloadStatus">${authed ? '' : 'Войдите, чтобы сохранить и скачать результат'}</div>`
            : `<button class="btn-secondary" disabled>Скачать результат в Word</button>
      <div class="future-note">Скачивание и отправка результата специалисту появятся позже</div>`;

        card.innerHTML = `${top}

    <div class="result-actions">
      <button class="btn-start" id="consultBtn">Обсудить со специалистом</button>
      ${downloadBlock}
      <button class="btn-secondary" id="retakeBtn">Пройти тест заново</button>
    </div>

    <div class="card-footer">
      <div class="disclaimer">${cfg.disclaimer}</div>
    </div>
  `;

        document.getElementById('consultBtn').addEventListener('click', () => {
            window.location.href = isAuthenticated() ? '../chat.html' : '../auth.html';
        });
        if (HAS_BACKEND) {
            document.getElementById('downloadBtn').addEventListener('click', handleDownloadClick);
        }
        document.getElementById('retakeBtn').addEventListener('click', () => {
            answers.fill(null);
            step = -1;
            saveState = 'idle';
            resultId = null;
            render();
        });

        // Сохраняем результат сразу, пока пользователь читает описание — так
        // кнопка скачивания обычно уже готова к моменту, когда до неё доходит клик.
        if (HAS_BACKEND && authed) saveResultToBackend();
    }

    /* ───────────── Сохранение и скачивание результата (только с slug) ───────────── */

    // Ответы страницы — {индекс вопроса: value} — переводим в формат,
    // который ждёт POST /api/tests/{slug}/results: {"q1": value, ...}.
    // id вопроса "qN" — по номеру вопроса; они должны совпадать с записью
    // Tests(slug=...) в Data/MindSpaceDb.sql.
    function buildAnswersPayload() {
        const payload = {};
        answers.forEach((value, i) => { payload[`q${i + 1}`] = value; });
        return payload;
    }

    function setDownloadStatus(text, isError) {
        const status = document.getElementById('downloadStatus');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('is-error', !!isError);
    }

    function setDownloadButtonLabel(text, disabled) {
        const btn = document.getElementById('downloadBtn');
        if (!btn) return;
        btn.textContent = text;
        btn.disabled = !!disabled;
    }

    // Отправляет пройденный тест на сервер, чтобы получить Id результата —
    // он нужен для скачивания .docx через GET /api/tests/results/{id}/export/docx
    // (см. TestsController). Балл и подпись результата сервер считает сам.
    async function saveResultToBackend() {
        const token = localStorage.getItem('token');
        if (!token) return;

        saveState = 'saving';
        setDownloadButtonLabel('Сохраняем результат…', true);
        setDownloadStatus('');

        try {
            const response = await fetch(`${API_BASE}/api/tests/${cfg.slug}/results`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ answers: buildAnswersPayload() })
            });

            if (!response.ok) {
                let message = 'Не удалось сохранить результат';
                try { message = (await response.json()).error || message; } catch { }
                throw new Error(message);
            }

            const data = await response.json();
            resultId = data.id;
            saveState = 'saved';
            setDownloadButtonLabel('Скачать результат в Word', false);
            setDownloadStatus('');
        } catch (err) {
            saveState = 'error';
            setDownloadButtonLabel('Скачать результат в Word', false);
            setDownloadStatus(err.message || 'Не удалось сохранить результат — попробуйте ещё раз', true);
        }
    }

    // Скачивает уже сохранённый результат как .docx. Имя файла берётся из
    // заголовка Content-Disposition, который отдаёт TestsController.ExportResultToWord.
    async function downloadWordResult() {
        const token = localStorage.getItem('token');

        setDownloadButtonLabel('Скачиваем…', true);
        setDownloadStatus('');

        try {
            const response = await fetch(`${API_BASE}/api/tests/results/${resultId}/export/docx`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '../auth.html';
                    return;
                }
                throw new Error('Не удалось скачать документ');
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            // Сервер отдаёт кириллическое имя файла через filename* (RFC 5987,
            // URL-кодировка) и/или обычный filename="..." — пробуем сначала filename*.
            const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
            const fileName = starMatch
                ? decodeURIComponent(starMatch[1])
                : (plainMatch ? plainMatch[1] : `Результат_${cfg.slug}.docx`);

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            setDownloadButtonLabel('Скачать результат в Word', false);
        } catch (err) {
            setDownloadButtonLabel('Скачать результат в Word', false);
            setDownloadStatus(err.message || 'Не удалось скачать документ — попробуйте ещё раз', true);
        }
    }

    async function handleDownloadClick() {
        if (!isAuthenticated()) {
            window.location.href = '../auth.html';
            return;
        }
        if (saveState === 'saving') return;
        if (saveState !== 'saved' || !resultId) {
            await saveResultToBackend();
            if (saveState !== 'saved' || !resultId) return;
        }
        await downloadWordResult();
    }

    render();
})();