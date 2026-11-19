/* ==========================================================================
   exams.js · Full exam management: cards, marks entry, results, analytics
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;
  const PAGE_SIZE = 15;

  let db, exams, students, subjects, marks;
  let examModal, resultCanvas;
  let editingExamId = null;
  let marksPage = 1, resPage = 1;

  document.addEventListener('bs:ready', init);

  function init() {
    db       = BS.db();
    exams    = db.exams;
    students = db.students;
    subjects = db.subjects;
    marks    = db.marks;

    examModal    = new bootstrap.Modal(document.getElementById('examModal'));
    resultCanvas = new bootstrap.Offcanvas(document.getElementById('resultCanvas'));

    renderSubline();
    renderKpi();
    renderExamCards();
    populateAllSelects();
    renderMarksTable();
    renderResultsTable();
    renderCharts();
    bindEvents();
  }

  /* ── helpers ── */
  function gradeOf(pct) {
    if (pct >= 80) return 'A';
    if (pct >= 65) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 40) return 'D';
    return 'F';
  }
  function gradeColor(g) {
    return { A: '#157347', B: '#0A58CA', C: '#8A5F00', D: '#c45e00', F: '#B02A37' }[g] || '#666';
  }
  function sel(id) { return document.getElementById(id).value; }
  function studentsOf(cls, section) {
    return students.filter(s =>
      (!cls || s.cls === cls) &&
      (!section || s.section === section)
    );
  }
  function marksFor(examId, studentId) {
    return (marks[examId] && marks[examId][studentId]) || null;
  }
  function totalOf(row) {
    return subjects.reduce((s, sub) => s + (Number(row[sub]) || 0), 0);
  }
  function pctOf(row, totalMarks) {
    const max = subjects.length * (totalMarks || 100);
    return max ? Math.round(totalOf(row) / max * 100) : 0;
  }
  function sectionsOf(cls) {
    const all = students.filter(s => !cls || s.cls === cls).map(s => s.section);
    return [...new Set(all)].sort();
  }

  /* ── pagination renderer ── */
  function renderPagination(ulId, infoId, current, total, onPage) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const info  = document.getElementById(infoId);
    const ul    = document.getElementById(ulId);
    const wrap  = ul ? ul.closest('[id$="PaginationWrap"]') : null;
    if (info) info.textContent = total
      ? `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, total)} of ${total}`
      : '';
    if (!ul) return;
    if (pages <= 1) { ul.innerHTML = ''; if (wrap) wrap.style.display = 'none'; return; }
    if (wrap) wrap.style.display = '';
    const prev = `<li class="page-item ${current === 1 ? 'disabled' : ''}"><a class="page-link" data-p="${current - 1}" href="#">‹</a></li>`;
    const next = `<li class="page-item ${current === pages ? 'disabled' : ''}"><a class="page-link" data-p="${current + 1}" href="#">›</a></li>`;
    const nums = Array.from({ length: pages }, (_, i) => i + 1)
      .filter(p => p === 1 || p === pages || Math.abs(p - current) <= 1)
      .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('…'); acc.push(p); return acc; }, [])
      .map(p => p === '…'
        ? `<li class="page-item disabled"><span class="page-link">…</span></li>`
        : `<li class="page-item ${p === current ? 'active' : ''}"><a class="page-link" data-p="${p}" href="#">${p}</a></li>`)
      .join('');
    ul.innerHTML = prev + nums + next;
    ul.querySelectorAll('[data-p]').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); onPage(+a.dataset.p); })
    );
  }

  /* ── subline ── */
  function renderSubline() {
    const ongoing = exams.find(e => e.status === 'Ongoing');
    document.getElementById('examSubline').textContent = ongoing
      ? `${ongoing.name} is currently ongoing · ${BS.fmtDate(ongoing.start)} – ${BS.fmtDate(ongoing.end)}`
      : `${exams.length} exam(s) configured for this session`;
  }

  /* ── KPI ── */
  function renderKpi() {
    const completed = exams.filter(e => e.status === 'Completed').length;
    const ongoing   = exams.filter(e => e.status === 'Ongoing').length;
    const upcoming  = exams.filter(e => e.status === 'Upcoming').length;
    let totalPct = 0, count = 0;
    exams.filter(e => e.status === 'Completed').forEach(ex => {
      students.forEach(st => {
        const m = marksFor(ex.id, st.id);
        if (m) { totalPct += pctOf(m, ex.totalMarks); count++; }
      });
    });
    const avgPct = count ? Math.round(totalPct / count) : 0;
    const kpis = [
      { icon: 'bi-journal-text',      label: 'Total Exams',   val: exams.length, cls: '' },
      { icon: 'bi-check-circle-fill', label: 'Completed',     val: completed,    cls: '' },
      { icon: 'bi-hourglass-split',   label: 'Ongoing',       val: ongoing,      cls: 'amber' },
      { icon: 'bi-calendar-event',    label: 'Upcoming',      val: upcoming,     cls: '' },
      { icon: 'bi-bar-chart-fill',    label: 'Session Avg %', val: avgPct + '%', cls: '' }
    ];
    document.getElementById('examKpi').innerHTML = kpis.map(k =>
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

  /* ── Exam Cards ── */
  function renderExamCards() {
    const wrap = document.getElementById('examCards');
    document.getElementById('examCardCount').textContent = `${exams.length} exam(s)`;
    if (!exams.length) {
      wrap.innerHTML = `<div class="col-12">${BS.empty('bi-journal-x', 'No exams yet', 'Click "Add Exam" to create one.')}</div>`;
      return;
    }
    wrap.innerHTML = exams.map(ex => {
      const kind = BS.statusKind(ex.status);
      return `<div class="col-12 col-sm-6 col-lg-4">
        <div class="exam-card" data-id="${ex.id}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="exam-name">${BS.esc(ex.name)}</div>
            ${BS.pill(ex.status, kind)}
          </div>
          <div class="exam-dates mt-1"><i class="bi bi-calendar3 me-1"></i>${BS.fmtDate(ex.start)} – ${BS.fmtDate(ex.end)}</div>
          <div class="exam-dates"><i class="bi bi-award me-1"></i>Total Marks: ${ex.totalMarks}</div>
          <div class="d-flex gap-2 mt-2 exam-actions">
            <button class="btn btn-sm btn-outline-primary btn-exam-edit" data-id="${ex.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
            <button class="btn btn-sm btn-outline-danger btn-exam-del" data-id="${ex.id}"><i class="bi bi-trash me-1"></i>Delete</button>
          </div>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.btn-exam-edit').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openExamModal(b.dataset.id); }));
    wrap.querySelectorAll('.btn-exam-del').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteExam(b.dataset.id); }));
  }

  /* ── Populate selects ── */
  function populateAllSelects() {
    ['marksExam', 'resExam', 'chartExam'].forEach(id => {
      const s = document.getElementById(id);
      s.innerHTML = exams.map(e => `<option value="${e.id}">${BS.esc(e.name)}</option>`).join('');
    });
    const classes = db.classes.map(c => c.name);
    ['marksClass', 'resClass', 'chartClass'].forEach(id => {
      const s = document.getElementById(id);
      s.innerHTML = `<option value="">All Classes</option>` + classes.map(c => `<option>${BS.esc(c)}</option>`).join('');
    });
    ['marksSection', 'resSection', 'chartSection'].forEach(id => {
      const s = document.getElementById(id);
      s.innerHTML = `<option value="">All Sections</option>`;
    });
    document.getElementById('marksSubject').innerHTML =
      `<option value="">All Subjects</option>` + subjects.map(s => `<option>${BS.esc(s)}</option>`).join('');
  }

  function updateSectionDropdown(prefix) {
    const cls = sel(prefix + 'Class');
    const secs = sectionsOf(cls);
    const s = document.getElementById(prefix + 'Section');
    const cur = s.value;
    s.innerHTML = `<option value="">All Sections</option>` + secs.map(sec => `<option ${sec === cur ? 'selected' : ''}>${BS.esc(sec)}</option>`).join('');
  }

  /* ── Context Banner ── */
  function updateContextBanner() {
    const banner  = document.getElementById('marksContextBanner');
    const examId  = sel('marksExam');
    const cls     = sel('marksClass');
    const section = sel('marksSection');
    const exam    = exams.find(e => e.id === examId);
    if (!exam) { banner.style.display = 'none'; return; }
    const parts = [
      `<i class="bi bi-journal-text me-1"></i><b>Exam:</b> ${BS.esc(exam.name)}`,
      `<i class="bi bi-people ms-3 me-1"></i><b>Class:</b> ${cls || 'All Classes'}`,
      `<i class="bi bi-grid ms-3 me-1"></i><b>Section:</b> ${section || 'All Sections'}`,
      `<i class="bi bi-calendar3 ms-3 me-1"></i>${BS.fmtDate(exam.start)} – ${BS.fmtDate(exam.end)}`,
      BS.pill(exam.status, BS.statusKind(exam.status))
    ];
    banner.innerHTML = parts.join(' ');
    banner.style.display = '';
  }

  /* ── Marks Entry ── */
  function renderMarksTable() {
    updateContextBanner();
    const examId  = sel('marksExam');
    const cls     = sel('marksClass');
    const section = sel('marksSection');
    const subject = sel('marksSubject');
    const q       = document.getElementById('marksSearch').value.trim().toLowerCase();
    const exam    = exams.find(e => e.id === examId);
    if (!exam) return;

    const cols    = subject ? [subject] : subjects;
    const allRows = studentsOf(cls, section).filter(s => !q || s.name.toLowerCase().includes(q));
    const total   = allRows.length;
    const pages   = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (marksPage > pages) marksPage = pages;
    const slice   = allRows.slice((marksPage - 1) * PAGE_SIZE, marksPage * PAGE_SIZE);

    // head
    document.getElementById('marksHead').innerHTML =
      `<tr><th class="ps-3">#</th><th>Student</th><th>Class</th><th>Sec</th>` +
      cols.map(s => `<th>${BS.esc(s)}</th>`).join('') +
      `<th>Total</th><th>%</th><th>Grade</th></tr>`;

    // count entered (across all rows, not just current page)
    let entered = 0;
    allRows.forEach(st => {
      const saved = marksFor(examId, st.id) || {};
      if (cols.every(sub => saved[sub] != null)) entered++;
    });

    // body
    document.getElementById('marksBody').innerHTML = slice.map((st, i) => {
      const saved    = marksFor(examId, st.id) || {};
      const rowTotal = cols.reduce((sum, sub) => sum + (Number(saved[sub]) || 0), 0);
      const rowPct   = cols.length ? Math.round(rowTotal / (cols.length * exam.totalMarks) * 100) : 0;
      const grade    = gradeOf(rowPct);
      const globalIdx = (marksPage - 1) * PAGE_SIZE + i + 1;
      return `<tr class="marks-row" data-sid="${st.id}">
        <td class="ps-3 text-muted small">${globalIdx}</td>
        <td><div class="fw-500">${BS.esc(st.name)}</div><small class="text-muted">${BS.esc(st.id)}</small></td>
        <td class="small">${BS.esc(st.cls)}</td>
        <td class="small">${BS.esc(st.section)}</td>
        ${cols.map(sub => {
          const val  = saved[sub] != null ? saved[sub] : '';
          const cls2 = val !== '' ? (Number(val) > exam.totalMarks ? 'is-invalid' : 'is-valid') : '';
          return `<td><input type="number" class="marks-input ${cls2}" data-sub="${sub}" min="0" max="${exam.totalMarks}" value="${val}" placeholder="—" aria-label="${sub} marks for ${st.name}"></td>`;
        }).join('')}
        <td class="fw-600 row-total">${rowTotal || '—'}</td>
        <td class="row-pct">${rowPct ? rowPct + '%' : '—'}</td>
        <td><span class="grade grade-${grade}">${grade}</span></td>
      </tr>`;
    }).join('');

    // progress
    const pct = total ? Math.round(entered / total * 100) : 0;
    document.getElementById('entryProgressBar').style.width   = pct + '%';
    document.getElementById('entryProgressLabel').textContent = `${entered} / ${total} entered`;
    document.getElementById('entryProgressPct').textContent   = pct + '%';

    // live listeners
    document.getElementById('marksBody').querySelectorAll('.marks-input').forEach(inp =>
      inp.addEventListener('input', () => updateRowLive(inp, exam))
    );

    renderPagination('marksPagination', 'marksPageInfo', marksPage, total, p => { marksPage = p; renderMarksTable(); });
  }

  function updateRowLive(inp, exam) {
    const val = Number(inp.value);
    inp.classList.toggle('is-invalid', inp.value !== '' && val > exam.totalMarks);
    inp.classList.toggle('is-valid',   inp.value !== '' && val <= exam.totalMarks);
    const row   = inp.closest('tr');
    const cols  = Array.from(row.querySelectorAll('.marks-input'));
    const total = cols.reduce((s, i) => s + (Number(i.value) || 0), 0);
    const pct   = cols.length ? Math.round(total / (cols.length * exam.totalMarks) * 100) : 0;
    const grade = gradeOf(pct);
    row.querySelector('.row-total').textContent = total || '—';
    row.querySelector('.row-pct').textContent   = pct ? pct + '%' : '—';
    row.querySelector('.grade').className       = `grade grade-${grade}`;
    row.querySelector('.grade').textContent     = grade;
  }

  function saveMarks() {
    const examId = sel('marksExam');
    const exam   = exams.find(e => e.id === examId);
    if (!exam) return;
    if (!marks[examId]) marks[examId] = {};
    let saved = 0, errors = 0;
    document.getElementById('marksBody').querySelectorAll('tr[data-sid]').forEach(row => {
      const sid  = row.dataset.sid;
      const inps = row.querySelectorAll('.marks-input');
      if (!inps.length) return;
      if (!marks[examId][sid]) marks[examId][sid] = {};
      inps.forEach(inp => {
        if (inp.value === '') return;
        const val = Number(inp.value);
        if (val > exam.totalMarks || val < 0) { errors++; return; }
        marks[examId][sid][inp.dataset.sub] = val;
        saved++;
      });
    });
    if (errors) BS.toast(`${errors} invalid value(s) skipped.`, 'warning');
    if (saved)  { BS.save(); BS.toast(`Marks saved (${saved} entries).`, 'success'); renderMarksTable(); }
    else if (!errors) BS.toast('No new marks to save.', 'info');
  }

  /* ── Results ── */
  function renderResultsTable() {
    const examId  = sel('resExam');
    const cls     = sel('resClass');
    const section = sel('resSection');
    const q       = document.getElementById('resSearch').value.trim().toLowerCase();
    const exam    = exams.find(e => e.id === examId);
    if (!exam) return;

    let allRows = studentsOf(cls, section)
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .map(st => {
        const m     = marksFor(examId, st.id);
        const total = m ? totalOf(m) : null;
        const pct   = m ? pctOf(m, exam.totalMarks) : null;
        return { st, m, total, pct, grade: pct != null ? gradeOf(pct) : null };
      })
      .filter(r => r.m)
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));

    allRows.forEach((r, i) => r.rank = i + 1);
    renderToppers(allRows.slice(0, 3));

    const total = allRows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (resPage > pages) resPage = pages;
    const slice = allRows.slice((resPage - 1) * PAGE_SIZE, resPage * PAGE_SIZE);

    if (!total) {
      document.getElementById('resultsBody').innerHTML =
        `<tr><td colspan="8">${BS.empty('bi-trophy', 'No results yet', 'Enter marks in the Marks Entry tab first.')}</td></tr>`;
      renderPagination('resPagination', 'resPageInfo', 1, 0, () => {});
      return;
    }

    document.getElementById('resultsBody').innerHTML = slice.map(r => {
      const pass = r.pct >= 40;
      return `<tr class="marks-row" style="cursor:pointer" data-sid="${r.st.id}" data-eid="${examId}">
        <td class="ps-3 fw-600">${r.rank}</td>
        <td><div class="fw-500">${BS.esc(r.st.name)}</div><small class="text-muted">${BS.esc(r.st.id)}</small></td>
        <td>${BS.esc(r.st.cls)} <span class="pill pill-muted ms-1">${BS.esc(r.st.section)}</span></td>
        <td>${subjects.map(sub => `<span class="me-2 small"><b>${sub.slice(0,3)}:</b> ${r.m[sub] ?? '—'}</span>`).join('')}</td>
        <td class="fw-600">${r.total}</td>
        <td>${r.pct}%</td>
        <td><span class="grade grade-${r.grade}">${r.grade}</span></td>
        <td class="pe-3">${BS.pill(pass ? 'Pass' : 'Fail', pass ? 'success' : 'danger')}</td>
      </tr>`;
    }).join('');

    document.getElementById('resultsBody').querySelectorAll('tr[data-sid]').forEach(row =>
      row.addEventListener('click', () => openResultCanvas(row.dataset.sid, row.dataset.eid))
    );

    renderPagination('resPagination', 'resPageInfo', resPage, total, p => { resPage = p; renderResultsTable(); });
  }

  function renderToppers(top) {
    const strip = document.getElementById('toppersStrip');
    if (!top.length) { strip.innerHTML = ''; return; }
    strip.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="fw-600 small me-1"><i class="bi bi-trophy-fill text-warning me-1"></i>Top Students:</span>
      ${top.map((r, i) => `
        <div class="topper-card">
          <div class="topper-avatar">${['🥇','🥈','🥉'][i]}</div>
          <div>
            <div class="fw-600 small">${BS.esc(r.st.name)}</div>
            <small class="text-muted">${BS.esc(r.st.cls)} ${BS.esc(r.st.section)} · ${r.pct}% · Grade ${r.grade}</small>
          </div>
        </div>`).join('')}
    </div>`;
  }

  /* ── Result Offcanvas ── */
  function openResultCanvas(sid, examId) {
    const st   = students.find(s => s.id === sid);
    const exam = exams.find(e => e.id === examId);
    const m    = marksFor(examId, sid);
    if (!st || !exam || !m) return;
    const total = totalOf(m);
    const pct   = pctOf(m, exam.totalMarks);
    const grade = gradeOf(pct);
    const pass  = pct >= 40;
    document.getElementById('resultCanvasTitle').textContent = `${st.name} · Result Card`;
    document.getElementById('resultBody').innerHTML = `
      <div class="text-center py-3 border-bottom mb-3">
        <div class="topper-avatar mx-auto mb-2" style="width:56px;height:56px;font-size:1.4rem;border-radius:50%">${BS.initials(st.name)}</div>
        <div class="fw-700 fs-5">${BS.esc(st.name)}</div>
        <small class="text-muted">${BS.esc(st.cls)} · Section ${BS.esc(st.section)} · ${BS.esc(st.id)}</small>
        <div class="mt-2">${BS.pill(pass ? 'Pass' : 'Fail', pass ? 'success' : 'danger')}</div>
      </div>
      <div class="d-flex justify-content-around text-center mb-3">
        <div><div class="fw-700 fs-4">${total}</div><small class="text-muted">Total</small></div>
        <div><div class="fw-700 fs-4">${pct}%</div><small class="text-muted">Percentage</small></div>
        <div><div class="fw-700 fs-4" style="color:${gradeColor(grade)}">${grade}</div><small class="text-muted">Grade</small></div>
      </div>
      <div class="mb-2 fw-600 small">Subject-wise Marks</div>
      ${subjects.map(sub => {
        const val = m[sub] ?? 0;
        const sp  = Math.round(val / exam.totalMarks * 100);
        return `<div class="result-subject-row">
          <span>${BS.esc(sub)}</span>
          <div class="d-flex align-items-center gap-2">
            <div class="result-bar-wrap"><div class="result-bar" style="width:${sp}%;background:${gradeColor(gradeOf(sp))}"></div></div>
            <span class="fw-600" style="width:28px;text-align:right">${val}</span>
          </div>
        </div>`;
      }).join('')}
      <div class="mt-3 text-muted small text-center">${BS.esc(exam.name)} · Total Marks: ${exam.totalMarks} per subject</div>`;
    resultCanvas.show();
  }

  /* ── Analytics Charts ── */
  function renderCharts() {
    const examId  = sel('chartExam');
    const cls     = sel('chartClass');
    const section = sel('chartSection');
    const exam    = exams.find(e => e.id === examId);
    if (!exam) return;
    const rows = studentsOf(cls, section).map(st => marksFor(examId, st.id)).filter(Boolean);
    const subAvgs = subjects.map(sub => {
      const vals = rows.map(r => Number(r[sub]) || 0).filter(v => v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    });
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    rows.forEach(r => { gradeCounts[gradeOf(pctOf(r, exam.totalMarks))]++; });
    BS.charts.make('subjectChart', c => ({
      type: 'bar',
      data: { labels: subjects, datasets: [{ label: 'Class Average', data: subAvgs, backgroundColor: c.amber, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: BS.charts.scales(c, { max: exam.totalMarks }) }
    }));
    BS.charts.make('gradeChart', c => ({
      type: 'doughnut',
      data: { labels: ['A','B','C','D','F'], datasets: [{ data: Object.values(gradeCounts), backgroundColor: ['#157347','#0A58CA','#E8A317','#fd7e14','#B02A37'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: c.text, padding: 12 } } }, cutout: '65%' }
    }));
  }

  /* ── Add / Edit Exam Modal ── */
  function openExamModal(id) {
    editingExamId = id || null;
    const ex = id ? exams.find(e => e.id === id) : null;
    document.getElementById('examModalTitle').textContent = ex ? 'Edit Exam' : 'Add Exam';
    document.getElementById('examSaveBtn').textContent    = ex ? 'Save Changes' : 'Save Exam';
    document.getElementById('examForm').classList.remove('was-validated');
    document.getElementById('fExamName').value   = ex ? ex.name : '';
    document.getElementById('fExamStart').value  = ex ? ex.start : '';
    document.getElementById('fExamEnd').value    = ex ? ex.end : '';
    document.getElementById('fExamTotal').value  = ex ? ex.totalMarks : 100;
    document.getElementById('fExamStatus').value = ex ? ex.status : 'Upcoming';
    examModal.show();
  }

  function saveExam(e) {
    e.preventDefault();
    const form = e.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    const payload = {
      name:       document.getElementById('fExamName').value.trim(),
      start:      document.getElementById('fExamStart').value,
      end:        document.getElementById('fExamEnd').value,
      totalMarks: parseInt(document.getElementById('fExamTotal').value) || 100,
      status:     document.getElementById('fExamStatus').value
    };
    if (editingExamId) {
      const idx = exams.findIndex(e => e.id === editingExamId);
      exams[idx] = { ...exams[idx], ...payload };
      BS.toast(`${payload.name} updated.`, 'success');
    } else {
      payload.id = BS.nextId('E', exams, 1);
      exams.push(payload);
      if (!marks[payload.id]) marks[payload.id] = {};
      BS.toast(`${payload.name} created.`, 'success');
    }
    BS.save();
    examModal.hide();
    renderSubline(); renderKpi(); renderExamCards(); populateAllSelects();
    renderMarksTable(); renderResultsTable(); renderCharts();
  }

  async function deleteExam(id) {
    const ex = exams.find(e => e.id === id);
    if (!ex) return;
    const ok = await BS.confirm(`Delete "${ex.name}"? All marks will also be removed.`, { title: 'Delete Exam?', ok: 'Delete', danger: true });
    if (!ok) return;
    db.exams = exams = exams.filter(e => e.id !== id);
    delete marks[id];
    BS.save();
    BS.toast(`${ex.name} deleted.`, 'danger');
    renderSubline(); renderKpi(); renderExamCards(); populateAllSelects();
    renderMarksTable(); renderResultsTable(); renderCharts();
  }

  /* ── Export Results CSV ── */
  function exportResults() {
    const examId = sel('resExam');
    const exam   = exams.find(e => e.id === examId);
    if (!exam) return;
    const header = ['Rank','ID','Name','Class','Section',...subjects,'Total','Percentage','Grade','Result'];
    const rows = students
      .map(st => { const m = marksFor(examId, st.id); return m ? { st, m } : null; })
      .filter(Boolean)
      .map(({ st, m }) => { const total = totalOf(m), pct = pctOf(m, exam.totalMarks), grade = gradeOf(pct); return { st, m, total, pct, grade }; })
      .sort((a, b) => b.pct - a.pct)
      .map((r, i) => [i+1, r.st.id, r.st.name, r.st.cls, r.st.section, ...subjects.map(s => r.m[s] ?? ''), r.total, r.pct+'%', r.grade, r.pct >= 40 ? 'Pass' : 'Fail']);
    BS.download(
      `results_${exam.name.replace(/\s+/g,'_')}_${BS.todayISO()}.csv`,
      [header,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    );
    BS.toast('Results exported as CSV.', 'success');
  }

  /* ── Bind Events ── */
  function bindEvents() {
    document.getElementById('addExamBtn').addEventListener('click', () => openExamModal(null));
    document.getElementById('examForm').addEventListener('submit', saveExam);
    document.getElementById('saveMarksBtn').addEventListener('click', saveMarks);
    document.getElementById('exportResultBtn').addEventListener('click', exportResults);
    document.getElementById('printBtn').addEventListener('click', BS.print);

    // marks tab
    ['marksExam','marksSubject'].forEach(id =>
      document.getElementById(id).addEventListener('change', () => { marksPage = 1; renderMarksTable(); })
    );
    document.getElementById('marksClass').addEventListener('change', () => {
      marksPage = 1; updateSectionDropdown('marks'); renderMarksTable();
    });
    document.getElementById('marksSection').addEventListener('change', () => { marksPage = 1; renderMarksTable(); });
    document.getElementById('marksSearch').addEventListener('input', BS.debounce(() => { marksPage = 1; renderMarksTable(); }, 200));

    // results tab
    document.getElementById('resExam').addEventListener('change', () => { resPage = 1; renderResultsTable(); });
    document.getElementById('resClass').addEventListener('change', () => {
      resPage = 1; updateSectionDropdown('res'); renderResultsTable();
    });
    document.getElementById('resSection').addEventListener('change', () => { resPage = 1; renderResultsTable(); });
    document.getElementById('resSearch').addEventListener('input', BS.debounce(() => { resPage = 1; renderResultsTable(); }, 200));

    // charts tab
    document.getElementById('chartExam').addEventListener('change', renderCharts);
    document.getElementById('chartClass').addEventListener('change', () => { updateSectionDropdown('chart'); renderCharts(); });
    document.getElementById('chartSection').addEventListener('change', renderCharts);
    document.querySelector('[data-bs-target="#tabCharts"]').addEventListener('shown.bs.tab', renderCharts);
  }

})();
