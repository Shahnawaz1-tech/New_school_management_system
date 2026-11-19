/* ==========================================================================
   crm.js · Admissions CRM – Kanban + List + Analytics + Real-time clock
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;

  /* ── Stage config ── */
  const STAGE_COLORS = {
    'New':             '#6c757d',
    'Contacted':       '#0d6efd',
    'Visit Scheduled': '#fd7e14',
    'Form Submitted':  '#6f42c1',
    'Enrolled':        '#198754'
  };

  let db, leads, stages, sortCol = 'followUp', sortDir = 1;
  let filterStage = '', filterSource = '', filterClass = '', searchQ = '';
  let editingId = null;
  let leadModal, detailModal;

  /* ── Activity log (session-only) ── */
  const actLog = [];
  function logActivity(icon, text, colorClass = '') {
    actLog.unshift({ icon, text, colorClass, time: new Date().toISOString() });
    if (actLog.length > 20) actLog.pop();
    renderTimeline();
  }

  /* ── Init ── */
  document.addEventListener('bs:ready', function () {
    db = BS.db();
    leads = db.leads;
    stages = db.stages;

    leadModal   = new bootstrap.Modal(document.getElementById('leadModal'));
    detailModal = new bootstrap.Modal(document.getElementById('detailModal'));

    populateFilters();
    populateFormSelects();
    startClock();
    renderAll();
    bindEvents();
  });

  /* ── Live clock ── */
  function startClock() {
    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      document.getElementById('liveClock').textContent = `${hh}:${mm}:${ss}`;
      document.getElementById('liveDate').textContent = now.toLocaleDateString('en-PK', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    }
    tick();
    setInterval(tick, 1000);
    const s = db.settings;
    document.getElementById('sessionLabel').textContent = `Session ${s.session} · ${s.schoolName}`;
  }

  /* ── Populate filter dropdowns ── */
  function populateFilters() {
    const stageEl = document.getElementById('filterStage');
    stages.forEach(s => stageEl.insertAdjacentHTML('beforeend', `<option>${s}</option>`));

    const sources = [...new Set(leads.map(l => l.source))].sort();
    const srcEl = document.getElementById('filterSource');
    sources.forEach(s => srcEl.insertAdjacentHTML('beforeend', `<option>${s}</option>`));

    const classes = [...new Set(leads.map(l => l.applyingFor))].sort((a, b) => {
      return parseInt(a.split(' ')[1]) - parseInt(b.split(' ')[1]);
    });
    const clsEl = document.getElementById('filterClass');
    classes.forEach(c => clsEl.insertAdjacentHTML('beforeend', `<option>${c}</option>`));
  }

  function populateFormSelects() {
    const stageEl = document.getElementById('lStage');
    stages.forEach(s => stageEl.insertAdjacentHTML('beforeend', `<option>${s}</option>`));

    const clsEl = document.getElementById('lClass');
    for (let i = 1; i <= 10; i++) clsEl.insertAdjacentHTML('beforeend', `<option>Class ${i}</option>`);
  }

  /* ── Filtered leads ── */
  function getFiltered() {
    return leads.filter(l => {
      if (filterStage  && l.stage       !== filterStage)  return false;
      if (filterSource && l.source      !== filterSource) return false;
      if (filterClass  && l.applyingFor !== filterClass)  return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (!l.child.toLowerCase().includes(q) && !l.parent.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
      }
      return true;
    });
  }

  /* ── Render everything ── */
  function renderAll() {
    renderHeaderPills();
    renderKanban();
    renderList();
    renderAnalytics();
    renderFollowups();
    renderTimeline();
  }

  /* ── Header KPI pills ── */
  function renderHeaderPills() {
    const total    = leads.length;
    const enrolled = leads.filter(l => l.stage === 'Enrolled').length;
    const today    = BS.todayISO();
    const due      = leads.filter(l => l.followUp <= today && l.stage !== 'Enrolled').length;
    const newLeads = leads.filter(l => l.stage === 'New').length;

    document.getElementById('headerPills').innerHTML = [
      ['Total Leads', total],
      ['New',         newLeads],
      ['Enrolled',    enrolled],
      ['Follow-ups Due', due]
    ].map(([lbl, val]) => `
      <div class="stat-pill">
        <div class="sp-val">${val}</div>
        <div class="sp-lbl">${lbl}</div>
      </div>`).join('');
  }

  /* ── Kanban ── */
  function renderKanban() {
    const filtered = getFiltered();
    const board = document.getElementById('kanbanBoard');
    board.innerHTML = '';

    stages.forEach(stage => {
      const cards = filtered.filter(l => l.stage === stage);
      const col = document.createElement('div');
      col.className = 'kb-col';
      col.dataset.stage = stage;

      col.innerHTML = `
        <div class="kb-col-head">
          <div class="d-flex align-items-center gap-2">
            <span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>
            <span>${stage}</span>
          </div>
          <span class="kb-count">${cards.length}</span>
        </div>
        ${cards.map(l => kanbanCard(l)).join('')}
        <button class="btn btn-sm btn-outline-secondary w-100 mt-1" style="font-size:.75rem;border-style:dashed" data-add-stage="${stage}">
          <i class="bi bi-plus"></i> Add
        </button>`;

      /* Drag-and-drop */
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault(); col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const lead = leads.find(l => l.id === id);
        if (lead && lead.stage !== stage) {
          const old = lead.stage;
          lead.stage = stage;
          BS.save();
          BS.audit('Moved admission lead', 'Lead', id, `${lead.child}: ${old} to ${stage}`);
          logActivity('bi-arrow-right-circle', `${lead.child} moved from "${old}" → "${stage}"`, 'amber');
          BS.toast(`${lead.child} moved to "${stage}"`, 'success');
          renderAll();
        }
      });

      board.appendChild(col);
    });

    /* Card drag events */
    board.querySelectorAll('.kb-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    /* Quick-add from column */
    board.querySelectorAll('[data-add-stage]').forEach(btn => {
      btn.addEventListener('click', () => openAddModal(btn.dataset.addStage));
    });

    /* Card action buttons */
    board.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.view)));
    board.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.edit)));
    board.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteLead(btn.dataset.del)));
    board.querySelectorAll('[data-advance]').forEach(btn => btn.addEventListener('click', () => advanceStage(btn.dataset.advance)));
  }

  function kanbanCard(l) {
    const today = BS.todayISO();
    let followClass = 'follow-future', followLabel = 'Upcoming';
    if (l.followUp < today)      { followClass = 'follow-overdue'; followLabel = 'Overdue'; }
    else if (l.followUp === today){ followClass = 'follow-today';   followLabel = 'Today'; }

    const stageIdx = stages.indexOf(l.stage);
    const canAdvance = stageIdx < stages.length - 1;

    return `
      <div class="kb-card" draggable="true" data-id="${l.id}">
        <span class="follow-badge ${followClass}">${followLabel}</span>
        <div class="kc-name">${BS.esc(l.child)}</div>
        <div class="kc-meta"><i class="bi bi-person me-1"></i>${BS.esc(l.parent)}</div>
        <div class="kc-meta"><i class="bi bi-telephone me-1"></i>${BS.esc(l.phone)}</div>
        <div class="kc-meta"><i class="bi bi-mortarboard me-1"></i>${BS.esc(l.applyingFor)} · <i class="bi bi-share me-1"></i>${BS.esc(l.source)}</div>
        <div class="kc-meta"><i class="bi bi-calendar-event me-1"></i>${BS.fmtDate(l.followUp)}</div>
        <div class="kc-actions">
          <button class="btn btn-outline-secondary" data-view="${l.id}" title="View"><i class="bi bi-eye"></i></button>
          <button class="btn btn-outline-primary" data-edit="${l.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          ${canAdvance ? `<button class="btn btn-outline-success" data-advance="${l.id}" title="Advance stage"><i class="bi bi-arrow-right"></i></button>` : ''}
          <button class="btn btn-outline-danger ms-auto" data-del="${l.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>`;
  }

  /* ── List view ── */
  function renderList() {
    const filtered = getFiltered().slice().sort((a, b) => {
      const av = a[sortCol] || '', bv = b[sortCol] || '';
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });

    document.getElementById('listCount').textContent = `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`;
    const today = BS.todayISO();

    document.getElementById('leadsBody').innerHTML = filtered.length
      ? filtered.map(l => {
          let followClass = 'pill-success', followLabel = l.followUp;
          if (l.followUp < today)       { followClass = 'pill-danger';  }
          else if (l.followUp === today){ followClass = 'pill-warning'; }
          return `<tr>
            <td><strong>${BS.esc(l.child)}</strong></td>
            <td>${BS.esc(l.parent)}</td>
            <td><a href="tel:${BS.esc(l.phone)}">${BS.esc(l.phone)}</a></td>
            <td>${BS.esc(l.applyingFor)}</td>
            <td>${BS.esc(l.source)}</td>
            <td><span class="pill" style="background:${STAGE_COLORS[l.stage]}22;color:${STAGE_COLORS[l.stage]}">${BS.esc(l.stage)}</span></td>
            <td><span class="pill ${followClass}">${BS.fmtDate(l.followUp)}</span></td>
            <td>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-secondary" data-view="${l.id}"><i class="bi bi-eye"></i></button>
                <button class="btn btn-sm btn-outline-primary" data-edit="${l.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-del="${l.id}"><i class="bi bi-trash"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="8">${BS.empty('bi-funnel', 'No leads found', 'Try adjusting your filters.')}</td></tr>`;

    /* Sort headers */
    document.querySelectorAll('#leadsTable th.sortable').forEach(th => {
      th.classList.remove('asc', 'desc');
      if (th.dataset.col === sortCol) th.classList.add(sortDir === 1 ? 'asc' : 'desc');
    });

    /* Bind list actions */
    document.querySelectorAll('#leadsBody [data-view]').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.view)));
    document.querySelectorAll('#leadsBody [data-edit]').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.edit)));
    document.querySelectorAll('#leadsBody [data-del]').forEach(b => b.addEventListener('click', () => deleteLead(b.dataset.del)));
  }

  /* ── Analytics ── */
  function renderAnalytics() {
    const total    = leads.length;
    const enrolled = leads.filter(l => l.stage === 'Enrolled').length;
    const today    = BS.todayISO();
    const due      = leads.filter(l => l.followUp <= today && l.stage !== 'Enrolled').length;
    const pipeline = leads.filter(l => l.stage !== 'Enrolled').length;
    const pct      = total ? Math.round((enrolled / total) * 100) : 0;

    /* Conversion ring */
    const circumference = 2 * Math.PI * 46; // r=46
    const offset = circumference - (pct / 100) * circumference;
    const ring = document.getElementById('convRing');
    ring.style.strokeDasharray  = circumference;
    ring.style.strokeDashoffset = offset;
    document.getElementById('convPct').textContent = pct + '%';
    document.getElementById('statTotal').textContent    = total;
    document.getElementById('statEnrolled').textContent = enrolled;
    document.getElementById('statPipeline').textContent = pipeline;
    document.getElementById('statDue').textContent      = due;

    /* Funnel */
    const maxCount = Math.max(...stages.map(s => leads.filter(l => l.stage === s).length), 1);
    document.getElementById('funnelWrap').innerHTML = stages.map(s => {
      const cnt = leads.filter(l => l.stage === s).length;
      const w   = Math.max(30, Math.round((cnt / maxCount) * 100));
      return `<div class="funnel-step" style="width:${w}%;background:${STAGE_COLORS[s]}">
        <span>${s}</span><strong>${cnt}</strong>
      </div>`;
    }).join('');

    /* Source bar */
    const srcMap = {};
    leads.forEach(l => { srcMap[l.source] = (srcMap[l.source] || 0) + 1; });
    const maxSrc = Math.max(...Object.values(srcMap), 1);
    document.getElementById('sourceBar').innerHTML = Object.entries(srcMap)
      .sort((a, b) => b[1] - a[1])
      .map(([src, cnt]) => `
        <div class="source-row">
          <span class="src-lbl">${BS.esc(src)}</span>
          <div class="src-track"><div class="src-fill" style="width:${Math.round((cnt/maxSrc)*100)}%"></div></div>
          <span class="src-cnt">${cnt}</span>
        </div>`).join('');
  }

  /* ── Follow-ups due ── */
  function renderFollowups() {
    const today = BS.todayISO();
    const due = leads
      .filter(l => l.followUp <= today && l.stage !== 'Enrolled')
      .sort((a, b) => a.followUp.localeCompare(b.followUp));

    document.getElementById('dueCount').textContent = due.length;
    document.getElementById('followupBody').innerHTML = due.length
      ? due.map(l => {
          const overdue = l.followUp < today;
          return `<tr class="followup-row">
            <td><strong>${BS.esc(l.child)}</strong></td>
            <td>${BS.esc(l.parent)}</td>
            <td><span class="pill" style="background:${STAGE_COLORS[l.stage]}22;color:${STAGE_COLORS[l.stage]}">${BS.esc(l.stage)}</span></td>
            <td><span class="pill ${overdue ? 'pill-danger' : 'pill-warning'}">${BS.fmtDate(l.followUp)}</span></td>
            <td>
              <button class="btn btn-sm btn-outline-primary" data-edit="${l.id}"><i class="bi bi-pencil me-1"></i>Update</button>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-check-circle text-success me-2"></i>No follow-ups overdue</td></tr>`;

    document.querySelectorAll('#followupBody [data-edit]').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.edit)));
  }

  /* ── Timeline ── */
  function renderTimeline() {
    const tl = document.getElementById('crmTimeline');
    if (!actLog.length) {
      tl.innerHTML = `<li class="text-muted small ps-4">No activity yet this session.</li>`;
      return;
    }
    tl.innerHTML = actLog.slice(0, 8).map(a => `
      <li>
        <div class="tl-dot ${a.colorClass || ''}"><i class="bi ${a.icon}"></i></div>
        <div class="tl-body">
          <div class="tl-title">${BS.esc(a.text)}</div>
          <div class="tl-time">${BS.timeAgo(a.time)}</div>
        </div>
      </li>`).join('');
  }

  /* ── Open Add Modal ── */
  function openAddModal(defaultStage = 'New') {
    editingId = null;
    document.getElementById('leadModalTitle').textContent = 'New Admission Lead';
    document.getElementById('leadSaveBtn').textContent = 'Save Lead';
    document.getElementById('leadForm').reset();
    document.getElementById('leadForm').classList.remove('was-validated');
    document.getElementById('lStage').value = defaultStage;
    document.getElementById('lFollowUp').value = BS.todayISO();
    leadModal.show();
  }

  /* ── Open Edit Modal ── */
  function openEditModal(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    editingId = id;
    document.getElementById('leadModalTitle').textContent = 'Edit Lead';
    document.getElementById('leadSaveBtn').textContent = 'Update Lead';
    document.getElementById('leadForm').classList.remove('was-validated');
    document.getElementById('lChild').value    = l.child;
    document.getElementById('lParent').value   = l.parent;
    document.getElementById('lPhone').value    = l.phone;
    document.getElementById('lClass').value    = l.applyingFor;
    document.getElementById('lSource').value   = l.source;
    document.getElementById('lStage').value    = l.stage;
    document.getElementById('lFollowUp').value = l.followUp;
    document.getElementById('lNote').value     = l.note || '';
    leadModal.show();
  }

  /* ── Open Detail Modal ── */
  function openDetail(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    const today = BS.todayISO();
    let followClass = 'pill-success';
    if (l.followUp < today)       followClass = 'pill-danger';
    else if (l.followUp === today) followClass = 'pill-warning';

    document.getElementById('detailContent').innerHTML = `
      <div class="modal-header" style="background:${STAGE_COLORS[l.stage]};color:#fff">
        <h2 class="modal-title fs-5">${BS.esc(l.child)}</h2>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="row g-3">
          <div class="col-6"><div class="text-muted small">Parent</div><strong>${BS.esc(l.parent)}</strong></div>
          <div class="col-6"><div class="text-muted small">Phone</div><a href="tel:${BS.esc(l.phone)}">${BS.esc(l.phone)}</a></div>
          <div class="col-6"><div class="text-muted small">Applying For</div><strong>${BS.esc(l.applyingFor)}</strong></div>
          <div class="col-6"><div class="text-muted small">Source</div>${BS.esc(l.source)}</div>
          <div class="col-6"><div class="text-muted small">Stage</div>
            <span class="pill" style="background:${STAGE_COLORS[l.stage]}22;color:${STAGE_COLORS[l.stage]}">${BS.esc(l.stage)}</span>
          </div>
          <div class="col-6"><div class="text-muted small">Follow-up</div>
            <span class="pill ${followClass}">${BS.fmtDate(l.followUp)}</span>
          </div>
          <div class="col-6"><div class="text-muted small">Lead ID</div><code>${l.id}</code></div>
          <div class="col-6"><div class="text-muted small">Created</div>${BS.fmtDate(l.createdAt)}</div>
          ${l.note ? `<div class="col-12"><div class="text-muted small">Note</div><p class="mb-0">${BS.esc(l.note)}</p></div>` : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-primary" data-bs-dismiss="modal" data-edit="${l.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
        <button class="btn btn-light" data-bs-dismiss="modal">Close</button>
      </div>`;

    document.getElementById('detailContent').querySelector('[data-edit]')?.addEventListener('click', e => {
      openEditModal(e.currentTarget.dataset.edit);
    });
    detailModal.show();
  }

  /* ── Advance stage ── */
  function advanceStage(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    const idx = stages.indexOf(l.stage);
    if (idx < stages.length - 1) {
      const next = stages[idx + 1];
      l.stage = next;
      BS.save();
      BS.audit('Advanced admission lead', 'Lead', id, `${l.child} to ${next}`);
      logActivity('bi-arrow-right-circle', `${l.child} advanced to "${next}"`, 'green');
      BS.toast(`${l.child} → ${next}`, 'success');
      renderAll();
    }
  }

  /* ── Delete lead ── */
  async function deleteLead(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    const ok = await BS.confirm(`Delete lead for "${l.child}"? This cannot be undone.`, { title: 'Delete Lead', ok: 'Delete', danger: true });
    if (!ok) return;
    db.leads = leads = leads.filter(x => x.id !== id);
    BS.save();
    BS.audit('Deleted admission lead', 'Lead', id, l.child);
    logActivity('bi-trash', `Lead deleted: ${l.child}`, '');
    BS.toast(`Lead for ${l.child} deleted`, 'danger');
    renderAll();
  }

  /* ── Form submit (add / edit) ── */
  document.addEventListener('bs:ready', () => {
    document.getElementById('leadForm').addEventListener('submit', function (e) {
      e.preventDefault();
      this.classList.add('was-validated');
      if (!this.checkValidity()) return;

      const data = {
        child:      document.getElementById('lChild').value.trim(),
        parent:     document.getElementById('lParent').value.trim(),
        phone:      document.getElementById('lPhone').value.trim(),
        applyingFor:document.getElementById('lClass').value,
        source:     document.getElementById('lSource').value,
        stage:      document.getElementById('lStage').value,
        followUp:   document.getElementById('lFollowUp').value || BS.todayISO(),
        note:       document.getElementById('lNote').value.trim()
      };

      if (editingId) {
        const l = leads.find(x => x.id === editingId);
        Object.assign(l, data);
        BS.save();
        BS.audit('Updated admission lead', 'Lead', editingId, data.child);
        logActivity('bi-pencil', `Lead updated: ${data.child}`, 'blue');
        BS.toast(`Lead for ${data.child} updated`, 'success');
      } else {
        const newLead = { id: BS.nextId('L', leads, 201), createdAt: BS.todayISO(), ...data };
        leads.push(newLead);
        db.leads = leads;
        BS.save();
        BS.audit('Added admission lead', 'Lead', newLead.id, data.child);
        logActivity('bi-person-plus', `New lead added: ${data.child}`, 'amber');
        BS.toast(`Lead for ${data.child} added`, 'success');
      }

      leadModal.hide();
      renderAll();
    });
  });

  /* ── Bind UI events ── */
  function bindEvents() {
    document.getElementById('addLeadBtn').addEventListener('click', () => openAddModal());
    document.getElementById('fabAdd').addEventListener('click', () => openAddModal());

    /* View toggle */
    document.getElementById('btnKanban').addEventListener('click', () => {
      document.getElementById('kanbanView').style.display = '';
      document.getElementById('listView').style.display = 'none';
      document.getElementById('btnKanban').classList.add('active', 'btn-primary');
      document.getElementById('btnKanban').classList.remove('btn-outline-primary');
      document.getElementById('btnList').classList.remove('active', 'btn-primary');
      document.getElementById('btnList').classList.add('btn-outline-primary');
    });
    document.getElementById('btnList').addEventListener('click', () => {
      document.getElementById('kanbanView').style.display = 'none';
      document.getElementById('listView').style.display = '';
      document.getElementById('btnList').classList.add('active', 'btn-primary');
      document.getElementById('btnList').classList.remove('btn-outline-primary');
      document.getElementById('btnKanban').classList.remove('active', 'btn-primary');
      document.getElementById('btnKanban').classList.add('btn-outline-primary');
    });

    /* Filters */
    document.getElementById('crmSearch').addEventListener('input', BS.debounce(e => { searchQ = e.target.value.trim(); renderAll(); }));
    document.getElementById('filterStage').addEventListener('change', e => { filterStage = e.target.value; renderAll(); });
    document.getElementById('filterSource').addEventListener('change', e => { filterSource = e.target.value; renderAll(); });
    document.getElementById('filterClass').addEventListener('change', e => { filterClass = e.target.value; renderAll(); });
    document.getElementById('clearFilters').addEventListener('click', () => {
      searchQ = filterStage = filterSource = filterClass = '';
      document.getElementById('crmSearch').value = '';
      document.getElementById('filterStage').value = '';
      document.getElementById('filterSource').value = '';
      document.getElementById('filterClass').value = '';
      renderAll();
    });

    /* Sort on list headers */
    document.querySelectorAll('#leadsTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        if (sortCol === th.dataset.col) sortDir *= -1;
        else { sortCol = th.dataset.col; sortDir = 1; }
        renderList();
      });
    });

    /* Export CSV */
    document.getElementById('exportBtn').addEventListener('click', () => {
      const rows = [['ID','Child','Parent','Phone','Class','Source','Stage','Follow-up','Note']];
      getFiltered().forEach(l => rows.push([l.id, l.child, l.parent, l.phone, l.applyingFor, l.source, l.stage, l.followUp, l.note || '']));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      BS.download(`crm-leads-${BS.todayISO()}.csv`, csv);
      BS.toast('CSV exported', 'success');
    });
  }
})();
