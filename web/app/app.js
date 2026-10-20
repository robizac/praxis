const screens = {
  home: document.getElementById('screen-home'),
  history: document.getElementById('screen-history'),
  review: document.getElementById('screen-review'),
  account: document.getElementById('screen-account')
};

const state = {
  history: [],
  pendingCount: 0,
  plans: [],
  subscription: null
};

const ui = {
  navLinks: Array.from(document.querySelectorAll('[data-nav]')),
  generateBtn: document.getElementById('generateBtn'),
  inputLearned: document.getElementById('inputLearned'),
  inputArea: document.getElementById('inputArea'),
  homeNotice: document.getElementById('homeNotice'),
  resultCards: document.getElementById('resultCards'),
  summaryText: document.getElementById('summaryText'),
  resAcao: document.getElementById('resAcao'),
  resPrazo: document.getElementById('resPrazo'),
  resRegra: document.getElementById('resRegra'),
  filterArea: document.getElementById('filterArea'),
  filterStatus: document.getElementById('filterStatus'),
  filterQuery: document.getElementById('filterQuery'),
  filterSort: document.getElementById('filterSort'),
  exportHistoryCsvBtn: document.getElementById('exportHistoryCsvBtn'),
  exportHistoryMdBtn: document.getElementById('exportHistoryMdBtn'),
  historyList: document.getElementById('historyList'),
  saveReviewBtn: document.getElementById('saveReviewBtn'),
  reviewNotice: document.getElementById('reviewNotice'),
  reviewList: document.getElementById('reviewList'),
  rev1: document.getElementById('rev1'),
  rev2: document.getElementById('rev2'),
  rev3: document.getElementById('rev3'),
  rev4: document.getElementById('rev4'),
  quotaText: document.getElementById('quotaText'),
  planText: document.getElementById('planText'),
  upgradeProBtn: document.getElementById('upgradeProBtn'),
  upgradeAnnualBtn: document.getElementById('upgradeAnnualBtn'),
  portalBtn: document.getElementById('portalBtn'),
  byokProvider: document.getElementById('byokProvider'),
  byokKey: document.getElementById('byokKey'),
  byokModel: document.getElementById('byokModel'),
  byokBaseUrl: document.getElementById('byokBaseUrl'),
  telegramText: document.getElementById('telegramText'),
  telegramCode: document.getElementById('telegramCode'),
  telegramLinkBtn: document.getElementById('telegramLinkBtn'),
  telegramUnlinkBtn: document.getElementById('telegramUnlinkBtn'),
  reminderEnabled: document.getElementById('reminderEnabled'),
  reminderChannel: document.getElementById('reminderChannel'),
  reminderLead: document.getElementById('reminderLead'),
  saveReminderBtn: document.getElementById('saveReminderBtn'),
  exportDataBtn: document.getElementById('exportDataBtn'),
  deleteAccountBtn: document.getElementById('deleteAccountBtn'),
  saveByokBtn: document.getElementById('saveByokBtn'),
  removeByokBtn: document.getElementById('removeByokBtn'),
  accountNotice: document.getElementById('accountNotice')
};

