/* ==========================================================================
   data.js · Fake demo data for Bright School (all names/numbers are invented)
   BS.seed() returns a fresh, deterministic dataset. app.js stores it in
   localStorage so add / edit / delete persist; "Reset demo data" re-seeds.
   ========================================================================== */
(function () {
  'use strict';
  const BS = (window.BS = window.BS || {});

  BS.seed = function seed() {
    // ---- tiny seeded random generator (same data every reset) ----
    let s = 20261119;
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const addDays = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
    const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

    // ---- classes & fee structure (PKR) ----
    const classes = Array.from({ length: 10 }, (_, i) => ({ name: `Class ${i + 1}`, section: 'A', fee: 3000 + i * 500 }));
    const feeHeads = [
      { id: 'H1', name: 'Admission Fee', amount: 5000, freq: 'One-time' },
      { id: 'H2', name: 'Annual Fund', amount: 2500, freq: 'Yearly' },
      { id: 'H3', name: 'Transport', amount: 2500, freq: 'Monthly' },
      { id: 'H4', name: 'Exam Fee', amount: 1000, freq: 'Per term' },
      { id: 'H5', name: 'Late Fine', amount: 200, freq: 'Per challan' }
    ];

    // ---- 60 students ----
    const boys = ['Ahmed', 'Ali', 'Hassan', 'Hamza', 'Usman', 'Bilal', 'Zain', 'Faizan', 'Talha', 'Saad', 'Hammad', 'Daniyal', 'Arslan', 'Rayyan', 'Shahzaib', 'Umar', 'Abdullah', 'Ibrahim', 'Awais', 'Danish'];
    const girls = ['Ayesha', 'Fatima', 'Zainab', 'Maryam', 'Hira', 'Sana', 'Areeba', 'Iqra', 'Noor', 'Laiba', 'Mahnoor', 'Eman', 'Hoorain', 'Anaya', 'Dua', 'Rida', 'Kinza', 'Mehwish', 'Sidra', 'Aiman'];
    const surnames = ['Khan', 'Malik', 'Butt', 'Raza', 'Qureshi', 'Chaudhry', 'Siddiqui', 'Abbasi', 'Awan', 'Mirza', 'Sheikh', 'Rana', 'Hashmi', 'Gillani', 'Niazi'];
    const areas = ['Satellite Town', 'Bahria Town Phase 4', 'Saddar', 'Westridge', 'Chaklala Scheme 3', 'Adiala Road', 'Gulraiz', 'Peshawar Road', 'DHA Phase 2', 'Commercial Market'];
    const phone = () => '03' + pick(['00', '01', '11', '21', '33', '45']) + String(int(1000000, 9999999));

    const students = [];
    for (let i = 0; i < 60; i++) {
      const cls = classes[i % 10], clsNo = (i % 10) + 1;
      const female = rnd() < 0.48, sur = pick(surnames);
      students.push({
        id: `S-${1001 + i}`, rollNo: Math.floor(i / 10) + 1,
        name: `${pick(female ? girls : boys)} ${sur}`, gender: female ? 'Female' : 'Male',
        cls: cls.name, section: 'A', fatherName: `${pick(boys)} ${sur}`, phone: phone(),
        address: `House ${int(1, 240)}, Street ${int(1, 30)}, ${pick(areas)}, Rawalpindi`,
        dob: iso(new Date(2026 - (clsNo + 5), int(0, 11), int(1, 28))),
        admissionDate: `${2026 - int(0, Math.min(clsNo, 5))}-04-0${int(1, 9)}`,
        transport: rnd() < 0.3, discountPct: rnd() < 0.08 ? 10 : 0, status: 'Active'
      });
    }
    // Demonstration family account: two linked children, as a real parent portal expects.
    students[2].fatherName = 'Tariq Mehmood';
    students[12].fatherName = 'Tariq Mehmood';
    const parentLinks = [{ id: 'P-1001', name: 'Tariq Mehmood', studentIds: [students[2].id, students[12].id] }];

    // ---- fee records: last 6 months, one record per student per month ----
    const months = Array.from({ length: 6 }, (_, k) => monthKey(new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)));
    const curMonth = months[5];
    const feeRecords = [];
    let fr = 1;
    students.forEach((st) => {
      const base = classes.find((c) => c.name === st.cls).fee, trans = st.transport ? 2500 : 0;
      months.forEach((m) => {
        const total = Math.round((base + trans) * (1 - st.discountPct / 100));
        const r = rnd(), cur = m === curMonth;
        let status = 'Paid';
        if (cur) status = r < 0.52 ? 'Paid' : r < 0.64 ? 'Partial' : 'Unpaid';
        else status = r < 0.93 ? 'Paid' : r < 0.97 ? 'Partial' : 'Unpaid';
        const paid = status === 'Paid' ? total : status === 'Partial' ? Math.round(total / 2) : 0;
        const day = cur ? int(1, Math.max(1, now.getDate())) : int(3, 15);
        feeRecords.push({
          id: `FR-${fr++}`, studentId: st.id, month: m, tuition: base, transport: trans,
          discount: (base + trans) - total, total, paid, status,
          dueDate: `${m}-10`, paidOn: paid ? `${m}-${pad(day)}` : null, method: paid ? pick(['Cash', 'Bank']) : null,
          challanNo: `CH-${m.replace('-', '')}-${st.id.slice(2)}`
        });
      });
    });

    // ---- attendance: last 30 days (no Sundays). Classes 9 & 10 left unmarked today for the live demo ----
    const attendance = {};
    const tendency = {}; students.forEach((st) => (tendency[st.id] = 0.03 + rnd() * 0.08));
    for (let d = 29; d >= 0; d--) {
      const date = addDays(-d); if (date.getDay() === 0) continue;
      const key = iso(date), isToday = d === 0; attendance[key] = {};
      students.forEach((st) => {
        if (isToday && (st.cls === 'Class 9' || st.cls === 'Class 10')) return;
        const r = rnd(), p = tendency[st.id];
        attendance[key][st.id] = r < p ? 'A' : r < p + 0.03 ? 'L' : 'P';
      });
    }

    // ---- 15 staff ----
    const staffDefs = [
      ['Mrs. Rubina Akhtar', 'Principal', 'Administration', 185000, ''], ['Mr. Khalid Mehmood', 'Vice Principal', 'Administration', 140000, 'Mathematics'],
      ['Ms. Sadia Noreen', 'Teacher', 'Academics', 72000, 'English'], ['Mr. Imran Shah', 'Teacher', 'Academics', 68000, 'Mathematics'],
      ['Ms. Farah Naz', 'Teacher', 'Academics', 65000, 'Science'], ['Mr. Tahir Hussain', 'Teacher', 'Academics', 60000, 'Urdu'],
      ['Ms. Nazia Perveen', 'Teacher', 'Academics', 62000, 'Islamiyat'], ['Mr. Adeel Anwar', 'Teacher', 'Academics', 64000, 'Computer'],
      ['Ms. Humaira Bibi', 'Teacher', 'Academics', 58000, 'Social Studies'], ['Mr. Rashid Ali', 'Teacher', 'Academics', 66000, 'Science'],
      ['Ms. Amna Javed', 'Teacher', 'Academics', 55000, 'English'], ['Mr. Bilal Ahmed', 'Accountant', 'Finance', 75000, ''],
      ['Mr. Waqas Butt', 'Admin Officer', 'Administration', 60000, ''], ['Mr. Shafiq Ahmad', 'Clerk', 'Administration', 38000, ''],
      ['Mr. Ghulam Rasool', 'Support Staff', 'Operations', 28000, '']
    ];
    const staff = staffDefs.map((d, i) => ({
      id: `T-${101 + i}`, name: d[0], designation: d[1], department: d[2], salary: d[3], subject: d[4],
      gender: /^(Mrs|Ms)\./.test(d[0]) ? 'Female' : 'Male', phone: phone(),
      email: d[0].replace(/^(Mr|Mrs|Ms)\.\s/, '').toLowerCase().replace(/\s+/g, '.') + '@brightschool.pk',
      joinDate: `${2026 - int(1, 9)}-0${int(1, 9)}-1${int(0, 9)}`, status: 'Active'
    }));

    // ---- exams & marks (7 subjects x 100) ----
    const subjects = ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiyat', 'Social Studies', 'Computer'];
    const exams = [
      { id: 'E1', name: 'First Term 2026', start: '2026-09-14', end: '2026-09-25', status: 'Completed', totalMarks: 100 },
      { id: 'E2', name: 'Mid-Term (November)', start: iso(addDays(-3)), end: iso(addDays(6)), status: 'Ongoing', totalMarks: 100 },
      { id: 'E3', name: 'Final Term 2027', start: '2027-03-08', end: '2027-03-20', status: 'Upcoming', totalMarks: 100 }
    ];
    const marks = { E1: {}, E2: {}, E3: {} };
    students.forEach((st) => {
      const ability = 50 + rnd() * 35, clsNo = Number(st.cls.split(' ')[1]);
      const row = () => { const r = {}; subjects.forEach((sub) => (r[sub] = Math.max(20, Math.min(99, Math.round(ability + int(-12, 12)))))); return r; };
      marks.E1[st.id] = row();
      if (clsNo <= 8) marks.E2[st.id] = row(); // classes 9-10 left empty for the marks-entry demo
    });

    // ---- admission leads (CRM) ----
    const stages = ['New', 'Contacted', 'Visit Scheduled', 'Form Submitted', 'Enrolled'];
    const leadKids = ['Rohan Ali', 'Minahil Khan', 'Shayan Butt', 'Alishba Raza', 'Hashir Malik', 'Inaya Chaudhry', 'Mustafa Awan', 'Zara Siddiqui', 'Taimoor Abbasi', 'Hooriya Mirza', 'Ayan Sheikh', 'Sumbul Rana'];
    const leadStage = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4];
    const leads = leadKids.map((kid, i) => ({
      id: `L-${201 + i}`, child: kid, parent: `${pick(boys)} ${kid.split(' ')[1]}`, phone: phone(),
      applyingFor: `Class ${int(1, 8)}`, source: pick(['Facebook', 'Walk-in', 'Referral', 'Website', 'Banner']),
      stage: stages[leadStage[i]], followUp: iso(addDays(int(-3, 6))), note: pick(['Asked about transport', 'Wants fee concession', 'Visit with spouse', 'Comparing with nearby school', 'Interested in Urdu medium support']),
      createdAt: iso(addDays(-int(2, 25)))
    }));

    // ---- leave requests, approvals ----
    const leaves = [
      ['T-103', 'Sick Leave', 2, 3, 'Fever and flu', 'Pending'], ['T-105', 'Casual Leave', 5, 6, 'Family wedding in Lahore', 'Pending'],
      ['T-107', 'Annual Leave', 10, 14, 'Umrah trip', 'Pending'], ['T-109', 'Sick Leave', -6, -5, 'Dental surgery', 'Approved'],
      ['T-110', 'Casual Leave', -12, -12, 'Bank work', 'Approved'], ['T-114', 'Casual Leave', -2, -2, 'Personal', 'Rejected']
    ].map((l, i) => ({ id: `LV-${i + 1}`, staffId: l[0], type: l[1], from: iso(addDays(l[2])), to: iso(addDays(l[3])), reason: l[4], status: l[5] }));

    const approvals = [
      { type: 'Fee Discount', title: '15% sibling discount for S-1007', by: 'Mr. Bilal Ahmed', amount: 6000 },
      { type: 'Leave', title: 'Ms. Sadia Noreen · Sick leave (2 days)', by: 'Ms. Sadia Noreen', amount: null },
      { type: 'Fee Waiver', title: 'Late fine waiver for S-1023', by: 'Mr. Bilal Ahmed', amount: 200 },
      { type: 'Transfer Certificate', title: 'School leaving certificate for S-1040', by: 'Mr. Waqas Butt', amount: null },
      { type: 'Purchase', title: 'Whiteboard markers & chalk (Term 2)', by: 'Mr. Shafiq Ahmad', amount: 18500 },
      { type: 'Event Budget', title: 'Annual sports day budget', by: 'Mr. Khalid Mehmood', amount: 120000 },
      { type: 'Leave', title: 'Mr. Rashid Ali · Casual leave (1 day)', by: 'Mr. Rashid Ali', amount: null }
    ].map((a, i) => ({ id: `AP-${i + 1}`, ...a, date: iso(addDays(-int(0, 4))), status: i < 5 ? 'Pending' : i === 5 ? 'Approved' : 'Rejected' }));

    // ---- weekly timetable per class: timetable[class][day][period] ----
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const periods = ['08:00', '08:45', '09:30', 'Break', '10:30', '11:15', '12:00'];
    const teacherFor = (sub) => (staff.find((t) => t.subject === sub && t.designation === 'Teacher') || staff[2]).id;
    const timetable = {};
    classes.forEach((c, ci) => {
      timetable[c.name] = days.map((_, d) => periods.map((p, pi) => {
        if (p === 'Break') return null;
        const sub = subjects[(d * 2 + pi + ci) % subjects.length];
        return { subject: sub, teacherId: teacherFor(sub) };
      }));
    });

    // ---- announcements, activity, notifications ----
    const announcements = [
      { id: 'AN-1', title: 'Parent-teacher meeting', text: 'Held on Saturday 10:00 AM – 1:00 PM in the main hall.', date: iso(addDays(-1)), tag: 'Event' },
      { id: 'AN-2', title: 'Mid-term datesheet released', text: 'Classes 1–8 mid-term papers begin as per datesheet on the notice board.', date: iso(addDays(-3)), tag: 'Exam' },
      { id: 'AN-3', title: 'Fee due date reminder', text: `November fee is due on the 10th. A late fine of Rs 200 applies after that.`, date: iso(addDays(-6)), tag: 'Fee' },
      { id: 'AN-4', title: 'Winter uniform from 1 December', text: 'Blazers and sweaters in school colours are mandatory.', date: iso(addDays(-8)), tag: 'Notice' }
    ];
    const activity = [
      { icon: 'bi-cash-coin', text: 'Fee received from Hamza Qureshi – Rs 6,500', time: ago(12) },
      { icon: 'bi-person-plus', text: 'New admission lead: Rohan Ali (Class 3)', time: ago(55) },
      { icon: 'bi-calendar-check', text: 'Class 5 attendance marked by Ms. Farah Naz', time: ago(95) },
      { icon: 'bi-journal-text', text: 'Mid-Term marks entered for Class 7', time: ago(180) },
      { icon: 'bi-check2-square', text: 'Leave request approved for Mr. Rashid Ali', time: ago(300) },
      { icon: 'bi-megaphone', text: 'Announcement published: Parent-teacher meeting', time: ago(1500) }
    ];
    const notifications = [
      { id: 'N-1', icon: 'bi-hourglass-split', text: '5 requests are waiting for your approval', time: ago(20), read: false },
      { id: 'N-2', icon: 'bi-exclamation-circle', text: 'Class 9 and Class 10 attendance not marked today', time: ago(60), read: false },
      { id: 'N-3', icon: 'bi-person-plus', text: '3 admission follow-ups are due', time: ago(120), read: false },
      { id: 'N-4', icon: 'bi-cash-coin', text: 'Fee defaulter list updated', time: ago(400), read: true }
    ];

    const settings = {
      schoolName: 'Bright School', tagline: 'Learning that shines', address: 'Street 7, Satellite Town, Rawalpindi',
      phone: '051-4412345', email: 'info@brightschool.pk', principal: 'Mrs. Rubina Akhtar', session: '2026-27',
      bankName: 'Meezan Bank', accountTitle: 'Bright School', accountNo: '0123-4567890-01', dueDay: 10, lateFine: 200
    };

    return { version: 1, settings, classes, feeHeads, students, feeRecords, attendance, staff, subjects, exams, marks, stages, leads, leaves, approvals, days, periods, timetable, announcements, activity, notifications, parentLinks, payrollPayments: {}, auditLog: [], currentMonth: curMonth };
  };
})();
