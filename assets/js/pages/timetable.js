/* ==========================================================================
   timetable.js · Dynamic timetable: class view, teacher view, edit cells,
   conflict detection, teacher workload, auto-fill, CSV export
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  let db, classes, staff, subjects, timetable, days, periods;
  let currentView = 'class';   // 'class' | 'teacher'
  let cellModal;
  let editCtx = null;          // { cls, dayIdx, periodIdx }

  /* ── Subject → colour map ── */
  const SUB_COLORS = {
    'English':       { bg: 'rgba(13,110,253,.13)',  color: '#0A58CA' },
    'Urdu':          { bg: 'rgba(111,66,193,.13)',  color: '#6f42c1' },
    'Mathematics':   { bg: 'rgba(232,163,23,.18)',  color: '#8A5F00' },
    'Science':       { bg: 'rgba(25,135,84,.13)',   color: '#157347' },
    'Islamiyat':     { bg: 'rgba(102,16,242,.1)',   color: '#6610f2' },
    'Social Studies':{ bg: 'rgba(253,126,20,.15)',  color: '#c45e00' },
    'Computer':      { bg: 'rgba(13,202,240,.13)',  color: '#0a7a8f' }
  };
  function subColor(sub) { return SUB_COLORS[sub] || { bg: 'rgba(108,117,125,.12)', color: '#495057' }; }

  document.addEventListener('bs:ready', init);

  function init() {
    db        = BS.db();
    classes   = db.classes;
    staff     = db.staff;
    subjects  = db.subjects;
    timetable = db.timetable;
    days      = db.days;
    periods   = db.periods;

    cellModal = new bootstrap.Modal(document.getElementById('cellModal'));

    populateSelects();
    renderSubline();
    renderKpi();
    renderNowIndicator();
    renderLegend();
    renderGrid();
    renderWorkload();
    bindEvents();

    // refresh now-indicator every minute
    setInterval(renderNowIndicator, 60000);
  }

  /* ── Populate dropdowns ── */
  function populateSelects() {
    const cs = document.getElementById('classSelect');
    cs.innerHTML = classes.map(c => `<option value="${BS.esc(c.name)}">${BS.esc(c.name)}</option>`).join('');
    updateSectionSelect();

    const ts = document.getElementById('teacherSelect');
    ts.innerHTML = staff.filter(t => t.subject).map(t =>
      `<option value="${t.id}">${BS.esc(t.name)} · ${BS.esc(t.subject)}</option>`
    ).join('');
  }

  function updateSectionSelect() {
    const cls = document.getElementById('classSelect').value;
    const secs = [...new Set(db.students.filter(s => s.cls === cls).map(s => s.section))].sort();
    const ss = document.getElementById('sectionSelect');
    ss.innerHTML = secs.map(s => `<option>${BS.esc(s)}</option>`).join('') || `<option>A</option>`;
  }

  /* ── Subline ── */
  function renderSubline() {
    const totalPeriods = days.length * periods.filter(p => p !== 'Break').length;
    document.getElementById('ttSubline').textContent =
      `${classes.length} classes · ${days.length} days/week · ${periods.filter(p => p !== 'Break').length} periods/day · ${totalPeriods} total slots`;
  }

  /* ── KPI ── */
  function renderKpi() {
    const teachers = staff.filter(t => t.subject && t.designation === 'Teacher').length;
    let filled = 0, total = 0;
    classes.forEach(c => {
      days.forEach((_, di) => {
        periods.forEach((p, pi) => {
          if (p === 'Break') return;
          total++;
          const slot = timetable[c.name]?.[di]?.[pi];
          if (slot && slot.subject) filled++;
        });
      });
    });
    const pct = total ? Math.round(filled / total * 100) : 0;
    const conflicts = detectAllConflicts().length;

    const kpis = [
      { icon: 'bi-calendar3-week-fill', label: 'Working Days',    val: days.length,    cls: '' },
      { icon: 'bi-clock',               label: 'Periods/Day',     val: periods.filter(p => p !== 'Break').length, cls: '' },
      { icon: 'bi-person-badge-fill',   label: 'Teachers',        val: teachers,       cls: '' },
      { icon: 'bi-check2-square',       label: 'Slots Filled',    val: `${pct}%`,      cls: 'amber' },
      { icon: 'bi-exclamation-triangle',label: 'Conflicts',       val: conflicts,      cls: conflicts ? '' : '' }
    ];
    document.getElementById('ttKpi').innerHTML = kpis.map(k =>
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

  /* ── Now indicator ── */
  function renderNowIndicator() {
    const now  = new Date();
    const day  = now.getDay(); // 0=Sun
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayName = dayNames[day];
    const todayIdx  = days.indexOf(todayName);
    const el = document.getElementById('nowIndicator');
    if (todayIdx === -1) { el.innerHTML = ''; return; }

    // find current period
    const hm = now.getHours() * 60 + now.getMinutes();
    const periodTimes = periods.map(p => {
      if (p === 'Break') return null;
      const [h, m] = p.split(':').map(Number);
      return h * 60 + m;
    });
    let curPeriod = null;
    periodTimes.forEach((t, i) => {
      if (t !== null && hm >= t && hm < t + 45) curPeriod = i;
    });

    el.innerHTML = `<span class="now-badge">
      <i class="bi bi-circle-fill" style="font-size:.5rem"></i>
      ${BS.esc(todayName)}${curPeriod !== null ? ' · Period ' + (curPeriod + 1) + ' (' + periods[curPeriod] + ')' : ' · School hours'}
    </span>`;
  }

  /* ── Subject legend ── */
  function renderLegend() {
    document.getElementById('subjectLegend').innerHTML = subjects.map(sub => {
      const c = subColor(sub);
      return `<span class="sub-chip" style="background:${c.bg};color:${c.color}">${BS.esc(sub)}</span>`;
    }).join('');
  }

  /* ── Today column index ── */
  function todayDayIdx() {
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days.indexOf(dayNames[new Date().getDay()]);
  }

  /* ══════════════════════════════════════════════
     CLASS VIEW
  ══════════════════════════════════════════════ */
  function renderClassView() {
    const cls     = document.getElementById('classSelect').value;
    const todayI  = todayDayIdx();
    const tt      = timetable[cls] || [];
    const conflicts = detectConflicts(cls);

    document.getElementById('ttGridTitle').textContent = `${cls} — Weekly Timetable`;

    let html = '<thead><tr>';
    html += `<th style="min-width:72px">Period</th>`;
    days.forEach((d, di) => {
      const isToday = di === todayI;
      html += `<th class="${isToday ? 'day-head today-col' : 'day-head'}">${BS.esc(d)}${isToday ? ' <span style="font-size:.65rem;opacity:.8">(Today)</span>' : ''}</th>`;
    });
    html += '</tr></thead><tbody>';

    periods.forEach((p, pi) => {
      html += '<tr>';
      if (p === 'Break') {
        html += `<td class="period-label"><span>Break</span></td>`;
        days.forEach((_, di) => {
          const isToday = di === todayI;
          html += `<td class="tt-cell break-cell ${isToday ? 'today-col' : ''}"><span class="text-muted small">☕ Break</span></td>`;
        });
      } else {
        html += `<td class="period-label"><b>${pi + 1}</b><span class="period-time">${p}</span></td>`;
        days.forEach((_, di) => {
          const isToday = di === todayI;
          const slot    = tt[di]?.[pi];
          const hasConflict = conflicts.some(c => c.dayIdx === di && c.periodIdx === pi);
          html += renderCell(slot, di, pi, cls, isToday, hasConflict);
        });
      }
      html += '</tr>';
    });

    html += '</tbody>';
    document.getElementById('ttGrid').innerHTML = html;
    attachCellListeners();
  }

  /* ══════════════════════════════════════════════
     TEACHER VIEW
  ══════════════════════════════════════════════ */
  function renderTeacherView() {
    const teacherId = document.getElementById('teacherSelect').value;
    const teacher   = staff.find(t => t.id === teacherId);
    const todayI    = todayDayIdx();
    if (!teacher) return;

    document.getElementById('ttGridTitle').textContent = `${teacher.name} — Weekly Schedule`;

    let html = '<thead><tr>';
    html += `<th style="min-width:72px">Period</th>`;
    days.forEach((d, di) => {
      const isToday = di === todayI;
      html += `<th class="${isToday ? 'day-head today-col' : 'day-head'}">${BS.esc(d)}${isToday ? ' <span style="font-size:.65rem;opacity:.8">(Today)</span>' : ''}</th>`;
    });
    html += '</tr></thead><tbody>';

    periods.forEach((p, pi) => {
      html += '<tr>';
      if (p === 'Break') {
        html += `<td class="period-label"><span>Break</span></td>`;
        days.forEach((_, di) => {
          html += `<td class="tt-cell break-cell ${di === todayI ? 'today-col' : ''}"><span class="text-muted small">☕ Break</span></td>`;
        });
      } else {
        html += `<td class="period-label"><b>${pi + 1}</b><span class="period-time">${p}</span></td>`;
        days.forEach((_, di) => {
          const isToday = di === todayI;
          // find which class this teacher teaches at this slot
          let foundSlot = null, foundCls = null;
          classes.forEach(c => {
            const slot = timetable[c.name]?.[di]?.[pi];
            if (slot && slot.teacherId === teacherId) { foundSlot = slot; foundCls = c.name; }
          });
          if (foundSlot) {
            const c = subColor(foundSlot.subject);
            html += `<td class="tt-cell ${isToday ? 'today-col' : ''}" style="background:${c.bg}">
              <div class="cell-sub" style="color:${c.color}">${BS.esc(foundSlot.subject)}</div>
              <div class="cell-teacher">${BS.esc(foundCls)}</div>
            </td>`;
          } else {
            html += `<td class="tt-cell empty-cell ${isToday ? 'today-col' : ''}"></td>`;
          }
        });
      }
      html += '</tr>';
    });

    html += '</tbody>';
    document.getElementById('ttGrid').innerHTML = html;
    // teacher view cells are read-only
  }

  /* ── Render single cell ── */
  function renderCell(slot, di, pi, cls, isToday, hasConflict) {
    const todayCls = isToday ? 'today-col' : '';
    if (!slot || !slot.subject) {
      return `<td class="tt-cell empty-cell ${todayCls}" data-cls="${BS.esc(cls)}" data-di="${di}" data-pi="${pi}">
        <span class="cell-edit"><i class="bi bi-plus"></i></span>
      </td>`;
    }
    const c       = subColor(slot.subject);
    const teacher = staff.find(t => t.id === slot.teacherId);
    const tName   = teacher ? teacher.name.replace(/^(Mr|Mrs|Ms)\.\s/, '') : '—';
    return `<td class="tt-cell ${todayCls}" data-cls="${BS.esc(cls)}" data-di="${di}" data-pi="${pi}" style="background:${c.bg}">
      ${hasConflict ? '<span class="conflict-badge" title="Teacher conflict"></span>' : ''}
      <div class="cell-sub" style="color:${c.color}">${BS.esc(slot.subject)}</div>
      <div class="cell-teacher"><i class="bi bi-person me-1" style="font-size:.65rem"></i>${BS.esc(tName)}</div>
      <span class="cell-edit"><i class="bi bi-pencil"></i></span>
    </td>`;
  }

  function attachCellListeners() {
    document.querySelectorAll('.tt-cell[data-cls]').forEach(td => {
      td.addEventListener('click', () => openCellModal(td.dataset.cls, +td.dataset.di, +td.dataset.pi));
    });
  }

  /* ══════════════════════════════════════════════
     CONFLICT DETECTION
  ══════════════════════════════════════════════ */
  function detectConflicts(cls) {
    const conflicts = [];
    const tt = timetable[cls] || [];
    days.forEach((_, di) => {
      periods.forEach((p, pi) => {
        if (p === 'Break') return;
        const slot = tt[di]?.[pi];
        if (!slot || !slot.teacherId) return;
        // check if same teacher is assigned to another class at same slot
        classes.forEach(c => {
          if (c.name === cls) return;
          const other = timetable[c.name]?.[di]?.[pi];
          if (other && other.teacherId === slot.teacherId) {
            conflicts.push({ dayIdx: di, periodIdx: pi, otherClass: c.name });
          }
        });
      });
    });
    return conflicts;
  }

  function detectAllConflicts() {
    const seen = {}, conflicts = [];
    classes.forEach(c => {
      days.forEach((_, di) => {
        periods.forEach((p, pi) => {
          if (p === 'Break') return;
          const slot = timetable[c.name]?.[di]?.[pi];
          if (!slot || !slot.teacherId) return;
          const key = `${slot.teacherId}-${di}-${pi}`;
          if (seen[key]) conflicts.push({ cls: c.name, dayIdx: di, periodIdx: pi, teacherId: slot.teacherId });
          seen[key] = c.name;
        });
      });
    });
    return conflicts;
  }

  function renderConflictAlert() {
    const all = detectAllConflicts();
    const alert = document.getElementById('conflictAlert');
    const msg   = document.getElementById('conflictMsg');
    if (!all.length) { alert.classList.add('d-none'); return; }
    alert.classList.remove('d-none');
    msg.textContent = `${all.length} teacher conflict(s) detected. Click on a red-dotted cell to fix.`;
  }

  /* ── Check conflict for a specific teacher at a slot (excluding current cls) ── */
  function teacherBusyAt(teacherId, di, pi, excludeCls) {
    return classes.some(c => {
      if (c.name === excludeCls) return false;
      const slot = timetable[c.name]?.[di]?.[pi];
      return slot && slot.teacherId === teacherId;
    });
  }

  /* ══════════════════════════════════════════════
     TEACHER WORKLOAD
  ══════════════════════════════════════════════ */
  function renderWorkload() {
    const teachers = staff.filter(t => t.subject && t.designation === 'Teacher');
    const maxPeriods = days.length * periods.filter(p => p !== 'Break').length;

    const loads = teachers.map(t => {
      let count = 0;
      classes.forEach(c => {
        days.forEach((_, di) => {
          periods.forEach((p, pi) => {
            if (p === 'Break') return;
            const slot = timetable[c.name]?.[di]?.[pi];
            if (slot && slot.teacherId === t.id) count++;
          });
        });
      });
      return { teacher: t, count };
    }).sort((a, b) => b.count - a.count);

    document.getElementById('workloadBody').innerHTML = loads.map(l => {
      const pct  = maxPeriods ? Math.round(l.count / maxPeriods * 100) : 0;
      const color = pct > 70 ? '#B02A37' : pct > 40 ? '#E8A317' : '#157347';
      return `<div class="d-flex align-items-center gap-3 mb-2">
        <div style="width:160px;font-size:.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${BS.esc(l.teacher.name.replace(/^(Mr|Mrs|Ms)\.\s/,''))}</div>
        <div class="sub-chip" style="background:${subColor(l.teacher.subject).bg};color:${subColor(l.teacher.subject).color};min-width:90px">${BS.esc(l.teacher.subject)}</div>
        <div class="flex-fill">
          <div class="workload-bar"><div class="workload-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
        <div style="font-size:.8rem;font-weight:600;width:60px;text-align:right;color:${color}">${l.count} periods</div>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════
     CELL MODAL
  ══════════════════════════════════════════════ */
  function openCellModal(cls, di, pi) {
    editCtx = { cls, di, pi };
    const slot    = timetable[cls]?.[di]?.[pi];
    const dayName = days[di];
    const period  = periods[pi];

    document.getElementById('cellModalTitle').textContent = `Edit — ${cls} · ${dayName} · Period ${pi + 1}`;
    document.getElementById('cellInfo').innerHTML =
      `<span class="fw-600">${BS.esc(dayName)}</span> &nbsp;·&nbsp; Period ${pi + 1} &nbsp;<span class="text-muted">(${BS.esc(period)})</span>`;

    // subject options
    document.getElementById('subjectOptions').innerHTML = subjects.map(sub => {
      const c = subColor(sub);
      const sel = slot && slot.subject === sub ? 'selected' : '';
      return `<div class="sub-option ${sel}" data-sub="${BS.esc(sub)}" style="${sel ? 'background:' + c.bg : ''}">
        <span class="sub-chip" style="background:${c.bg};color:${c.color}">${BS.esc(sub)}</span>
        <span class="small text-muted">${BS.esc(sub)}</span>
      </div>`;
    }).join('');

    // teacher dropdown — only teachers who teach this subject
    const curSub = slot ? slot.subject : subjects[0];
    populateTeacherPick(curSub, di, pi, cls, slot ? slot.teacherId : null);

    // subject option click
    document.getElementById('subjectOptions').querySelectorAll('.sub-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.sub-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.style.background = subColor(opt.dataset.sub).bg;
        populateTeacherPick(opt.dataset.sub, di, pi, cls, null);
      });
    });

    document.getElementById('conflictWarning').classList.add('d-none');
    cellModal.show();
  }

  function populateTeacherPick(sub, di, pi, cls, currentTeacherId) {
    const teachers = staff.filter(t => t.subject === sub);
    const tp = document.getElementById('teacherPick');
    tp.innerHTML = `<option value="">— Select Teacher —</option>` + teachers.map(t => {
      const busy    = teacherBusyAt(t.id, di, pi, cls);
      const selAttr = t.id === currentTeacherId ? 'selected' : '';
      return `<option value="${t.id}" ${selAttr} ${busy ? 'data-busy="1"' : ''}>${BS.esc(t.name)}${busy ? ' ⚠ Busy' : ''}</option>`;
    }).join('');

    tp.addEventListener('change', () => {
      const opt  = tp.options[tp.selectedIndex];
      const warn = document.getElementById('conflictWarning');
      if (opt.dataset.busy) {
        document.getElementById('conflictWarnMsg').textContent = `This teacher is already assigned to another class at this slot.`;
        warn.classList.remove('d-none');
      } else {
        warn.classList.add('d-none');
      }
    });
  }

  function saveCell() {
    if (!editCtx) return;
    const { cls, di, pi } = editCtx;
    const selSub = document.querySelector('.sub-option.selected');
    const teacherId = document.getElementById('teacherPick').value;
    if (!selSub || !teacherId) { BS.toast('Please select a subject and teacher.', 'warning'); return; }

    if (!timetable[cls]) timetable[cls] = [];
    if (!timetable[cls][di]) timetable[cls][di] = [];
    timetable[cls][di][pi] = { subject: selSub.dataset.sub, teacherId };

    BS.save();
    cellModal.hide();
    BS.toast(`Period updated — ${selSub.dataset.sub}`, 'success');
    renderGrid();
    renderWorkload();
    renderKpi();
    renderConflictAlert();
  }

  function clearCell() {
    if (!editCtx) return;
    const { cls, di, pi } = editCtx;
    if (timetable[cls]?.[di]) timetable[cls][di][pi] = null;
    BS.save();
    cellModal.hide();
    BS.toast('Period cleared.', 'info');
    renderGrid();
    renderWorkload();
    renderKpi();
    renderConflictAlert();
  }

  /* ══════════════════════════════════════════════
     AUTO-FILL
  ══════════════════════════════════════════════ */
  async function autoFill() {
    const ok = await BS.confirm(
      'Auto-fill will assign subjects and teachers to all empty slots, avoiding teacher conflicts.',
      { title: 'Auto-Fill Timetable?', ok: 'Auto-Fill', danger: false }
    );
    if (!ok) return;

    let filled = 0;
    classes.forEach(c => {
      if (!timetable[c.name]) timetable[c.name] = [];
      days.forEach((_, di) => {
        if (!timetable[c.name][di]) timetable[c.name][di] = [];
        let subIdx = 0;
        periods.forEach((p, pi) => {
          if (p === 'Break') return;
          if (timetable[c.name][di][pi]) return; // skip filled
          // rotate subjects
          const sub = subjects[subIdx % subjects.length];
          subIdx++;
          // find a free teacher for this subject at this slot
          const teachers = staff.filter(t => t.subject === sub && t.designation === 'Teacher');
          const freeTeacher = teachers.find(t => !teacherBusyAt(t.id, di, pi, c.name));
          if (freeTeacher) {
            timetable[c.name][di][pi] = { subject: sub, teacherId: freeTeacher.id };
            filled++;
          }
        });
      });
    });

    BS.save();
    BS.toast(`Auto-fill complete — ${filled} slots filled.`, 'success');
    renderGrid();
    renderWorkload();
    renderKpi();
    renderConflictAlert();
  }

  /* ══════════════════════════════════════════════
     EXPORT CSV
  ══════════════════════════════════════════════ */
  function exportCsv() {
    const cls = document.getElementById('classSelect').value;
    const tt  = timetable[cls] || [];
    const header = ['Period', 'Time', ...days];
    const rows = periods.map((p, pi) => {
      if (p === 'Break') return ['Break', 'Break', ...days.map(() => 'Break')];
      return [
        `Period ${pi + 1}`, p,
        ...days.map((_, di) => {
          const slot = tt[di]?.[pi];
          if (!slot) return '';
          const t = staff.find(s => s.id === slot.teacherId);
          return `${slot.subject} (${t ? t.name : '—'})`;
        })
      ];
    });
    BS.download(
      `timetable_${cls.replace(/\s+/g,'_')}_${BS.todayISO()}.csv`,
      [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    );
    BS.toast(`Timetable exported for ${cls}.`, 'success');
  }

  /* ══════════════════════════════════════════════
     RENDER GRID (dispatcher)
  ══════════════════════════════════════════════ */
  function renderGrid() {
    if (currentView === 'class') renderClassView();
    else renderTeacherView();
    renderConflictAlert();
  }

  /* ══════════════════════════════════════════════
     BIND EVENTS
  ══════════════════════════════════════════════ */
  function bindEvents() {
    // view toggle
    document.getElementById('viewClass').addEventListener('click', () => {
      currentView = 'class';
      document.getElementById('viewClass').classList.add('active');
      document.getElementById('viewTeacher').classList.remove('active');
      document.getElementById('classSelect').classList.remove('d-none');
      document.getElementById('sectionSelect').classList.remove('d-none');
      document.getElementById('teacherSelect').classList.add('d-none');
      document.getElementById('workloadCard').classList.remove('d-none');
      renderGrid();
    });
    document.getElementById('viewTeacher').addEventListener('click', () => {
      currentView = 'teacher';
      document.getElementById('viewTeacher').classList.add('active');
      document.getElementById('viewClass').classList.remove('active');
      document.getElementById('classSelect').classList.add('d-none');
      document.getElementById('sectionSelect').classList.add('d-none');
      document.getElementById('teacherSelect').classList.remove('d-none');
      document.getElementById('workloadCard').classList.add('d-none');
      renderGrid();
    });

    // selectors
    document.getElementById('classSelect').addEventListener('change', () => { updateSectionSelect(); renderGrid(); });
    document.getElementById('sectionSelect').addEventListener('change', renderGrid);
    document.getElementById('teacherSelect').addEventListener('change', renderGrid);

    // modal actions
    document.getElementById('saveCellBtn').addEventListener('click', saveCell);
    document.getElementById('clearCellBtn').addEventListener('click', clearCell);

    // toolbar
    document.getElementById('autoFillBtn').addEventListener('click', autoFill);
    document.getElementById('exportBtn').addEventListener('click', exportCsv);
    document.getElementById('printBtn').addEventListener('click', BS.print);
  }

})();
