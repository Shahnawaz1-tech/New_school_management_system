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

    staffModal  = new bootstrap.Modal(document.getElementById('staffModal'));
    payslipModal = new bootstrap.Modal(document.getElementById('payslipModal'));
    leaveModal  = new bootstrap.Modal(document.getElementById('leaveModal'));
    staffCanvas = new bootstrap.Offcanvas(document.getElementById('staffCanvas'));

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

    // Payroll month options (last 6 months)
    const mSel = document.getElementById('payrollMonth');
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      mSel.insertAdjacentHTML('beforeend', `<option value="${key}">${label}</option>`);
    }

    // Attendance date default = today
    document.getElementById('attDate').value = BS.todayISO();
  }

  /* ── KPI cards ── */
  function renderKpi() {
    const total    = staff.length;
    const active   = staff.filter(s => s.status === 'Active').length;
    const teachers = staff.filter(s => s.designation === 'Teacher').length;
    const female   = staff.filter(s => s.gender === 'Female').length;
    const totalSal = staff.reduce((a, s) => a + s.salary, 0);

    const kpis = [
      { icon: 'bi-person-badge-fill', label: 'Total Staff',    val: total,                    cls: '' },
      { icon: 'bi-person-check-fill', label: 'Active',         val: active,                   cls: '' },
      { icon: 'bi-mortarboard-fill',  label: 'Teachers',       val: teachers,                 cls: '' },
      { icon: 'bi-gender-female',     label: 'Female Staff',   val: female,                   cls: 'amber' },
      { icon: 'bi-cash-coin',         label: 'Monthly Payroll',val: 'Rs ' + BS.fmtNum(totalSal), cls: '' }
    ];

    document.getElementById('hrKpi').innerHTML = kpis.map(k =>
      `<div class="col-6 col-sm-4 col-lg">
        <div class="card-soft h-100">
          <div class="kpi ${k.cls}">
            <div class="ico"><i class="bi ${k.icon}"></i></div>
            <div><div class="val">${k.val}</div><div class="lbl">${k.label}</div></div>
          </div>
        </div>
      </div>`
    ).join('');
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
      BS.toast('Payroll processed successfully for all active staff.', 'success');
      renderPayroll();
    });

    document.getElementById('applyLeaveBtn').addEventListener('click', () => {
      document.getElementById('leaveForm').classList.remove('was-validated');
      document.getElementById('fLeaveStaff').value = '';
      document.getElementById('fLeaveType').value = '';
      document.getElementById('fLeaveFrom').value = BS.todayISO();
      document.getElementById('fLeaveTo').value = BS.todayISO();
      document.getElementById('fLeaveReason').value = '';
      leaveModal.show();
    });
    document.getElementById('leaveForm').addEventListener('submit', saveLeave);
    document.getElementById('saveAttBtn').addEventListener('click', saveAttendance);
    document.getElementById('payrollMonth').addEventListener('change', renderPayroll);
  }

  /* ── Staff directory render ── */
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
      return `<tr>
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
        <td>${BS.fmtDate(s.joinDate)}</td>
        <td>${BS.pill(s.status, BS.statusKind(s.status))}</td>
        <td class="text-end pe-3">
          <button class="btn btn-sm btn-outline-secondary me-1 btn-view-staff" data-id="${s.id}" title="View"><i class="bi bi-eye"></i></button>
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
