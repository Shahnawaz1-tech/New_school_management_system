/* ==========================================================================
   dashboard.js · Role-aware dashboard: greeting, KPI cards, charts,
   recent activity and announcements. All numbers are computed live from the
   localStorage demo database, so edits on other pages show up here.
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  document.addEventListener('bs:ready', () => {
    const db = BS.db(), role = BS.role, user = BS.user;
    const $ = (id) => document.getElementById(id);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const monthLabel = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' });

    /* ---------- Greeting ---------- */
    const hr = new Date().getHours();
    $('todayLabel').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('greeting').textContent = `${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}, ${user.name.split(' ')[0]}`;

    /* ---------- Shared numbers ---------- */
    const cur = db.feeRecords.filter((f) => f.month === db.currentMonth);
    const billed = cur.reduce((s, f) => s + f.total, 0), collected = cur.reduce((s, f) => s + f.paid, 0);
    const defaulters = new Set(cur.filter((f) => f.status !== 'Paid').map((f) => f.studentId)).size;
    const todayAtt = db.attendance[BS.todayISO()] || {};
    const marked = Object.values(todayAtt), present = marked.filter((x) => x === 'P').length;
    const classesPending = db.classes.filter((c) => !db.students.some((s) => s.cls === c.name && todayAtt[s.id])).length;
    const attDates = Object.keys(db.attendance).sort();

    // Parent sees one child only (S-1003, or the first student if that record was deleted)
    const child = db.students.find((s) => s.id === 'S-1003') || db.students[0];

    /* ---------- Role configuration ---------- */
    const kpi = (icon, value, label, href, sub = '', amber = false) =>
      `<div class="col-12 col-sm-6 col-xl"><a class="card-soft kpi ${amber ? 'amber' : ''}" href="${href}"><span class="ico"><i class="bi ${icon}"></i></span>
        <span><span class="val d-block">${value}</span><span class="lbl d-block">${label}</span>${sub ? `<span class="kpi-sub">${sub}</span>` : ''}</span></a></div>`;

    let kpis = [], show = { fee: true, att: true, cls: true }, quick = [], subline = '';
    if (role === 'admin') {
      subline = 'Here is how the school is doing today.';
      kpis = [
        kpi('bi-people-fill', db.students.length, 'Students', 'students.html'),
        kpi('bi-person-badge-fill', db.staff.length, 'Staff', 'hr.html'),
        kpi('bi-funnel-fill', db.leads.filter((l) => l.stage !== 'Enrolled').length, 'Open admission leads', 'crm.html'),
        kpi('bi-cash-coin', pct(collected, billed) + '%', 'Fee collected this month', 'fee.html', `${BS.pkr(collected)} of ${BS.pkr(billed)}`, true),
        kpi('bi-calendar-check-fill', marked.length ? pct(present, marked.length) + '%' : '—', 'Attendance today', 'attendance.html', marked.length ? `${present} of ${marked.length} marked present` : 'Not marked yet')
      ];
      quick = [['students.html', 'bi-person-plus', 'Add student'], ['fee.html', 'bi-receipt', 'Receive fee'], ['attendance.html', 'bi-calendar-check', 'Mark attendance']];
    } else if (role === 'teacher') {
      subline = classesPending ? `${classesPending} classes still need attendance today.` : 'All classes are marked for today.';
      show.fee = false;
      kpis = [
        kpi('bi-people-fill', db.students.length, 'Students', 'students.html'),
        kpi('bi-calendar-check-fill', marked.length ? pct(present, marked.length) + '%' : '—', 'Attendance today', 'attendance.html', `${present} of ${marked.length} present`, true),
        kpi('bi-exclamation-circle', classesPending, 'Classes not marked today', 'attendance.html'),
        kpi('bi-journal-text', db.exams.filter((e) => e.status === 'Ongoing').length, 'Exams in progress', 'exams.html')
      ];
      quick = [['attendance.html', 'bi-calendar-check', 'Mark attendance'], ['exams.html', 'bi-journal-text', 'Enter marks'], ['timetable.html', 'bi-calendar3-week', 'My timetable']];
    } else if (role === 'accountant') {
      subline = `${defaulters} students have an open balance this month.`;
      show.att = false; show.cls = false;
      kpis = [
        kpi('bi-cash-coin', pct(collected, billed) + '%', 'Collected this month', 'fee.html', '', true),
        kpi('bi-wallet2', BS.pkr(collected), 'Amount received', 'fee.html'),
        kpi('bi-hourglass-split', BS.pkr(billed - collected), 'Outstanding', 'fee.html'),
        kpi('bi-person-exclamation', defaulters, 'Students with dues', 'fee.html')
      ];
      quick = [['fee.html', 'bi-receipt', 'Receive payment'], ['fee.html', 'bi-file-earmark-text', 'Generate challans'], ['approvals.html', 'bi-check2-square', 'Approvals']];
    } else { // parent
      const mine = db.attendance, days = attDates.map((d) => mine[d] && mine[d][child.id]).filter(Boolean);
      const rec = cur.find((f) => f.studentId === child.id), exam = db.marks.E1[child.id];
      const examPct = exam ? Math.round(Object.values(exam).reduce((a, b) => a + b, 0) / (db.subjects.length)) : null;
      subline = `Showing ${child.name} · ${child.cls}-${child.section}`;
      show.cls = false;
      kpis = [
        kpi('bi-calendar-check-fill', pct(days.filter((x) => x === 'P').length, days.length) + '%', 'Attendance (30 days)', 'attendance.html', '', true),
        kpi('bi-cash-coin', BS.pkr(rec ? rec.total - rec.paid : 0), 'Fee due this month', 'fee.html', rec ? rec.status : ''),
        kpi('bi-journal-text', examPct !== null ? examPct + '%' : '—', 'First Term result', 'exams.html'),
        kpi('bi-mortarboard-fill', `${child.cls}-${child.section}`, 'Class', 'timetable.html', `Roll no. ${child.rollNo}`)
      ];
      quick = [['fee.html', 'bi-receipt', 'View fee challan'], ['exams.html', 'bi-journal-text', 'Result card']];
    }
    $('subline').textContent = subline;
    $('quickActions').innerHTML = quick.map((q, i) => `<a class="btn ${i === 0 ? 'btn-warning' : 'btn-outline-primary'}" href="${q[0]}"><i class="bi ${q[1]} me-1"></i>${q[2]}</a>`).join('');

    /* Hide cards this role does not use and re-balance column widths */
    if (!show.fee) $('cardFee').remove(); if (!show.att) $('cardAtt').remove(); if (!show.cls) $('cardCls').remove();
    if (!show.att && show.fee) $('cardFee').className = 'col-12';
    if (!show.fee && show.att) $('cardAtt').className = 'col-12';
    const row3 = ['cardCls', 'cardAct', 'cardAnn'].map($).filter(Boolean);
    row3.forEach((el) => (el.className = `col-12 col-lg-${12 / row3.length}`));
    if (role === 'parent') { $('feeTitle').textContent = `${child.name.split(' ')[0]}'s fees`; $('attTitle').textContent = 'Attendance by week'; }

    /* ---------- KPI cards with skeleton ---------- */
    const kpiRow = $('kpiRow');
    kpiRow.innerHTML = kpis.map(() => '<div class="col-12 col-sm-6 col-xl"><div class="card-soft kpi"><div class="skeleton-block w-100" style="height:46px"></div></div></div>').join('');
    setTimeout(() => (kpiRow.innerHTML = kpis.join('')), 450);

    /* ---------- Charts ---------- */
    setTimeout(() => {
      if (!window.Chart) { document.querySelectorAll('.chart-box').forEach((b) => (b.innerHTML = BS.empty('bi-wifi-off', 'Charts need internet', 'Chart.js loads from a CDN. Connect and reload.'))); return; }

      // 1) Monthly fee collection (billed vs collected). Parent: only their child's records.
      const months = [...new Set(db.feeRecords.map((f) => f.month))].sort();
      const feeScope = role === 'parent' ? db.feeRecords.filter((f) => f.studentId === child.id) : db.feeRecords;
      BS.charts.make('feeChart', (c) => ({
        type: 'bar',
        data: { labels: months.map(monthLabel), datasets: [
          { label: 'Billed', data: months.map((m) => feeScope.filter((f) => f.month === m).reduce((s, f) => s + f.total, 0)), backgroundColor: c.navySoft, borderRadius: 6 },
          { label: 'Collected', data: months.map((m) => feeScope.filter((f) => f.month === m).reduce((s, f) => s + f.paid, 0)), backgroundColor: c.amber, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${BS.pkr(x.parsed.y)}` } } },
          scales: BS.charts.scales(c, { ticks: { color: c.text, callback: (v) => (v >= 1000 ? v / 1000 + 'k' : v) } }) }
      }));

      // 2) Attendance trend. Staff roles: school % for the last 14 days. Parent: child % per week.
      let labels, values;
      if (role === 'parent') {
        const last30 = attDates.slice(-30), size = Math.ceil(last30.length / 5);
        labels = []; values = [];
        for (let i = 0; i < last30.length; i += size) {
          const chunk = last30.slice(i, i + size).map((d) => db.attendance[d][child.id]).filter(Boolean);
          labels.push('Wk ' + (labels.length + 1)); values.push(pct(chunk.filter((x) => x === 'P').length, chunk.length));
        }
      } else {
        const dates = attDates.filter((d) => Object.keys(db.attendance[d]).length > 20).slice(-14);
        labels = dates.map((d) => d.slice(8) + '/' + d.slice(5, 7));
        values = dates.map((d) => { const v = Object.values(db.attendance[d]); return pct(v.filter((x) => x === 'P').length, v.length); });
      }
      BS.charts.make('attChart', (c) => ({
        type: 'line',
        data: { labels, datasets: [{ label: 'Present %', data: values, borderColor: c.navy, backgroundColor: c.navySoft, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: c.amber }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: BS.charts.scales(c, { min: 60, max: 100, ticks: { color: c.text, callback: (v) => v + '%' } }) }
      }));

      // 3) Class strength (live count from the students table)
      BS.charts.make('clsChart', (c) => ({
        type: 'bar',
        data: { labels: db.classes.map((k) => k.name.replace('Class ', 'C')), datasets: [{ label: 'Students', data: db.classes.map((k) => db.students.filter((s) => s.cls === k.name).length), backgroundColor: c.navy, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: BS.charts.scales(c, { ticks: { color: c.text, precision: 0 } }) }
      }));
    }, 500);

    /* ---------- Recent activity ---------- */
    BS.loading($('activityList'), () => {
      $('activityList').innerHTML = db.activity.length
        ? db.activity.map((a) => `<div class="activity-item"><span class="ico"><i class="bi ${a.icon}"></i></span><div><div class="small">${BS.esc(a.text)}</div><small class="text-muted">${BS.timeAgo(a.time)}</small></div></div>`).join('')
        : BS.empty('bi-clock-history', 'No activity yet', 'Actions you take will appear here.');
    }, { rows: 4, delay: 600 });

    /* ---------- Announcements (admin can publish; others read) ---------- */
    const annBox = $('announceList');
    const renderAnn = () => {
      annBox.innerHTML = db.announcements.length
        ? db.announcements.map((a) => `<article class="announce-item"><div class="flex-grow-1"><h3>${BS.esc(a.title)} ${BS.pill(a.tag, 'info')}</h3><p>${BS.esc(a.text)}</p><small class="text-muted">${BS.fmtDate(a.date)}</small></div>
            ${role === 'admin' ? `<button class="btn btn-sm btn-link text-danger p-0 align-self-start" data-del="${a.id}" aria-label="Delete announcement"><i class="bi bi-trash"></i></button>` : ''}</article>`).join('')
        : BS.empty('bi-megaphone', 'No announcements', 'Publish one to inform parents and staff.');
    };
    BS.loading(annBox, renderAnn, { rows: 4, delay: 700 });
    if (role !== 'admin') $('newAnnBtn').remove();

    annBox.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      if (await BS.confirm('This announcement will be removed for everyone.', { title: 'Delete announcement?', ok: 'Delete', danger: true })) {
        db.announcements = db.announcements.filter((a) => a.id !== b.dataset.del); BS.save(); renderAnn(); BS.toast('Announcement deleted', 'success');
      }
    });

    const modalEl = $('annModal'), form = $('annForm');
    $('newAnnBtn').addEventListener('click', () => { form.reset(); form.classList.remove('was-validated'); bootstrap.Modal.getOrCreateInstance(modalEl).show(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault(); form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      db.announcements.unshift({ id: BS.nextId('AN', db.announcements, 1), title: $('annTitleIn').value.trim(), text: $('annTextIn').value.trim(), tag: $('annTagIn').value, date: BS.todayISO() });
      db.activity.unshift({ icon: 'bi-megaphone', text: `Announcement published: ${$('annTitleIn').value.trim()}`, time: new Date().toISOString() });
      BS.save(); bootstrap.Modal.getInstance(modalEl).hide(); renderAnn();
      $('activityList').innerHTML = db.activity.slice(0, 8).map((a) => `<div class="activity-item"><span class="ico"><i class="bi ${a.icon}"></i></span><div><div class="small">${BS.esc(a.text)}</div><small class="text-muted">${BS.timeAgo(a.time)}</small></div></div>`).join('');
      BS.toast('Announcement published', 'success');
    });
  });
})();
