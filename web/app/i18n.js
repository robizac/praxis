(function () {
  const STORAGE_KEY = 'praxis_locale';
  const supported = ['pt-BR', 'en', 'es'];
  const fallback = 'pt-BR';

  function detectLocale() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (supported.includes(stored)) return stored;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('pt')) return 'pt-BR';
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('en')) return 'en';
    return fallback;
  }

  let locale = detectLocale();

  function t(key) {
    const dict = (window.PRAXIS_LOCALES || {})[locale] || {};
    return dict[key] || (window.PRAXIS_LOCALES[fallback] || {})[key] || key;
  }

  function setLocale(next) {
    if (!supported.includes(next)) return;
    locale = next;
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    applyTranslations();
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
  }

  window.PRAXIS_I18N = { t, setLocale, getLocale: () => locale, supported, applyTranslations };
  document.addEventListener('DOMContentLoaded', applyTranslations);
})();