const authUi = {
  screen: document.getElementById('screen-auth'),
  shell: document.getElementById('appShell'),
  tabs: document.getElementById('authTabs'),
  loginForm: document.getElementById('authLoginForm'),
  registerForm: document.getElementById('authRegisterForm'),
  forgotForm: document.getElementById('authForgotForm'),
  resetForm: document.getElementById('authResetForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginNotice: document.getElementById('loginNotice'),
  regName: document.getElementById('regName'),
  regEmail: document.getElementById('regEmail'),
  regPassword: document.getElementById('regPassword'),
  registerNotice: document.getElementById('registerNotice'),
  forgotEmail: document.getElementById('forgotEmail'),
  forgotNotice: document.getElementById('forgotNotice'),
  resetPassword: document.getElementById('resetPassword'),
  resetNotice: document.getElementById('resetNotice'),
  userEmail: document.getElementById('userEmail'),
  logoutBtn: document.getElementById('logoutBtn')
};

let resetToken = '';

function getCookie(name) {
  const prefix = `${name}=`;
  const part = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : '';
}

async function ensureCsrf() {
  if (!getCookie('praxis_csrf')) {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitize(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function showNotice(el, message) {
  el.textContent = message;
  el.classList.add('visible');
}

function hideNotice(el) {
  el.textContent = '';
  el.classList.remove('visible');
}

function getRoute() {
  const route = location.hash.replace('#/', '');
  if (route === 'history' || route === 'review' || route === 'account') {
    return route;
  }
  return 'home';
}

function renderRoute() {
  const route = getRoute();
  Object.entries(screens).forEach(([key, node]) => {
    node.classList.toggle('active', key === route);
  });
  ui.navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === route);
  });
}

async function requestJson(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRF-Token'] = getCookie('praxis_csrf');
  }

  const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    showAuth('login');
  }

  if (!res.ok) {
    const errorBody = data && data.error && typeof data.error === 'object' ? data.error : {};
    const error = new Error(errorBody.message || data.message || 'Erro de comunicação');
    error.status = res.status;
    error.payload = data;
    error.code = errorBody.code;
    throw error;
  }
  return data;
}

