(function () {
  'use strict';
  const BS = window.BS;

  document.addEventListener('bs:ready', init);

  function init() {
    const db = BS.db();
    render(db);
  }

  function render(db) {
    const el = document.getElementById('content');
    el.innerHTML = `
      <!-- KPI Row -->
      <div class="row g-3 mb-3" id="kpiRow"></div>

      <!-- Chart + Fee Heads -->
      <div class="row g-3 mb-3">
        <div class="col-lg-8">
          <div class="card-soft h-100">
            <div class="card-head"><span><i class="bi bi-bar-chart-fill me-2 text-warning"></i>Monthly Collection</span>
              <span class="text-muted" style="font-size:.78rem;font-weight:400">Last 6 months</span>
            </div>
            <div class="card-body-x"><div class="fee-chart-box"><canvas id="feeChart"></canvas></div></div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card-soft h-100">
            <div class="card-head"><span><i class="bi bi-list-check me-2 text-warning"></i>Fee Heads</span>
              <button class="btn btn-outline-secondary btn-xs" id="btnFeeHeads"><i class="bi bi-pencil"></i></button>
            </div>
            <div class="card-body-x p-0" id="feeHeadsList"></div>
          </div>
        </div>
      </div>

      <!-- Filters + Table -->
      <div class="card-soft">
        <div class="card-head flex-wrap gap-2">
          <span><i class="bi bi-table me-2 text-warning"></i>Fee Records</span>
          <div class="d-flex gap-2 flex-wrap ms-auto">
            <select class="form-select form-select-sm fee-filter" id="filterClass" style="width:140px">
              <option value="">All Classes</option>
            </select>
            <select class="form-select form-select-sm fee-filter" id="filterMonth" style="width:150px">
              <option value="">All Months</option>
            </select>
            <select class="form-select form-select-sm fee-filter" id="filterStatus" style="width:130px">
              <option value="">All Status</option>
              <option>Paid</option><option>Partial</option><option>Unpaid</option>
            </select>
            <div class="position-relative">
              <i class="bi bi-search position-absolute" style="left:.65rem;top:50%;transform:translateY(-50%);color:var(--muted);font-size:.85rem"></i>
              <input type="search" class="form-control form-control-sm fee-filter" id="filterSearch" placeholder="Search student…" style="padding-left:2rem;width:180px">
            </div>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-modern mb-0" id="feeTable">
            <thead>
              <tr>
                <th class="sortable" data-col="name">Student</th>
                <th class="sortable" data-col="cls">Class</th>
                <th class="sortable" data-col="month">Month</th>
                <th class="sortable" data-col="total">Total</th>
                <th class="sortable" data-col="paid">Paid</th>
                <th>Balance</th>
                <th class="sortable" data-col="status">Status</th>
                <th>Method</th>
                <th style="width:110px">Actions</th>
              </tr>
            </thead>
            <tbody id="feeBody"></tbody>
          </table>
        </div>
        <div class="d-flex align-items-center justify-content-between px-3 py-2 border-top" style="font-size:.82rem">
          <span id="feeCount" class="text-muted"></span>
          <div class="d-flex gap-1" id="feePager"></div>
        </div>
      </div>`;

    buildKPIs(db);
    buildChart(db);
    buildFeeHeads(db);
    buildFilters(db);
    setupTable(db);
    setupModal(db);
    setupExport(db);

    document.getElementById('btnPrintList').addEventListener('click', () => window.print());
  }

  /* ── KPIs ── */
  function buildKPIs(db) {
    const records = db.feeRecords;
    const cur = db.currentMonth;
    const curRecs = records.filter(r => r.month === cur);
    const totalDue = curRecs.reduce((s, r) => s + r.total, 0);
    const totalPaid = curRecs.reduce((s, r) => s + r.paid, 0);
    const unpaid = curRecs.filter(r => r.status === 'Unpaid').length;
    const partial = curRecs.filter(r => r.status === 'Partial').length;
    const recovery = totalDue ? Math.round((totalPaid / totalDue) * 100) : 0;

    const kpis = [
      { icon: 'bi-cash-stack', label: 'Collected (This Month)', val: BS.pkr(totalPaid), sub: `of ${BS.pkr(totalDue)} due`, cls: '' },
      { icon: 'bi-hourglass-split', label: 'Pending Balance', val: BS.pkr(totalDue - totalPaid), sub: `${partial} partial payments`, cls: 'amber' },
      { icon: 'bi-exclamation-triangle-fill', label: 'Defaulters', val: unpaid, sub: 'unpaid this month', cls: 'danger-kpi' },
      { icon: 'bi-graph-up-arrow', label: 'Recovery Rate', val: recovery + '%', sub: 'current month', cls: '' }
    ];

    document.getElementById('kpiRow').innerHTML = kpis.map(k => `
      <div class="col-6 col-xl-3">
        <div class="card-soft kpi ${k.cls}">
          <div class="ico"><i class="bi ${k.icon}"></i></div>
          <div><div class="val">${k.val}</div><div class="lbl">${k.label}</div><div class="kpi-sub">${k.sub}</div></div>
        </div>
      </div>`).join('');
  }

  /* ── Chart ── */
  function buildChart(db) {
    const months = [...new Set(db.feeRecords.map(r => r.month))].sort();
    const collected = months.map(m => db.feeRecords.filter(r => r.month === m).reduce((s, r) => s + r.paid, 0));
    const due = months.map(m => db.feeRecords.filter(r => r.month === m).reduce((s, r) => s + r.total, 0));
    const labels = months.map(m => { const [y, mo] = m.split('-'); return new Date(y, mo - 1).toLocaleString('en', { month: 'short', year: '2-digit' }); });

    const isDark = () => document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const gridColor = () => isDark() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
    const textColor = () => isDark() ? '#adb5bd' : '#6c757d';

    const ctx = document.getElementById('feeChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Collected', data: collected, backgroundColor: 'rgba(232,163,23,.85)', borderRadius: 6, borderSkipped: false },
          { label: 'Due', data: due, backgroundColor: 'rgba(13,110,253,.15)', borderRadius: 6, borderSkipped: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor(), font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ' ' + BS.pkr(ctx.raw) } } },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: textColor() } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => 'Rs ' + (v / 1000) + 'k' } }
        }
      }
    });

    document.addEventListener('bs:theme', () => {
      chart.options.plugins.legend.labels.color = textColor();
      chart.options.scales.x.grid.color = gridColor();
      chart.options.scales.x.ticks.color = textColor();
      chart.options.scales.y.grid.color = gridColor();
      chart.options.scales.y.ticks.color = textColor();
      chart.update();
    });
  }

  /* ── Fee Heads ── */
  function buildFeeHeads(db) {
    const el = document.getElementById('feeHeadsList');
    el.innerHTML = db.feeHeads.map(h => `
      <div class="fee-head-row">
        <div>
          <div class="fw-semibold" style="font-size:.88rem">${BS.esc(h.name)}</div>
          <div style="font-size:.75rem;color:var(--muted)">${BS.esc(h.freq)}</div>
        </div>
        <div class="fw-bold" style="color:var(--amber-dark)">${BS.pkr(h.amount)}</div>
      </div>`).join('');

    document.getElementById('btnFeeHeads').addEventListener('click', () => {
      BS.toast('Fee Heads editor coming soon', 'info');
    });
  }

  /* ── Filters ── */
  function buildFilters(db) {
    const classes = [...new Set(db.students.map(s => s.cls))].sort((a, b) => {
      const n = x => parseInt(x.replace(/\D/g, ''));
      return n(a) - n(b);
    });
    const months = [...new Set(db.feeRecords.map(r => r.month))].sort();

    const fc = document.getElementById('filterClass');
    classes.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; fc.appendChild(o); });

    const fm = document.getElementById('filterMonth');
    months.forEach(m => {
      const o = document.createElement('option'); o.value = m;
      const [y, mo] = m.split('-');
      o.textContent = new Date(y, mo - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
      fm.appendChild(o);
    });
    fm.value = db.currentMonth;
  }

  /* ── Table ── */
  let sortCol = 'month', sortDir = 'desc', page = 1;
  const PAGE_SIZE = 15;

  function setupTable(db) {
    const filters = ['filterClass', 'filterMonth', 'filterStatus', 'filterSearch'];
    filters.forEach(id => document.getElementById(id).addEventListener('input', () => { page = 1; renderTable(db); }));

    document.querySelectorAll('#feeTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'asc'; }
        document.querySelectorAll('#feeTable th.sortable').forEach(t => t.classList.remove('asc', 'desc'));
        th.classList.add(sortDir);
        renderTable(db);
      });
    });

    renderTable(db);
  }

  function getRows(db) {
    const cls = document.getElementById('filterClass').value;
    const month = document.getElementById('filterMonth').value;
    const status = document.getElementById('filterStatus').value;
    const q = document.getElementById('filterSearch').value.trim().toLowerCase();

    return db.feeRecords
      .map(r => {
        const st = db.students.find(s => s.id === r.studentId);
        return st ? { ...r, name: st.name, cls: st.cls } : null;
      })
      .filter(r => r &&
        (!cls || r.cls === cls) &&
        (!month || r.month === month) &&
        (!status || r.status === status) &&
        (!q || r.name.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
        if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
  }

  function renderTable(db) {
    const rows = getRows(db);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, pages);
    const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    document.getElementById('feeCount').textContent = `Showing ${slice.length} of ${total} records`;

    const tbody = document.getElementById('feeBody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted"><i class="bi bi-inbox fs-4 d-block mb-1"></i>No records found</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => {
        const bal = r.total - r.paid;
        const isDefaulter = r.status === 'Unpaid';
        return `<tr class="${isDefaulter ? 'table-danger-soft' : ''}">
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="avatar-xs">${BS.initials(r.name)}</span>
              <div><div class="fw-semibold" style="font-size:.88rem">${BS.esc(r.name)}</div>
              <div style="font-size:.75rem;color:var(--muted)">${BS.esc(r.studentId)}</div></div>
            </div>
          </td>
          <td><span class="pill pill-info">${BS.esc(r.cls)}</span></td>
          <td>${fmtMonth(r.month)}</td>
          <td class="fw-semibold">${BS.pkr(r.total)}</td>
          <td class="text-success fw-semibold">${BS.pkr(r.paid)}</td>
          <td class="${bal > 0 ? 'text-danger fw-semibold' : 'text-muted'}">${bal > 0 ? BS.pkr(bal) : '—'}</td>
          <td>${BS.pill(r.status, BS.statusKind(r.status))}</td>
          <td>${r.method ? `<span class="pill pill-muted">${BS.esc(r.method)}</span>` : '—'}</td>
          <td>
            <div class="d-flex gap-1">
              <button class="icon-btn-sm" title="View Challan" data-challan="${BS.esc(r.id)}"><i class="bi bi-receipt"></i></button>
              <button class="icon-btn-sm" title="Edit" data-edit="${BS.esc(r.id)}"><i class="bi bi-pencil"></i></button>
              <button class="icon-btn-sm text-danger" title="Delete" data-del="${BS.esc(r.id)}"><i class="bi bi-trash3"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    /* Pager */
    const pager = document.getElementById('feePager');
    pager.innerHTML = '';
    if (pages > 1) {
      const mkBtn = (label, p, disabled, active) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`;
        b.innerHTML = label; b.disabled = disabled;
        b.addEventListener('click', () => { page = p; renderTable(db); });
        return b;
      };
      pager.appendChild(mkBtn('<i class="bi bi-chevron-left"></i>', page - 1, page === 1, false));
      for (let i = 1; i <= pages; i++) {
        if (pages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== pages) {
          if (i === 2 || i === pages - 1) { const sp = document.createElement('span'); sp.className = 'btn btn-sm disabled'; sp.textContent = '…'; pager.appendChild(sp); }
          continue;
        }
        pager.appendChild(mkBtn(i, i, false, i === page));
      }
      pager.appendChild(mkBtn('<i class="bi bi-chevron-right"></i>', page + 1, page === pages, false));
    }

    /* Row actions */
    tbody.querySelectorAll('[data-challan]').forEach(btn => btn.addEventListener('click', () => showChallan(db, btn.dataset.challan)));
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openModal(db, btn.dataset.edit)));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteRecord(db, btn.dataset.del)));
  }

  /* ── Modal ── */
  function setupModal(db) {
    document.getElementById('btnAddRecord').addEventListener('click', () => openModal(db, null));

    const fields = ['feeTuition', 'feeTransport', 'feeDiscount'];
    fields.forEach(id => document.getElementById(id).addEventListener('input', calcTotal));

    document.getElementById('feeModalSave').addEventListener('click', () => saveRecord(db));

    const studentSel = document.getElementById('feeStudent');
    db.students.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id; o.textContent = `${s.name} (${s.cls})`;
      studentSel.appendChild(o);
    });

    studentSel.addEventListener('change', () => {
      const st = db.students.find(s => s.id === studentSel.value);
      if (!st) return;
      const cls = db.classes.find(c => c.name === st.cls);
      document.getElementById('feeTuition').value = cls ? cls.fee : '';
      document.getElementById('feeTransport').value = st.transport ? 2500 : 0;
      document.getElementById('feeDiscount').value = cls ? Math.round((cls.fee + (st.transport ? 2500 : 0)) * st.discountPct / 100) : 0;
      calcTotal();
    });
  }

  function calcTotal() {
    const t = +document.getElementById('feeTuition').value || 0;
    const tr = +document.getElementById('feeTransport').value || 0;
    const d = +document.getElementById('feeDiscount').value || 0;
    document.getElementById('feeTotal').value = Math.max(0, t + tr - d);
  }

  function openModal(db, id) {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('feeModal'));
    document.getElementById('feeForm').classList.remove('was-validated');
    document.getElementById('feeModalLabel').textContent = id ? 'Edit Fee Record' : 'Add Fee Record';
    document.getElementById('feeId').value = id || '';

    if (id) {
      const r = db.feeRecords.find(x => x.id === id);
      if (!r) return;
      document.getElementById('feeStudent').value = r.studentId;
      document.getElementById('feeMonth').value = r.month;
      document.getElementById('feeDueDate').value = r.dueDate || '';
      document.getElementById('feeTuition').value = r.tuition;
      document.getElementById('feeTransport').value = r.transport;
      document.getElementById('feeDiscount').value = r.discount;
      document.getElementById('feeTotal').value = r.total;
      document.getElementById('feePaid').value = r.paid;
      document.getElementById('feeMethod').value = r.method || '';
      document.getElementById('feePaidOn').value = r.paidOn || '';
      document.getElementById('feeStatus').value = r.status;
    } else {
      document.getElementById('feeForm').reset();
      document.getElementById('feeMonth').value = db.currentMonth;
      const day = db.settings.dueDay || 10;
      document.getElementById('feeDueDate').value = `${db.currentMonth}-${String(day).padStart(2, '0')}`;
    }
    modal.show();
  }

  function saveRecord(db) {
    const form = document.getElementById('feeForm');
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const id = document.getElementById('feeId').value;
    const paid = +document.getElementById('feePaid').value || 0;
    const total = +document.getElementById('feeTotal').value || 0;
    let status = document.getElementById('feeStatus').value;
    if (!status) status = paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';

    const data = {
      studentId: document.getElementById('feeStudent').value,
      month: document.getElementById('feeMonth').value,
      dueDate: document.getElementById('feeDueDate').value,
      tuition: +document.getElementById('feeTuition').value || 0,
      transport: +document.getElementById('feeTransport').value || 0,
      discount: +document.getElementById('feeDiscount').value || 0,
      total, paid, status,
      method: document.getElementById('feeMethod').value || null,
      paidOn: document.getElementById('feePaidOn').value || null,
    };

    if (id) {
      const idx = db.feeRecords.findIndex(r => r.id === id);
      if (idx > -1) db.feeRecords[idx] = { ...db.feeRecords[idx], ...data };
      BS.toast('Fee record updated', 'success');
    } else {
      data.id = BS.nextId('FR', db.feeRecords, 1);
      const st = db.students.find(s => s.id === data.studentId);
      data.challanNo = `CH-${data.month.replace('-', '')}-${data.studentId.slice(2)}`;
      db.feeRecords.push(data);
      BS.toast('Fee record added', 'success');
    }

    BS.save();
    BS.audit(id ? 'Updated fee record' : 'Created fee record', 'Fee record', id || data.id, `${data.studentId}; ${data.month}; paid Rs ${data.paid} of Rs ${data.total}`);
    bootstrap.Modal.getInstance(document.getElementById('feeModal')).hide();
    buildKPIs(db);
    renderTable(db);
  }

  async function deleteRecord(db, id) {
    if (!await BS.confirm('Delete this fee record permanently?', { title: 'Delete Record', ok: 'Delete', danger: true })) return;
    db.feeRecords = db.feeRecords.filter(r => r.id !== id);
    BS.save();
    BS.audit('Deleted fee record', 'Fee record', id);
    BS.toast('Record deleted', 'danger');
    buildKPIs(db);
    renderTable(db);
  }

  /* ── Challan ── */
  function showChallan(db, id) {
    const r = db.feeRecords.find(x => x.id === id);
    if (!r) return;
    const st = db.students.find(s => s.id === r.studentId);
    const s = db.settings;
    document.getElementById('challanBody').innerHTML = `
      <div class="challan-wrap">
        <div class="challan-header">
          <strong>${BS.esc(s.schoolName)}</strong>
          <small>${BS.esc(s.address)}</small>
        </div>
        <div class="challan-title">FEE CHALLAN</div>
        <table class="challan-table">
          <tr><td>Student</td><td><strong>${BS.esc(st ? st.name : r.studentId)}</strong></td></tr>
          <tr><td>Class</td><td>${BS.esc(st ? st.cls : '—')}</td></tr>
          <tr><td>Challan No</td><td>${BS.esc(r.challanNo || r.id)}</td></tr>
          <tr><td>Month</td><td>${fmtMonth(r.month)}</td></tr>
          <tr><td>Due Date</td><td>${BS.fmtDate(r.dueDate)}</td></tr>
          <tr class="challan-sep"><td>Tuition Fee</td><td>${BS.pkr(r.tuition)}</td></tr>
          <tr><td>Transport</td><td>${BS.pkr(r.transport)}</td></tr>
          <tr><td>Discount</td><td class="text-success">- ${BS.pkr(r.discount)}</td></tr>
          <tr class="challan-total"><td>Total</td><td>${BS.pkr(r.total)}</td></tr>
          <tr><td>Paid</td><td class="text-success">${BS.pkr(r.paid)}</td></tr>
          <tr><td>Balance</td><td class="${r.total - r.paid > 0 ? 'text-danger' : ''}">${BS.pkr(r.total - r.paid)}</td></tr>
          <tr><td>Status</td><td>${BS.pill(r.status, BS.statusKind(r.status))}</td></tr>
        </table>
        <div class="challan-footer">Bank: ${BS.esc(s.bankName)} · A/C: ${BS.esc(s.accountNo)}</div>
      </div>`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('challanModal')).show();
  }

  /* ── Export CSV ── */
  function setupExport(db) {
    document.getElementById('btnExport').addEventListener('click', () => {
      const rows = getRows(db);
      const header = 'ID,Student,Class,Month,Total,Paid,Balance,Status,Method,Paid On\n';
      const csv = rows.map(r => [r.id, `"${r.name}"`, r.cls, r.month, r.total, r.paid, r.total - r.paid, r.status, r.method || '', r.paidOn || ''].join(',')).join('\n');
      BS.download(`fee-records-${db.currentMonth}.csv`, header + csv);
      BS.toast('CSV exported', 'success');
    });
  }

  /* ── Helpers ── */
  function fmtMonth(m) {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleString('en', { month: 'short', year: 'numeric' });
  }
})();
