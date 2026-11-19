/* ==========================================================================
   attendance.js · Full attendance management:
   – Mark P/A/L per student with live progress bar
   – Mark All Present / Absent
   – Save to localStorage
   – KPI cards with SVG progress rings
   – Monthly calendar heatmap
   – 14-day trend chart (Chart.js)
   – Today's absentee list
   – Class-wise summary table
   – Student 30-day report offcanvas
   – CSV export + Print
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  let db, students, attendance;
  let selDate, selClass;
  let calYear, calMonth;
  let reportCanvas;
  /* draft holds unsaved P/A/L changes for the current date+class view */
  let draft = {};

  const pad  = (n) => String(n).padStart(2, '0');
  const iso  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = iso(new Date());

  document.addEventListener('bs:ready', init);

  /* ================================================================
     INIT
  ================================================================ */
  function init() {
    db         = BS.db();
    students   = db.students;
    attendance = db.attendance;

    reportCanvas = new bootstrap.Offcanvas(document.getElementById('reportCanvas'));

    /* default date = today, default class = first class */
    selDate  = today;
    selClass = db.classes[0].name;
    const now = new Date();
    calYear  = now.getFullYear();
    calMonth = now.getMonth();

    setupControls();
    renderKpi();
    renderAttList();
    renderCalendar();
    renderSummary();
    renderAbsentees();

    /* draw trend chart after Chart.js is ready */
    setTimeout(renderTrendChart, 300);

    /* re-draw charts on theme change */
    document.addEventListener('bs:theme', () => setTimeout(renderTrendChart, 100));
  }

  /* ================================================================
     CONTROLS  (date picker, class selector, buttons)
  ================================================================ */
  function setupControls() {
    /* populate class dropdown */
    const clsSel = document.getElementById('attClass');
    db.classes.forEach((c) => {
      const o = document.createElement('option');
      o.value = o.textContent = c.name;
      clsSel.appendChild(o);
    });
    clsSel.value = selClass;

    /* date picker */
    const datePicker = document.getElementById('attDate');
    datePicker.value = selDate;
    datePicker.max   = today;
    datePicker.addEventListener('change', () => {
      selDate = datePicker.value || today;
      draft = {};
      renderKpi();
      renderAttList();
      renderSummary();
      renderAbsentees();
    });

    /* class selector */
    clsSel.addEventListener('change', () => {
      selClass = clsSel.value;
      draft = {};
      renderAttList();
    });

    /* mark all present / absent */
    document.getElementById('markAllP').addEventListener('click', () => markAll('P'));
    document.getElementById('markAllA').addEventListener('click', () => markAll('A'));

    /* save button */
    document.getElementById('saveAttBtn').addEventListener('click', saveAttendance);

    /* search */
    document.getElementById('attSearch').addEventListener('input',
      BS.debounce(() => renderAttList(), 180));

    /* export */
    document.getElementById('exportAttBtn').addEventListener('click', exportCsv);

    /* print */
    document.getElementById('printBtn').addEventListener('click', () => {
      document.getElementById('printTitle').textContent =
        `Attendance — ${selClass} · ${BS.fmtDate(selDate)}`;
      document.getElementById('printMeta').textContent =
        `Printed on ${new Date().toLocaleString('en-GB')}`;
      window.print();
    });

    /* calendar nav */
    document.getElementById('calPrev').addEventListener('click', () => {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });
  }

  /* ================================================================
     KPI CARDS  (with SVG progress rings)
  ================================================================ */
  function renderKpi() {
    const rec  = attendance[selDate] || {};
    const all  = students;
    const vals = Object.values(rec);
    const P    = vals.filter((v) => v === 'P').length;
    const A    = vals.filter((v) => v === 'A').length;
    const L    = vals.filter((v) => v === 'L').length;
    const marked = vals.length;
    const pct  = marked ? Math.round((P / marked) * 100) : 0;

    /* 30-day school average */
    const dates30 = Object.keys(attendance).sort().slice(-30);
    const avg30 = dates30.length
      ? Math.round(dates30.reduce((sum, d) => {
          const v = Object.values(attendance[d]);
          return sum + (v.length ? v.filter((x) => x === 'P').length / v.length : 0);
        }, 0) / dates30.length * 100)
      : 0;

    const kpis = [
      { label: 'Present',       val: P,     pct,    color: '#157347', icon: 'bi-person-check-fill' },
      { label: 'Absent',        val: A,     pct: marked ? Math.round(A/marked*100) : 0, color: '#B02A37', icon: 'bi-person-x-fill' },
      { label: 'On Leave',      val: L,     pct: marked ? Math.round(L/marked*100) : 0, color: '#0A58CA', icon: 'bi-person-dash-fill' },
      { label: '30-day Avg',    val: avg30+'%', pct: avg30, color: '#E8A317', icon: 'bi-graph-up-arrow' }
    ];

    document.getElementById('attKpi').innerHTML = kpis.map((k) => {
      const r = 28, circ = 2 * Math.PI * r;
      const offset = circ - (k.pct / 100) * circ;
      return `<div class="col-6 col-sm-3">
        <div class="card-soft h-100">
          <div class="kpi">
            <div class="ring-wrap">
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle class="ring-bg"  cx="32" cy="32" r="${r}"/>
                <circle class="ring-val" cx="32" cy="32" r="${r}"
                  stroke="${k.color}"
                  stroke-dasharray="${circ}"
                  stroke-dashoffset="${offset}"/>
              </svg>
              <div class="ring-label" style="color:${k.color}">${k.pct}%</div>
            </div>
            <div>
              <div class="val">${k.val}</div>
              <div class="lbl"><i class="bi ${k.icon} me-1"></i>${k.label}</div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('attSubline').textContent =
      `${BS.fmtDate(selDate)} · ${marked} of ${all.length} students marked`;
  }

  /* ================================================================
     ATTENDANCE LIST  (mark P / A / L per student)
  ================================================================ */
  function renderAttList() {
    const q       = document.getElementById('attSearch').value.trim().toLowerCase();
    const dayRec  = attendance[selDate] || {};
    const cls     = students.filter((s) => s.cls === selClass);
    const visible = q ? cls.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : cls;

    if (!visible.length) {
      document.getElementById('attList').innerHTML =
        `<div class="p-3">${BS.empty('bi-people', 'No students', 'No students found in this class.')}</div>`;
      updateProgress(cls);
      return;
    }

    document.getElementById('attList').innerHTML = visible.map((s) => {
      const status = draft[s.id] ?? dayRec[s.id] ?? '';
      const gc     = s.gender === 'Female' ? 'female' : 'male';
      return `<div class="att-row" data-sid="${s.id}">
        <span class="att-avatar ${gc}" aria-hidden="true">${BS.esc(BS.initials(s.name))}</span>
        <div class="att-name">
          <strong>${BS.esc(s.name)}</strong>
          <small>${BS.esc(s.id)} · Roll ${s.rollNo || '—'}</small>
        </div>
        <div class="att-btn-group" role="group" aria-label="Attendance for ${BS.esc(s.name)}">
          <button class="att-btn ${status==='P'?'P':''}" data-v="P" title="Present">P</button>
          <button class="att-btn ${status==='A'?'A':''}" data-v="A" title="Absent">A</button>
          <button class="att-btn ${status==='L'?'L':''}" data-v="L" title="Leave">L</button>
        </div>
        <button class="btn btn-sm btn-link p-0 ms-2 text-muted btn-report" data-sid="${s.id}" title="View report">
          <i class="bi bi-bar-chart-line"></i>
        </button>
      </div>`;
    }).join('');

    /* toggle buttons */
    document.getElementById('attList').querySelectorAll('.att-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.att-row');
        const sid = row.dataset.sid;
        const val = btn.dataset.v;
        draft[sid] = val;
        row.querySelectorAll('.att-btn').forEach((b) => b.classList.remove('P','A','L'));
        btn.classList.add(val);
        updateProgress(cls);
      });
    });

    /* report buttons */
    document.getElementById('attList').querySelectorAll('.btn-report').forEach((btn) => {
      btn.addEventListener('click', () => openReport(btn.dataset.sid));
    });

    updateProgress(cls);
    document.getElementById('markProgress').style.display = 'block';
  }

  function updateProgress(cls) {
    const dayRec = attendance[selDate] || {};
    const total  = cls.length;
    const marked = cls.filter((s) => (draft[s.id] ?? dayRec[s.id])).length;
    const pct    = total ? Math.round((marked / total) * 100) : 0;
    document.getElementById('progressLabel').textContent = `${marked} / ${total} marked`;
    document.getElementById('progressPct').textContent   = pct + '%';
    document.getElementById('progressBar').style.width   = pct + '%';
  }

  /* ================================================================
     MARK ALL
  ================================================================ */
  function markAll(val) {
    const cls = students.filter((s) => s.cls === selClass);
    cls.forEach((s) => (draft[s.id] = val));
    renderAttList();
  }

  /* ================================================================
     SAVE
  ================================================================ */
  function saveAttendance() {
    if (!Object.keys(draft).length) {
      BS.toast('Nothing to save — mark some students first.', 'warning');
      return;
    }
    if (!attendance[selDate]) attendance[selDate] = {};
    Object.assign(attendance[selDate], draft);
    draft = {};
    BS.save();
    BS.audit('Saved attendance', 'Attendance', `${selDate}/${selClass}`, 'Updated student attendance for selected class');
    BS.toast(`Attendance saved for ${selClass} on ${BS.fmtDate(selDate)}.`, 'success');
    renderKpi();
    renderSummary();
    renderAbsentees();
    renderCalendar();
  }

  /* ================================================================
     CALENDAR HEATMAP
  ================================================================ */
  function renderCalendar() {
    const label = new Date(calYear, calMonth, 1)
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    document.getElementById('calMonthLabel').textContent = label;

    const days  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const first = new Date(calYear, calMonth, 1).getDay();
    const last  = new Date(calYear, calMonth + 1, 0).getDate();
    const todayD = new Date();

    let html = days.map((d) => `<div class="cal-day-label">${d}</div>`).join('');

    /* empty cells before first day */
    for (let i = 0; i < first; i++) html += `<div class="cal-cell empty"></div>`;

    for (let d = 1; d <= last; d++) {
      const dateStr = `${calYear}-${pad(calMonth+1)}-${pad(d)}`;
      const dow     = new Date(calYear, calMonth, d).getDay();
      const isFuture = new Date(calYear, calMonth, d) > todayD;
      const isToday  = dateStr === today;

      if (dow === 0) { html += `<div class="cal-cell sunday" title="Sunday">${d}</div>`; continue; }
      if (isFuture)  { html += `<div class="cal-cell future" title="Future">${d}</div>`; continue; }

      const rec = attendance[dateStr];
      if (!rec || !Object.keys(rec).length) {
        html += `<div class="cal-cell future ${isToday?'today':''}" title="${dateStr} — no data">${d}</div>`;
        continue;
      }
      const vals = Object.values(rec);
      const pct  = Math.round(vals.filter((v) => v === 'P').length / vals.length * 100);
      const cls  = pct === 100 ? 'p100' : pct >= 90 ? 'p90' : pct >= 75 ? 'p75' : pct >= 50 ? 'p50' : 'p0';
      html += `<div class="cal-cell ${cls} ${isToday?'today':''}" title="${dateStr} — ${pct}% present">${d}</div>`;
    }

    document.getElementById('calGrid').innerHTML = html;
  }

  /* ================================================================
     TREND CHART  (last 14 school days)
  ================================================================ */
  function renderTrendChart() {
    if (!window.Chart) return;
    const dates = Object.keys(attendance)
      .filter((d) => Object.keys(attendance[d]).length > 5)
      .sort().slice(-14);

    const labels = dates.map((d) => d.slice(8) + '/' + d.slice(5,7));
    const pData  = dates.map((d) => {
      const v = Object.values(attendance[d]);
      return v.length ? Math.round(v.filter((x) => x==='P').length / v.length * 100) : 0;
    });
    const aData = dates.map((d) => {
      const v = Object.values(attendance[d]);
      return v.length ? Math.round(v.filter((x) => x==='A').length / v.length * 100) : 0;
    });

    BS.charts.make('trendChart', (c) => ({
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Present %', data: pData, borderColor: '#157347', backgroundColor: 'rgba(21,115,71,.15)', fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#157347' },
          { label: 'Absent %',  data: aData, borderColor: '#B02A37', backgroundColor: 'rgba(176,42,55,.1)',  fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#B02A37' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: c.text, boxWidth: 12 } } },
        scales: BS.charts.scales(c, { min: 0, max: 100, ticks: { color: c.text, callback: (v) => v + '%' } })
      }
    }));
  }

  /* ================================================================
     CLASS SUMMARY TABLE
  ================================================================ */
  function renderSummary() {
    document.getElementById('summaryDateLabel').textContent = BS.fmtDate(selDate);
    const rec = attendance[selDate] || {};

    document.getElementById('summaryBody').innerHTML = db.classes.map((c) => {
      const cls     = students.filter((s) => s.cls === c.name);
      const total   = cls.length;
      const P       = cls.filter((s) => rec[s.id] === 'P').length;
      const A       = cls.filter((s) => rec[s.id] === 'A').length;
      const L       = cls.filter((s) => rec[s.id] === 'L').length;
      const unmarked = total - P - A - L;
      const pct     = (total - unmarked) ? Math.round(P / (total - unmarked) * 100) : 0;
      const pillCls = pct >= 90 ? 'pill-success' : pct >= 75 ? 'pill-warning' : pct > 0 ? 'pill-danger' : 'pill-muted';
      return `<tr>
        <td class="ps-3 fw-500">${BS.esc(c.name)}</td>
        <td>${total}</td>
        <td class="text-success fw-600">${P}</td>
        <td class="text-danger">${A}</td>
        <td class="text-primary">${L}</td>
        <td class="text-muted">${unmarked}</td>
        <td class="pe-3"><span class="pill ${pillCls}">${pct ? pct+'%' : '—'}</span></td>
      </tr>`;
    }).join('');
  }

  /* ================================================================
     ABSENTEES LIST
  ================================================================ */
  function renderAbsentees() {
    const rec      = attendance[selDate] || {};
    const absentees = students.filter((s) => rec[s.id] === 'A' || rec[s.id] === 'L');
    document.getElementById('absentCount').textContent = absentees.length;

    if (!absentees.length) {
      document.getElementById('absentList').innerHTML =
        `<div class="py-3 text-center text-muted small"><i class="bi bi-check-circle text-success me-1"></i>No absences recorded for this date.</div>`;
      return;
    }

    document.getElementById('absentList').innerHTML = absentees.map((s) => {
      const status = rec[s.id];
      const gc     = s.gender === 'Female' ? 'female' : 'male';
      return `<div class="absent-item">
        <span class="att-avatar ${gc}" style="width:30px;height:30px;font-size:.68rem">${BS.esc(BS.initials(s.name))}</span>
        <div class="flex-grow-1 min-w-0">
          <div class="small fw-600 text-truncate">${BS.esc(s.name)}</div>
          <div style="font-size:.72rem;color:var(--muted)">${BS.esc(s.cls)} · ${BS.esc(s.id)}</div>
        </div>
        ${BS.pill(status === 'A' ? 'Absent' : 'Leave', status === 'A' ? 'danger' : 'info')}
      </div>`;
    }).join('');
  }

  /* ================================================================
     STUDENT REPORT OFFCANVAS  (30-day breakdown)
  ================================================================ */
  function openReport(sid) {
    const s      = students.find((x) => x.id === sid);
    if (!s) return;
    const dates  = Object.keys(attendance).sort().slice(-30);
    const P      = dates.filter((d) => attendance[d][sid] === 'P').length;
    const A      = dates.filter((d) => attendance[d][sid] === 'A').length;
    const L      = dates.filter((d) => attendance[d][sid] === 'L').length;
    const total  = dates.filter((d) => attendance[d][sid]).length;
    const pct    = total ? Math.round(P / total * 100) : 0;
    const gc     = s.gender === 'Female' ? 'female' : 'male';

    const barW   = (n) => total ? Math.round(n / total * 100) : 0;

    /* last 30 day cells */
    const cells = dates.map((d) => {
      const v = attendance[d][sid];
      const cls = v === 'P' ? 'p90' : v === 'A' ? 'p0' : v === 'L' ? '' : 'future';
      const style = v === 'L' ? 'background:#0A58CA;color:#fff' : '';
      return `<div class="cal-cell ${cls}" style="font-size:.6rem;${style}" title="${d}: ${v||'—'}">${d.slice(8)}</div>`;
    }).join('');

    document.getElementById('reportBody').innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="att-avatar ${gc}" style="width:52px;height:52px;font-size:1.1rem">${BS.esc(BS.initials(s.name))}</span>
        <div>
          <div class="fw-700 fs-5">${BS.esc(s.name)}</div>
          <small class="text-muted">${BS.esc(s.id)} · ${BS.esc(s.cls)}-${BS.esc(s.section)}</small>
        </div>
      </div>
      <div class="row g-2 mb-3 text-center">
        <div class="col-4"><div class="card-soft p-2"><div class="fw-700 text-success fs-5">${P}</div><div class="small text-muted">Present</div></div></div>
        <div class="col-4"><div class="card-soft p-2"><div class="fw-700 text-danger fs-5">${A}</div><div class="small text-muted">Absent</div></div></div>
        <div class="col-4"><div class="card-soft p-2"><div class="fw-700 text-primary fs-5">${L}</div><div class="small text-muted">Leave</div></div></div>
      </div>
      <div class="mb-3">
        <div class="d-flex justify-content-between small mb-1"><span class="text-muted">Attendance rate (30 days)</span><strong>${pct}%</strong></div>
        <div class="report-bar">
          <span style="width:${barW(P)}%;background:#157347"></span>
          <span style="width:${barW(A)}%;background:#B02A37"></span>
          <span style="width:${barW(L)}%;background:#0A58CA"></span>
        </div>
        <div style="font-size:.72rem;color:var(--muted)">${P} present · ${A} absent · ${L} leave</div>
      </div>
      <div class="mb-2 small fw-600">Last 30 days</div>
      <div class="cal-grid" style="gap:3px">${cells}</div>
      ${pct < 75 ? `<div class="alert alert-warning mt-3 small p-2"><i class="bi bi-exclamation-triangle me-1"></i>Attendance below 75%. Consider notifying parents.</div>` : ''}
    `;

    document.getElementById('reportCanvasTitle').textContent = `Report — ${s.name}`;
    reportCanvas.show();
  }

  /* ================================================================
     EXPORT CSV
  ================================================================ */
  function exportCsv() {
    const rec  = attendance[selDate] || {};
    const rows = students.map((s) => [
      s.id, s.name, s.cls, s.section, s.gender, rec[s.id] || 'Unmarked'
    ]);
    const header = 'ID,Name,Class,Section,Gender,Status';
    BS.download(
      `attendance_${selDate}.csv`,
      [header, ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n')
    );
    BS.toast('Attendance CSV exported.', 'success');
  }

})();
