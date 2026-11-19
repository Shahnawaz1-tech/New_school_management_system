/* ==========================================================================
   students.js · Full student management: list, search, filter, sort,
   add, edit, delete, view profile, CSV export/import, pagination, bulk delete
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  const PAGE_SIZE = 15;
  let db, students, filtered = [], sortCol = 'name', sortDir = 'asc', page = 1;
  let stuModal, profileCanvas, editingId = null;

  document.addEventListener('bs:ready', init);

  function init() {
    db = BS.db();
    students = db.students;

    stuModal     = new bootstrap.Modal(document.getElementById('stuModal'));
    profileCanvas = new bootstrap.Offcanvas(document.getElementById('profileCanvas'));

    populateClassOptions();
    renderKpi();
    applyUrlQuery();
    bindEvents();
    render();
  }

  /* ---------- Populate class dropdowns ---------- */
  function populateClassOptions() {
    const classes = db.classes.map((c) => c.name);
    const filterSel = document.getElementById('filterClass');
    const formSel   = document.getElementById('fClass');
    classes.forEach((c) => {
      filterSel.insertAdjacentHTML('beforeend', `<option>${BS.esc(c)}</option>`);
      formSel.insertAdjacentHTML('beforeend', `<option>${BS.esc(c)}</option>`);
    });
  }

  /* ---------- KPI cards ---------- */
  function renderKpi() {
    const total   = students.length;
    const active  = students.filter((s) => s.status === 'Active').length;
    const boys    = students.filter((s) => s.gender === 'Male').length;
    const girls   = students.filter((s) => s.gender === 'Female').length;
    const onBus   = students.filter((s) => s.transport).length;

    const kpis = [
      { icon: 'bi-people-fill',       label: 'Total Students',  val: total,  cls: '' },
      { icon: 'bi-person-check-fill', label: 'Active',          val: active, cls: '' },
      { icon: 'bi-gender-male',       label: 'Boys',            val: boys,   cls: '' },
      { icon: 'bi-gender-female',     label: 'Girls',           val: girls,  cls: 'amber' },
      { icon: 'bi-bus-front-fill',    label: 'On Transport',    val: onBus,  cls: '' }
    ];

    document.getElementById('stuKpi').innerHTML = kpis.map((k) =>
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

  /* ---------- URL query pre-fill ---------- */
  function applyUrlQuery() {
    const q = BS.param('q');
    if (q) document.getElementById('searchInput').value = q;
  }

  /* ---------- Bind all events ---------- */
  function bindEvents() {
    // Search + filters
    document.getElementById('searchInput').addEventListener('input', BS.debounce(() => { page = 1; render(); }));
    ['filterClass', 'filterGender', 'filterStatus', 'filterTransport'].forEach((id) =>
      document.getElementById(id).addEventListener('change', () => { page = 1; render(); })
    );
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    // Sorting
    document.querySelectorAll('#stuTable th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'asc'; }
        render();
      })
    );

    // Select all checkbox
    document.getElementById('checkAll').addEventListener('change', (e) => {
      document.querySelectorAll('.row-check').forEach((cb) => (cb.checked = e.target.checked));
      updateBulkBar();
    });

    // Add button
    document.getElementById('addBtn').addEventListener('click', () => openModal(null));

    // Form submit
    document.getElementById('stuForm').addEventListener('submit', saveStudent);

    // Export / Import
    document.getElementById('exportBtn').addEventListener('click', exportCsv);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
    document.getElementById('csvFileInput').addEventListener('change', importCsv);

    // Bulk delete
    document.getElementById('bulkDelete').addEventListener('click', bulkDelete);
  }

  /* ---------- Main render ---------- */
  function render() {
    const q   = document.getElementById('searchInput').value.trim().toLowerCase();
    const cls = document.getElementById('filterClass').value;
    const gen = document.getElementById('filterGender').value;
    const sta = document.getElementById('filterStatus').value;
    const trn = document.getElementById('filterTransport').value;

    filtered = students.filter((s) => {
      if (q && !`${s.name} ${s.id} ${s.fatherName} ${s.phone}`.toLowerCase().includes(q)) return false;
      if (cls && s.cls !== cls) return false;
      if (gen && s.gender !== gen) return false;
      if (sta && s.status !== sta) return false;
      if (trn === '1' && !s.transport) return false;
      if (trn === '0' && s.transport) return false;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'asc' ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
    });

    // Pagination
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    document.getElementById('stuCount').textContent = `${total} student${total !== 1 ? 's' : ''} found`;

    // Update sort indicators
    document.querySelectorAll('#stuTable th.sortable').forEach((th) => {
      th.classList.remove('asc', 'desc');
      if (th.dataset.col === sortCol) th.classList.add(sortDir);
    });

    renderRows(slice);
    renderPagination(pages);
    document.getElementById('pageInfo').textContent =
      total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : '';
  }

  function renderRows(slice) {
    const tbody = document.getElementById('stuBody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="11">${BS.empty('bi-people', 'No students found', 'Try adjusting your search or filters.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = slice.map((s) => {
      const initials = BS.initials(s.name);
      const gClass   = s.gender === 'Female' ? 'female' : 'male';
      return `<tr>
        <td class="ps-3"><input type="checkbox" class="form-check-input row-check" data-id="${s.id}" aria-label="Select ${BS.esc(s.name)}"></td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="stu-avatar ${gClass}" aria-hidden="true">${BS.esc(initials)}</span>
            <div>
              <div class="fw-500">${BS.esc(s.name)}</div>
              <small class="text-muted">${BS.esc(s.id)}</small>
            </div>
          </div>
        </td>
        <td><small class="text-muted">${BS.esc(s.id)}</small></td>
        <td>${BS.esc(s.cls)} <small class="text-muted">${BS.esc(s.section)}</small></td>
        <td>${BS.esc(s.gender)}</td>
        <td>${BS.esc(s.fatherName)}</td>
        <td><a href="tel:${BS.esc(s.phone)}" class="text-decoration-none">${BS.esc(s.phone)}</a></td>
        <td>${BS.fmtDate(s.admissionDate)}</td>
        <td>${s.transport ? '<span class="pill pill-info"><i class="bi bi-bus-front me-1"></i>Yes</span>' : '<span class="pill pill-muted">No</span>'}</td>
        <td>${BS.pill(s.status, BS.statusKind(s.status))}</td>
        <td class="text-end pe-3">
          <button class="btn btn-sm btn-outline-secondary me-1 btn-view" data-id="${s.id}" title="View profile"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-del" data-id="${s.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    // Row action listeners
    tbody.querySelectorAll('.btn-view').forEach((b) => b.addEventListener('click', () => viewProfile(b.dataset.id)));
    tbody.querySelectorAll('.btn-edit').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.id)));
    tbody.querySelectorAll('.btn-del').forEach((b)  => b.addEventListener('click', () => deleteStudent(b.dataset.id)));
    tbody.querySelectorAll('.row-check').forEach((cb) => cb.addEventListener('change', updateBulkBar));
  }

  /* ---------- Pagination ---------- */
  function renderPagination(pages) {
    const ul = document.getElementById('pagination');
    if (pages <= 1) { ul.innerHTML = ''; return; }
    const prev = `<li class="page-item ${page === 1 ? 'disabled' : ''}"><a class="page-link" data-p="${page - 1}" href="#">‹</a></li>`;
    const next = `<li class="page-item ${page === pages ? 'disabled' : ''}"><a class="page-link" data-p="${page + 1}" href="#">›</a></li>`;
    const nums = Array.from({ length: pages }, (_, i) => i + 1)
      .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
      .reduce((acc, p, i, arr) => {
        if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
        acc.push(p); return acc;
      }, [])
      .map((p) => p === '…'
        ? `<li class="page-item disabled"><span class="page-link">…</span></li>`
        : `<li class="page-item ${p === page ? 'active' : ''}"><a class="page-link" data-p="${p}" href="#">${p}</a></li>`)
      .join('');
    ul.innerHTML = prev + nums + next;
    ul.querySelectorAll('[data-p]').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); page = +a.dataset.p; render(); })
    );
  }

  /* ---------- Bulk bar ---------- */
  function updateBulkBar() {
    const checked = document.querySelectorAll('.row-check:checked').length;
    const bar = document.getElementById('bulkActions');
    bar.classList.toggle('d-none', !checked);
    bar.classList.toggle('d-flex', !!checked);
    if (checked) bar.querySelector('#bulkDelete').textContent = `Delete selected (${checked})`;
  }

  /* ---------- View profile ---------- */
  function viewProfile(id) {
    const s = students.find((x) => x.id === id);
    if (!s) return;
    const gClass = s.gender === 'Female' ? 'female' : 'male';
    document.getElementById('profileBody').innerHTML = `
      <div class="profile-row">
        <span class="stu-avatar ${gClass}" style="width:56px;height:56px;font-size:1.2rem">${BS.esc(BS.initials(s.name))}</span>
        <div>
          <div class="fw-600 fs-5">${BS.esc(s.name)}</div>
          <small class="text-muted">${BS.esc(s.id)} · ${BS.esc(s.cls)} ${BS.esc(s.section)}</small>
        </div>
      </div>
      ${BS.pill(s.status, BS.statusKind(s.status))}
      ${s.transport ? ' <span class="pill pill-info ms-1"><i class="bi bi-bus-front me-1"></i>Transport</span>' : ''}
      ${s.discountPct ? ` <span class="pill pill-warning ms-1">${s.discountPct}% discount</span>` : ''}
      <hr>
      <dl class="profile-detail row">
        <dt class="col-5">Father</dt><dd class="col-7">${BS.esc(s.fatherName)}</dd>
        <dt class="col-5">Gender</dt><dd class="col-7">${BS.esc(s.gender)}</dd>
        <dt class="col-5">Date of Birth</dt><dd class="col-7">${BS.fmtDate(s.dob)}</dd>
        <dt class="col-5">Phone</dt><dd class="col-7"><a href="tel:${BS.esc(s.phone)}">${BS.esc(s.phone)}</a></dd>
        <dt class="col-5">Address</dt><dd class="col-7">${BS.esc(s.address)}</dd>
        <dt class="col-5">Admitted</dt><dd class="col-7">${BS.fmtDate(s.admissionDate)}</dd>
        <dt class="col-5">Roll No</dt><dd class="col-7">${s.rollNo || '—'}</dd>
      </dl>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary btn-sm flex-fill btn-edit" data-id="${s.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
        <button class="btn btn-outline-danger btn-sm btn-del" data-id="${s.id}"><i class="bi bi-trash me-1"></i>Delete</button>
      </div>`;
    document.getElementById('profileBody').querySelector('.btn-edit').addEventListener('click', () => { profileCanvas.hide(); openModal(s.id); });
    document.getElementById('profileBody').querySelector('.btn-del').addEventListener('click', () => { profileCanvas.hide(); deleteStudent(s.id); });
    profileCanvas.show();
  }

  /* ---------- Add / Edit modal ---------- */
  function openModal(id) {
    editingId = id;
    const form = document.getElementById('stuForm');
    form.classList.remove('was-validated');
    const s = id ? students.find((x) => x.id === id) : null;
    document.getElementById('stuModalTitle').textContent = s ? 'Edit Student' : 'Add Student';
    document.getElementById('stuSaveBtn').textContent    = s ? 'Save Changes' : 'Save Student';

    document.getElementById('fName').value      = s ? s.name : '';
    document.getElementById('fFather').value    = s ? s.fatherName : '';
    document.getElementById('fClass').value     = s ? s.cls : '';
    document.getElementById('fSection').value   = s ? s.section : 'A';
    document.getElementById('fRoll').value      = s ? s.rollNo : '';
    document.getElementById('fGender').value    = s ? s.gender : '';
    document.getElementById('fDob').value       = s ? (s.dob || '') : '';
    document.getElementById('fAdmDate').value   = s ? (s.admissionDate || '') : BS.todayISO();
    document.getElementById('fPhone').value     = s ? s.phone : '';
    document.getElementById('fStatus').value    = s ? s.status : 'Active';
    document.getElementById('fAddress').value   = s ? s.address : '';
    document.getElementById('fDiscount').value  = s ? (s.discountPct || 0) : 0;
    document.getElementById('fTransport').checked = s ? !!s.transport : false;

    stuModal.show();
  }

  function saveStudent(e) {
    e.preventDefault();
    const form = e.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const payload = {
      name:          document.getElementById('fName').value.trim(),
      fatherName:    document.getElementById('fFather').value.trim(),
      cls:           document.getElementById('fClass').value,
      section:       document.getElementById('fSection').value.trim() || 'A',
      rollNo:        parseInt(document.getElementById('fRoll').value) || 0,
      gender:        document.getElementById('fGender').value,
      dob:           document.getElementById('fDob').value,
      admissionDate: document.getElementById('fAdmDate').value,
      phone:         document.getElementById('fPhone').value.trim(),
      status:        document.getElementById('fStatus').value,
      address:       document.getElementById('fAddress').value.trim(),
      discountPct:   parseFloat(document.getElementById('fDiscount').value) || 0,
      transport:     document.getElementById('fTransport').checked
    };

    if (editingId) {
      const idx = students.findIndex((x) => x.id === editingId);
      students[idx] = { ...students[idx], ...payload };
      BS.toast(`${payload.name} updated successfully.`, 'success');
    } else {
      payload.id = BS.nextId('S', students, 1001);
      students.push(payload);
      BS.toast(`${payload.name} added successfully.`, 'success');
    }

    BS.save();
    BS.audit(editingId ? 'Updated student' : 'Added student', 'Student', editingId || payload.id, payload.name);
    stuModal.hide();
    renderKpi();
    render();
  }

  /* ---------- Delete ---------- */
  async function deleteStudent(id) {
    const s = students.find((x) => x.id === id);
    if (!s) return;
    const ok = await BS.confirm(`Delete ${s.name} (${s.id})? This cannot be undone.`, { title: 'Delete student?', ok: 'Delete', danger: true });
    if (!ok) return;
    db.students = students = students.filter((x) => x.id !== id);
    BS.save();
    BS.audit('Deleted student', 'Student', id, s.name);
    BS.toast(`${s.name} deleted.`, 'danger');
    renderKpi();
    render();
  }

  /* ---------- Bulk delete ---------- */
  async function bulkDelete() {
    const ids = Array.from(document.querySelectorAll('.row-check:checked')).map((cb) => cb.dataset.id);
    if (!ids.length) return;
    const ok = await BS.confirm(`Delete ${ids.length} selected student(s)? This cannot be undone.`, { title: 'Bulk delete?', ok: 'Delete all', danger: true });
    if (!ok) return;
    db.students = students = students.filter((s) => !ids.includes(s.id));
    BS.save();
    BS.audit('Bulk deleted students', 'Student', ids.join(', '), `${ids.length} student records`);
    BS.toast(`${ids.length} student(s) deleted.`, 'danger');
    document.getElementById('checkAll').checked = false;
    updateBulkBar();
    renderKpi();
    render();
  }

  /* ---------- Clear filters ---------- */
  function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterClass').value = '';
    document.getElementById('filterGender').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterTransport').value = '';
    page = 1;
    render();
  }

  /* ---------- Export CSV ---------- */
  function exportCsv() {
    const cols = ['id', 'name', 'fatherName', 'cls', 'section', 'rollNo', 'gender', 'dob', 'admissionDate', 'phone', 'address', 'transport', 'discountPct', 'status'];
    const header = cols.join(',');
    const rows = (filtered.length ? filtered : students).map((s) =>
      cols.map((c) => `"${String(s[c] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    BS.download(`students_${BS.todayISO()}.csv`, [header, ...rows].join('\n'));
    BS.toast('CSV exported successfully.', 'success');
  }

  /* ---------- Import CSV ---------- */
  function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
      let added = 0;
      lines.slice(1).forEach((line) => {
        const vals = line.match(/(".*?"|[^,]+)/g) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
        if (!obj.name || !obj.cls) return;
        const exists = students.find((s) => s.id === obj.id);
        if (exists) return;
        obj.id = obj.id || BS.nextId('S', students, 1001);
        obj.transport = obj.transport === 'true';
        obj.discountPct = parseFloat(obj.discountPct) || 0;
        obj.rollNo = parseInt(obj.rollNo) || 0;
        obj.status = obj.status || 'Active';
        students.push(obj);
        added++;
      });
      BS.save();
      BS.toast(`${added} student(s) imported.`, 'success');
      renderKpi();
      render();
    };
    reader.readAsText(file);
    e.target.value = '';
  }
})();
