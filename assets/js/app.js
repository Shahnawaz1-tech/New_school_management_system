/* ==========================================================================
   app.js · Core helpers shared by every page: storage, UI prefs, toasts,
   confirm dialog, skeleton loader, formatting. Exposes everything on window.BS.
   NOTE: classic scripts (not ES modules) are used on purpose, because browsers
   block <script type="module"> on file:// and this demo must run by double-click.
   ========================================================================== */
(function () {
  'use strict';
  const BS = (window.BS = window.BS || {});
  const DB_KEY = 'bs_demo_db_v1', UI_KEY = 'bs_ui_v1';
  const CSS_LTR = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
  const CSS_RTL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css';

  /* ---------- Safe localStorage wrapper (falls back to memory) ---------- */
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };

  /* ---------- Demo database ---------- */
  let cache = null;
  BS.db = function () {
    if (cache) return cache;
    try { cache = JSON.parse(store.get(DB_KEY)); } catch (e) { cache = null; }
    if (!cache || cache.version !== 1) { cache = BS.seed(); BS.save(); }
    // Additive migrations keep existing browser demo data usable as the demo grows.
    ['payrollPayments', 'auditLog', 'parentLinks'].forEach((key) => {
      if (!cache[key]) cache[key] = key === 'payrollPayments' ? {} : [];
    });
    if (!cache.parentLinks.length && cache.students.some(student => student.id === 'S-1003')) {
      cache.parentLinks.push({ id: 'P-1001', name: 'Tariq Mehmood', studentIds: ['S-1003', 'S-1013'].filter(id => cache.students.some(student => student.id === id)) });
    }
    return cache;
  };
  BS.save = () => store.set(DB_KEY, JSON.stringify(cache));
  BS.audit = function (action, entity, entityId, details = '') {
    const db = BS.db();
    db.auditLog.push({ id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: new Date().toISOString(), actor: BS.user?.name || 'Demo user', role: BS.role || 'unknown', action, entity, entityId: String(entityId ?? ''), details: String(details).slice(0, 240) });
    if (db.auditLog.length > 500) db.auditLog.splice(0, db.auditLog.length - 500);
    BS.save();
  };
  BS.reset = function () {
    store.del(DB_KEY); cache = null;
    BS.toast('Demo data reset. Reloading…', 'success');
    setTimeout(() => location.reload(), 700);
  };
  /** Next id such as S-1061 from a list, given prefix + start number */
  BS.nextId = (prefix, list, start) => {
    const nums = list.map((x) => parseInt(String(x.id).replace(/\D/g, ''), 10) || 0);
    return `${prefix}-${Math.max(start - 1, ...nums) + 1}`;
  };

  /* ---------- UI preferences: theme, language, role, sidebar ---------- */
  BS.ui = {
    get(k, d) { try { const v = JSON.parse(store.get(UI_KEY)) || {}; return k in v ? v[k] : d; } catch (e) { return d; } },
    set(k, val) { let v = {}; try { v = JSON.parse(store.get(UI_KEY)) || {}; } catch (e) {} v[k] = val; store.set(UI_KEY, JSON.stringify(v)); }
  };
  BS.ROLES = {
    admin: { label: 'Admin', name: 'Waqas Butt', title: 'Administrator', icon: 'bi-shield-lock' },
    teacher: { label: 'Teacher', name: 'Sadia Noreen', title: 'Teacher · English', icon: 'bi-easel' },
    accountant: { label: 'Accountant', name: 'Bilal Ahmed', title: 'Accountant', icon: 'bi-calculator' },
    parent: { label: 'Parent', name: 'Tariq Mehmood', title: 'Parent', icon: 'bi-people' }
  };
  /** Apply theme + language/direction. Runs immediately (script is in <head>) to avoid a flash. */
  BS.applyUI = function () {
    const root = document.documentElement, lang = BS.ui.get('lang', 'en');
    root.setAttribute('data-bs-theme', BS.ui.get('theme', 'light'));
    root.setAttribute('lang', lang); root.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
    const link = document.getElementById('bs-css'); const want = lang === 'ur' ? CSS_RTL : CSS_LTR;
    if (link && link.getAttribute('href') !== want) link.setAttribute('href', want);
  };
  BS.applyUI();

  /* ---------- Formatting + small utilities ---------- */
  BS.qs = (s, r = document) => r.querySelector(s);
  BS.qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  BS.esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BS.pkr = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-PK');
  BS.fmtDate = (iso) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  BS.todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  BS.initials = (name) => String(name).replace(/^(Mr|Mrs|Ms)\.\s/, '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  BS.timeAgo = (isoStr) => { const m = Math.max(1, Math.round((Date.now() - new Date(isoStr)) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  BS.pill = (text, kind) => `<span class="pill pill-${kind}">${BS.esc(text)}</span>`;
  BS.statusKind = (s) => ({ Paid: 'success', Present: 'success', Approved: 'success', Active: 'success', Enrolled: 'success', Completed: 'success', Partial: 'warning', Pending: 'warning', Ongoing: 'warning', Leave: 'info', Upcoming: 'info', Unpaid: 'danger', Absent: 'danger', Rejected: 'danger' }[s] || 'muted');
  BS.param = (k) => new URLSearchParams(location.search).get(k);
  BS.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- Toasts (use for every action) ---------- */
  BS.toast = function (msg, type = 'success') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toast-container position-fixed bottom-0 end-0 p-3'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const icons = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = `toast align-items-center bs-toast bs-toast-${type}`; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="bi ${icons[type] || icons.info} me-2"></i>${BS.esc(msg)}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    box.appendChild(el);
    el.addEventListener('hidden.bs.toast', () => el.remove());
    new bootstrap.Toast(el, { delay: 3200 }).show();
  };

  /* ---------- Confirm dialog -> Promise<boolean> ---------- */
  BS.confirm = function (message, { title = 'Please confirm', ok = 'Yes, continue', danger = false } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal fade'; wrap.tabIndex = -1; wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-sm"><div class="modal-content">
        <div class="modal-header"><h2 class="modal-title fs-6">${BS.esc(title)}</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">${BS.esc(message)}</div>
        <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${BS.esc(ok)}</button></div></div></div>`;
      document.body.appendChild(wrap);
      const m = new bootstrap.Modal(wrap); let result = false;
      wrap.querySelector('[data-ok]').addEventListener('click', () => { result = true; m.hide(); });
      wrap.addEventListener('hidden.bs.modal', () => { wrap.remove(); resolve(result); });
      m.show();
    });
  };

  /* ---------- Skeleton loader + empty state ---------- */
  /** Show skeleton rows inside `el`, then call render() after `delay` ms */
  BS.loading = function (el, render, { rows = 5, delay = 450 } = {}) {
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = Array.from({ length: rows }, () => '<div class="skeleton-line"></div>').join('');
    setTimeout(() => { render(); el.removeAttribute('aria-busy'); }, delay);
  };
  BS.empty = (icon, title, text = '', action = '') =>
    `<div class="empty-state"><i class="bi ${icon}"></i><h3>${BS.esc(title)}</h3><p class="mb-3">${BS.esc(text)}</p>${action}</div>`;

  /* ---------- Printing ---------- */
  BS.print = () => window.print();
  /** Download text as a file (used for demo exports) */
  BS.download = (name, text, type = 'text/csv') => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
})();