async function downloadHistory(format) {
  try {
    const res = await fetch(`/api/history/export?format=${encodeURIComponent(format)}`, {
      credentials: 'same-origin'
    });
    if (!res.ok) {
      throw new Error('Falha ao exportar.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'md' ? 'praxis-historico.md' : 'praxis-historico.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (_error) {
    alert('Não foi possível exportar o histórico agora.');
  }
}

async function loadSummary() {
  try {
    const data = await requestJson('/api/summary');
    const text = `Pendentes: ${data.pendentes} · Feitas esta semana: ${data.feitosSemana} · Streak: ${data.streak} dia(s)`;
    ui.summaryText.textContent = text;
  } catch (_error) {
    ui.summaryText.textContent = 'Não foi possível carregar o resumo.';
  }
}

function renderHomeGate() {
  const blocked = state.pendingCount >= 2;
  ui.generateBtn.disabled = blocked;
  if (blocked) {
    showNotice(ui.homeNotice, 'Você já tem 2 ações pendentes. Conclua 1 para gerar outra.');
  } else {
    hideNotice(ui.homeNotice);
  }
}

function renderHistory() {
  let items = [...state.history];
  const area = ui.filterArea.value;
  const status = ui.filterStatus.value;
  const query = sanitize(ui.filterQuery.value).toLowerCase();
  const sort = ui.filterSort.value;

  if (area) {
    items = items.filter((item) => item.area === area);
  }

  if (status !== 'all') {
    items = items.filter((item) => item.status === status);
  }

  if (query) {
    items = items.filter((item) => {
      const hay = `${item.texto} ${item.acao} ${item.prazo}`.toLowerCase();
      return hay.includes(query);
    });
  }

  if (sort === 'deadline') {
    items.sort((a, b) => new Date(a.prazo_iso) - new Date(b.prazo_iso));
  } else {
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (!items.length) {
    ui.historyList.innerHTML =
      '<p class="empty">Nenhuma ação ainda. Gere sua primeira ação na tela Início.</p>';
    return;
  }

  ui.historyList.innerHTML = items
    .map((item) => {
      const statusLabel = item.status === 'feito' ? 'concluído' : 'pendente';
      const actionLabel = item.status === 'feito' ? 'Reabrir' : 'Concluir';
      const nextStatus = item.status === 'feito' ? 'pendente' : 'feito';
      return `
            <article class="card history-item">
              <span class="badge">${escapeHtml(item.area)}</span>
              <span class="badge">${escapeHtml(statusLabel)}</span>
              <div>${escapeHtml(item.acao)}</div>
              <div class="meta">Prazo: ${escapeHtml(item.prazo)}</div>
              <div class="meta">Criado em: ${escapeHtml(new Date(item.created_at).toLocaleString('pt-BR'))}</div>
              <button class="button secondary" data-action="toggle-status" data-id="${item.id}" data-status="${nextStatus}">${actionLabel}</button>
            </article>
          `;
    })
    .join('');
}

async function refreshHistoryAndMeta() {
  const [history, meta] = await Promise.all([
    requestJson('/api/history'),
    requestJson('/api/meta')
  ]);
  state.history = Array.isArray(history) ? history : [];
  state.pendingCount = Number(meta?.pendentes || 0);
  renderHomeGate();
  renderHistory();
  loadSummary();
}

async function generateAction() {
  const input = sanitize(ui.inputLearned.value);
  const area = sanitize(ui.inputArea.value);

  if (!input) {
    showNotice(ui.homeNotice, 'Escreva o que você aprendeu para gerar uma ação.');
    return;
  }

  if (!area) {
    showNotice(ui.homeNotice, 'Selecione a Área da Vida para continuar.');
    return;
  }

  ui.generateBtn.disabled = true;
  ui.generateBtn.classList.add('loading');

  try {
    const data = await requestJson('/api/praxis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, area })
    });

    hideNotice(ui.homeNotice);
    ui.resAcao.textContent = data.acao;
    ui.resPrazo.textContent = data.prazo;
    ui.resRegra.textContent = data.regraMinima || data.regra_minima;
    ui.resultCards.hidden = false;

    const notes = [];
    if (data.warning) {
      notes.push(data.warning);
    }
    if (data.defaultReminder) {
      const when = new Date(data.defaultReminder.remind_at_iso).toLocaleString('pt-BR');
      notes.push(`Lembrete agendado para ${when}.`);
    }
    if (notes.length) {
      showNotice(ui.homeNotice, notes.join(' '));
    }

    ui.inputLearned.value = '';
    await refreshHistoryAndMeta();
  } catch (error) {
    if (error.status === 409 && error.code === 'limite_pendentes') {
      showNotice(ui.homeNotice, error.message);
      await refreshHistoryAndMeta();
      return;
    }

    if (error.status === 402) {
      showNotice(ui.homeNotice, `${error.message} Configure sua chave em "Conta" ou faça upgrade.`);
      return;
    }

    if (String(error.message || '').includes('formato inválido')) {
      showNotice(ui.homeNotice, 'Não entendi a resposta da IA — gere novamente.');
      return;
    }

    showNotice(ui.homeNotice, 'Não foi possível gerar a ação agora. Tente novamente.');
  } finally {
    ui.generateBtn.classList.remove('loading');
    renderHomeGate();
  }
}

async function toggleStatus(id, status, button) {
  button.disabled = true;
  button.classList.add('loading');
  try {
    await requestJson(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await refreshHistoryAndMeta();
  } catch (_error) {
    alert('Não foi possível atualizar este item agora.');
  } finally {
    button.classList.remove('loading');
  }
}

function renderReviews(items) {
  const limited = (Array.isArray(items) ? items : []).slice(0, 10);
  if (!limited.length) {
    ui.reviewList.innerHTML = '<p class="empty">Nenhuma revisão registrada ainda.</p>';
    return;
  }

  ui.reviewList.innerHTML = limited
    .map(
      (item) => `
          <details>
            <summary>${escapeHtml(new Date(item.created_at).toLocaleString('pt-BR'))}</summary>
            <p><strong>1) O que executei?</strong><br>${escapeHtml(item.respostas?.executei)}</p>
            <p><strong>2) O que trouxe paz?</strong><br>${escapeHtml(item.respostas?.trouxe_paz)}</p>
            <p><strong>3) O que gerou peso?</strong><br>${escapeHtml(item.respostas?.gerou_peso)}</p>
            <p><strong>4) O que deve sair?</strong><br>${escapeHtml(item.respostas?.deve_sair)}</p>
          </details>
        `
    )
    .join('');
}

async function loadReviews() {
  try {
    const items = await requestJson('/api/weekly-reviews');
    renderReviews(items);
  } catch (_error) {
    ui.reviewList.innerHTML = '<p class="empty">Erro ao carregar revisões.</p>';
  }
}

async function saveReview() {
  const respostas = {
    executei: sanitize(ui.rev1.value),
    trouxe_paz: sanitize(ui.rev2.value),
    gerou_peso: sanitize(ui.rev3.value),
    deve_sair: sanitize(ui.rev4.value)
  };

  if (
    !respostas.executei ||
    !respostas.trouxe_paz ||
    !respostas.gerou_peso ||
    !respostas.deve_sair
  ) {
    showNotice(ui.reviewNotice, 'Preencha as 4 respostas antes de salvar.');
    return;
  }

  ui.saveReviewBtn.disabled = true;
  ui.saveReviewBtn.classList.add('loading');

  try {
    await requestJson('/api/weekly-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respostas })
    });
    hideNotice(ui.reviewNotice);
    ui.rev1.value = '';
    ui.rev2.value = '';
    ui.rev3.value = '';
    ui.rev4.value = '';
    await loadReviews();
  } catch (_error) {
    showNotice(ui.reviewNotice, 'Não foi possível salvar a revisão agora.');
  } finally {
    ui.saveReviewBtn.classList.remove('loading');
    ui.saveReviewBtn.disabled = false;
  }
}

function formatDate(iso) {
  if (!iso) {
    return '';
  }
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch (_error) {
    return '';
  }
}

function renderPlan() {
  const sub = state.subscription;
  if (!sub) {
    ui.planText.textContent = 'Plano Free';
    return;
  }

  const name = escapeHtml(sub.plan?.name || 'Free');
  let text = `Plano ${name}`;
  if (sub.status && sub.status !== 'none') {
    text += ` • status: ${escapeHtml(sub.status)}`;
  }
  if (sub.currentPeriodEnd) {
    text += ` • até ${escapeHtml(formatDate(sub.currentPeriodEnd))}`;
  }
  if (sub.cancelAtPeriodEnd) {
    text += ' • cancelamento agendado';
  }
  ui.planText.textContent = text;
}

function priceIdFor(planId) {
  const plan = state.plans.find((item) => item.id === planId);
  return plan ? plan.priceId : null;
}

async function startCheckout(planId) {
  const priceId = priceIdFor(planId);
  if (!priceId) {
    showNotice(ui.accountNotice, 'Pagamentos indisponíveis no momento.');
    return;
  }
  try {
    const session = await requestJson('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId })
    });
    if (session.url) {
      window.location.href = session.url;
    }
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível iniciar o checkout.');
  }
}

async function openPortal() {
  try {
    const session = await requestJson('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (session.url) {
      window.location.href = session.url;
    }
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível abrir o portal de assinatura.');
  }
}

async function loadTelegram() {
  try {
    const status = await requestJson('/api/telegram');
    if (!status.configured) {
      ui.telegramText.textContent = 'Bot do Telegram não configurado no servidor.';
      ui.telegramLinkBtn.disabled = true;
      ui.telegramUnlinkBtn.disabled = true;
      return;
    }
    ui.telegramText.textContent = status.linked
      ? `Vinculado${status.username ? ` (@${status.username})` : ''}.`
      : 'Não vinculado.';
    ui.telegramLinkBtn.disabled = status.linked;
    ui.telegramUnlinkBtn.disabled = !status.linked;
  } catch (_error) {
    ui.telegramText.textContent = 'Não foi possível carregar o Telegram agora.';
  }
}

async function generateTelegramCode() {
  try {
    const data = await requestJson('/api/telegram/link-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const bot = data.botUsername ? `@${escapeHtml(data.botUsername)}` : 'o bot';
    ui.telegramCode.innerHTML = `Envie <code>/start ${escapeHtml(data.code)}</code> para ${bot} no Telegram.`;
    showNotice(ui.accountNotice, 'Código gerado. Ele expira em 15 minutos.');
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível gerar o código.');
  }
}

async function unlinkTelegram() {
  try {
    await requestJson('/api/telegram/link', { method: 'DELETE' });
    ui.telegramCode.textContent = '';
    showNotice(ui.accountNotice, 'Telegram desvinculado.');
    await loadTelegram();
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível desvincular.');
  }
}

async function loadReminderSettings() {
  try {
    const data = await requestJson('/api/settings');
    const prefs = data.reminderDefault || {};
    ui.reminderEnabled.checked = Boolean(prefs.enabled);
    ui.reminderChannel.value = prefs.channel || 'browser';
    ui.reminderLead.value = prefs.leadMinutes !== undefined ? prefs.leadMinutes : 10;
  } catch (_error) {
    showNotice(ui.accountNotice, 'Não foi possível carregar as preferências de lembrete.');
  }
}

async function saveReminderSettings() {
  try {
    const data = await requestJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: ui.reminderEnabled.checked,
        channel: ui.reminderChannel.value,
        leadMinutes: Number(ui.reminderLead.value)
      })
    });
    const prefs = data.reminderDefault || {};
    ui.reminderEnabled.checked = Boolean(prefs.enabled);
    ui.reminderChannel.value = prefs.channel || 'browser';
    ui.reminderLead.value = prefs.leadMinutes !== undefined ? prefs.leadMinutes : 10;
    showNotice(ui.accountNotice, 'Preferências de lembrete salvas.');
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível salvar as preferências.');
  }
}

