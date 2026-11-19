/* ==========================================================================
   login.js · Role chooser. No real authentication: the chosen role is saved in
   localStorage (BS.ui) and the user is sent to the dashboard. layout.js reads
   the role to build the sidebar and greeting.
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;
  const blurbs = {
    admin: 'Full access to every module and report.',
    teacher: 'Attendance, marks, timetable and students.',
    accountant: 'Fee collection, challans and approvals.',
    parent: 'Your child’s attendance, fees and results.'
  };

  const grid = document.getElementById('roleGrid');
  const current = BS.ui.get('role', null) || 'admin'; // preselect last used role
  grid.innerHTML = Object.entries(BS.ROLES).map(([key, r]) => `
    <div class="role-card">
      <input type="radio" name="role" id="role-${key}" value="${key}" ${key === current ? 'checked' : ''}>
      <label for="role-${key}"><i class="bi ${r.icon}" aria-hidden="true"></i><strong>${BS.esc(r.label)}</strong><small>${BS.esc(blurbs[key])}</small></label>
    </div>`).join('');

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = document.querySelector('input[name="role"]:checked');
    const err = document.getElementById('roleError');
    if (!picked) { err.hidden = false; return; }
    err.hidden = true;
    BS.ui.set('role', picked.value);
    BS.db(); // make sure demo data exists before the dashboard loads
    const btn = document.getElementById('goBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Signing in…';
    BS.toast(`Signed in as ${BS.ROLES[picked.value].label}`, 'success');
    setTimeout(() => (location.href = 'dashboard.html'), 650);
  });
})();
