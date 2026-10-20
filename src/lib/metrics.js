'use strict';

/**
 * Métricas de negócio e de runtime (Fase 8), no formato de exposição do
 * Prometheus, **sem dependência nova**.
 *
 * Por que em memória: o PRAXIS roda um worker e um processo web; métricas
 * por processo cobrem os sinais que a operação precisa (erros 5xx, latência,
 * entregas do worker, custo de IA). Agregação multi-instância é problema de
 * escala — fica para quando houver mais de uma instância, igual ao cache.
 *
 * O formato é o texto do Prometheus (`# TYPE`, `nome{labels} valor`), que
 * Grafana/Alertmanager e outros coletores já leem sem adaptador.
 */

const counters = new Map(); // nome -> { help, values: Map<labelKey, { labels, value }> }
const histograms = new Map(); // nome -> { help, buckets, counts: Map<labelKey, number[]>, sums, totals }

function ensureCounter(name, help) {
  if (!counters.has(name)) {
    counters.set(name, { help, values: new Map() });
  }
  return counters.get(name);
}

function ensureHistogram(name, help, buckets) {
  if (!histograms.has(name)) {
    histograms.set(name, { help, buckets, counts: new Map(), sums: new Map(), totals: new Map() });
  }
  return histograms.get(name);
}

function labelKey(labels) {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',');
}

/** Incrementa um contador (eventos acumulados). */
function increment(name, help, labels = {}, value = 1) {
  const counter = ensureCounter(name, help);
  const key = labelKey(labels);
  const current = counter.values.get(key);
  counter.values.set(key, {
    labels,
    value: (current ? current.value : 0) + value
  });
}

/**
 * Lê o valor atual de um contador (0 se ainda não existir).
 * Usado pelos alertas para comparar janelas de tempo sem expor o registry.
 */
function getCounter(name, labels = {}) {
  const counter = counters.get(name);
  if (!counter) {
    return 0;
  }
  const current = counter.values.get(labelKey(labels));
  return current ? current.value : 0;
}

/** Lista os valores de um contador com seus labels (para agregações). */
function getCounters(name) {
  const counter = counters.get(name);
  if (!counter) {
    return [];
  }
  return [...counter.values.values()].map((entry) => ({
    labels: entry.labels,
    value: entry.value
  }));
}

/** Observa um valor num histograma (ex.: latência em segundos). */
function observe(name, help, buckets, value, labels = {}) {
  const histogram = ensureHistogram(name, help, buckets);
  const key = labelKey(labels);
  const counts = histogram.counts.get(key) || histogram.buckets.map(() => 0);
  for (let i = 0; i < histogram.buckets.length; i += 1) {
    if (value <= histogram.buckets[i]) {
      counts[i] += 1;
    }
  }
  histogram.counts.set(key, counts);
  histogram.sums.set(key, (histogram.sums.get(key) || 0) + value);
  histogram.totals.set(key, (histogram.totals.get(key) || 0) + 1);
}

/** Formata número no padrão Prometheus (sem notação científica). */
function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

function renderLabels(key, extra = '') {
  const parts = [key, extra].filter(Boolean);
  return parts.length ? `{${parts.join(',')}}` : '';
}

/** Serializa o registry no formato de texto do Prometheus. */
function render() {
  const lines = [];

  for (const [name, counter] of counters.entries()) {
    lines.push(`# HELP ${name} ${counter.help}`);
    lines.push(`# TYPE ${name} counter`);
    if (counter.values.size === 0) {
      lines.push(`${name} 0`);
    }
    for (const [key, entry] of counter.values.entries()) {
      lines.push(`${name}${renderLabels(key)} ${formatNumber(entry.value)}`);
    }
  }

  for (const [name, histogram] of histograms.entries()) {
    lines.push(`# HELP ${name} ${histogram.help}`);
    lines.push(`# TYPE ${name} histogram`);
    const keys = new Set([...histogram.counts.keys(), ...histogram.totals.keys()]);
    if (keys.size === 0) {
      lines.push(`${name}_count 0`);
    }
    for (const key of keys) {
      const counts = histogram.counts.get(key) || histogram.buckets.map(() => 0);
      let cumulative = 0;
      for (let i = 0; i < histogram.buckets.length; i += 1) {
        cumulative += counts[i];
        const bucketLabel = `le="${histogram.buckets[i]}"`;
        lines.push(`${name}_bucket${renderLabels(key, bucketLabel)} ${cumulative}`);
      }
      const total = histogram.totals.get(key) || 0;
      lines.push(`${name}_bucket${renderLabels(key, 'le="+Inf"')} ${total}`);
      lines.push(`${name}_sum${renderLabels(key)} ${formatNumber(histogram.sums.get(key) || 0)}`);
      lines.push(`${name}_count${renderLabels(key)} ${total}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Zera o registry (usado nos testes para isolar casos). */
function reset() {
  counters.clear();
  histograms.clear();
}

// Latências em segundos (padrão Prometheus).
const HTTP_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

module.exports = {
  increment,
  observe,
  getCounter,
  getCounters,
  render,
  reset,
  HTTP_DURATION_BUCKETS
};
