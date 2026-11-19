/* Staff self-service demo: every view is scoped to the signed-in demo staff ID. */
(function () {
  'use strict';
  const BS = window.BS;

  document.addEventListener('bs:ready', init);

  function init() {
    const db = BS.db();
    const staffId = BS.user.staffId;
    const staff = db.staff.find(item => item.id === staffId);
    if (!staff) {
      document.getElementById('staffSubline').textContent = 'This demo account is not linked to a staff profile.';
      return;
    }
    db.staffAttendance = db.staffAttendance || {};
    db.payrollPayments = db.payrollPayments || {};
    const $ = id => document.getElementById(id);
    const month = db.currentMonth;
    const attendance = Object.entries(db.staffAttendance).filter(([date, marks]) => date.startsWith(month) && marks[staffId]);
    const leaves = db.leaves.filter(item => item.staffId === staffId).sort((a, b) => b.from.localeCompare(a.from));
    const payroll = Object.entries(db.payrollPayments).map(([period, records]) => ({ period, ...records[staffId] }))
      .filter(record => record.staffId).sort((a, b) => b.period.localeCompare(a.period));

    const firstName = staff.name.replace(/^(Mr|Mrs|Ms)\.\s*/i, '').split(' ')[0];
    $('staffWelcome').textContent = `Welcome, ${firstName}`;
    $('staffSubline').textContent = `${staff.designation} · ${staff.department} · ${staff.id}`;
    $('staffKpis').innerHTML = [
      ['bi-calendar-check', `${attendance.filter(([, marks]) => marks[staffId] === 'P').length}/${attendance.length}`, 'Days present this month'],
      ['bi-cash-stack', payroll[0] ? BS.pkr(payroll[0].net) : '—', payroll[0] ? `Latest payroll · ${payroll[0].status}` : 'No payroll generated'],
      ['bi-calendar2-minus', leaves.filter(item => item.status === 'Pending').length, 'Pending leave requests'],
      ['bi-book', staff.subject || '—', 'Assigned subject']
    ].map(([icon, value, label]) => `<div class="col-6 col-xl-3"><div class="card-soft h-100 p-3"><div class="d-flex gap-3 align-items-center"><span class="ico"><i class="bi ${icon}"></i></span><div><strong class="d-block fs-5">${BS.esc(value)}</strong><small class="text-muted">${BS.esc(label)}</small></div></div></div></div>`).join('');

    $('staffProfile').innerHTML = `<div class="staff-portal-profile"><div class="avatar lg">${BS.esc(BS.initials(staff.name))}</div><div><h3 class="h5 mb-1">${BS.esc(staff.name)}</h3><div class="text-muted">${BS.esc(staff.designation)} · ${BS.esc(staff.department)}</div></div></div>
      <dl class="row small mb-0 mt-3"><dt class="col-5 text-muted">Staff ID</dt><dd class="col-7">${BS.esc(staff.id)}</dd><dt class="col-5 text-muted">Email</dt><dd class="col-7 text-break">${BS.esc(staff.email || '—')}</dd><dt class="col-5 text-muted">Phone</dt><dd class="col-7">${BS.esc(staff.phone || '—')}</dd><dt class="col-5 text-muted">Joined</dt><dd class="col-7">${BS.fmtDate(staff.joinDate)}</dd><dt class="col-5 text-muted">Department</dt><dd class="col-7">${BS.esc(staff.department)}</dd></dl>`;

    const recentAttendance = attendance.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
    $('staffAttendanceBody').innerHTML = recentAttendance.length ? recentAttendance.map(([date, marks]) => `<tr><td>${BS.fmtDate(date)}</td><td>${BS.pill(marks[staffId] === 'P' ? 'Present' : marks[staffId] === 'A' ? 'Absent' : 'On leave', BS.statusKind(marks[staffId] === 'P' ? 'Present' : marks[staffId] === 'A' ? 'Absent' : 'Leave'))}</td></tr>`).join('') : '<tr><td colspan="2" class="text-center text-muted py-4">No attendance has been recorded for you this month.</td></tr>';

    $('staffPayrollBody').innerHTML = payroll.length ? payroll.map(record => `<tr><td>${BS.esc(record.period)}</td><td class="text-end">${BS.pkr(record.net)}</td><td>${BS.pill(record.status, BS.statusKind(record.status))}</td><td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-slip="${BS.esc(record.period)}">Download</button></td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted py-4">Payslips appear after payroll is generated.</td></tr>';
    $('staffPayrollBody').addEventListener('click', e => {
      const button = e.target.closest('[data-slip]'); if (!button) return;
      const record = payroll.find(item => item.period === button.dataset.slip); if (!record) return;
      const csv = [['School', db.settings.schoolName], ['Employee', staff.name], ['Staff ID', staff.id], ['Period', record.period], ['Basic salary', record.basic], ['Allowance', record.allowance], ['Deduction', record.deduction], ['Net pay', record.net], ['Status', record.status], ['Paid on', record.paidAt || '']]
        .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      BS.download(`payslip-${staff.id}-${record.period}.csv`, csv, 'text/csv;charset=utf-8');
    });

    const renderLeaves = () => {
      $('staffLeaveBody').innerHTML = leaves.length ? leaves.map(item => `<tr><td>${BS.esc(item.type)}</td><td class="text-nowrap">${BS.fmtDate(item.from)} – ${BS.fmtDate(item.to)}</td><td>${BS.pill(item.status, BS.statusKind(item.status))}</td><td class="text-end">${item.status === 'Pending' ? `<button class="btn btn-sm btn-outline-danger" data-cancel-leave="${BS.esc(item.id)}">Cancel</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted py-4">You have no leave requests.</td></tr>';
    };
    renderLeaves();
    $('staffLeaveBody').addEventListener('click', async e => {
      const button = e.target.closest('[data-cancel-leave]'); if (!button) return;
      const leave = leaves.find(item => item.id === button.dataset.cancelLeave);
      if (!leave || leave.status !== 'Pending') return;
      if (!await BS.confirm('Cancel this pending leave request?', { title: 'Cancel request', ok: 'Cancel request', danger: true })) return;
      leave.status = 'Cancelled'; BS.save(); BS.audit('Cancelled leave request', 'Leave request', leave.id, staffId); renderLeaves();
    });

    const scheduleRows = [];
    db.days.forEach((day, dayIndex) => Object.entries(db.timetable || {}).forEach(([className, week]) => {
      (week[dayIndex] || []).forEach((slot, periodIndex) => {
        if (slot?.teacherId !== staffId) return;
        scheduleRows.push(`<tr><td>${BS.esc(day)}</td><td>${BS.esc(db.periods[periodIndex] || `Period ${periodIndex + 1}`)}</td><td>${BS.esc(className)}</td><td>${BS.esc(slot.subject)}</td></tr>`);
      });
    }));
    $('staffScheduleBody').innerHTML = scheduleRows.join('') || '<tr><td colspan="4" class="text-center text-muted py-4">No periods are currently assigned to you.</td></tr>';

    const modal = bootstrap.Modal.getOrCreateInstance($('staffLeaveModal'));
    $('newStaffLeave').addEventListener('click', () => {
      $('staffLeaveForm').reset(); $('staffLeaveForm').classList.remove('was-validated');
      $('staffLeaveFrom').value = BS.todayISO(); $('staffLeaveTo').value = BS.todayISO(); modal.show();
    });
    $('staffLeaveForm').addEventListener('submit', e => {
      e.preventDefault(); const form = e.currentTarget; form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      const from = $('staffLeaveFrom').value, to = $('staffLeaveTo').value;
      if (to < from) { $('staffLeaveTo').setCustomValidity('End date must be on or after start date.'); form.classList.add('was-validated'); BS.toast('Leave end date must be on or after its start date.', 'warning'); return; }
      $('staffLeaveTo').setCustomValidity('');
      const request = { id: BS.nextId('LV', db.leaves, 1), staffId, type: $('staffLeaveType').value, from, to, reason: $('staffLeaveReason').value.trim(), status: 'Pending' };
      db.leaves.push(request); leaves.unshift(request); BS.save(); BS.audit('Submitted leave request', 'Leave request', request.id, `${request.type}; ${from} to ${to}`);
      modal.hide(); renderLeaves(); BS.toast('Leave request submitted for review.', 'success');
    });
    $('staffLeaveTo').addEventListener('input', e => e.target.setCustomValidity(''));
    $('staffPrint').addEventListener('click', () => window.print());
  }
})();
