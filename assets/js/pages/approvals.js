(function () {
  'use strict';
  const BS = window.BS;

  let db, approvals, filtered = [], activeTab = 'all', page = 1;
  const PAGE_SIZE = 6;
  let requestModal, remarkModal, detailCanvas;
  let pendingAction = null, pendingId = null;

  // Priority assignment (deterministic from id)
  const PRIORITIES = ['High', 'Medium', 'Medium', 'Low', 'Medium', 'High', 'Low'];
  const TYPE_ICONS = {
    'Fee Discount':        { icon: 'bi-percent',           bg: 'rgba(67,97,238,.14)',   color: '#4361ee' },
    'Fee Waiver':          { icon: 'bi-cash-coin',         bg: 'rgba(6,214,160,.14)',   color: '#06d6a0' },
    'Leave':               { icon: 'bi-calendar-x-fill',   bg: 'rgba(255,159,28,.16)',  color: '#ff9f1c' },
    'Purchase':            { icon: 'bi-cart-fill',         bg: 'rgba(131,56,236,.14)',  color: '#8338ec' },
    'Event Budget':        { icon: 'bi-megaphone-fill',    bg: 'rgba(230,57,70,.13)',   color: '#e63946' },
    'Transfer Certificate':{ icon: 'bi-file-earmark-text', bg: 'rgba(46,196,182,.14)',  color: '#2ec4b6' },
    'Salary Advance':      { icon: 'bi-wallet2',           bg: 'rgba(232,163,23,.18)',  color: '#E8A317' },
    'Other':               { icon: 'bi-three-dots',        bg: 'rgba(102,114,143,.14)', color: '#66728F' }
  };

  BS.fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-PK');

  document.addEventListener('bs:ready', init);

  function init() {
    db = BS.db();
    // Enrich approvals with priority + details if missing
    if (!db.approvals) db.approvals = [];
    db.approvals.forEach((a, i) => {
      if (!a.priority) a.priority = PRIORITIES[i % PRIORITIES.length];
      if (!a.details)  a.details  = '';
      if (!a.remarks)  a.remarks  = [];
    });
    approvals = db.approvals;

    requestModal = new bootstrap.Modal(document.getElementById('requestModal'));
    remarkModal  = new bootstrap.Modal(document.getElementById('remarkModal'));
    detailCanvas = new bootstrap.Offcanvas(document.getElementById('detailCanvas'));

    populateFilters();
    renderKpi();
    renderSidebar();
    bindEvents();
    render();
  }

  function populateFilters() {
    const types = [...new Set(approvals.map(a => a.type))];
    const sel = document.getElementById('filterType');
    types.forEach(t => sel.insertAdjacentHTML('beforeend', `<option>${BS.esc(t)}</option>`));

    const staffSel = document.getElementById('fBy');
    (db.staff || []).forEach(s =>
      staffSel.insertAdjacentHTML('beforeend', `<option value="${BS.esc(s.name)}">${BS.esc(s.name)}</option>`)
    );
    document.getElementById('fDate').value = BS.todayISO();
  }

  /* ── KPI cards ── */
  function renderKpi() {
    const total    = approvals.length;
    const pending  = approvals.filter(a => a.status === 'Pending').length;
    const approved = approvals.filter(a => a.status === 'Approved').length;
    const rejected = approvals.filter(a => a.status === 'Rejected').length;
    const withAmt  = approvals.filter(a => a.amount).reduce((s, a) => s + (a.amount || 0), 0);

    const kpis = [
      { icon: 'bi-inbox-fill',        label: 'Total Requests', val: total,    color: '#4361ee' },
      { icon: 'bi-hourglass-split',   label: 'Pending',        val: pending,  color: '#ff9f1c' },
      { icon: 'bi-check-circle-fill', label: 'Approved',       val: approved, color: '#2ec4b6' },
      { icon: 'bi-x-circle-fill',     label: 'Rejected',       val: rejected, color: '#e63946' },
      { icon: 'bi-cash-coin',         label: 'Total Amount',   val: 'Rs ' + BS.fmtNum(withAmt), color: '#06d6a0', raw: null }
    ];

    document.getElementById('apKpi').innerHTML = kpis.map(k => `
      <div class="col-6 col-sm-4 col-xl-2-4">
        <div class="card-soft h-100 kpi-card" style="border-top:3px solid ${k.color}">
          <div class="kpi">
            <div class="ico" style="background:${k.color}22;color:${k.color}"><i class="bi ${k.icon}"></i></div>
            <div>
              <div class="val kpi-num" data-target="${k.raw !== undefined ? '' : k.val}">${k.val}</div>
              <div class="lbl">${k.label}</div>
            </div>
          </div>
        </div>
      </div>`).join('');

    // Animate numeric counters
    document.querySelectorAll('.kpi-num[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target);
      if (isNaN(target)) return;
      let cur = 0;
      const step = Math.max(1, Math.ceil(target / 30));
      const t = setInterval(() => {
        cur = Math.min(cur + step, target);
        el.textContent = cur;
        if (cur >= target) clearInterval(t);
      }, 20);
    });

    // Update tab counts
    document.getElementById('cnt-all').textContent      = total;
    document.getElementById('cnt-pending').textContent  = pending;
    document.getElementById('cnt-approved').textContent = approved;
    document.getElementById('cnt-rejected').textContent = rejected;
  }

  /* ── Sidebar: rate donut + type breakdown + timeline ── */
  function renderSidebar() {
    renderRateChart();
    renderTypeBreakdown();
    renderTimeline();
  }

  function renderRateChart() {
    const total    = approvals.length || 1;
    const approved = approvals.filter(a => a.status === 'Approved').length;
    const rejected = approvals.filter(a => a.status === 'Rejected').length;
    const pending  = approvals.filter(a => a.status === 'Pending').length;
    const pct      = Math.round((approved / total) * 100);

    const r = 28, circ = 2 * Math.PI * r;
    const aDash = (approved / total) * circ;
    const rDash = (rejected / total) * circ;
    const rOff  = aDash;

    document.getElementById('rateChart').innerHTML = `
      <div class="ring-wrap" style="width:80px;height:80px">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="#2ec4b6" stroke-width="9"
            stroke-dasharray="${aDash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="#e63946" stroke-width="9"
            stroke-dasharray="${rDash.toFixed(1)} ${circ.toFixed(1)}"
            stroke-dashoffset="-${rOff.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div class="ring-val">${pct}%</div>
      </div>
      <div class="flex-fill">
        <div class="d-flex align-items-center gap-2 mb-1 small">
          <span style="width:10px;height:10px;border-radius:50%;background:#2ec4b6;display:inline-block"></span>
          <span class="text-muted">Approved</span><span class="ms-auto fw-600">${approved}</span>
        </div>
        <div class="d-flex align-items-center gap-2 mb-1 small">
          <span style="width:10px;height:10px;border-radius:50%;background:#e63946;display:inline-block"></span>
          <span class="text-muted">Rejected</span><span class="ms-auto fw-600">${rejected}</span>
        </div>
        <div class="d-flex align-items-center gap-2 small">
          <span style="width:10px;height:10px;border-radius:50%;background:#ff9f1c;display:inline-block"></span>
          <span class="text-muted">Pending</span><span class="ms-auto fw-600">${pending}</span>
        </div>
      </div>`;
  }

  function renderTypeBreakdown() {
    const types = [...new Set(approvals.map(a => a.type))];
    const counts = types.map(t => ({ t, n: approvals.filter(a => a.type === t).length }));
    counts.sort((a, b) => b.n - a.n);
    const max = counts[0]?.n || 1;
    const colors = ['#4361ee','#2ec4b6','#ff9f1c','#8338ec','#06d6a0','#e63946','#E8A317'];

    document.getElementById('typeBreakdown').innerHTML = `<div class="p-1">` +
      counts.map((c, i) => {
        const pct = Math.round((c.n / max) * 100);
        const ic = TYPE_ICONS[c.t] || TYPE_ICONS['Other'];
        return `<div class="mb-2">
          <div class="d-flex justify-content-between small mb-1">
            <span class="d-flex align-items-center gap-1">
              <i class="bi ${ic.icon}" style="color:${colors[i % colors.length]}"></i>
              <span>${BS.esc(c.t)}</span>
            </span>
            <span class="text-muted fw-500">${c.n}</span>
          </div>
          <div class="progress" style="height:7px;border-radius:99px">
            <div class="progress-bar" role="progressbar"
              style="width:${pct}%;background:${colors[i % colors.length]};border-radius:99px"
              aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
          </div>
        </div>`;
      }).join('') + `</div>`;
  }

  function renderTimeline() {
    const recent = [...approvals]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);

    const dotClass = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };
    document.getElementById('apTimeline').innerHTML = `<div class="timeline p-2">` +
      recent.map(a => `
        <div class="tl-item">
          <div class="tl-dot ${dotClass[a.status] || 'new'}"></div>
          <div class="small">
            <div class="fw-500 text-truncate" style="max-width:220px" title="${BS.esc(a.title)}">${BS.esc(a.title)}</div>
            <div class="text-muted" style="font-size:.72rem">
              ${BS.esc(a.type)} · ${BS.fmtDate(a.date)}
              <span class="ms-1">${BS.pill(a.status, BS.statusKind(a.status))}</span>
            </div>
          </div>
        </div>`).join('') +
      `</div>`;
  }


  /* ── Main render ── */
  function render() {
    const q    = document.getElementById('apSearch').value.trim().toLowerCase();
    const type = document.getElementById('filterType').value;
    const pri  = document.getElementById('filterPriority').value;
    const date = document.getElementById('filterDate').value;

    let pool = approvals;
    if (activeTab !== 'all') pool = pool.filter(a => a.status.toLowerCase() === activeTab);

    filtered = pool.filter(a => {
      if (q && !`${a.title} ${a.type} ${a.by}`.toLowerCase().includes(q)) return false;
      if (type && a.type !== type) return false;
      if (pri  && a.priority !== pri) return false;
      if (date && a.date !== date) return false;
      return true;
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    renderCards(slice, q);
    renderPagination(pages);
  }

  function highlight(text, q) {
    if (!q) return BS.esc(text);
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return BS.esc(text).replace(re, '<mark>$1</mark>');
  }

  function renderCards(slice, q) {
    const list = document.getElementById('apList');
    if (!slice.length) {
      list.innerHTML = BS.empty('bi-check2-square', 'No requests found', 'Try adjusting your filters or tab.');
      return;
    }

    list.innerHTML = slice.map(a => {
      const ic = TYPE_ICONS[a.type] || TYPE_ICONS['Other'];
      const priClass = `priority-${(a.priority || 'medium').toLowerCase()}`;
      const statusKind = BS.statusKind(a.status);
      const amtHtml = a.amount
        ? `<span class="small text-muted ms-2"><i class="bi bi-cash-coin me-1"></i>Rs ${BS.fmtNum(a.amount)}</span>`
        : '';
      const deadlineHtml = a.deadline
        ? `<span class="small text-muted ms-2"><i class="bi bi-alarm me-1"></i>${BS.fmtDate(a.deadline)}</span>`
        : '';
      const remarkCount = (a.remarks || []).length;

      return `
        <div class="req-card ${a.status.toLowerCase()} mb-2" data-id="${a.id}">
          <div class="d-flex align-items-start gap-3">
            <input type="checkbox" class="form-check-input ap-check mt-1" data-id="${a.id}">
            <div class="req-type-icon" style="background:${ic.bg};color:${ic.color}">
              <i class="bi ${ic.icon}"></i>
            </div>
            <div class="flex-fill min-w-0">
              <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                <span class="fw-600 text-truncate" style="max-width:320px">${highlight(a.title, q)}</span>
                ${BS.pill(a.status, statusKind)}
                <span class="pill ${priClass}" style="font-size:.68rem">${a.priority || 'Medium'}</span>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-1 small text-muted">
                <span class="badge bg-secondary-subtle text-secondary border">${BS.esc(a.type)}</span>
                <span><i class="bi bi-person me-1"></i>${highlight(a.by, q)}</span>
                <span><i class="bi bi-calendar3 me-1"></i>${BS.fmtDate(a.date)}</span>
                ${amtHtml}${deadlineHtml}
                ${remarkCount ? `<span><i class="bi bi-chat-left-text me-1"></i>${remarkCount} remark${remarkCount > 1 ? 's' : ''}</span>` : ''}
              </div>
              ${a.details ? `<p class="small text-muted mb-0 mt-1 text-truncate" style="max-width:420px">${BS.esc(a.details)}</p>` : ''}
            </div>
            <div class="req-actions d-flex flex-column gap-1 ms-2">
              <button class="btn btn-xs btn-outline-secondary btn-view-ap" data-id="${a.id}" title="View Details">
                <i class="bi bi-eye"></i>
              </button>
              ${a.status === 'Pending' ? `
              <button class="btn btn-xs btn-success btn-approve-ap" data-id="${a.id}" title="Approve">
                <i class="bi bi-check-lg"></i>
              </button>
              <button class="btn btn-xs btn-danger btn-reject-ap" data-id="${a.id}" title="Reject">
                <i class="bi bi-x-lg"></i>
              </button>` : ''}
              <button class="btn btn-xs btn-outline-danger btn-del-ap" data-id="${a.id}" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.btn-view-ap').forEach(b    => b.addEventListener('click', () => viewDetail(b.dataset.id)));
    list.querySelectorAll('.btn-approve-ap').forEach(b => b.addEventListener('click', () => openRemark(b.dataset.id, 'Approved')));
    list.querySelectorAll('.btn-reject-ap').forEach(b  => b.addEventListener('click', () => openRemark(b.dataset.id, 'Rejected')));
    list.querySelectorAll('.btn-del-ap').forEach(b     => b.addEventListener('click', () => deleteRequest(b.dataset.id)));
    list.querySelectorAll('.ap-check').forEach(cb      => cb.addEventListener('change', updateBulkBar));
  }

  function renderPagination(pages) {
    const ul = document.getElementById('apPagination');
    if (pages <= 1) { ul.innerHTML = ''; return; }
    const prev = `<li class="page-item ${page===1?'disabled':''}"><a class="page-link" data-p="${page-1}" href="#">‹</a></li>`;
    const next = `<li class="page-item ${page===pages?'disabled':''}"><a class="page-link" data-p="${page+1}" href="#">›</a></li>`;
    const nums = Array.from({length: pages}, (_, i) => i + 1)
      .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
      .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('…'); acc.push(p); return acc; }, [])
      .map(p => p === '…'
        ? `<li class="page-item disabled"><span class="page-link">…</span></li>`
        : `<li class="page-item ${p===page?'active':''}"><a class="page-link" data-p="${p}" href="#">${p}</a></li>`)
      .join('');
    ul.innerHTML = prev + nums + next;
    ul.querySelectorAll('[data-p]').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); page = +a.dataset.p; render(); }));
  }


  /* ── Events ── */
  function bindEvents() {
    // Tabs
    document.querySelectorAll('#apTabNav .nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#apTabNav .nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        page = 1;
        render();
      });
    });

    // Filters
    document.getElementById('apSearch').addEventListener('input', BS.debounce(() => { page = 1; render(); }));
    ['filterType','filterPriority','filterDate'].forEach(id =>
      document.getElementById(id).addEventListener('change', () => { page = 1; render(); }));
    document.getElementById('clearFilters').addEventListener('click', () => {
      document.getElementById('apSearch').value = '';
      document.getElementById('filterType').value = '';
      document.getElementById('filterPriority').value = '';
      document.getElementById('filterDate').value = '';
      page = 1; render();
    });

    // New request
    document.getElementById('newRequestBtn').addEventListener('click', () => {
      document.getElementById('requestForm').classList.remove('was-validated');
      document.getElementById('requestForm').reset();
      document.getElementById('fDate').value = BS.todayISO();
      document.getElementById('requestModalTitle').textContent = 'New Approval Request';
      requestModal.show();
    });
    document.getElementById('requestForm').addEventListener('submit', saveRequest);

    // Remark confirm
    document.getElementById('remarkForm').addEventListener('submit', confirmRemark);

    // Bulk actions
    document.getElementById('bulkApprove').addEventListener('click', () => bulkAction('Approved'));
    document.getElementById('bulkReject').addEventListener('click',  () => bulkAction('Rejected'));

    // Export
    document.getElementById('exportBtn').addEventListener('click', exportCsv);
  }

  /* ── Approve / Reject with remark ── */
  function openRemark(id, action) {
    pendingId     = id;
    pendingAction = action;
    document.getElementById('fRemark').value = '';
    document.getElementById('remarkTitle').textContent = action === 'Approved' ? 'Approve Request' : 'Reject Request';
    const btn = document.getElementById('remarkConfirmBtn');
    btn.className = `btn ${action === 'Approved' ? 'btn-success' : 'btn-danger'}`;
    btn.textContent = action === 'Approved' ? 'Approve' : 'Reject';
    remarkModal.show();
  }

  function confirmRemark(e) {
    e.preventDefault();
    const remark = document.getElementById('fRemark').value.trim();
    updateStatus(pendingId, pendingAction, remark);
    remarkModal.hide();
  }

  function updateStatus(id, status, remark) {
    const a = approvals.find(x => x.id === id);
    if (!a) return;
    a.status = status;
    if (remark) {
      if (!a.remarks) a.remarks = [];
      a.remarks.push({ text: remark, by: BS.user.name, date: BS.todayISO() });
    }
    BS.save();
    BS.toast(`Request "${a.title}" ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'danger');
    renderKpi();
    renderSidebar();
    render();
  }

  function deleteRequest(id) {
    const a = approvals.find(x => x.id === id);
    if (!a) return;
    BS.confirm(`Delete "${a.title}"? This cannot be undone.`, { title: 'Delete Request', ok: 'Delete', danger: true })
      .then(ok => {
        if (!ok) return;
        db.approvals = approvals = approvals.filter(x => x.id !== id);
        BS.save();
        BS.toast('Request deleted.', 'danger');
        renderKpi(); renderSidebar(); render();
      });
  }

  /* ── Bulk actions ── */
  function updateBulkBar() {
    const n = document.querySelectorAll('.ap-check:checked').length;
    const bar = document.getElementById('apBulkBar');
    bar.classList.toggle('d-none', !n);
    bar.classList.toggle('d-flex', !!n);
    if (n) document.getElementById('apBulkCount').textContent = `${n} selected`;
  }

  function bulkAction(status) {
    const ids = [...document.querySelectorAll('.ap-check:checked')].map(cb => cb.dataset.id);
    if (!ids.length) return;
    ids.forEach(id => {
      const a = approvals.find(x => x.id === id);
      if (a && a.status === 'Pending') a.status = status;
    });
    BS.save();
    BS.toast(`${ids.length} request(s) ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'danger');
    renderKpi(); renderSidebar(); render();
    updateBulkBar();
  }

  /* ── New request save ── */
  function saveRequest(e) {
    e.preventDefault();
    const form = e.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const type     = document.getElementById('fType').value;
    const priority = document.getElementById('fPriority').value;
    const title    = document.getElementById('fTitle').value.trim();
    const by       = document.getElementById('fBy').value;
    const amount   = parseInt(document.getElementById('fAmount').value) || null;
    const details  = document.getElementById('fDetails').value.trim();
    const date     = document.getElementById('fDate').value;
    const deadline = document.getElementById('fDeadline').value || null;

    const newId = BS.nextId('AP', approvals, 1);
    approvals.push({ id: newId, type, priority, title, by, amount, details, date, deadline, status: 'Pending', remarks: [] });
    BS.save();
    BS.toast(`Request "${title}" submitted.`, 'success');
    requestModal.hide();
    renderKpi(); renderSidebar(); render();
  }

  /* ── Detail offcanvas ── */
  function viewDetail(id) {
    const a = approvals.find(x => x.id === id);
    if (!a) return;
    const ic = TYPE_ICONS[a.type] || TYPE_ICONS['Other'];
    const priClass = `priority-${(a.priority || 'medium').toLowerCase()}`;
    const statusKind = BS.statusKind(a.status);

    const remarksHtml = (a.remarks || []).length
      ? (a.remarks || []).map(r => `
          <div class="d-flex gap-2 p-2 rounded mb-1" style="background:var(--surface-2)">
            <i class="bi bi-chat-left-quote text-warning mt-1"></i>
            <div>
              <div class="small fw-500">${BS.esc(r.by)} <span class="text-muted fw-400">· ${BS.fmtDate(r.date)}</span></div>
              <div class="small text-muted">${BS.esc(r.text)}</div>
            </div>
          </div>`).join('')
      : `<div class="small text-muted">No remarks yet.</div>`;

    document.getElementById('detailCanvasBody').innerHTML = `
      <div class="detail-head">
        <div class="d-flex align-items-center gap-3 mb-2">
          <div style="width:46px;height:46px;border-radius:12px;background:${ic.bg};color:${ic.color};display:grid;place-items:center;font-size:1.3rem;flex:none">
            <i class="bi ${ic.icon}"></i>
          </div>
          <div>
            <div class="fw-700 fs-6">${BS.esc(a.title)}</div>
            <div class="opacity-75 small">${BS.esc(a.type)} · ${BS.esc(a.id)}</div>
          </div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${BS.pill(a.status, statusKind)}
          <span class="pill ${priClass}">${a.priority || 'Medium'}</span>
        </div>
      </div>
      <div class="p-3">
        <div class="detail-row"><i class="bi bi-person"></i><span class="text-muted">Requested by</span><span class="ms-auto fw-500">${BS.esc(a.by)}</span></div>
        <div class="detail-row"><i class="bi bi-calendar3"></i><span class="text-muted">Date</span><span class="ms-auto">${BS.fmtDate(a.date)}</span></div>
        ${a.deadline ? `<div class="detail-row"><i class="bi bi-alarm"></i><span class="text-muted">Deadline</span><span class="ms-auto">${BS.fmtDate(a.deadline)}</span></div>` : ''}
        ${a.amount   ? `<div class="detail-row"><i class="bi bi-cash-coin"></i><span class="text-muted">Amount</span><span class="ms-auto fw-600" style="color:#06d6a0">Rs ${BS.fmtNum(a.amount)}</span></div>` : ''}
        ${a.details  ? `<div class="mt-3 mb-2"><div class="small fw-600 text-muted mb-1 text-uppercase" style="letter-spacing:.05em">Details</div><p class="small mb-0">${BS.esc(a.details)}</p></div>` : ''}

        <div class="mt-3 mb-2">
          <div class="small fw-600 text-muted mb-2 text-uppercase" style="letter-spacing:.05em">Remarks</div>
          ${remarksHtml}
        </div>

        ${a.status === 'Pending' ? `
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-success flex-fill btn-approve-detail" data-id="${a.id}">
            <i class="bi bi-check-lg me-1"></i>Approve
          </button>
          <button class="btn btn-danger flex-fill btn-reject-detail" data-id="${a.id}">
            <i class="bi bi-x-lg me-1"></i>Reject
          </button>
        </div>` : ''}
      </div>`;

    document.querySelector('.btn-approve-detail')?.addEventListener('click', () => {
      detailCanvas.hide();
      setTimeout(() => openRemark(a.id, 'Approved'), 300);
    });
    document.querySelector('.btn-reject-detail')?.addEventListener('click', () => {
      detailCanvas.hide();
      setTimeout(() => openRemark(a.id, 'Rejected'), 300);
    });

    detailCanvas.show();
  }

  /* ── Export CSV ── */
  function exportCsv() {
    const headers = ['ID','Type','Title','Requested By','Amount','Date','Deadline','Priority','Status'];
    const rows = (filtered.length ? filtered : approvals).map(a =>
      [a.id, a.type, a.title, a.by, a.amount || '', a.date, a.deadline || '', a.priority || '', a.status]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    BS.download('approvals_export.csv', [headers.join(','), ...rows].join('\n'));
    BS.toast('CSV exported successfully.', 'success');
  }

})();
