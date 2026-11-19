/* ==========================================================================
   mentor-ai.js · Intelligent AI assistant using live demo data
   ========================================================================== */
(function () {
  'use strict';
  const BS = window.BS;
  const STORE_KEY = 'bs_mentor_v1';

  /* ── State ── */
  let sessions = [], activeId = null, isTyping = false, msgCount = 0, tokenCount = 0;

  /* ── DOM refs ── */
  const chatWindow   = BS.qs('#chatWindow');
  const chatInput    = BS.qs('#chatInput');
  const sendBtn      = BS.qs('#sendBtn');
  const charCount    = BS.qs('#charCount');
  const sugRow       = BS.qs('#suggestionsRow');
  const historyList  = BS.qs('#historyList');
  const aiStats      = BS.qs('#aiStats');

  /* ── Persist helpers ── */
  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }
  function saveSessions() {
    localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
  }

  /* ── Build rich school context from live data ── */
  function buildContext() {
    const db = BS.db();
    const today = BS.todayISO();
    const totalStudents = db.students.length;
    const activeStudents = db.students.filter(s => s.status === 'Active').length;

    // Attendance today
    const todayAtt = db.attendance[today] || {};
    const attVals = Object.values(todayAtt);
    const present = attVals.filter(v => v === 'P').length;
    const absent  = attVals.filter(v => v === 'A').length;
    const attPct  = attVals.length ? Math.round(present / attVals.length * 100) : null;

    // Fee this month
    const curRecs = db.feeRecords.filter(r => r.month === db.currentMonth);
    const feeBilled    = curRecs.reduce((s, r) => s + r.total, 0);
    const feeCollected = curRecs.reduce((s, r) => s + r.paid, 0);
    const unpaidCount  = curRecs.filter(r => r.status === 'Unpaid').length;
    const partialCount = curRecs.filter(r => r.status === 'Partial').length;

    // Exams
    const ongoing  = db.exams.find(e => e.status === 'Ongoing');
    const upcoming = db.exams.find(e => e.status === 'Upcoming');

    // Pending approvals
    const pendingApprovals = db.approvals.filter(a => a.status === 'Pending').length;

    // Top defaulters
    const defaulters = db.students
      .filter(s => curRecs.find(r => r.studentId === s.id && r.status === 'Unpaid'))
      .slice(0, 5).map(s => s.name).join(', ');

    // Staff count
    const teachers = db.staff.filter(s => s.designation === 'Teacher').length;

    // CRM leads
    const newLeads = db.leads.filter(l => l.stage === 'New').length;
    const followUps = db.leads.filter(l => new Date(l.followUp) <= new Date(today)).length;

    return {
      schoolName: db.settings.schoolName,
      session: db.settings.session,
      today,
      totalStudents, activeStudents,
      present, absent, attPct, attMarked: attVals.length,
      feeBilled, feeCollected, unpaidCount, partialCount,
      feeRecoveryPct: feeBilled ? Math.round(feeCollected / feeBilled * 100) : 0,
      defaulters,
      ongoingExam: ongoing ? `${ongoing.name} (${ongoing.start} to ${ongoing.end})` : null,
      upcomingExam: upcoming ? `${upcoming.name} starts ${upcoming.start}` : null,
      pendingApprovals,
      totalStaff: db.staff.length, teachers,
      newLeads, followUps,
      classes: db.classes.map(c => c.name),
      subjects: db.subjects,
      currentMonth: db.currentMonth
    };
  }

  /* ── AI response generator (rule-based NLP on live data) ── */
  function generateResponse(query) {
    const q = query.toLowerCase();
    const ctx = buildContext();
    const db = BS.db();

    // ── Attendance queries ──
    if (/attend|present|absent|haazri/.test(q)) {
      if (ctx.attPct === null) {
        return `Attendance for **${ctx.today}** has not been marked yet for all classes. Classes 9 and 10 are still pending.\n\nWould you like me to show the attendance summary for yesterday?`;
      }
      const status = ctx.attPct >= 90 ? '✅ Excellent' : ctx.attPct >= 75 ? '⚠️ Acceptable' : '🔴 Low';
      return `**Today's Attendance (${ctx.today})**\n\n| Metric | Value |\n|---|---|\n| Present | ${ctx.present} students |\n| Absent | ${ctx.absent} students |\n| Attendance % | **${ctx.attPct}%** ${status} |\n| Classes marked | ${ctx.attMarked > 0 ? 'Most classes' : 'None'} |\n\n${ctx.attPct < 80 ? '⚠️ Attendance is below 80%. Consider sending SMS alerts to parents of absent students.' : 'Attendance looks good today!'}`;
    }

    // ── Fee queries ──
    if (/fee|payment|paid|unpaid|challan|default|recover/.test(q)) {
      return `**Fee Summary — ${ctx.currentMonth}**\n\n| | Amount |\n|---|---|\n| Total Billed | ${BS.pkr(ctx.feeBilled)} |\n| Collected | ${BS.pkr(ctx.feeCollected)} |\n| Recovery Rate | **${ctx.feeRecoveryPct}%** |\n| Unpaid | ${ctx.unpaidCount} students |\n| Partial | ${ctx.partialCount} students |\n\n${ctx.unpaidCount > 0 ? `**Top defaulters:** ${ctx.defaulters || 'None found'}\n\n` : ''}${ctx.feeRecoveryPct < 80 ? '💡 Tip: Send fee reminders to unpaid families. Due date is the 10th.' : '✅ Fee recovery is on track this month.'}`;
    }

    // ── Student queries ──
    if (/student|enroll|admission|class strength|roll/.test(q)) {
      const byClass = {};
      db.students.forEach(s => { byClass[s.cls] = (byClass[s.cls] || 0) + 1; });
      const rows = Object.entries(byClass).map(([c, n]) => `| ${c} | ${n} |`).join('\n');
      return `**Student Enrollment — ${ctx.schoolName}**\n\nTotal: **${ctx.totalStudents}** students (${ctx.activeStudents} active)\n\n| Class | Students |\n|---|---|\n${rows}\n\n💡 Use the Students page to add, edit or filter students by class.`;
    }

    // ── Exam queries ──
    if (/exam|test|marks|result|paper|datesheet/.test(q)) {
      let resp = `**Exam Status**\n\n`;
      if (ctx.ongoingExam) resp += `🟡 **Ongoing:** ${ctx.ongoingExam}\n`;
      if (ctx.upcomingExam) resp += `🔵 **Upcoming:** ${ctx.upcomingExam}\n`;
      const e1 = db.exams.find(e => e.status === 'Completed');
      if (e1) resp += `✅ **Completed:** ${e1.name}\n`;

      // marks analysis for ongoing exam
      if (ctx.ongoingExam) {
        const marksEntered = Object.keys(db.marks.E2 || {}).length;
        resp += `\n**Marks Entry Progress (Mid-Term)**\nEntered for **${marksEntered}** of ${ctx.totalStudents} students.\n${marksEntered < ctx.totalStudents ? `\n⚠️ ${ctx.totalStudents - marksEntered} students still need marks entry.` : '\n✅ All marks entered.'}`;
      }
      return resp;
    }

    // ── Staff / HR queries ──
    if (/staff|teacher|hr|payroll|salary|leave|employee/.test(q)) {
      const pendingLeaves = db.leaves.filter(l => l.status === 'Pending').length;
      return `**Staff Overview**\n\n| | |\n|---|---|\n| Total Staff | ${ctx.totalStaff} |\n| Teachers | ${ctx.teachers} |\n| Pending Leaves | ${pendingLeaves} |\n\n**Departments:** Administration, Academics, Finance, Operations\n\n${pendingLeaves > 0 ? `⚠️ ${pendingLeaves} leave request(s) awaiting approval.` : '✅ No pending leave requests.'}`;
    }

    // ── Approvals ──
    if (/approv|pending|request|workflow/.test(q)) {
      const items = db.approvals.filter(a => a.status === 'Pending');
      if (!items.length) return '✅ No pending approvals at the moment. All requests have been processed.';
      const list = items.map(a => `- **${a.type}:** ${a.title}`).join('\n');
      return `**Pending Approvals (${items.length})**\n\n${list}\n\n💡 Go to the Approvals page to review and act on these requests.`;
    }

    // ── CRM / Admissions ──
    if (/crm|lead|admission|enqu|prospect|follow/.test(q)) {
      return `**Admissions CRM**\n\n| Stage | Count |\n|---|---|\n| New Leads | ${ctx.newLeads} |\n| Follow-ups Due | ${ctx.followUps} |\n| Total Leads | ${db.leads.length} |\n\n${ctx.followUps > 0 ? `⚠️ ${ctx.followUps} follow-up(s) are overdue. Check the CRM page.` : '✅ All follow-ups are up to date.'}`;
    }

    // ── Timetable ──
    if (/timetable|schedule|period|class time/.test(q)) {
      return `**Timetable**\n\nThe school runs **${db.periods.filter(p => p !== 'Break').length} periods** per day across **${db.days.length} days** (Monday–Saturday).\n\nSubjects taught: ${db.subjects.join(', ')}.\n\n💡 Open the Timetable page to view or print the full schedule for any class.`;
    }

    // ── Settings / school info ──
    if (/setting|school name|principal|contact|bank|session/.test(q)) {
      const s = db.settings;
      return `**School Information**\n\n| | |\n|---|---|\n| School | ${s.schoolName} |\n| Session | ${s.session} |\n| Principal | ${s.principal} |\n| Phone | ${s.phone} |\n| Email | ${s.email} |\n| Bank | ${s.bankName} |\n| Account | ${s.accountNo} |\n| Due Day | ${s.dueDay}th of each month |\n| Late Fine | ${BS.pkr(s.lateFine)} |`;
    }

    // ── Summary / overview ──
    if (/summary|overview|dashboard|report|status|today/.test(q)) {
      return `**School Summary — ${ctx.today}**\n\n**Students:** ${ctx.totalStudents} enrolled\n**Attendance:** ${ctx.attPct !== null ? ctx.attPct + '%' : 'Not fully marked'} today\n**Fee (${ctx.currentMonth}):** ${BS.pkr(ctx.feeCollected)} collected of ${BS.pkr(ctx.feeBilled)} (${ctx.feeRecoveryPct}%)\n**Pending Approvals:** ${ctx.pendingApprovals}\n**Exam:** ${ctx.ongoingExam || ctx.upcomingExam || 'No active exam'}\n**CRM Follow-ups Due:** ${ctx.followUps}\n\n---\nAsk me about any specific area for a detailed breakdown.`;
    }

    // ── Help ──
    if (/help|what can|feature|how to|guide/.test(q)) {
      return `I can help you with:\n\n- 📊 **Attendance** — today's stats, absent students, trends\n- 💰 **Fee** — collection summary, defaulters, recovery rate\n- 👨‍🎓 **Students** — enrollment, class strength, profiles\n- 📝 **Exams** — status, marks entry progress, results\n- 👩‍🏫 **Staff & HR** — staff list, leaves, payroll info\n- ✅ **Approvals** — pending requests summary\n- 📣 **CRM** — admission leads, follow-ups\n- 🗓️ **Timetable** — schedule overview\n- ⚙️ **Settings** — school info, bank details\n\nJust ask in plain English (or Urdu)!`;
    }

    // ── Urdu fallback ──
    if (/طالب|حاضری|فیس|امتحان/.test(q)) {
      return `آپ کا سوال موصول ہوا۔ ابھی اردو میں مکمل جواب کی سہولت محدود ہے، لیکن میں انگریزی میں مدد کر سکتا ہوں۔\n\nمثال کے طور پر: "attendance today", "fee summary", "pending approvals"`;
    }

    // ── Greeting ──
    if (/^(hi|hello|hey|salam|assalam|good\s*(morning|afternoon|evening))/.test(q)) {
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      return `${greet}! 👋 I'm **Mentor AI**, your ${ctx.schoolName} assistant.\n\nI have live access to your school data. You can ask me about attendance, fees, students, exams, staff, approvals, and more.\n\nWhat would you like to know today?`;
    }

    // ── Default ──
    return `I understand you're asking about: *"${query}"*\n\nI can provide insights on **attendance, fees, students, exams, staff, approvals, CRM, and timetable** using your live school data.\n\nTry asking:\n- "Show today's attendance"\n- "Fee collection this month"\n- "Any pending approvals?"\n- "Exam status"`;
  }

  /* ── Suggested follow-ups based on last AI response ── */
  const SUGGESTIONS = {
    attend: ['Show absent students', 'Attendance trend this week', 'Which class has lowest attendance?'],
    fee:    ['Show top defaulters', 'Fee collection last month', 'How to send fee reminders?'],
    student:['Students in Class 5', 'New admissions this year', 'Show class strength chart'],
    exam:   ['Marks entry progress', 'When is the next exam?', 'Show exam results'],
    staff:  ['Pending leave requests', 'Teacher list', 'Payroll this month'],
    default:['Show school summary', 'Pending approvals', 'CRM follow-ups due', 'Help']
  };

  function getSuggestions(response) {
    const r = response.toLowerCase();
    if (/attend/.test(r)) return SUGGESTIONS.attend;
    if (/fee|collect/.test(r)) return SUGGESTIONS.fee;
    if (/student|enroll/.test(r)) return SUGGESTIONS.student;
    if (/exam|marks/.test(r)) return SUGGESTIONS.exam;
    if (/staff|teacher/.test(r)) return SUGGESTIONS.staff;
    return SUGGESTIONS.default;
  }

  /* ── Render suggestions ── */
  function renderSuggestions(list) {
    sugRow.innerHTML = list.map(s =>
      `<button class="sug-chip" data-q="${BS.esc(s)}">${BS.esc(s)}</button>`
    ).join('');
    sugRow.querySelectorAll('.sug-chip').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.dataset.q));
    });
  }

  /* ── Simple markdown renderer ── */
  function renderMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^#{1,3}\s(.+)$/gm, '<strong>$1</strong>')
      .replace(/^\|\s*(.+?)\s*\|(.+)$/gm, (_, a, rest) => {
        const cells = [a, ...rest.split('|').filter(c => c.trim() && !/^[-\s]+$/.test(c))];
        return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
      })
      .replace(/(<tr>.*<\/tr>\n?)+/gs, m => `<table>${m}</table>`)
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.+)$/, '<p>$1</p>');
  }

  /* ── Append a message bubble ── */
  function appendMsg(role, text, id) {
    const isAI = role === 'ai';
    const db = BS.db();
    const initials = isAI ? 'AI' : BS.initials(BS.user ? BS.user.name : 'U');
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (id) div.id = id;
    div.innerHTML = `
      <div class="msg-avatar">${initials}</div>
      <div class="msg-body">
        <div class="msg-bubble">${isAI ? renderMd(text) : BS.esc(text)}</div>
        <div class="msg-meta">${time}${isAI ? ' · Mentor AI' : ''}</div>
        ${isAI ? `<div class="msg-actions">
          <button class="copy-btn" title="Copy"><i class="bi bi-clipboard me-1"></i>Copy</button>
          <button class="regen-btn" title="Regenerate"><i class="bi bi-arrow-clockwise me-1"></i>Retry</button>
        </div>` : ''}
      </div>`;

    if (isAI) {
      div.querySelector('.copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => BS.toast('Copied to clipboard', 'info'));
      });
      div.querySelector('.regen-btn').addEventListener('click', () => {
        const session = sessions.find(s => s.id === activeId);
        if (!session || session.messages.length < 2) return;
        const lastUser = [...session.messages].reverse().find(m => m.role === 'user');
        if (lastUser) { div.remove(); sendMessage(lastUser.text, true); }
      });
    }

    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
  }

  /* ── Typing indicator ── */
  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg ai'; div.id = 'typingIndicator';
    div.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-body"><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
  function hideTyping() { BS.qs('#typingIndicator')?.remove(); }

  /* ── Welcome screen ── */
  function showWelcome() {
    const db = BS.db();
    chatWindow.innerHTML = `
      <div class="welcome-screen">
        <div class="ai-logo"><i class="bi bi-stars"></i></div>
        <h2 class="h5 fw-bold">Mentor AI</h2>
        <p class="text-muted mb-3">Ask me anything about <strong>${BS.esc(db.settings.schoolName)}</strong>.<br>I have live access to students, fees, attendance, exams and more.</p>
        <div class="qp-grid mx-auto" style="max-width:420px">
          <div class="qp-card" data-q="Show today's attendance summary"><i class="bi bi-calendar-check"></i>Today's Attendance</div>
          <div class="qp-card" data-q="Fee collection this month"><i class="bi bi-cash-coin"></i>Fee Summary</div>
          <div class="qp-card" data-q="Any pending approvals?"><i class="bi bi-check2-square"></i>Pending Approvals</div>
          <div class="qp-card" data-q="Show school overview"><i class="bi bi-grid-1x2"></i>School Overview</div>
        </div>
      </div>`;
    chatWindow.querySelectorAll('.qp-card').forEach(c => {
      c.addEventListener('click', () => sendMessage(c.dataset.q));
    });
    renderSuggestions(SUGGESTIONS.default);
  }

  /* ── Session management ── */
  function newSession() {
    const id = 'sess_' + Date.now();
    sessions.unshift({ id, title: 'New Chat', messages: [], createdAt: new Date().toISOString() });
    activeId = id;
    saveSessions();
    renderHistory();
    showWelcome();
    updateStats();
  }

  function loadSession(id) {
    activeId = id;
    const session = sessions.find(s => s.id === id);
    chatWindow.innerHTML = '';
    if (!session || !session.messages.length) { showWelcome(); return; }
    session.messages.forEach(m => appendMsg(m.role, m.text));
    const last = session.messages.filter(m => m.role === 'ai').pop();
    if (last) renderSuggestions(getSuggestions(last.text));
    renderHistory();
    updateStats();
  }

  function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    saveSessions();
    if (activeId === id) {
      if (sessions.length) loadSession(sessions[0].id);
      else newSession();
    } else renderHistory();
  }

  function renderHistory() {
    if (!sessions.length) { historyList.innerHTML = `<div class="p-3 text-muted text-center" style="font-size:.8rem">No history yet</div>`; return; }
    historyList.innerHTML = sessions.map(s =>
      `<div class="history-item ${s.id === activeId ? 'active' : ''}" data-id="${s.id}">
        <i class="bi bi-chat-left-text"></i>
        <span class="hi-title">${BS.esc(s.title)}</span>
        <button class="hi-del btn btn-link p-0" data-del="${s.id}" title="Delete"><i class="bi bi-x"></i></button>
      </div>`
    ).join('');
    historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        loadSession(el.dataset.id);
      });
    });
    historyList.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deleteSession(btn.dataset.del); });
    });
  }

  /* ── Stats bar ── */
  function updateStats() {
    const session = sessions.find(s => s.id === activeId);
    const msgs = session ? session.messages.length : 0;
    aiStats.innerHTML = `
      <span><i class="bi bi-chat-dots"></i> ${msgs} messages</span>
      <span><i class="bi bi-lightning"></i> ~${tokenCount} tokens</span>
      <span class="text-success"><i class="bi bi-circle-fill" style="font-size:.5rem"></i> Live data</span>`;
  }

  /* ── Core send ── */
  function sendMessage(text, isRegen) {
    text = (text || '').trim();
    if (!text || isTyping) return;

    const session = sessions.find(s => s.id === activeId);
    if (!session) return;

    // Remove welcome screen
    BS.qs('.welcome-screen')?.closest('.chat-window') && (chatWindow.innerHTML = '');
    BS.qs('.welcome-screen')?.remove();

    if (!isRegen) {
      appendMsg('user', text);
      session.messages.push({ role: 'user', text, time: new Date().toISOString() });
      if (session.messages.length === 1) {
        session.title = text.length > 40 ? text.slice(0, 40) + '…' : text;
      }
    }

    chatInput.value = ''; charCount.textContent = '0 / 800';
    sendBtn.disabled = true; isTyping = true; sugRow.innerHTML = '';

    const delay = 600 + Math.random() * 800;
    showTyping();

    setTimeout(() => {
      hideTyping();
      const response = generateResponse(text);
      tokenCount += Math.round((text.length + response.length) / 4);
      appendMsg('ai', response);
      session.messages.push({ role: 'ai', text: response, time: new Date().toISOString() });
      saveSessions();
      renderHistory();
      renderSuggestions(getSuggestions(response));
      isTyping = false;
      sendBtn.disabled = false;
      updateStats();
    }, delay);

    saveSessions();
    updateStats();
  }

  /* ── Export chat ── */
  function exportChat() {
    const session = sessions.find(s => s.id === activeId);
    if (!session || !session.messages.length) { BS.toast('No messages to export', 'warning'); return; }
    const lines = session.messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
    const header = `Mentor AI Chat Export\nSession: ${session.title}\nDate: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n`;
    BS.download(`mentor-ai-${activeId}.txt`, header + lines, 'text/plain');
    BS.toast('Chat exported as .txt', 'success');
  }

  /* ── Init ── */
  document.addEventListener('bs:ready', () => {
    sessions = loadSessions();
    if (sessions.length) { activeId = sessions[0].id; loadSession(activeId); }
    else newSession();

    /* Input events */
    chatInput.addEventListener('input', () => {
      const len = chatInput.value.length;
      charCount.textContent = `${len} / 800`;
      sendBtn.disabled = !chatInput.value.trim() || isTyping;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput.value); }
    });

    sendBtn.addEventListener('click', () => sendMessage(chatInput.value));
    BS.qs('#newChatBtn').addEventListener('click', newSession);
    BS.qs('#clearBtn').addEventListener('click', async () => {
      if (await BS.confirm('Clear this conversation?', { ok: 'Clear', danger: true })) {
        const session = sessions.find(s => s.id === activeId);
        if (session) { session.messages = []; session.title = 'New Chat'; saveSessions(); }
        showWelcome(); renderHistory(); updateStats(); tokenCount = 0;
      }
    });
    BS.qs('#clearHistoryBtn').addEventListener('click', async () => {
      if (await BS.confirm('Delete all chat history?', { ok: 'Delete all', danger: true })) {
        sessions = []; saveSessions(); newSession(); BS.toast('History cleared', 'info');
      }
    });
    BS.qs('#exportBtn').addEventListener('click', exportChat);
    BS.qs('#voiceBtn').addEventListener('click', () => BS.toast('Voice input coming soon!', 'info'));
    BS.qs('#attachBtn').addEventListener('click', () => BS.toast('You can ask about any student, class or month directly in the chat.', 'info'));
  });
})();
