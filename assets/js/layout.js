/* ==========================================================================
   layout.js · Builds the shared shell (sidebar, top bar, breadcrumbs, footer)
   around each page's <main id="page">. Also handles role-based menu,
   English/Urdu labels, theme toggle, notifications and the reset button.
   Page markup needs:  <body data-page="students" data-title-key="m_students" data-group="g_academics">
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  /* ---------- Translations (menu + shell labels only) ---------- */
  const I18N = {
    en: { g_overview: 'Overview', g_academics: 'Academics', g_finance: 'Finance', g_people: 'People & Growth', g_workflow: 'Workflow', g_system: 'System',
      m_dashboard: 'Dashboard', m_students: 'Students', m_attendance: 'Attendance', m_exams: 'Exams', m_timetable: 'Timetable', m_fee: 'Fee Management',
      m_hr: 'HR & Payroll', m_crm: 'Admissions CRM', m_approvals: 'Approvals', m_mentor: 'Mentor AI', m_settings: 'Settings',
      home: 'Home', search: 'Search students…', notifications: 'Notifications', markRead: 'Mark all read', noNotif: 'You are all caught up',
      theme: 'Toggle theme', menu: 'Toggle menu', switchRole: 'Switch role', reset: 'Reset demo data', logout: 'Sign out', myProfile: 'School settings',
      demo: 'Demo build · fake data only' },
    ur: { g_overview: 'جائزہ', g_academics: 'تعلیمی', g_finance: 'مالیات', g_people: 'عملہ اور داخلے', g_workflow: 'ورک فلو', g_system: 'سسٹم',
      m_dashboard: 'ڈیش بورڈ', m_students: 'طلباء', m_attendance: 'حاضری', m_exams: 'امتحانات', m_timetable: 'ٹائم ٹیبل', m_fee: 'فیس کا انتظام',
      m_hr: 'عملہ اور تنخواہ', m_crm: 'داخلہ لیڈز', m_approvals: 'منظوریاں', m_mentor: 'مینٹر اے آئی', m_settings: 'ترتیبات',
      home: 'ہوم', search: 'طلباء تلاش کریں…', notifications: 'اطلاعات', markRead: 'سب پڑھا ہوا کریں', noNotif: 'کوئی نئی اطلاع نہیں',
      theme: 'تھیم تبدیل کریں', menu: 'مینو', switchRole: 'کردار تبدیل کریں', reset: 'ڈیمو ڈیٹا ری سیٹ', logout: 'سائن آؤٹ', myProfile: 'اسکول کی ترتیبات',
      demo: 'ڈیمو ورژن · فرضی ڈیٹا' }
  };
  BS.t = (k) => (I18N[BS.ui.get('lang', 'en')] || I18N.en)[k] || I18N.en[k] || k;

  /* ---------- Menu definition + who can see what ---------- */
  const MENU = [
    { g: 'g_overview', items: [['dashboard', 'bi-grid-1x2-fill', 'm_dashboard']] },
    { g: 'g_academics', items: [['students', 'bi-people-fill', 'm_students'], ['attendance', 'bi-calendar-check-fill', 'm_attendance'], ['exams', 'bi-journal-text', 'm_exams'], ['timetable', 'bi-calendar3-week-fill', 'm_timetable']] },
    { g: 'g_finance', items: [['fee', 'bi-cash-coin', 'm_fee']] },
    { g: 'g_people', items: [['hr', 'bi-person-badge-fill', 'm_hr'], ['crm', 'bi-funnel-fill', 'm_crm']] },
    { g: 'g_workflow', items: [['approvals', 'bi-check2-square', 'm_approvals'], ['mentor-ai', 'bi-stars', 'm_mentor']] },
    { g: 'g_system', items: [['settings', 'bi-gear-fill', 'm_settings']] }
  ];
  const ACCESS = {
    admin: '*',
    teacher: ['dashboard', 'students', 'attendance', 'exams', 'timetable', 'mentor-ai', 'settings'],
    accountant: ['dashboard', 'students', 'fee', 'approvals', 'mentor-ai', 'settings'],
    parent: ['dashboard', 'attendance', 'fee', 'exams', 'timetable', 'settings']
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    BS.applyUI();
    const body = document.body, pageId = body.dataset.page;
    if (pageId === 'login') return; // login page has no shell
    const role = BS.ui.get('role', null);
    if (!role) { location.replace('login.html'); return; } // demo "auth": no role chosen yet
    BS.role = role; BS.user = BS.ROLES[role];

    const db = BS.db(), main = document.getElementById('page');
    const allowed = ACCESS[role] === '*' ? () => true : (id) => ACCESS[role].includes(id);
    const pending = db.approvals.filter((a) => a.status === 'Pending').length;

    /* Sidebar */
    const nav = MENU.map((grp) => {
      const items = grp.items.filter((i) => allowed(i[0]));
      if (!items.length) return '';
      return `<div class="nav-label">${BS.t(grp.g)}</div>` + items.map(([id, icon, key]) =>
        `<a class="nav-item-x ${id === pageId ? 'active' : ''}" href="${id}.html" ${id === pageId ? 'aria-current="page"' : ''} title="${BS.t(key)}">
           <i class="bi ${icon}" aria-hidden="true"></i><span>${BS.t(key)}</span>${id === 'approvals' && pending ? `<b class="count">${pending}</b>` : ''}</a>`).join('');
    }).join('');

    /* Notifications */
    const unread = db.notifications.filter((n) => !n.read).length;

    const shell = document.createElement('div');
    shell.className = 'app';
    shell.innerHTML = `
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <a class="brand" href="dashboard.html"><img src="../assets/img/logo.svg" alt="">
          <span class="brand-text"><strong>${BS.esc(db.settings.schoolName)}</strong><small>by Shahzam Solution</small></span></a>
        <nav class="side-nav">${nav}</nav>
        <div class="sidebar-foot">${BS.t('demo')}</div>
      </aside>
      <div class="sidebar-backdrop" id="sbBackdrop"></div>
      <div class="app-main">
        <header class="topbar">
          <button class="icon-btn" id="sbToggle" aria-label="${BS.t('menu')}" aria-controls="sidebar"><i class="bi bi-list"></i></button>
          <form class="gsearch" id="gSearch" role="search">
            <i class="bi bi-search" aria-hidden="true"></i>
            <label class="visually-hidden" for="gSearchInput">${BS.t('search')}</label>
            <input type="search" id="gSearchInput" class="form-control" placeholder="${BS.t('search')}" autocomplete="off">
          </form>
          <div class="ms-auto d-flex align-items-center gap-1">
            <button class="icon-btn" id="themeBtn" aria-label="${BS.t('theme')}"><i class="bi bi-moon-stars"></i></button>
            <div class="dropdown">
              <button class="icon-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="${BS.t('notifications')}" aria-expanded="false">
                <i class="bi bi-bell"></i><span class="dot" id="notifDot" ${unread ? '' : 'hidden'}>${unread}</span></button>
              <div class="dropdown-menu dropdown-menu-end notif-menu">
                <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom"><strong>${BS.t('notifications')}</strong>
                  <button class="btn btn-link btn-sm p-0" id="markRead">${BS.t('markRead')}</button></div>
                <div id="notifList"></div>
              </div>
            </div>
            <div class="dropdown">
              <button class="profile-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Profile menu">
                <span class="avatar">${BS.initials(BS.user.name)}</span>
                <span class="profile-meta d-flex flex-column lh-1"><strong class="small">${BS.esc(BS.user.name)}</strong><small class="text-muted">${BS.esc(BS.user.label)}</small></span>
                <i class="bi bi-chevron-down small text-muted profile-meta"></i></button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><h6 class="dropdown-header">${BS.esc(BS.user.name)} · ${BS.esc(BS.user.title)}</h6></li>
                <li><a class="dropdown-item" href="settings.html"><i class="bi bi-gear me-2"></i>${BS.t('myProfile')}</a></li>
                <li><a class="dropdown-item" href="login.html"><i class="bi bi-arrow-left-right me-2"></i>${BS.t('switchRole')}</a></li>
                <li><button class="dropdown-item" id="resetBtn"><i class="bi bi-arrow-counterclockwise me-2"></i>${BS.t('reset')}</button></li>
                <li><hr class="dropdown-divider"></li>
                <li><button class="dropdown-item text-danger" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>${BS.t('logout')}</button></li>
              </ul>
            </div>
          </div>
        </header>
        <div class="content">
          <nav class="crumbs" aria-label="Breadcrumb"><ol class="breadcrumb"></ol></nav>
        </div>
        <footer class="app-foot">© 2026 Shahzam Solution · ${BS.esc(db.settings.schoolName)} ERP demo</footer>
      </div>`;
    body.prepend(shell);
    shell.querySelector('.content').appendChild(main); // move the page inside the shell

    /* Breadcrumbs: Home / Group / Page */
    const titleKey = body.dataset.titleKey, groupKey = body.dataset.group;
    shell.querySelector('.breadcrumb').innerHTML =
      `<li class="breadcrumb-item"><a href="dashboard.html">${BS.t('home')}</a></li>` +
      (groupKey && groupKey !== 'g_overview' ? `<li class="breadcrumb-item">${BS.t(groupKey)}</li>` : '') +
      `<li class="breadcrumb-item active" aria-current="page">${BS.t(titleKey)}</li>`;
    document.title = `${BS.t(titleKey)} · ${db.settings.schoolName}`;

    /* Sidebar toggle: collapse on desktop, slide-in on mobile */
    if (BS.ui.get('collapsed', false)) body.classList.add('sidebar-collapsed');
    const mobile = () => window.matchMedia('(max-width: 991.98px)').matches;
    document.getElementById('sbToggle').addEventListener('click', () => {
      if (mobile()) body.classList.toggle('sidebar-open');
      else { body.classList.toggle('sidebar-collapsed'); BS.ui.set('collapsed', body.classList.contains('sidebar-collapsed')); }
    });
    document.getElementById('sbBackdrop').addEventListener('click', () => body.classList.remove('sidebar-open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') body.classList.remove('sidebar-open'); });

    /* Theme toggle */
    const themeBtn = document.getElementById('themeBtn');
    const syncThemeIcon = () => (themeBtn.innerHTML = `<i class="bi ${BS.ui.get('theme', 'light') === 'dark' ? 'bi-sun' : 'bi-moon-stars'}"></i>`);
    syncThemeIcon();
    themeBtn.addEventListener('click', () => {
      BS.ui.set('theme', BS.ui.get('theme', 'light') === 'dark' ? 'light' : 'dark');
      BS.applyUI(); syncThemeIcon(); document.dispatchEvent(new CustomEvent('bs:theme')); // charts re-colour on this event
      BS.toast(`Switched to ${BS.ui.get('theme')} theme`, 'info');
    });

    /* Global search -> students page */
    document.getElementById('gSearch').addEventListener('submit', (e) => {
      e.preventDefault(); const q = document.getElementById('gSearchInput').value.trim();
      if (q) location.href = `students.html?q=${encodeURIComponent(q)}`;
    });

    /* Notifications dropdown */
    const renderNotifs = () => {
      const list = document.getElementById('notifList'), items = db.notifications;
      list.innerHTML = items.length ? items.map((n) => `<div class="notif-item ${n.read ? '' : 'unread'}"><i class="bi ${n.icon}"></i><div><div>${BS.esc(n.text)}</div><small class="text-muted">${BS.timeAgo(n.time)}</small></div></div>`).join('')
        : `<div class="p-3 text-muted text-center">${BS.t('noNotif')}</div>`;
      const c = items.filter((n) => !n.read).length, dot = document.getElementById('notifDot');
      dot.textContent = c; dot.hidden = !c;
    };
    renderNotifs();
    document.getElementById('markRead').addEventListener('click', () => { db.notifications.forEach((n) => (n.read = true)); BS.save(); renderNotifs(); BS.toast('All notifications marked as read', 'info'); });

    /* Reset + logout */
    document.getElementById('resetBtn').addEventListener('click', async () => {
      if (await BS.confirm('All added, edited and deleted records will be replaced with the original demo data.', { title: 'Reset demo data?', ok: 'Reset now', danger: true })) BS.reset();
    });
    document.getElementById('logoutBtn').addEventListener('click', () => { BS.ui.set('role', null); location.href = 'login.html'; });

    /* Role guard: if this role cannot open the page, tell them and go home */
    if (!allowed(pageId)) { BS.toast('This page is not available for the ' + BS.user.label + ' role', 'warning'); setTimeout(() => (location.href = 'dashboard.html'), 1200); }

    document.dispatchEvent(new CustomEvent('bs:ready'));
  }
})();
