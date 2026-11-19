(function () {
  'use strict';
  const BS = window.BS;

  let db, staff, filtered = [], sortCol = 'name', sortDir = 'asc', page = 1;
  const PAGE_SIZE = 10;
  let staffModal, payslipModal, leaveModal, staffCanvas;
  let editingId = null;
  let activeTab = 'staff';

  document.addEventListener('bs:ready', init);

  function init() {
    db = BS.db();
    staff = db.staff;

    staffModal   = new bootstrap.Modal(document.getElementById('staffModal'));
    payslipModal = new bootstrap.Modal(document.getElementById('payslipModal'));
    leaveModal   = new bootstrap.Modal(document.getElementById('leaveModal'));
    staffCanvas  = new bootstrap.Offcanvas(document.getElementById('staffCanvas'));

    populateFilters();
    renderKpi();
    bindEvents();
    render();
    renderPayroll();
    renderLeaves();
    renderAttendance();
  }

  /* ── Populate filter dropdowns ── */
  function populateFilters() {
    const depts  = [...new Set(staff.map(s => s.department))];
    const desigs = [...new Set(staff.map(s => s.designation))];
    const dSel = document.getElementById('filterDept');
    const rSel = document.getElementById('filterDesig');
    depts.forEach(d  => dSel.insertAdjacentHTML('beforeend', `<option>${BS.esc(d)}</option>`));
    desigs.forEach(d => rSel.insertAdjacentHTML('beforeend', `<option>${BS.esc(d)}</option>`));

    const leaveSel = document.getElementById('fLeaveStaff');
    staff.forEach(s => leaveSel.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${BS.esc(s.name)}</option>`));

    const mSel = document.getElementById('payrollMonth');
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      mSel.insertAdjacentHTML('beforeend', `<option value="${key}">${label}</option>`);
    }

    document.getElementById('attDate').value = BS.todayISO();
  }

  /* ── Animated KPI cards ── */
  function renderKpi() {
    const total    = staff.length;
    const active   = staff.filter(s => s.status === 'Active').length;
    const onLeave  = staff.filter(s => s.status === 'On Leave').length;
    const teachers = staff.filter(s => s.designation === 'Teacher').length;
    const female   = staff.filter(s => s.gender === 'Female').length;
    const totalSal = staff.reduce((a, s) => a + s.salary, 0);

    const kpis = [
      { icon: 'bi-person-badge-fill', label: 'Total Staff',     val: total,    raw: total,    cls: '',      color: '#4361ee' },
      { icon: 'bi-person-check-fill', label: 'Active',          val: active,   raw: active,   cls: '',      color: '#2ec4b6' },
      { icon: 'bi-mortarboard-fill',  label: 'Teachers',        val: teachers, raw: teachers, cls: '',      color: '#ff9f1c' },
      { icon: 'bi-calendar-x-fill',   label: 'On Leave',        val: onLeave,  raw: onLeave,  cls: 'amber', color: '#e63946' },
      { icon: 'bi-gender-female',     label: 'Female Staff',    val: female,   raw: female,   cls: '',      color: '#8338ec' },
      { icon: 'bi-cash-coin',         label: 'Monthly Payroll', val: 'Rs ' + BS.fmtNum(totalSal), raw: null, cls: '', color: '#06d6a0' }
    ];

    document.getElementById('hrKpi').innerHTML = kpis.map((k, i) => `
      <div class="col-6 col-sm-4 col-xl-2">
        <div class="card-soft h-100 kpi-card" style="border-top:3px solid ${k.color}">
          <div class="kpi ${k.cls}">
            <div class="ico" style="background:${k.color}22;color:${k.color}"><i class="bi ${k.icon}"></i></div>
            <div>
              <div class="val kpi-num" data-target="${k.raw ?? ''}" data-prefix="${k.raw === null ? 'Rs ' : ''}" data-suffix="">${k.val}</div>
              <div class="lbl">${k.label}</div>
            </div>
          </div>
        </div>
      </div>`
    ).join('');

    // Animate counters
    document.querySelectorAll('.kpi-num[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target);
      if (isNaN(target)) return;
      let start = 0, duration = 900, step = 16;
      const inc = target / (duration / step);
      const timer = setInterval(() => {
        start = Math.min(start + inc, target);
        el.textContent = el.dataset.prefix + Math.round(start).toLocaleString() + el.dataset.suffix;
        if (start >= target) clearInterval(timer);
      }, step);
    });
  }

  /* ── Tab switching ── */
  function bindEvents() {
    document.querySelectorAll('#hrTabNav .nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#hrTabNav .nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        ['staff','payroll','leaves','attendance'].forEach(t => {
          document.getElementById('tab-' + t).classList.toggle('d-none', t !== activeTab);
        });
        if (activeTab === 'payroll') renderDeptChart();
      });
    });

    document.getElementById('staffSearch').addEventListener('input', BS.debounce(() => { page = 1; render(); }));
    ['filterDept','filterDesig','filterGender'].forEach(id =>
      document.getElementById(id).addEventListener('change', () => { page = 1; render(); }));
    document.getElementById('clearStaffFilters').addEventListener('click', clearFilters);

    document.querySelectorAll('#staffTable th.sortable').forEach(th =>
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'asc'; }
        render();
      })
    );

    document.getElementById('checkAllStaff').addEventListener('change', e => {
      document.querySelectorAll('.staff-check').forEach(cb => cb.checked = e.target.checked);
      updateBulkBar();
    });

    document.getElementById('addStaffBtn').addEventListener('click', () => openModal(null));
    document.getElementById('exportStaffBtn').addEventListener('click', exportCsv);
    document.getElementById('staffForm').addEventListener('submit', saveStaff);
    document.getElementById('hrBulkDelete').addEventListener('click', bulkDelete);

    document.getElementById('runPayrollBtn').addEventListener('click', () => {
      const month = document.getElementById('payrollMonth').value;
      db.payrollPayments[month] = db.payrollPayments[month] || {};
      let added = 0;
      staff.filter(s => s.status === 'Active').forEach(s => {
        if (db.payrollPayments[month][s.id]) return;
        const basic = Number(s.salary) || 0;
        const allowance = Math.round(basic * 0.15), deduction = Math.round(basic * 0.05);
        db.payrollPayments[month][s.id] = { staffId: s.id, basic, allowance, deduction, net: basic + allowance - deduction, status: 'Pending', generatedAt: new Date().toISOString(), paidAt: null, reference: '' };
        added++;
      });
      if (!added) { BS.toast('Payroll is already generated for all active staff this month.', 'info'); return; }
      BS.save();
      BS.audit('Generated payroll', 'Payroll', month, `${added} staff payment records`);
      BS.toast(`Payroll generated for ${added} staff. Record payments as they are made.`, 'success');
      renderPayroll();
    });

    document.getElementById('applyLeaveBtn').addEventListener('click', () => {
      document.getElementById('leaveForm').classList.remove('was-validated');
      ['fLeaveStaff','fLeaveType','fLeaveReason'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('fLeaveFrom').value = BS.todayISO();
      document.getElementById('fLeaveTo').value   = BS.todayISO();
      leaveModal.show();
    });
    document.getElementById('leaveForm').addEventListener('submit', saveLeave);
    document.getElementById('saveAttBtn').addEventListener('click', saveAttendance);
    document.getElementById('payrollMonth').addEventListener('change', renderPayroll);
  }

  /* ── Staff directory ── */
  function render() {
    const q   = document.getElementById('staffSearch').value.trim().toLowerCase();
    const dep = document.getElementById('filterDept').value;
    const des = document.getElementById('filterDesig').value;
    const gen = document.getElementById('filterGender').value;

    filtered = staff.filter(s => {
      if (q && !`${s.name} ${s.id} ${s.subject} ${s.email}`.toLowerCase().includes(q)) return false;
      if (dep && s.department !== dep) return false;
      if (des && s.designation !== des) return false;
      if (gen && s.gender !== gen) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'asc' ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    document.getElementById('staffCount').textContent = `${total} staff member${total !== 1 ? 's' : ''} found`;
    document.getElementById('staffPageInfo').textContent = total
      ? `Showing ${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE, total)} of ${total}` : '';

    document.querySelectorAll('#staffTable th.sortable').forEach(th => {
      th.classList.remove('asc','desc');
      if (th.dataset.col === sortCol) th.classList.add(sortDir);
    });

    renderRows(slice);
    renderPagination(pages);
  }

  function renderRows(slice) {
    const tbody = document.getElementById('staffBody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="9">${BS.empty('bi-person-badge','No staff found','Try adjusting your search or filters.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = slice.map(s => {
      const ini = BS.initials(s.name);
      const fem = s.gender === 'Female';
      const exp = calcExperience(s.joinDate);
      return `<tr class="staff-row-animate">
        <td class="ps-3"><input type="checkbox" class="form-check-input staff-check" data-id="${s.id}"></td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="staff-avatar ${fem ? 'female' : ''}">${BS.esc(ini)}</span>
            <div>
              <div class="fw-500">${BS.esc(s.name)}</div>
              <small class="text-muted">${BS.esc(s.id)} · <a href="mailto:${BS.esc(s.email)}" class="text-decoration-none">${BS.esc(s.email)}</a></small>
            </div>
          </div>
        </td>
        <td>${BS.esc(s.designation)}</td>
        <td><span class="dept-badge dept-${s.department.replace(/\s/g,'')}">${BS.esc(s.department)}</span></td>
        <td>${s.subject ? BS.esc(s.subject) : '<span class="text-muted">—</span>'}</td>
        <td class="fw-500">Rs ${BS.fmtNum(s.salary)}</td>
        <td>
          <div>${BS.fmtDate(s.joinDate)}</div>
          <small class="text-muted">${exp}</small>
        </td>
        <td>${BS.pill(s.status, BS.statusKind(s.status))}</td>
        <td class="text-end pe-3">
          <button class="btn btn-sm btn-outline-secondary me-1 btn-view-staff" data-id="${s.id}" title="View Profile"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1 btn-edit-staff" data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-del-staff" data-id="${s.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-view-staff').forEach(b => b.addEventListener('click', () => viewProfile(b.dataset.id)));
    tbody.querySelectorAll('.btn-edit-staff').forEach(b => b.addEventListener('click', () => openModal(b.dataset.id)));
    tbody.querySelectorAll('.btn-del-staff').forEach(b  => b.addEventListener('click', () => deleteStaff(b.dataset.id)));
    tbody.querySelectorAll('.staff-check').forEach(cb => cb.addEventListener('change', updateBulkBar));
  }

  function calcExperience(joinDate) {
    if (!joinDate) return '';
    const diff = Date.now() - new Date(joinDate).getTime();
    const years = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
    const months = Math.floor((diff % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
    if (years > 0) return `${years}y ${months}m exp`;
    return `${months}m exp`;
  }

  function renderPagination(pages) {
    const ul = document.getElementById('staffPagination');
    if (pages <= 1) { ul.innerHTML = ''; return; }
    const prev = `<li class="page-item ${page===1?'disabled':''}"><a class="page-link" data-p="${page-1}" href="#">‹</a></li>`;
    const next = `<li class="page-item ${page===pages?'disabled':''}"><a class="page-link" data-p="${page+1}" href="#">›</a></li>`;
    const nums = Array.from({length:pages},(_,i)=>i+1)
      .filter(p => p===1||p===pages||Math.abs(p-page)<=1)
      .reduce((acc,p,i,arr) => { if(i>0&&p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; },[])
      .map(p => p==='…'
        ? `<li class="page-item disabled"><span class="page-link">…</span></li>`
        : `<li class="page-item ${p===page?'active':''}"><a class="page-link" data-p="${p}" href="#">${p}</a></li>`)
      .join('');
    ul.innerHTML = prev + nums + next;
    ul.querySelectorAll('[data-p]').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); page = +a.dataset.p; render(); }));
  }

  function updateBulkBar() {
    const n = document.querySelectorAll('.staff-check:checked').length;
    const bar = document.getElementById('hrBulkBar');
    bar.classList.toggle('d-none', !n);
    bar.classList.toggle('d-flex', !!n);
    if (n) document.getElementById('hrBulkCount').textContent = `${n} selected`;
  }

  function clearFilters() {
    document.getElementById('staffSearch').value = '';
    document.getElementById('filterDept').value = '';
    document.getElementById('filterDesig').value = '';
    document.getElementById('filterGender').value = '';
    page = 1; render();
  }

  /* ── Add / Edit Modal ── */
  function openModal(id) {
    editingId = id;
    const form = document.getElementById('staffForm');
    form.classList.remove('was-validated');
    document.getElementById('staffModalTitle').textContent = id ? 'Edit Staff' : 'Add Staff';

    if (id) {
      const s = staff.find(x => x.id === id);
      if (!s) return;
      document.getElementById('fStaffName').value   = s.name;
      document.getElementById('fDesig').value        = s.designation;
      document.getElementById('fDept').value         = s.department;
      document.getElementById('fSubject').value      = s.subject || '';
      document.getElementById('fStaffGender').value  = s.gender;
      document.getElementById('fStaffPhone').value   = s.phone;
      document.getElementById('fStaffEmail').value   = s.email;
      document.getElementById('fJoinDate').value     = s.joinDate;
      document.getElementById('fSalary').value       = s.salary;
      document.getElementById('fStaffStatus').value  = s.status;
    } else {
      form.reset();
    }
    staffModal.show();
  }

  function saveStaff(e) {
    e.preventDefault();
    const form = e.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const name  = document.getElementById('fStaffName').value.trim();
    const desig = document.getElementById('fDesig').value;
    const dept  = document.getElementById('fDept').value;
    const subj  = document.getElementById('fSubject').value.trim();
    const gen   = document.getElementById('fStaffGender').value;
    const phone = document.getElementById('fStaffPhone').value.trim();
    const email = document.getElementById('fStaffEmail').value.trim();
    const join  = document.getElementById('fJoinDate').value;
    const sal   = parseInt(document.getElementById('fSalary').value) || 0;
    const stat  = document.getElementById('fStaffStatus').value;

    let auditId = editingId;
    if (editingId) {
      const s = staff.find(x => x.id === editingId);
      Object.assign(s, { name, designation: desig, department: dept, subject: subj, gender: gen, phone, email, joinDate: join, salary: sal, status: stat });
      BS.toast(`${name} updated successfully.`, 'success');
    } else {
      const newId = 'T-' + (100 + staff.length + 1 + Math.floor(Math.random()*100));
      auditId = newId;
      staff.push({ id: newId, name, designation: desig, department: dept, subject: subj, gender: gen, phone, email, joinDate: join, salary: sal, status: stat });
      BS.toast(`${name} added to staff directory.`, 'success');
    }

    BS.save(db);
    BS.audit(editingId ? 'Updated staff member' : 'Added staff member', 'Staff', auditId, name);
    staffModal.hide();
    renderKpi();
    render();
    renderPayroll();
    syncLeaveStaffDropdown();
  }

  function syncLeaveStaffDropdown() {
    const sel = document.getElementById('fLeaveStaff');
    sel.innerHTML = '<option value="">Select…</option>';
    staff.forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${BS.esc(s.name)}</option>`));
  }

  function deleteStaff(id) {
    const s = staff.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    db.staff = staff = staff.filter(x => x.id !== id);
    BS.save(db);
    BS.audit('Deleted staff member', 'Staff', id, s.name);
    BS.toast(`${s.name} removed from staff.`, 'danger');
    renderKpi();
    render();
    renderPayroll();
  }

  function bulkDelete() {
    const ids = [...document.querySelectorAll('.staff-check:checked')].map(cb => cb.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected staff member(s)?`)) return;
    db.staff = staff = staff.filter(s => !ids.includes(s.id));
    BS.save(db);
    BS.audit('Bulk deleted staff', 'Staff', ids.join(', '), `${ids.length} staff records`);
    BS.toast(`${ids.length} staff member(s) deleted.`, 'danger');
    document.getElementById('checkAllStaff').checked = false;
    updateBulkBar();
    renderKpi();
    render();
    renderPayroll();
  }

  function exportCsv() {
    const headers = ['ID','Name','Designation','Department','Subject','Gender','Phone','Email','Join Date','Salary','Status'];
    const rows = (filtered.length ? filtered : staff).map(s =>
      [s.id, s.name, s.designation, s.department, s.subject||'', s.gender, s.phone, s.email, s.joinDate, s.salary, s.status]
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'staff_export.csv';
    a.click();
    BS.toast('CSV exported successfully.', 'success');
  }

  /* ── Staff Profile Offcanvas ── */
  function viewProfile(id) {
    const s = staff.find(x => x.id === id);
    if (!s) return;
    const ini = BS.initials(s.name);
    const fem = s.gender === 'Female';
    const exp = calcExperience(s.joinDate);
    const allowance  = Math.round(s.salary * 0.15);
    const deduction  = Math.round(s.salary * 0.05);
    const net        = s.salary + allowance - deduction;
    const leaveCount = (db.leaves || []).filter(l => l.staffId === s.id).length;

    // Attendance ring (mock 85-98%)
    const attPct = 85 + Math.floor(Math.abs(s.id.charCodeAt(2) - 48) * 1.5) % 14;
    const r = 34, circ = 2 * Math.PI * r;
    const dash = (attPct / 100) * circ;

    document.getElementById('staffCanvasBody').innerHTML = `
      <div class="staff-profile-head">
        <div class="avatar-lg ${fem ? 'female' : ''}">${BS.esc(ini)}</div>
        <div>
          <div class="fw-700 fs-5">${BS.esc(s.name)}</div>
          <div class="opacity-75 small">${BS.esc(s.designation)} · ${BS.esc(s.department)}</div>
          <div class="mt-1">${BS.pill(s.status, BS.statusKind(s.status))}</div>
        </div>
      </div>
      <div class="p-3">
        <!-- Attendance ring + salary ring -->
        <div class="d-flex gap-3 mb-3 justify-content-around">
          <div class="text-center">
            <div class="ring-wrap mx-auto">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/>
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="#2ec4b6" stroke-width="8"
                  stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
              </svg>
              <div class="ring-val">${attPct}%</div>
            </div>
            <div class="small text-muted mt-1">Attendance</div>
          </div>
          <div class="text-center">
            <div class="ring-wrap mx-auto">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/>
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="#ff9f1c" stroke-width="8"
                  stroke-dasharray="${(0.72*circ).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
              </svg>
              <div class="ring-val">72%</div>
            </div>
            <div class="small text-muted mt-1">Performance</div>
          </div>
          <div class="text-center">
            <div class="ring-wrap mx-auto">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/>
                <circle cx="40" cy="40" r="${r}" fill="none" stroke="#8338ec" stroke-width="8"
                  stroke-dasharray="${(0.6*circ).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
              </svg>
              <div class="ring-val">${leaveCount}</div>
            </div>
            <div class="small text-muted mt-1">Leaves</div>
          </div>
        </div>

        <!-- Info rows -->
        <div class="mb-3">
          <div class="info-row"><i class="bi bi-person-badge"></i><span class="text-muted">ID</span><span class="ms-auto fw-500">${BS.esc(s.id)}</span></div>
          <div class="info-row"><i class="bi bi-telephone"></i><span class="text-muted">Phone</span><span class="ms-auto">${BS.esc(s.phone)}</span></div>
          <div class="info-row"><i class="bi bi-envelope"></i><span class="text-muted">Email</span><span class="ms-auto small">${BS.esc(s.email)}</span></div>
          <div class="info-row"><i class="bi bi-calendar3"></i><span class="text-muted">Joined</span><span class="ms-auto">${BS.fmtDate(s.joinDate)} <small class="text-muted">(${exp})</small></span></div>
          ${s.subject ? `<div class="info-row"><i class="bi bi-book"></i><span class="text-muted">Subject</span><span class="ms-auto">${BS.esc(s.subject)}</span></div>` : ''}
        </div>

        <!-- Salary breakdown -->
        <div class="card-soft p-3 mb-3">
          <div class="fw-600 mb-2 small text-uppercase" style="letter-spacing:.06em">Salary Breakdown</div>
          <div class="d-flex justify-content-between small mb-1"><span class="text-muted">Basic</span><span class="fw-500">Rs ${BS.fmtNum(s.salary)}</span></div>
          <div class="d-flex justify-content-between small mb-1"><span class="text-muted">Allowance (15%)</span><span class="text-success fw-500">+ Rs ${BS.fmtNum(allowance)}</span></div>
          <div class="d-flex justify-content-between small mb-2"><span class="text-muted">Deduction (5%)</span><span class="text-danger fw-500">- Rs ${BS.fmtNum(deduction)}</span></div>
          <div class="d-flex justify-content-between fw-700 border-top pt-2"><span>Net Pay</span><span style="color:#06d6a0">Rs ${BS.fmtNum(net)}</span></div>
        </div>

        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary flex-fill" onclick="document.getElementById('staffCanvas').querySelector('.btn-close').click(); setTimeout(()=>{ document.querySelector('.btn-edit-staff[data-id=\\'${s.id}\\']')?.click(); },300)">
            <i class="bi bi-pencil me-1"></i>Edit
          </button>
          <button class="btn btn-sm btn-success flex-fill" onclick="showPayslipForStaff('${s.id}')">
            <i class="bi bi-receipt me-1"></i>Payslip
          </button>
        </div>
      </div>`;

    staffCanvas.show();
  }

  /* ── Payroll ── */
  function renderPayroll() {
    const month = document.getElementById('payrollMonth').value;
    const activeStaff = staff.filter(s => s.status === 'Active');
    db.payrollPayments = db.payrollPayments || {};
    const payments = db.payrollPayments[month] || {};

    let totalBasic = 0, totalNet = 0;
    const rows = activeStaff.map(s => {
      const saved = payments[s.id];
      const basic = saved ? saved.basic : Number(s.salary) || 0;
      const allowance = saved ? saved.allowance : Math.round(basic * 0.15);
      const deduction = saved ? saved.deduction : Math.round(basic * 0.05);
      const net = saved ? saved.net : basic + allowance - deduction;
      totalBasic += basic;
      totalNet   += net;
      return { s, basic, allowance, deduction, net, payment: saved || null };
    });

    // KPI
    const onLeave = staff.filter(s => s.status === 'On Leave').length;
    document.getElementById('payrollKpi').innerHTML = [
      { icon: 'bi-people-fill',   label: 'Active Staff',    val: activeStaff.length, color: '#4361ee' },
      { icon: 'bi-cash-stack',    label: 'Total Basic',     val: 'Rs ' + BS.fmtNum(totalBasic), color: '#2ec4b6' },
      { icon: 'bi-graph-up-arrow',label: 'Total Net Pay',   val: 'Rs ' + BS.fmtNum(totalNet),   color: '#06d6a0' },
      { icon: 'bi-calendar-x',    label: 'On Leave',        val: onLeave,            color: '#e63946' }
    ].map(k => `
      <div class="col-6 col-lg-3">
        <div class="card-soft" style="border-left:4px solid ${k.color}">
          <div class="kpi">
            <div class="ico" style="background:${k.color}22;color:${k.color}"><i class="bi ${k.icon}"></i></div>
            <div><div class="val">${k.val}</div><div class="lbl">${k.label}</div></div>
          </div>
        </div>
      </div>`).join('');

    document.getElementById('payrollBody').innerHTML = rows.map(({ s, basic, allowance, deduction, net, payment }) => `
      <tr>
        <td class="ps-3">
          <div class="d-flex align-items-center gap-2">
            <span class="staff-avatar ${s.gender==='Female'?'female':''}">${BS.esc(BS.initials(s.name))}</span>
            <div>
              <div class="fw-500">${BS.esc(s.name)}</div>
              <small class="text-muted">${BS.esc(s.id)}</small>
            </div>
          </div>
        </td>
        <td>${BS.esc(s.designation)}</td>
        <td>Rs ${BS.fmtNum(basic)}</td>
        <td class="text-success">+ Rs ${BS.fmtNum(allowance)}</td>
        <td class="text-danger">- Rs ${BS.fmtNum(deduction)}</td>
        <td class="fw-700" style="color:#06d6a0">Rs ${BS.fmtNum(net)}</td>
        <td>${payment?.status === 'Paid'
          ? `<span class="badge bg-success-subtle text-success border border-success-subtle">Paid</span><small class="d-block text-muted">${BS.fmtDate(payment.paidAt?.slice(0, 10))}</small>`
          : payment ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">Pending</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border">Draft</span>'}</td>
        <td class="text-end pe-3">
          ${payment?.status !== 'Paid' && payment ? `<button class="btn btn-sm btn-outline-success btn-payroll-paid me-1" data-id="${BS.esc(s.id)}">Mark paid</button>` : ''}
          <button class="btn btn-sm btn-outline-secondary btn-payslip" data-id="${s.id}" title="View Payslip">
            <i class="bi bi-receipt me-1"></i>Payslip
          </button>
        </td>
      </tr>`).join('');

    document.querySelectorAll('.btn-payslip').forEach(b =>
      b.addEventListener('click', () => showPayslipForStaff(b.dataset.id)));
    document.querySelectorAll('.btn-payroll-paid').forEach(b => b.addEventListener('click', async () => {
      const current = db.payrollPayments[month]?.[b.dataset.id];
      if (!current || current.status === 'Paid') return;
      const employee = staff.find(s => s.id === b.dataset.id);
      if (!await BS.confirm(`Record Rs ${BS.fmtNum(current.net)} as paid to ${employee?.name || b.dataset.id}?`, { title: 'Confirm salary payment', ok: 'Mark paid' })) return;
      current.status = 'Paid'; current.paidAt = new Date().toISOString(); current.reference = `DEMO-${month}-${b.dataset.id}`;
      BS.save();
      BS.audit('Recorded salary payment', 'Payroll', `${month}/${b.dataset.id}`, `Rs ${current.net}; demo reference ${current.reference}`);
      renderPayroll();
      BS.toast('Salary payment recorded in this browser demo.', 'success');
    }));

    renderDeptChart();
  }

  function renderDeptChart() {
    const depts = [...new Set(staff.map(s => s.department))];
    const totals = depts.map(d => staff.filter(s => s.department === d).reduce((a, s) => a + s.salary, 0));
    const max = Math.max(...totals);
    const colors = ['#4361ee','#2ec4b6','#ff9f1c','#8338ec','#06d6a0','#e63946'];

    document.getElementById('deptSalaryChart').innerHTML = `
      <div class="p-3">
        ${depts.map((d, i) => {
          const pct = Math.round((totals[i] / max) * 100);
          return `
            <div class="mb-3">
              <div class="d-flex justify-content-between small mb-1">
                <span class="fw-500">${BS.esc(d)}</span>
                <span class="text-muted">Rs ${BS.fmtNum(totals[i])}</span>
              </div>
              <div class="progress" style="height:10px;border-radius:99px">
                <div class="progress-bar" role="progressbar"
                  style="width:${pct}%;background:${colors[i % colors.length]};border-radius:99px;transition:width 1s ease"
                  aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            </div>`;
        }).join('')}
        <div class="border-top pt-2 mt-2 d-flex justify-content-between fw-700 small">
          <span>Total Payroll</span>
          <span style="color:#06d6a0">Rs ${BS.fmtNum(totals.reduce((a,b)=>a+b,0))}</span>
        </div>
      </div>`;
  }

  /* ── Payslip ── */
  function showPayslipForStaff(id) {
    const s = staff.find(x => x.id === id);
    if (!s) return;
    const month = document.getElementById('payrollMonth').value ||
      new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const saved = db.payrollPayments?.[month]?.[id];
    const basic = saved ? saved.basic : Number(s.salary) || 0;
    const allowance = saved ? saved.allowance : Math.round(basic * 0.15);
    const deduction = saved ? saved.deduction : Math.round(basic * 0.05);
    const net = saved ? saved.net : basic + allowance - deduction;

    document.getElementById('payslipTitle').textContent = `Payslip — ${BS.esc(s.name)}`;
    document.getElementById('payslipBody').innerHTML = `
      <div class="payslip-wrap">
        <div class="payslip-header">
          <img src="../assets/img/logo.svg" alt="Logo" onerror="this.style.display='none'">
          <div>
            <div class="school-name">Bright School</div>
            <div class="small text-muted">Street 7, Satellite Town, Rawalpindi</div>
          </div>
        </div>
        <div class="payslip-title">SALARY SLIP — ${month.toUpperCase()}</div>
        <div class="row g-2 mb-3 small">
          <div class="col-6"><span class="text-muted">Employee:</span> <strong>${BS.esc(s.name)}</strong></div>
          <div class="col-6"><span class="text-muted">ID:</span> ${BS.esc(s.id)}</div>
          <div class="col-6"><span class="text-muted">Designation:</span> ${BS.esc(s.designation)}</div>
          <div class="col-6"><span class="text-muted">Department:</span> ${BS.esc(s.department)}</div>
        </div>
        <div class="row g-2">
          <div class="col-6">
            <div class="fw-600 small mb-1 text-success">EARNINGS</div>
            <table class="payslip-table">
              <tr><td>Basic Salary</td><td>Rs ${BS.fmtNum(basic)}</td></tr>
              <tr><td>Allowances</td><td>Rs ${BS.fmtNum(allowance)}</td></tr>
              <tr class="payslip-total"><td>Gross Pay</td><td>Rs ${BS.fmtNum(basic+allowance)}</td></tr>
            </table>
          </div>
          <div class="col-6">
            <div class="fw-600 small mb-1 text-danger">DEDUCTIONS</div>
            <table class="payslip-table">
              <tr><td>Payroll deductions</td><td>Rs ${BS.fmtNum(deduction)}</td></tr>
              <tr class="payslip-total"><td>Total Deductions</td><td>Rs ${BS.fmtNum(deduction)}</td></tr>
            </table>
          </div>
        </div>
        <table class="payslip-table mt-3">
          <tr class="payslip-total"><td>NET PAY</td><td style="color:#06d6a0;font-size:1.1rem">Rs ${BS.fmtNum(net)}</td></tr>
        </table>
        <div class="payslip-footer">Payment status: ${saved ? BS.esc(saved.status) : 'Draft'}${saved?.reference ? ` · Reference: ${BS.esc(saved.reference)}` : ''}</div>
        <div class="payslip-footer">Generated on ${new Date().toLocaleDateString()} · Bright School Management System</div>
      </div>`;
    payslipModal.show();
  }

  window.showPayslipForStaff = showPayslipForStaff;

  /* ── Leave Requests ── */
  function renderLeaves() {
    const leaves = db.leaves || [];

    // Summary counts
    const pending  = leaves.filter(l => l.status === 'Pending').length;
    const approved = leaves.filter(l => l.status === 'Approved').length;
    const rejected = leaves.filter(l => l.status === 'Rejected').length;

    document.getElementById('leaveSummary').innerHTML = `
      <div class="p-3 d-flex gap-3 flex-wrap">
        <div class="text-center flex-fill">
          <div class="fw-700 fs-4 text-warning">${pending}</div>
          <div class="small text-muted">Pending</div>
        </div>
        <div class="text-center flex-fill">
          <div class="fw-700 fs-4 text-success">${approved}</div>
          <div class="small text-muted">Approved</div>
        </div>
        <div class="text-center flex-fill">
          <div class="fw-700 fs-4 text-danger">${rejected}</div>
          <div class="small text-muted">Rejected</div>
        </div>
      </div>`;

    // Leave balance per type
    const types = ['Sick Leave','Casual Leave','Annual Leave','Maternity Leave'];
    const limits = { 'Sick Leave': 10, 'Casual Leave': 12, 'Annual Leave': 20, 'Maternity Leave': 90 };
    document.getElementById('leaveBalance').innerHTML = `
      <div class="p-3">
        ${types.map(t => {
          const used = leaves.filter(l => l.type === t && l.status === 'Approved').length;
          const total = limits[t];
          const pct = Math.min(100, Math.round((used / total) * 100));
          const color = pct > 80 ? '#e63946' : pct > 50 ? '#ff9f1c' : '#2ec4b6';
          return `
            <div class="mb-2">
              <div class="d-flex justify-content-between small mb-1">
                <span>${t}</span><span class="text-muted">${used}/${total} days</span>
              </div>
              <div class="progress" style="height:6px;border-radius:99px">
                <div class="progress-bar" style="width:${pct}%;background:${color};border-radius:99px"></div>
              </div>
            </div>`;
        }).join('')}
      </div>`;

    // Leave list
    const dotColor = { Pending: '#ff9f1c', Approved: '#2ec4b6', Rejected: '#e63946' };
    document.getElementById('leaveList').innerHTML = leaves.length
      ? leaves.map(l => {
          const s = staff.find(x => x.id === l.staffId);
          const name = s ? s.name : l.staffId;
          const days = Math.max(1, Math.round((new Date(l.to) - new Date(l.from)) / 86400000) + 1);
          return `
            <div class="leave-item px-3">
              <div class="leave-dot" style="background:${dotColor[l.status] || '#aaa'}"></div>
              <div class="flex-fill">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <span class="fw-500">${BS.esc(name)}</span>
                    <span class="ms-2 dept-badge dept-Academics" style="font-size:.7rem">${BS.esc(l.type)}</span>
                  </div>
                  <div class="d-flex gap-1 align-items-center">
                    ${l.status === 'Pending' ? `
                      <button class="btn btn-xs btn-success btn-approve-leave" data-id="${l.id}" title="Approve">
                        <i class="bi bi-check-lg"></i>
                      </button>
                      <button class="btn btn-xs btn-danger btn-reject-leave" data-id="${l.id}" title="Reject">
                        <i class="bi bi-x-lg"></i>
                      </button>` : ''}
                    <span class="badge ${l.status==='Approved'?'bg-success-subtle text-success':l.status==='Rejected'?'bg-danger-subtle text-danger':'bg-warning-subtle text-warning'} border">${l.status}</span>
                  </div>
                </div>
                <small class="text-muted">${BS.fmtDate(l.from)} – ${BS.fmtDate(l.to)} · ${days} day${days>1?'s':''} · ${BS.esc(l.reason)}</small>
              </div>
            </div>`;
        }).join('')
      : `<div class="p-4 text-center text-muted"><i class="bi bi-calendar-x fs-2 d-block mb-2"></i>No leave requests found.</div>`;

    document.querySelectorAll('.btn-approve-leave').forEach(b =>
      b.addEventListener('click', () => updateLeaveStatus(b.dataset.id, 'Approved')));
    document.querySelectorAll('.btn-reject-leave').forEach(b =>
      b.addEventListener('click', () => updateLeaveStatus(b.dataset.id, 'Rejected')));
  }

  function updateLeaveStatus(id, status) {
    const l = (db.leaves || []).find(x => x.id === id);
    if (!l) return;
    l.status = status;
    BS.save(db);
    BS.audit(`Marked leave ${status.toLowerCase()}`, 'Leave request', id, l.type);
    BS.toast(`Leave request ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'danger');
    renderLeaves();
  }

  function saveLeave(e) {
    e.preventDefault();
    const form = e.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const staffId = document.getElementById('fLeaveStaff').value;
    const type    = document.getElementById('fLeaveType').value;
    const from    = document.getElementById('fLeaveFrom').value;
    const to      = document.getElementById('fLeaveTo').value;
    const reason  = document.getElementById('fLeaveReason').value.trim();

    if (!db.leaves) db.leaves = [];
    const newId = 'LV-' + (db.leaves.length + 1 + Math.floor(Math.random()*100));
    db.leaves.push({ id: newId, staffId, type, from, to, reason, status: 'Pending' });
    BS.save(db);
    BS.audit('Submitted leave request', 'Leave request', newId, `${staffId}; ${type}; ${from} to ${to}`);
    BS.toast('Leave request submitted.', 'success');
    leaveModal.hide();
    renderLeaves();
  }

  /* ── Attendance ── */
  function renderAttendance() {
    const dateVal = document.getElementById('attDate').value || BS.todayISO();
    db.staffAttendance = db.staffAttendance || {};
    const attMap  = db.staffAttendance[dateVal] || {};

    // KPI
    const present = Object.values(attMap).filter(v => v === 'P').length;
    const absent  = Object.values(attMap).filter(v => v === 'A').length;
    const onLeave = Object.values(attMap).filter(v => v === 'L').length;
    const total   = staff.length;
    const pct     = total ? Math.round((present / total) * 100) : 0;

    document.getElementById('attKpi').innerHTML = [
      { icon: 'bi-person-check-fill', label: 'Present',  val: present,  color: '#2ec4b6' },
      { icon: 'bi-person-x-fill',     label: 'Absent',   val: absent,   color: '#e63946' },
      { icon: 'bi-calendar-x-fill',   label: 'On Leave', val: onLeave,  color: '#ff9f1c' },
      { icon: 'bi-percent',           label: 'Rate',     val: pct + '%', color: '#4361ee' }
    ].map(k => `
      <div class="col-6 col-lg-3">
        <div class="card-soft" style="border-left:4px solid ${k.color}">
          <div class="kpi">
            <div class="ico" style="background:${k.color}22;color:${k.color}"><i class="bi ${k.icon}"></i></div>
            <div><div class="val">${k.val}</div><div class="lbl">${k.label}</div></div>
          </div>
        </div>
      </div>`).join('');

    // Attendance table
    document.getElementById('attBody').innerHTML = staff.map(s => {
      const cur = attMap[s.id] || '';
      return `<tr>
        <td class="ps-3">
          <div class="d-flex align-items-center gap-2">
            <span class="staff-avatar ${s.gender==='Female'?'female':''}">${BS.esc(BS.initials(s.name))}</span>
            <div>
              <div class="fw-500">${BS.esc(s.name)}</div>
              <small class="text-muted">${BS.esc(s.designation)}</small>
            </div>
          </div>
        </td>
        <td><span class="dept-badge dept-${s.department.replace(/\s/g,'')}">${BS.esc(s.department)}</span></td>
        <td><input type="radio" class="form-check-input att-radio" name="att_${s.id}" value="P" data-id="${s.id}" ${cur==='P'?'checked':''}></td>
        <td><input type="radio" class="form-check-input att-radio" name="att_${s.id}" value="A" data-id="${s.id}" ${cur==='A'?'checked':''}></td>
        <td><input type="radio" class="form-check-input att-radio" name="att_${s.id}" value="L" data-id="${s.id}" ${cur==='L'?'checked':''}></td>
      </tr>`;
    }).join('');

    renderMonthlyOverview();
  }

  function saveAttendance() {
    const dateVal = document.getElementById('attDate').value || BS.todayISO();
    db.staffAttendance = db.staffAttendance || {};
    if (!db.staffAttendance[dateVal]) db.staffAttendance[dateVal] = {};

    document.querySelectorAll('.att-radio:checked').forEach(r => {
      db.staffAttendance[dateVal][r.dataset.id] = r.value;
    });

    BS.save(db);
    BS.audit('Saved staff attendance', 'Staff attendance', dateVal);
    BS.toast('Attendance saved successfully.', 'success');
    renderAttendance();
  }

  function renderMonthlyOverview() {
    const now = new Date();
    const days = [];
    for (let d = 1; d <= now.getDate(); d++) {
      const iso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const map = db.staffAttendance && db.staffAttendance[iso];
      if (!map) { days.push('empty'); continue; }
      const p = Object.values(map).filter(v => v === 'P').length;
      const total = staff.length;
      const pct = total ? p / total : 0;
      days.push(pct > 0.85 ? 'good' : pct > 0.6 ? 'avg' : 'low');
    }

    const colorMap = { good: '#2ec4b6', avg: '#ff9f1c', low: '#e63946', empty: 'var(--surface-2)' };
    document.getElementById('attMonthly').innerHTML = `
      <div class="p-3">
        <div class="small text-muted mb-2">${now.toLocaleString('default',{month:'long',year:'numeric'})} — Daily Attendance Rate</div>
        <div class="att-grid">
          ${days.map((d, i) => `
            <div class="att-cell ${d !== 'empty' ? 'present' : ''}"
              style="background:${colorMap[d]};opacity:${d==='empty'?0.4:0.85}"
              title="Day ${i+1}: ${d}">
              <span style="color:#fff;font-size:.55rem;font-weight:600">${i+1}</span>
            </div>`).join('')}
        </div>
        <div class="d-flex gap-3 mt-2 small">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#2ec4b6;margin-right:4px"></span>High</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ff9f1c;margin-right:4px"></span>Avg</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#e63946;margin-right:4px"></span>Low</span>
        </div>
      </div>`;
  }

  document.addEventListener('change', e => {
    if (e.target.id === 'attDate') renderAttendance();
  });

})();