async function loadAccount() {
  try {
    const [usage, cred, subscription, plans] = await Promise.all([
      requestJson('/api/ai/usage'),
      requestJson('/api/ai/credentials'),
      requestJson('/api/billing/subscription').catch(() => null),
      state.plans.length
        ? Promise.resolve(null)
        : requestJson('/api/billing/plans').catch(() => null)
    ]);

    if (plans?.plans) {
      state.plans = plans.plans;
    }
    state.subscription = subscription;
    renderPlan();
    loadTelegram();
    loadReminderSettings();

    const byok = usage.byokActive
      ? `• BYOK ativo (${escapeHtml(usage.provider || '')})`
      : '• modo gerenciado';
    ui.quotaText.innerHTML = `${usage.used}/${usage.limit} gerações no mês • plano ${escapeHtml(usage.planName)} ${byok}`;

    const credential = cred?.credential;
    if (credential) {
      ui.byokProvider.value = credential.provider || '';
      ui.byokModel.value = credential.model || '';
      ui.byokBaseUrl.value = credential.base_url || '';
    }

    // Habilita/desabilita ações de plano conforme disponibilidade.
    const proPlan = state.plans.find((item) => item.id === 'pro');
    const annualPlan = state.plans.find((item) => item.id === 'pro_annual');
    ui.upgradeProBtn.disabled = !(proPlan && proPlan.purchasable);
    ui.upgradeAnnualBtn.disabled = !(annualPlan && annualPlan.purchasable);
    ui.portalBtn.disabled = !(subscription && subscription.hasCustomer);
    if (proPlan && proPlan.priceBrl) {
      ui.upgradeProBtn.textContent = `Assinar Pro (R$${proPlan.priceBrl}/mês)`;
    }
    if (annualPlan && annualPlan.priceBrl) {
      ui.upgradeAnnualBtn.textContent = `Assinar Pro Anual (R$${annualPlan.priceBrl}/ano)`;
    }
  } catch (_error) {
    ui.quotaText.textContent = 'Não foi possível carregar o uso agora.';
    ui.planText.textContent = 'Não foi possível carregar o plano agora.';
  }
}

