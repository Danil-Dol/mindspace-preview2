// Автоматически подставляет текущий год в подвал: <span data-year>2026</span>.
// Если скрипт не загрузится, останется год, записанный в разметке.
(function () {
    var year = String(new Date().getFullYear());
    var items = document.querySelectorAll('[data-year]');
    for (var i = 0; i < items.length; i++) items[i].textContent = year;
})();
