/* ══════════════════════════════════════════════════════════════════
   ПЛАШКА «БЕТА» — публичное бета-тестирование
   ══════════════════════════════════════════════════════════════════
   Подключается ОДНИМ <script src="/js/beta-badge.js"></script> на
   каждой странице проекта — сам компонент (стили + разметка) собирает
   и вставляет себя в DOM самостоятельно, ничего в HTML/CSS страниц
   менять не нужно.

   ЕДИНСТВЕННЫЙ переключатель — переменная ниже:
     IS_BETA = true   → в углу экрана на каждой странице появляется
                         плашка «Бета» с пояснением и ссылкой на
                         техподдержку.
     IS_BETA = false  → плашка нигде не показывается, скрипт не
                         трогает страницу вообще (можно оставить
                         подключённым — просто ничего не сделает).

   Когда публичное бета-тестирование закончится — поменять на false
   (или удалить <script>-тег со страниц) одним действием.
   ══════════════════════════════════════════════════════════════════ */
const IS_BETA = true;

(function () {
    if (!IS_BETA) return;
    if (document.getElementById('betaBadgeRoot')) return; // уже вставлено на этой странице

    function inject() {
        const style = document.createElement('style');
        style.id = 'betaBadgeStyle';
        style.textContent = `
            #betaBadgeRoot {
                position: fixed;
                top: max(10px, env(safe-area-inset-top));
                right: max(150px, env(safe-area-inset-right));
                z-index: 100000;
                font-family: var(--font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif);
            }
            #betaBadgeTag {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: linear-gradient(135deg, #B85C00, #A34700);
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .04em;
                text-transform: uppercase;
                padding: 6px 11px;
                border-radius: 999px;
                box-shadow: 0 2px 10px rgba(0,0,0,.28);
                cursor: pointer;
                border: none;
                min-height: 24px;
                min-width: 24px;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
            }
            #betaBadgeTag:active { transform: scale(.96); }
            #betaBadgePopover {
                display: none;
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                width: 270px;
                max-width: calc(100vw - 28px);
                background: var(--surface, #fff);
                color: var(--text, #1D2733);
                border-radius: 16px;
                box-shadow: 0 10px 32px rgba(0,0,0,.24);
                padding: 16px 16px 14px;
                font-size: 13px;
                line-height: 1.5;
                box-sizing: border-box;
            }
            #betaBadgePopover.show { display: block; }
            #betaBadgePopover h4 {
                margin: 0 8px 6px 0;
                font-size: 14.5px;
                font-weight: 700;
            }
            #betaBadgePopover p {
                margin: 0 0 10px;
                color: var(--text-2, #5A6B7B);
            }
            #betaBadgePopover a.beta-support-link {
                display: inline-block;
                background: #0066CC;
                color: #fff;
                text-decoration: none;
                font-weight: 600;
                font-size: 12.5px;
                padding: 8px 13px;
                border-radius: 10px;
            }
            #betaBadgePopover .beta-close {
                position: absolute;
                top: 10px;
                right: 12px;
                background: none;
                border: none;
                font-size: 15px;
                line-height: 1;
                cursor: pointer;
                color: var(--text-3, #64717F);
                padding: 4px;
            }
            @media (max-width: 420px) {
                #betaBadgeTag { font-size: 10px; padding: 5px 9px; }
            }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'betaBadgeRoot';
        root.innerHTML = `
            <button type="button" id="betaBadgeTag">Предпросмотр</button>
            <div id="betaBadgePopover" role="dialog" aria-label="Бета-версия сайта">
                <button type="button" class="beta-close" aria-label="Закрыть">✕</button>
                <h4>Версия для проверки</h4>
                <p>Это временная версия сайта: здесь доступны только раздел «Вики» и «Тесты» — чтобы их можно было прочитать и проверить до запуска всего сайта.</p><p>Регистрация, чат и остальные разделы в этой версии не работают.</p>
            </div>
        `;
        document.body.appendChild(root);

        const tag = document.getElementById('betaBadgeTag');
        const popover = document.getElementById('betaBadgePopover');
        const closeBtn = root.querySelector('.beta-close');

        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            popover.classList.toggle('show');
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popover.classList.remove('show');
        });
        document.addEventListener('click', (e) => {
            if (!root.contains(e.target)) popover.classList.remove('show');
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') popover.classList.remove('show');
        });
    }

    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
})();