async function saveByok() {
  const provider = ui.byokProvider.value;
  if (!provider) {
    showNotice(ui.accountNotice, 'Selecione um provider para salvar a chave.');
    return;
  }

  const apiKey = ui.byokKey.value.trim();
  if (provider !== 'ollama' && apiKey.length < 8) {
    showNotice(ui.accountNotice, 'Informe uma chave de API válida.');
    return;
  }

  ui.saveByokBtn.disabled = true;
  ui.saveByokBtn.classList.add('loading');
  try {
    await requestJson('/api/ai/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey,
        model: ui.byokModel.value.trim(),
        baseUrl: ui.byokBaseUrl.value.trim()
      })
    });
    ui.byokKey.value = '';
    showNotice(ui.accountNotice, 'Chave salva! As próximas gerações usarão sua chave.');
    await loadAccount();
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível salvar a chave.');
  } finally {
    ui.saveByokBtn.disabled = false;
    ui.saveByokBtn.classList.remove('loading');
  }
}

async function removeByok() {
  ui.removeByokBtn.disabled = true;
  ui.removeByokBtn.classList.add('loading');
  try {
    await requestJson('/api/ai/credentials', { method: 'DELETE' });
    ui.byokProvider.value = '';
    ui.byokKey.value = '';
    ui.byokModel.value = '';
    ui.byokBaseUrl.value = '';
    showNotice(ui.accountNotice, 'Chave removida. Voltando ao modo gerenciado.');
    await loadAccount();
  } catch (error) {
    showNotice(ui.accountNotice, error.message || 'Não foi possível remover a chave.');
  } finally {
    ui.removeByokBtn.disabled = false;
    ui.removeByokBtn.classList.remove('loading');
  }
}

