(function () {
  const key = 'praxis-theme';
  try {
    const stored = localStorage.getItem(key);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored === 'dark' || stored === 'light' ? stored : prefersDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }

  function apply(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(key, t);
    } catch {}
    const icon = document.querySelector('.theme-toggle-icon');
    const label = document.querySelector('.theme-toggle-label');
    if (icon) icon.textContent = t === 'dark' ? '◑' : '◐';
    if (label) label.textContent = t === 'dark' ? 'Escuro' : 'Claro';
  }

  function bind() {
    const toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    apply(current);
    toggle.addEventListener('click', function () {
      const now = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      apply(now === 'dark' ? 'light' : 'dark');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
