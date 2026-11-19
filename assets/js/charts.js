/* ==========================================================================
   charts.js · Small Chart.js helper. Reads brand colours from CSS variables and
   redraws every registered chart when the theme changes (event "bs:theme").
   Usage: BS.charts.make('canvasId', (colors) => ({ type:'bar', data:{...}, options:{...} }))
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS, registry = {};

  const colors = () => {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    return { text: v('--muted'), grid: v('--border'), navy: dark ? '#6B8FE8' : '#0B2046', navySoft: dark ? 'rgba(107,143,232,.35)' : 'rgba(11,32,70,.22)', amber: '#E8A317', surface: v('--surface'), dark };
  };

  function draw(id) {
    const r = registry[id]; if (!r || !window.Chart) return;
    if (r.chart) r.chart.destroy();
    const c = colors();
    Chart.defaults.color = c.text;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    r.chart = new Chart(r.canvas, r.build(c));
  }

  BS.charts = {
    colors,
    make(id, build) {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      registry[id] = Object.assign(registry[id] || {}, { canvas, build });
      draw(id);
    },
    /** Shared axis styling so every chart looks consistent */
    scales: (c, extra = {}) => ({
      x: { grid: { display: false }, ticks: { color: c.text } },
      y: Object.assign({ beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text }, border: { display: false } }, extra)
    })
  };

  document.addEventListener('bs:theme', () => Object.keys(registry).forEach(draw));
})();