function showAuth(view = 'login') {
  authUi.shell.hidden = true;
  Object.values(screens).forEach((node) => node.classList.remove('active'));
  authUi.screen.classList.add('active');

  authUi.loginForm.hidden = view !== 'login';
  authUi.registerForm.hidden = view !== 'register';
  authUi.forgotForm.hidden = view !== 'forgot';
  authUi.resetForm.hidden = view !== 'reset';
  authUi.tabs.style.display = view === 'login' || view === 'register' ? 'flex' : 'none';

  authUi.tabs.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.authTab === view);
  });
}

function showApp(user) {
  authUi.screen.classList.remove('active');
  authUi.shell.hidden = false;
  authUi.userEmail.textContent = user?.email || '';
  if (!location.hash) {
    location.hash = '#/home';
  }
  renderRoute();
}

async function refreshData() {
  await refreshHistoryAndMeta();
  await loadReviews();
  await loadAccount();
}

function readHash() {
  return location.hash.replace('#/', '');
}

function queryFromHash(hash) {
  const index = hash.indexOf('?');
  return new URLSearchParams(index === -1 ? '' : hash.slice(index + 1));
}

async function handleAuthSubmit(form, noticeEl, action) {
  const button = form.querySelector('button[type="submit"]');
  hideNotice(noticeEl);
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await action();
  } catch (error) {
    showNotice(noticeEl, error.message || 'Não foi possível concluir. Tente novamente.');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function doLogin() {
  const data = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authUi.loginEmail.value, password: authUi.loginPassword.value })
  });
  authUi.loginPassword.value = '';
  showApp(data.user);
  await refreshData();
}

async function doRegister() {
  const data = await requestJson('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: authUi.regName.value,
      email: authUi.regEmail.value,
      password: authUi.regPassword.value,
      acceptedTerms: document.getElementById('regConsent')?.checked === true
    })
  });
  authUi.regPassword.value = '';
  showApp(data.user);
  await refreshData();
}

async function doForgot() {
  const data = await requestJson('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authUi.forgotEmail.value })
  });
  let message = 'Se o e-mail estiver cadastrado, enviaremos um link de redefinição.';
  if (data.devToken) {
    message += ` (dev) token: ${data.devToken}`;
  }
  showNotice(authUi.forgotNotice, message);
}

async function doReset() {
  if (!resetToken) {
    showNotice(authUi.resetNotice, 'Link inválido ou expirado. Solicite um novo.');
    return;
  }
  await requestJson('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: authUi.resetPassword.value })
  });
  authUi.resetPassword.value = '';
  showNotice(authUi.resetNotice, 'Senha redefinida! Você já pode entrar.');
  setTimeout(() => showAuth('login'), 1200);
}

