/* ==========================================================================
   settings.js · Full dynamic settings page:
   School profile, Classes, Fee Heads, Subjects, Appearance, Advanced
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  document.addEventListener('bs:ready', () => {
    const db = BS.db();
    const role = BS.role;
    const $ = (id) => document.getElementById(id);
    const isAdmin = role === 'admin';

    /* ------------------------------------------------------------------ */
    /* TAB 1 – School Profile                                               */
    /* ------------------------------------------------------------------ */
    const schoolFields = {
      sName: 'schoolName', sTagline: 'tagline', sAddress: 'address',
      sPhone: 'phone', sEmail: 'email', sPrincipal: 'principal',
      sSession: 'session', sBankName: 'bankName', sAccTitle: 'accountTitle',
      sAccNo: 'accountNo', sDueDay: 'dueDay', sLateFine: 'lateFine'
    };

    function loadSchoolForm() {
      Object.entries(schoolFields).forEach(([id, key]) => {
        const el = $(id); if (el) el.value = db.settings[key] ?? '';
      });
      updatePreview();
    }

    function updatePreview() {
      const name = $('sName').value.trim() || 'School';
      const words = name.replace(/^(The|Al)\s/i, '').split(/\s+/);
      const initials = words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
      $('prevInitials').textContent = initials;
      $('prevName').textContent = name;
      $('prevTagline').textContent = $('sTagline').value.trim();
      $('prevAddress').textContent = $('sAddress').value.trim();
      const ph = $('sPhone').value.trim(), em = $('sEmail').value.trim();
      $('prevContact').textContent = [ph, em].filter(Boolean).join(' · ');
      $('prevSession').textContent = $('sSession').value.trim() || '—';
      $('prevPrincipal').textContent = $('sPrincipal').value.trim() || '—';
      const dd = $('sDueDay').value; const lf = $('sLateFine').value;
      $('prevDue').textContent = dd ? `${dd}th of month · Fine Rs ${lf || 0}` : '—';
    }

    // Live preview on every keystroke
    ['sName','sTagline','sAddress','sPhone','sEmail','sPrincipal','sSession','sDueDay','sLateFine']
      .forEach(id => { const el = $(id); if (el) el.addEventListener('input', updatePreview); });

    $('schoolForm').addEventListener('submit', (e) => {
      e.preventDefault();
      $('schoolForm').classList.add('was-validated');
      if (!$('schoolForm').checkValidity()) return;
      Object.entries(schoolFields).forEach(([id, key]) => {
        const el = $(id); if (!el) return;
        db.settings[key] = el.type === 'number' ? Number(el.value) : el.value.trim();
      });
      BS.save();
      BS.audit('Updated school profile', 'School settings', db.settings.schoolName);
      // Update sidebar school name live
      const brandEl = document.querySelector('.brand-text strong');
      if (brandEl) brandEl.textContent = db.settings.schoolName;
      document.title = `Settings · ${db.settings.schoolName}`;
      BS.toast('School settings saved', 'success');
    });

    $('schoolReset').addEventListener('click', () => { loadSchoolForm(); BS.toast('Changes discarded', 'info'); });

    // Quick stats
    const statsEl = $('quickStats');
    const statRow = (label, val) => `<div class="d-flex justify-content-between small"><span class="text-muted">${label}</span><strong>${val}</strong></div>`;
    statsEl.innerHTML = [
      statRow('Total Students', db.students.length),
      statRow('Total Staff', db.staff.length),
      statRow('Classes', db.classes.length),
      statRow('Subjects', db.subjects.length),
      statRow('Fee Heads', db.feeHeads.length),
      statRow('Open Leads', db.leads.filter(l => l.stage !== 'Enrolled').length)
    ].join('');

    loadSchoolForm();

    /* ------------------------------------------------------------------ */
    /* TAB 2 – Classes                                                      */
    /* ------------------------------------------------------------------ */
    const classModal = bootstrap.Modal.getOrCreateInstance($('classModal'));

    function renderClasses() {
      $('classBody').innerHTML = db.classes.map((c, i) => {
        const count = db.students.filter(s => s.cls === c.name).length;
        return `<tr>
          <td class="fw-semibold">${BS.esc(c.name)}</td>
          <td>${BS.esc(c.section || 'A')}</td>
          <td class="text-end">${BS.pkr(c.fee)}</td>
          <td class="text-center"><span class="pill pill-info">${count}</span></td>
          <td class="text-end">
            ${isAdmin ? `<button class="icon-btn-sm me-1" data-edit-class="${i}" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="icon-btn-sm text-danger" data-del-class="${i}" title="Delete"><i class="bi bi-trash"></i></button>` : '<span class="text-muted small">—</span>'}
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="5" class="text-center text-muted py-4">No classes found.</td></tr>`;
    }

    $('classTable').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit-class]');
      const delBtn  = e.target.closest('[data-del-class]');
      if (editBtn) {
        const i = +editBtn.dataset.editClass, c = db.classes[i];
        $('classModalTitle').textContent = 'Edit Class';
        $('classEditIdx').value = i;
        $('className').value = c.name;
        $('classSection').value = c.section || 'A';
        $('classFee').value = c.fee;
        $('classForm').classList.remove('was-validated');
        classModal.show();
      }
      if (delBtn) {
        const i = +delBtn.dataset.delClass, c = db.classes[i];
        const used = db.students.some(s => s.cls === c.name);
        if (used) { BS.toast(`Cannot delete "${c.name}" — students are enrolled.`, 'danger'); return; }
        if (await BS.confirm(`Delete "${c.name}"?`, { title: 'Delete class?', ok: 'Delete', danger: true })) {
          db.classes.splice(i, 1); BS.save(); BS.audit('Deleted class', 'Class', c.name); renderClasses(); BS.toast('Class deleted', 'success');
        }
      }
    });

    $('addClassBtn').addEventListener('click', () => {
      if (!isAdmin) { BS.toast('Only admins can add classes', 'warning'); return; }
      $('classModalTitle').textContent = 'Add Class';
      $('classEditIdx').value = '';
      $('classForm').reset(); $('classForm').classList.remove('was-validated');
      classModal.show();
    });

    $('classForm').addEventListener('submit', (e) => {
      e.preventDefault();
      $('classForm').classList.add('was-validated');
      if (!$('classForm').checkValidity()) return;
      const obj = { name: $('className').value.trim(), section: $('classSection').value.trim() || 'A', fee: Number($('classFee').value) };
      const idx = $('classEditIdx').value;
      const duplicate = db.classes.some((c, i) => i !== (idx === '' ? -1 : +idx) && c.name.toLocaleLowerCase() === obj.name.toLocaleLowerCase() && String(c.section || 'A').toLocaleLowerCase() === obj.section.toLocaleLowerCase());
      if (duplicate) { BS.toast('This class and section already exists', 'warning'); return; }
      const previousName = idx !== '' ? db.classes[+idx].name : null;
      if (idx !== '') db.classes[+idx] = obj;
      else db.classes.push(obj);
      // Keep dependent records connected when an admin renames a class.
      if (previousName && previousName !== obj.name) {
        db.students.forEach(s => { if (s.cls === previousName) { s.cls = obj.name; s.section = obj.section; } });
        if (db.timetable && db.timetable[previousName]) { db.timetable[obj.name] = db.timetable[previousName]; delete db.timetable[previousName]; }
      } else if (previousName) {
        db.students.forEach(s => { if (s.cls === obj.name) s.section = obj.section; });
      }
      BS.save(); BS.audit(idx !== '' ? 'Updated class' : 'Added class', 'Class', obj.name, `${obj.section}; monthly fee ${obj.fee}`); classModal.hide(); renderClasses();
      BS.toast(idx !== '' ? 'Class updated' : 'Class added', 'success');
    });

    renderClasses();

    /* ------------------------------------------------------------------ */
    /* TAB 3 – Fee Heads                                                    */
    /* ------------------------------------------------------------------ */
    const fhModal = bootstrap.Modal.getOrCreateInstance($('feeHeadModal'));

    function renderFeeHeads() {
      $('feeHeadBody').innerHTML = db.feeHeads.map(fh => `<tr>
        <td><span class="pill pill-muted">${BS.esc(fh.id)}</span></td>
        <td class="fw-semibold">${BS.esc(fh.name)}</td>
        <td class="text-end">${BS.pkr(fh.amount)}</td>
        <td>${BS.esc(fh.freq)}</td>
        <td class="text-end">
          ${isAdmin ? `<button class="icon-btn-sm me-1" data-edit-fh="${fh.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="icon-btn-sm text-danger" data-del-fh="${fh.id}" title="Delete"><i class="bi bi-trash"></i></button>` : '<span class="text-muted small">—</span>'}
        </td>
      </tr>`).join('') || `<tr><td colspan="5" class="text-center text-muted py-4">No fee heads.</td></tr>`;
    }

    $('feeHeadTable').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit-fh]');
      const delBtn  = e.target.closest('[data-del-fh]');
      if (editBtn) {
        const fh = db.feeHeads.find(f => f.id === editBtn.dataset.editFh);
        $('fhModalTitle').textContent = 'Edit Fee Head';
        $('fhEditId').value = fh.id;
        $('fhName').value = fh.name; $('fhAmount').value = fh.amount; $('fhFreq').value = fh.freq;
        $('feeHeadForm').classList.remove('was-validated');
        fhModal.show();
      }
      if (delBtn) {
        const id = delBtn.dataset.delFh;
        if (await BS.confirm('Delete this fee head?', { title: 'Delete fee head?', ok: 'Delete', danger: true })) {
          db.feeHeads = db.feeHeads.filter(f => f.id !== id); BS.save(); BS.audit('Deleted fee head', 'Fee head', id); renderFeeHeads(); BS.toast('Fee head deleted', 'success');
        }
      }
    });

    $('addFeeHeadBtn').addEventListener('click', () => {
      if (!isAdmin) { BS.toast('Only admins can add fee heads', 'warning'); return; }
      $('fhModalTitle').textContent = 'Add Fee Head';
      $('fhEditId').value = '';
      $('feeHeadForm').reset(); $('feeHeadForm').classList.remove('was-validated');
      fhModal.show();
    });

    $('feeHeadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      $('feeHeadForm').classList.add('was-validated');
      if (!$('feeHeadForm').checkValidity()) return;
      const editId = $('fhEditId').value;
      const name = $('fhName').value.trim();
      if (db.feeHeads.some(f => f.id !== editId && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { BS.toast('A fee head with this name already exists', 'warning'); return; }
      if (editId) {
        const fh = db.feeHeads.find(f => f.id === editId);
        fh.name = name; fh.amount = Number($('fhAmount').value); fh.freq = $('fhFreq').value;
      } else {
        const nums = db.feeHeads.map(f => parseInt(f.id.replace('H', ''), 10));
        const nextId = 'H' + (Math.max(0, ...nums) + 1);
        db.feeHeads.push({ id: nextId, name, amount: Number($('fhAmount').value), freq: $('fhFreq').value });
      }
      BS.save(); BS.audit(editId ? 'Updated fee head' : 'Added fee head', 'Fee head', editId || db.feeHeads[db.feeHeads.length - 1].id, name); fhModal.hide(); renderFeeHeads();
      BS.toast(editId ? 'Fee head updated' : 'Fee head added', 'success');
    });

    renderFeeHeads();

    /* ------------------------------------------------------------------ */
    /* TAB 4 – Subjects                                                     */
    /* ------------------------------------------------------------------ */
    const subModal = bootstrap.Modal.getOrCreateInstance($('subjectModal'));

    function renderSubjects() {
      $('subjectChips').innerHTML = db.subjects.map((s, i) =>
        `<span class="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 d-inline-flex align-items-center gap-1 px-3 py-2 fs-6">
          ${BS.esc(s)}
          ${isAdmin ? `<button class="btn-close btn-close-sm ms-1" style="font-size:.6rem" data-del-sub="${i}" aria-label="Remove ${BS.esc(s)}"></button>` : ''}
        </span>`
      ).join('') || '<span class="text-muted small">No subjects defined.</span>';
    }

    $('subjectChips').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del-sub]'); if (!btn) return;
      const i = +btn.dataset.delSub, name = db.subjects[i];
      if (await BS.confirm(`Remove subject "${name}"?`, { title: 'Remove subject?', ok: 'Remove', danger: true })) {
        db.subjects.splice(i, 1); BS.save(); BS.audit('Removed subject', 'Subject', name); renderSubjects(); BS.toast('Subject removed', 'success');
      }
    });

    $('addSubjectBtn').addEventListener('click', () => {
      if (!isAdmin) { BS.toast('Only admins can add subjects', 'warning'); return; }
      $('subjectForm').reset(); $('subjectForm').classList.remove('was-validated');
      subModal.show();
    });

    $('subjectForm').addEventListener('submit', (e) => {
      e.preventDefault();
      $('subjectForm').classList.add('was-validated');
      if (!$('subjectForm').checkValidity()) return;
      const name = $('subjectName').value.trim();
      if (db.subjects.some(subject => subject.toLocaleLowerCase() === name.toLocaleLowerCase())) { BS.toast('Subject already exists', 'warning'); return; }
      db.subjects.push(name); BS.save(); BS.audit('Added subject', 'Subject', name); subModal.hide(); renderSubjects();
      BS.toast('Subject added', 'success');
    });

    renderSubjects();

    /* ------------------------------------------------------------------ */
    /* TAB 5 – Appearance                                                   */
    /* ------------------------------------------------------------------ */
    function syncAppearance() {
      const theme = BS.ui.get('theme', 'light');
      const lang  = BS.ui.get('lang', 'en');
      const collapsed = BS.ui.get('collapsed', false);

      $('themeLight').classList.toggle('border-primary', theme === 'light');
      $('themeLight').classList.toggle('bg-primary', theme === 'light');
      $('themeLight').classList.toggle('bg-opacity-10', theme === 'light');
      $('themeDark').classList.toggle('border-primary', theme === 'dark');
      $('themeDark').classList.toggle('bg-primary', theme === 'dark');
      $('themeDark').classList.toggle('bg-opacity-10', theme === 'dark');

      $('langEn').classList.toggle('border-primary', lang === 'en');
      $('langEn').classList.toggle('bg-primary', lang === 'en');
      $('langEn').classList.toggle('bg-opacity-10', lang === 'en');
      $('langUr').classList.toggle('border-primary', lang === 'ur');
      $('langUr').classList.toggle('bg-primary', lang === 'ur');
      $('langUr').classList.toggle('bg-opacity-10', lang === 'ur');

      $('sidebarCollapsed').checked = collapsed;
    }

    $('themeLight').addEventListener('click', () => {
      BS.ui.set('theme', 'light'); BS.applyUI(); syncAppearance();
      document.dispatchEvent(new CustomEvent('bs:theme'));
      BS.toast('Switched to Light theme', 'info');
    });
    $('themeDark').addEventListener('click', () => {
      BS.ui.set('theme', 'dark'); BS.applyUI(); syncAppearance();
      document.dispatchEvent(new CustomEvent('bs:theme'));
      BS.toast('Switched to Dark theme', 'info');
    });
    $('langEn').addEventListener('click', () => {
      BS.ui.set('lang', 'en'); BS.applyUI(); syncAppearance();
      BS.toast('Language set to English. Reload to apply fully.', 'info');
      setTimeout(() => location.reload(), 900);
    });
    $('langUr').addEventListener('click', () => {
      BS.ui.set('lang', 'ur'); BS.applyUI(); syncAppearance();
      BS.toast('زبان اردو میں تبدیل ہو گئی۔ دوبارہ لوڈ ہو رہا ہے…', 'info');
      setTimeout(() => location.reload(), 900);
    });
    $('sidebarCollapsed').addEventListener('change', (e) => {
      BS.ui.set('collapsed', e.target.checked);
      document.body.classList.toggle('sidebar-collapsed', e.target.checked);
      BS.toast(e.target.checked ? 'Sidebar will start collapsed' : 'Sidebar will start expanded', 'info');
    });

    // Role switcher cards
    const roleBox = $('roleCards');
    roleBox.innerHTML = Object.entries(BS.ROLES).map(([key, r]) =>
      `<button class="btn btn-sm ${BS.role === key ? 'btn-primary' : 'btn-outline-secondary'} d-flex align-items-center gap-1" data-switch-role="${key}">
        <i class="bi ${r.icon}"></i>${r.label}
      </button>`
    ).join('');
    roleBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-switch-role]'); if (!btn) return;
      const newRole = btn.dataset.switchRole;
      if (newRole === BS.role) return;
      BS.ui.set('role', newRole);
      BS.toast(`Switched to ${BS.ROLES[newRole].label} role. Reloading…`, 'info');
      setTimeout(() => location.href = 'dashboard.html', 800);
    });

    syncAppearance();

    /* ------------------------------------------------------------------ */
    /* TAB 6 – Advanced                                                     */
    /* ------------------------------------------------------------------ */
    // System info
    const storageBytes = new Blob([JSON.stringify(db)]).size;
    $('sysInfo').innerHTML = [
      `<div class="d-flex justify-content-between"><span>App Version</span><strong>1.0.0-demo</strong></div>`,
      `<div class="d-flex justify-content-between"><span>DB Version</span><strong>${db.version}</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Students</span><strong>${db.students.length}</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Fee Records</span><strong>${db.feeRecords.length}</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Attendance Days</span><strong>${Object.keys(db.attendance).length}</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Backup Size</span><strong>${storageBytes < 1024 * 1024 ? `${(storageBytes / 1024).toFixed(1)} KB` : `${(storageBytes / 1048576).toFixed(2)} MB`}</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Storage</span><strong>Browser local storage</strong></div>`,
      `<div class="d-flex justify-content-between"><span>Browser</span><strong>${navigator.userAgent.split(') ').pop().split(' ')[0]}</strong></div>`
    ].join('');

    const auditRows = [...(db.auditLog || [])].slice(-50).reverse();
    $('auditLogBody').innerHTML = auditRows.length ? auditRows.map(item => `<tr>
      <td class="text-nowrap">${BS.esc(new Date(item.time).toLocaleString())}</td>
      <td>${BS.esc(item.actor)} <span class="text-muted">· ${BS.esc(item.role)}</span></td>
      <td>${BS.esc(item.action)}</td><td>${BS.esc(item.entity)} ${BS.esc(item.entityId)}</td><td>${BS.esc(item.details)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No changes recorded yet.</td></tr>';
    $('exportAuditBtn').addEventListener('click', () => {
      BS.download(`brightschool-audit-${BS.todayISO()}.json`, JSON.stringify(db.auditLog || [], null, 2), 'application/json');
      BS.toast('Audit log exported', 'success');
    });

    // Export
    $('exportBtn').addEventListener('click', () => {
      const json = JSON.stringify(db, null, 2);
      BS.download(`brightschool-backup-${BS.todayISO()}.json`, json, 'application/json');
      BS.toast('Database exported as JSON', 'success');
    });

    // Import
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Backup file exceeds 10 MB');
        const text = await file.text();
        const parsed = JSON.parse(text);
        const requiredArrays = ['classes','feeHeads','students','feeRecords','staff','subjects','exams','leads','leaves','approvals'];
        if (!parsed || parsed.version !== 1 || !parsed.settings || typeof parsed.settings !== 'object' || requiredArrays.some(key => !Array.isArray(parsed[key]))) throw new Error('Invalid backup structure');
        if (parsed.students.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) throw new Error('Invalid student records');
        if (await BS.confirm(`Import "${file.name}"? This will overwrite all current data.`, { title: 'Import data?', ok: 'Import', danger: true })) {
          localStorage.setItem('bs_demo_db_v1', JSON.stringify(parsed));
          BS.toast('Data imported. Reloading…', 'success');
          setTimeout(() => location.reload(), 800);
        }
      } catch (error) {
        BS.toast(`Import failed: ${error.message || 'invalid backup file'}`, 'danger');
      }
      e.target.value = '';
    });

    // Danger reset
    $('dangerResetBtn').addEventListener('click', async () => {
      if (await BS.confirm('All added, edited and deleted records will be replaced with the original demo data.', { title: 'Reset demo data?', ok: 'Reset now', danger: true })) {
        BS.reset();
      }
    });

    /* ------------------------------------------------------------------ */
    /* Role guard: non-admin can view but not edit                          */
    /* ------------------------------------------------------------------ */
    if (!isAdmin) {
      $('auditCard').hidden = true;
      ['addClassBtn','addFeeHeadBtn','addSubjectBtn'].forEach(id => {
        const el = $(id); if (el) { el.disabled = true; el.title = 'Admin only'; }
      });
      $('schoolForm').querySelectorAll('input,select,textarea,button[type=submit]').forEach(el => el.disabled = true);
      ['exportBtn', 'importBtn', 'dangerResetBtn', 'exportAuditBtn'].forEach(id => {
        const el = $(id); if (el) { el.disabled = true; el.title = 'Admin only'; }
      });
    }
  });
})();