async function handleVerifyEmail(hash) {
  const token = queryFromHash(hash).get('token');
  let message = 'Não foi possível confirmar o e-mail.';
  try {
    await requestJson('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    message = 'E-mail confirmado com sucesso! Faça login.';
  } catch (_error) {
    // Mantém a mensagem padrão de falha.
  }
  location.hash = '#/home';
  showAuth('login');
  showNotice(authUi.loginNotice, message);
}

function maybeShowReset(hash) {
  if (hash.startsWith('redefinir-senha')) {
    resetToken = queryFromHash(hash).get('token') || '';
    showAuth('reset');
    return true;
  }
  return false;
}

async function bootstrap() {
  const hash = readHash();
  await ensureCsrf();

  // Link de confirmação de e-mail (não exige sessão).
  if (hash.startsWith('verificar-email')) {
    await handleVerifyEmail(hash);
    return;
  }

  const meResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (meResponse.ok) {
    const data = await meResponse.json();
    showApp(data.user);
    await refreshData();
    handleBillingReturn();
    return;
  }

  if (maybeShowReset(hash)) {
    return;
  }

  showAuth('login');
}

function handleBillingReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  if (!checkout && !params.get('billing')) {
    return;
  }

  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  window.location.hash = '#/account';

  if (checkout === 'ok') {
    showNotice(
      ui.accountNotice,
      'Assinatura em processamento. O acesso Pro é liberado assim que o pagamento é confirmado.'
    );
    // Repete a leitura otimista após o webhook sincronizar.
    setTimeout(() => loadAccount().catch(() => {}), 4000);
  } else if (checkout === 'cancel') {
    showNotice(ui.accountNotice, 'Checkout cancelado. Nenhuma cobrança foi feita.');
  }
}

ui.generateBtn.addEventListener('click', generateAction);
ui.filterArea.addEventListener('change', renderHistory);
ui.filterStatus.addEventListener('change', renderHistory);
ui.filterSort.addEventListener('change', renderHistory);
ui.filterQuery.addEventListener('input', renderHistory);
ui.exportHistoryCsvBtn.addEventListener('click', () => downloadHistory('csv'));
ui.exportHistoryMdBtn.addEventListener('click', () => downloadHistory('md'));

ui.exportDataBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/account/export', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('fail');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'praxis-dados.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (_error) {
    showNotice(ui.accountNotice, 'Não foi possível exportar os dados agora.');
  }
});

ui.historyList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  if (target.dataset.action === 'toggle-status') {
    toggleStatus(target.dataset.id, target.dataset.status, target);
  }
});

ui.saveReviewBtn.addEventListener('click', saveReview);
ui.saveByokBtn.addEventListener('click', saveByok);
ui.removeByokBtn.addEventListener('click', removeByok);
ui.upgradeProBtn.addEventListener('click', () => startCheckout('pro'));
ui.upgradeAnnualBtn.addEventListener('click', () => startCheckout('pro_annual'));
ui.portalBtn.addEventListener('click', openPortal);
ui.telegramLinkBtn.addEventListener('click', generateTelegramCode);
ui.telegramUnlinkBtn.addEventListener('click', unlinkTelegram);
ui.saveReminderBtn.addEventListener('click', saveReminderSettings);
window.addEventListener('hashchange', () => {
  const hash = readHash();
  if (hash.startsWith('verificar-email')) {
    handleVerifyEmail(hash);
    return;
  }
  if (maybeShowReset(hash)) {
    return;
  }
  renderRoute();
});

authUi.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuthSubmit(authUi.loginForm, authUi.loginNotice, doLogin);
});
authUi.registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuthSubmit(authUi.registerForm, authUi.registerNotice, doRegister);
});
authUi.forgotForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuthSubmit(authUi.forgotForm, authUi.forgotNotice, doForgot);
});
authUi.resetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuthSubmit(authUi.resetForm, authUi.resetNotice, doReset);
});

authUi.tabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-auth-tab]');
  if (tab) {
    showAuth(tab.dataset.authTab);
  }
});

authUi.screen.addEventListener('click', (event) => {
  const link = event.target.closest('[data-auth-link]');
  if (link) {
    showAuth(link.dataset.authLink);
  }
});

authUi.logoutBtn.addEventListener('click', async () => {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
  } catch (_error) {
    // Sessão já pode ter expirado; segue para a tela de login.
  }
  showAuth('login');
});

bootstrap();
