/**
 * EduTrack - Renderer (v2)
 * All corrections from correction_for_edutrack.txt applied.
 */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  view: 'dashboard',
  week: currentWeekNumber(),
  students: [], courses: [], assignments: [],
  payments: [], indivPayments: [], credentials: [],
  theme: localStorage.getItem('theme') || 'light',
  archivedSemesters: JSON.parse(localStorage.getItem('archivedSemesters') || '[]'),
};

function currentWeekNumber() {
  // Return week 1-18 based on today's date vs semester start stored in localStorage
  const start = localStorage.getItem('semesterStart');
  if (!start) return 1;
  const diff = Math.floor((Date.now() - new Date(start)) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(18, diff));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'cls') e.className = v;
    else e.setAttribute(k, v);
  }
  children.forEach(c => c && (typeof c === 'string' ? e.append(c) : e.appendChild(c)));
  return e;
};

function initials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

function statusBadge(s) {
  const cls = { Completed:'badge-green','In Progress':'badge-blue','Not Started':'badge-gray',
    Late:'badge-red', Paid:'badge-green', Pending:'badge-yellow', Overdue:'badge-red' }[s]||'badge-gray';
  return `<span class="badge ${cls}">${s}</span>`;
}

function fmtRs(n) { return 'Rs ' + Number(n||0).toLocaleString('en-IN', {minimumFractionDigits:0}); }
function getStudent(id) { return State.students.find(s=>s.id===id)||{}; }
function getCourse(id)  { return State.courses.find(c=>c.id===id)||{}; }

// Week date range label
function weekDateRange(week) {
  const asgns = State.assignments.filter(a => a.week === week);
  if (!asgns.length) return '';
  const dates = asgns.map(a => a.due_date).filter(Boolean).sort();
  if (!dates.length) return '';
  const fmt = d => { const p = d.split('-'); return `${p[1]}/${p[2]}`; };
  return dates.length === 1 ? fmt(dates[0]) : `${fmt(dates[0])}-${fmt(dates[dates.length-1])}`;
}

const ICON = {
  x:     `<svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  edit:  `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="stroke:var(--danger)"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  copy:  `<svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  eye:   `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  plus:  `<svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = {
  _t: null,
  show(msg, type='success') {
    const t = $('#toast');
    const c = {success:'#22c55e',info:'#4F7CFF',error:'#ef4444',warning:'#f59e0b'}[type]||'#4F7CFF';
    t.innerHTML = `<div class="toast-dot" style="background:${c}"></div>${msg}`;
    t.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(()=>t.classList.remove('show'), 3400);
  }
};

// ── Modal ─────────────────────────────────────────────────────────────────────
const Modal = {
  open(html, wide=false) {
    const box = $('#modal-box');
    box.innerHTML = html;
    box.style.width = wide ? '700px' : '540px';
    $('#modal-overlay').classList.add('open');
    setTimeout(()=>{ const i=box.querySelector('input,select'); if(i) i.focus(); }, 60);
  },
  close() {
    $('#modal-overlay').classList.remove('open');
    $('#modal-box').innerHTML = '';
  },
  closeOnOverlay(e) { if (e.target===$('#modal-overlay')) this.close(); }
};

const closeBtn = () => `<button class="btn btn-icon" onclick="Modal.close()">${ICON.x}</button>`;

// ── Navigation ────────────────────────────────────────────────────────────────
const Nav = {
  go(view) {
    State.view = view;
    $$('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
    const titles = { dashboard:'Dashboard', students:'Students', courses:'Courses',
      assignments:'Assignments', payments:'Payments', credentials:'Student Credentials',
      reports:'Reports', import:'Import & Export' };
    $('#page-title').textContent = titles[view]||view;
    Views.render(view);
  }
};

// ── Views ─────────────────────────────────────────────────────────────────────
const Views = {
  async render(view) {
    const root = $('#content');
    root.innerHTML = '';
    const fn = this['render_'+view];
    if (fn) await fn.call(this, root);
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  async render_dashboard(root) {
    let stats;
    try { stats = await window.api.dashboard.stats(); } catch {
      stats = {
        totalStudents: State.students.length, totalCourses: State.courses.length,
        pendingAssign: State.assignments.filter(a=>a.status!=='Completed').length,
        dueThisWeek: 0,
        unpaidAmount: State.payments.filter(p=>p.status!=='Paid'&&p.earned).reduce((s,p)=>s+p.amount,0),
        upcomingDeadlines: State.assignments.filter(a=>a.status!=='Completed').slice(0,6),
        weeklyProgress: [], recentPayments: State.payments.filter(p=>p.earned).slice(0,5),
        studentProgress: State.students.map(s=>({id:s.id,name:s.name,total:0,done:0}))
      };
    }

    // Payment totals (earned only)
    const earnedPayments = (await window.api.payments.getAll().catch(()=>State.payments)).filter(p=>p.earned);
    const totalBilled  = earnedPayments.reduce((s,p)=>s+p.amount,0);
    const totalPaid    = earnedPayments.filter(p=>p.status==='Paid').reduce((s,p)=>s+p.amount,0);
    const totalPending = totalBilled - totalPaid;

    root.innerHTML = `
    <div class="grid-4">
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 24 24" style="stroke:#4F7CFF;width:20px;height:20px;fill:none;stroke-width:1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
        <div class="stat-label">Total Students</div><div class="stat-value">${stats.totalStudents}</div>
        <div class="stat-sub">Active enrollments</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 24 24" style="stroke:#22c55e;width:20px;height:20px;fill:none;stroke-width:1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
        <div class="stat-label">Active Courses</div><div class="stat-value">${stats.totalCourses}</div>
        <div class="stat-sub">This semester</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 24 24" style="stroke:#f59e0b;width:20px;height:20px;fill:none;stroke-width:1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
        <div class="stat-label">Pending Assignments</div><div class="stat-value">${stats.pendingAssign}</div>
        <div class="stat-sub">Due this week: ${stats.dueThisWeek}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 24 24" style="stroke:#ef4444;width:20px;height:20px;fill:none;stroke-width:1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
        <div class="stat-label">Unpaid Amount</div><div class="stat-value">${fmtRs(stats.unpaidAmount)}</div>
        <div class="stat-sub">Pending / Overdue</div>
      </div>
    </div>

    <!-- Payment summary till date -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Payment Summary — Till Date</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        <div style="text-align:center;padding:12px;background:var(--surface2);border-radius:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Total Billed</div>
          <div style="font-size:22px;font-weight:700">${fmtRs(totalBilled)}</div>
        </div>
        <div style="text-align:center;padding:12px;background:#dcfce7;border-radius:10px">
          <div style="font-size:11px;color:#15803d;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Collected</div>
          <div style="font-size:22px;font-weight:700;color:#15803d">${fmtRs(totalPaid)}</div>
        </div>
        <div style="text-align:center;padding:12px;background:#fee2e2;border-radius:10px">
          <div style="font-size:11px;color:#991b1b;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Pending</div>
          <div style="font-size:22px;font-weight:700;color:#991b1b">${fmtRs(totalPending)}</div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Upcoming Deadlines</span>
          <button class="btn btn-sm" onclick="Nav.go('assignments')">View all</button></div>
        ${(stats.upcomingDeadlines||[]).map(a=>`
          <div class="deadline-item">
            <div class="avatar">${initials(a.student_name||getStudent(a.student_id).name||'?')}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
              <div style="font-size:11px;color:var(--text3)">${a.course_name||''} · Wk ${a.week}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">${statusBadge(a.status)}<div style="font-size:11px;color:var(--text3)">${a.due_date||''}</div></div>
          </div>`).join('')||'<div class="empty-state" style="padding:20px"><div>All caught up!</div></div>'}
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Weekly Progress</span></div>
        ${(stats.weeklyProgress||[]).map(w=>{
          const pct=w.total?Math.round(w.done/w.total*100):0;
          return `<div class="metric-row">
            <span style="font-size:12px;min-width:48px">Week ${w.week}</span>
            <div style="flex:1;margin:0 10px"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>
            <span style="font-size:12px;color:var(--text2)">${w.done}/${w.total}</span>
          </div>`;
        }).join('')||'<div style="color:var(--text3);font-size:13px;padding:8px 0">No data yet</div>'}
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Earned Payments</span>
          <button class="btn btn-sm" onclick="Nav.go('payments')">View all</button></div>
        ${(stats.recentPayments||[]).map(p=>`
          <div class="metric-row">
            <div><div style="font-size:13px">${p.student_name||getStudent(p.student_id).name||''}</div>
              <div style="font-size:11px;color:var(--text3)">${p.course_name||''} · Wk ${p.week}</div></div>
            <div style="text-align:right">${statusBadge(p.status)}<div style="font-size:13px;font-weight:600">${fmtRs(p.amount)}</div></div>
          </div>`).join('')||'<div style="color:var(--text3);padding:8px 0;font-size:13px">No payments yet</div>'}
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Students at a Glance</span></div>
        ${(stats.studentProgress||[]).map(s=>{
          const pct=s.total?Math.round(s.done/s.total*100):0;
          return `<div class="metric-row" style="cursor:pointer" onclick="Nav.go('students')">
            <div style="display:flex;align-items:center;gap:8px"><div class="avatar">${initials(s.name)}</div><span style="font-size:13px">${s.name}</span></div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:64px"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>
              <span style="font-size:12px;color:var(--text2);min-width:34px;text-align:right">${pct}%</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },

  // ── Students ───────────────────────────────────────────────────────────────
  async render_students(root) {
    try { State.students = await window.api.students.getAll(); State.courses = await window.api.courses.getAll(); } catch {}
    root.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">All Students (${State.students.length})</span>
        <button class="btn btn-primary btn-sm" onclick="StudentForms.add()">${ICON.plus} Add Student</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>College</th><th>Email</th><th>Phone</th><th>LMS Login</th><th>Courses</th><th>Actions</th></tr></thead>
        <tbody>${State.students.map(s=>`<tr>
          <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">${initials(s.name)}</div>${s.name}</div></td>
          <td>${s.college||'—'}</td>
          <td>${s.email||'—'}</td>
          <td>${s.phone||'—'}</td>
          <td>
            ${s.login_link ? `<span class="copy-btn" onclick="copyValue(event,'${(s.login_link||'').replace(/'/g,"\\'")}','Login Link')" title="Copy link">${ICON.copy} ${s.login_link.replace(/https?:\/\//,'').slice(0,22)}…</span>` : '—'}
            ${s.password ? `&nbsp;<span class="copy-btn" onclick="copyValue(event,'${(s.password||'').replace(/'/g,"\\'")}','Password')" title="Copy password">${ICON.copy} ••••</span>` : ''}
          </td>
          <td><span class="badge badge-blue">${(s.courses||[]).length} courses</span></td>
          <td><div class="inline-actions">
            <button class="btn btn-icon btn-sm" onclick="StudentForms.view(${s.id})" title="View">${ICON.eye}</button>
            <button class="btn btn-icon btn-sm" onclick="StudentForms.edit(${s.id})" title="Edit">${ICON.edit}</button>
            <button class="btn btn-icon btn-sm" onclick="confirmDelete('student',${s.id},'${s.name.replace(/'/g,"\\'")}')" title="Delete">${ICON.trash}</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  },

  // ── Courses ────────────────────────────────────────────────────────────────
  async render_courses(root) {
    try { State.courses = await window.api.courses.getAll(); State.students = await window.api.students.getAll(); } catch {}
    root.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Course Catalog (${State.courses.length})</span>
        <button class="btn btn-primary btn-sm" onclick="CourseForms.add()">${ICON.plus} Add Course</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Course Name</th><th>Professor</th><th>Rate/week</th><th>Enrolled Students</th><th>Tools</th><th>Actions</th></tr></thead>
        <tbody>${State.courses.map(c=>{
          const enrolled = State.students.filter(s=>(s.courses||[]).includes(c.id));
          const weekRate = (c.rate||0) * (c.credits||1);
          const tools = c.tools ? c.tools.split(',').filter(Boolean) : [];
          return `<tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.professor||'—'}</td>
            <td>${fmtRs(weekRate)}/week</td>
            <td>${enrolled.map(s=>`<span class="badge badge-blue" style="margin:1px">${s.name}</span>`).join('')||'—'}</td>
            <td>${tools.map(t=>`<span class="badge badge-purple" style="margin:1px">${t.trim()}</span>`).join('')||'—'}</td>
            <td><div class="inline-actions">
              <button class="btn btn-icon btn-sm" onclick="CourseForms.edit(${c.id})" title="Edit">${ICON.edit}</button>
              <button class="btn btn-icon btn-sm" onclick="confirmDelete('course',${c.id},'${c.name.replace(/'/g,"\\'")}')">${ICON.trash}</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  },

  // ── Assignments ────────────────────────────────────────────────────────────
  async render_assignments(root) {
    try {
      State.assignments = await window.api.assignments.getAll();
      State.students    = await window.api.students.getAll();
      State.courses     = await window.api.courses.getAll();
    } catch {}

    // Default week = current week based on date
    if (!localStorage.getItem('semesterStart')) {
      // show prompt to set semester start
    }

    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    const cOpts = State.courses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');

    root.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Assignment Tracker</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="AssignForms.recurring()"># Recurring</button>
          <button class="btn btn-sm" onclick="AssignForms.bulk()">Bulk Add</button>
          <button class="btn btn-primary btn-sm" onclick="AssignForms.add()">${ICON.plus} Add</button>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Select Week</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2)">
            Semester start: <input type="date" id="sem-start" value="${localStorage.getItem('semesterStart')||''}"
              style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"
              onchange="setSemesterStart(this.value)"/>
          </div>
        </div>
        <div class="week-grid" id="week-grid"></div>
      </div>
      <div class="filter-row">
        <select class="filter-select" id="f-student" onchange="Views._refreshAssignTable()">
          <option value="">All Students</option>${sOpts}
        </select>
        <select class="filter-select" id="f-course" onchange="Views._refreshAssignTable()">
          <option value="">All Courses</option>${cOpts}
        </select>
        <select class="filter-select" id="f-status" onchange="Views._refreshAssignTable()">
          <option value="">All Status</option>
          <option>Not Started</option><option>In Progress</option><option>Completed</option><option>Late</option>
        </select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Course</th><th>Assignment</th><th>Type</th><th>Due Date</th><th>Status</th><th>Remarks</th><th>Actions</th></tr></thead>
        <tbody id="assign-tbody"></tbody>
      </table></div>
    </div>`;

    this._buildWeekGrid();
    this._refreshAssignTable();
  },

  _buildWeekGrid() {
    const grid = $('#week-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let w=1; w<=18; w++) {
      const wa = State.assignments.filter(a=>a.week===w);
      const hasItems = wa.length > 0;
      const allDone  = hasItems && wa.every(a=>a.status==='Completed');
      const range    = weekDateRange(w);
      let cls = 'week-cell';
      if (w === State.week) cls += ' active';
      if (allDone) cls += ' all-done';
      else if (hasItems) cls += ' has-items';
      const cell = el('div', { cls, onclick: ()=>{ State.week=w; this._buildWeekGrid(); this._refreshAssignTable(); }},
        el('div', { cls: 'week-num' }, `W${w}`),
        range ? el('div', { cls: 'week-range' }, range) : null
      );
      grid.appendChild(cell);
    }
  },

  _refreshAssignTable() {
    const tbody = $('#assign-tbody');
    if (!tbody) return;
    const sid = parseInt($('#f-student')?.value)||0;
    const cid = parseInt($('#f-course')?.value)||0;
    const st  = $('#f-status')?.value||'';
    let data = State.assignments.filter(a=>a.week===State.week);
    if (sid) data = data.filter(a=>a.student_id===sid);
    if (cid) data = data.filter(a=>a.course_id===cid);
    if (st)  data = data.filter(a=>a.status===st);
    data.sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div>No assignments for Week ${State.week}</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(a=>{
      const sname = a.student_name || getStudent(a.student_id).name || '';
      const cname = a.course_name  || getCourse(a.course_id).name  || '';
      const atype = a.atype||'';
      const safeId = a.id;
      const safeRem = (a.remarks||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:6px"><div class="avatar" style="width:22px;height:22px;font-size:9px">${initials(sname)}</div>${sname}</div></td>
        <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${cname}">${cname}</td>
        <td>${a.name}</td>
        <td>${atype ? `<span class="badge badge-purple" style="font-size:10px">${atype}</span>` : '—'}</td>
        <td>${a.due_date||'—'}</td>
        <td>
          <select class="inline-status-select" onchange="updateAssignStatus(${safeId},this.value)" style="font-size:11px;padding:2px 6px;border-radius:99px;border:0.5px solid var(--border2);background:var(--surface);color:var(--text);cursor:pointer">
            ${['Not Started','In Progress','Completed','Late'].map(s=>`<option${s===a.status?' selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          <input type="text" value="${safeRem}" placeholder="Add remark…"
            style="font-size:12px;padding:3px 7px;border:0.5px solid transparent;border-radius:6px;background:transparent;color:var(--text);width:130px;cursor:text"
            onfocus="this.style.borderColor='var(--accent)'"
            onblur="updateAssignRemark(${safeId},this.value);this.style.borderColor='transparent'"/>
        </td>
        <td><div class="inline-actions">
          ${a.status!=='Completed'?`<button class="btn btn-icon btn-sm" onclick="markAssignDone(${safeId})" title="Complete" style="color:var(--success)">${ICON.check}</button>`:''}
          <button class="btn btn-icon btn-sm" onclick="AssignForms.edit(${safeId})">${ICON.edit}</button>
          <button class="btn btn-icon btn-sm" onclick="confirmDelete('assignment',${safeId},'${a.name.replace(/'/g,"\\'")}')">${ICON.trash}</button>
        </div></td>
      </tr>`;
    }).join('');
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  async render_payments(root) {
    try {
      State.payments      = await window.api.payments.getAll();
      State.indivPayments = await window.api.indivPayments.getAll();
      State.students      = await window.api.students.getAll();
      State.courses       = await window.api.courses.getAll();
    } catch {}

    const earned = State.payments.filter(p=>p.earned);
    const total  = earned.reduce((s,p)=>s+p.amount,0);
    const paid   = earned.filter(p=>p.status==='Paid').reduce((s,p)=>s+p.amount,0);
    const pend   = total - paid;

    root.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total Billed (Till Date)</div><div class="stat-value" style="font-size:20px">${fmtRs(total)}</div></div>
      <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:20px;color:var(--success)">${fmtRs(paid)}</div></div>
      <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" style="font-size:20px;color:var(--danger)">${fmtRs(pend)}</div></div>
    </div>
    <div class="tab-row">
      <div class="tab active" id="tab-course" onclick="PayViews.show('course')">Course Payments</div>
      <div class="tab" id="tab-indiv" onclick="PayViews.show('indiv')">Individual Assignments</div>
    </div>
    <div id="pay-course-section">
      <div class="card">
        <div class="card-header"><span class="card-title">Course Payments (auto-calculated per week)</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Student</th><th>Course</th><th>Week</th><th>Amount</th><th>Status</th><th>Mode</th><th>Actions</th></tr></thead>
          <tbody>${earned.map(p=>{
            const sname = p.student_name||getStudent(p.student_id).name||'';
            const cname = p.course_name||getCourse(p.course_id).name||'';
            return `<tr>
              <td><div style="display:flex;align-items:center;gap:6px"><div class="avatar" style="width:22px;height:22px;font-size:9px">${initials(sname)}</div>${sname}</div></td>
              <td style="font-size:12px">${cname}</td>
              <td><span class="badge badge-gray">Wk ${p.week}</span></td>
              <td><strong>${fmtRs(p.amount)}</strong></td>
              <td>${statusBadge(p.status)}</td>
              <td><span class="badge badge-gray">${p.mode||'—'}</span></td>
              <td><div class="inline-actions">
                ${p.status!=='Paid'?`<button class="btn btn-icon btn-sm" onclick="markPayPaid(${p.id})" title="Mark paid" style="color:var(--success)">${ICON.check}</button>`:''}
                <button class="btn btn-icon btn-sm" onclick="PayForms.edit(${p.id})">${ICON.edit}</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    </div>
    <div id="pay-indiv-section" style="display:none">
      <div class="card">
        <div class="card-header"><span class="card-title">Individual Assignment Payments</span>
          <button class="btn btn-primary btn-sm" onclick="PayForms.addIndiv()">${ICON.plus} Add</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Student</th><th>Assignment</th><th>Start</th><th>Due</th><th>Price</th><th>Status</th><th>Remarks</th><th>Actions</th></tr></thead>
          <tbody>${State.indivPayments.map(p=>{
            const sname = p.student_name||getStudent(p.student_id).name||'';
            return `<tr>
              <td>${sname}</td><td>${p.name}</td><td>${p.start_date||'—'}</td><td>${p.due_date||'—'}</td>
              <td><strong>${fmtRs(p.price)}</strong></td><td>${statusBadge(p.status)}</td>
              <td style="color:var(--text2);font-size:12px">${p.remarks||'—'}</td>
              <td><div class="inline-actions">
                <button class="btn btn-icon btn-sm" onclick="PayForms.editIndiv(${p.id})">${ICON.edit}</button>
                <button class="btn btn-icon btn-sm" onclick="confirmDelete('indivPayment',${p.id},'${p.name.replace(/'/g,"\\'")}')">${ICON.trash}</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    </div>`;
  },

  // ── Student Credentials ────────────────────────────────────────────────────
  async render_credentials(root) {
    try {
      State.credentials = await window.api.labs.getAll();
      State.students    = await window.api.students.getAll();
    } catch {}
    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

    root.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Student Credentials</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="filter-select" id="f-cred-student" onchange="Views._refreshCreds()">
            <option value="">All Students</option>${sOpts}
          </select>
          <button class="btn btn-primary btn-sm" onclick="CredForms.add()">${ICON.plus} Add Credential</button>
        </div>
      </div>
      <div id="creds-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>
    </div>`;
    this._refreshCreds();
  },

  _refreshCreds() {
    const sid  = parseInt($('#f-cred-student')?.value)||0;
    const data = sid ? State.credentials.filter(c=>c.student_id===sid) : State.credentials;
    const grid = $('#creds-grid');
    if (!grid) return;

    // Group by student
    const byStudent = {};
    data.forEach(c => {
      const key = c.student_id;
      if (!byStudent[key]) byStudent[key] = { name: c.student_name||getStudent(c.student_id).name||'', items:[] };
      byStudent[key].items.push(c);
    });

    grid.innerHTML = Object.values(byStudent).map(grp=>`
      <div class="lab-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div class="avatar" style="width:36px;height:36px;font-size:13px">${initials(grp.name)}</div>
          <div style="flex:1;font-size:13px;font-weight:600">${grp.name}</div>
          <button class="btn btn-sm" onclick="CredForms.addForStudent(${grp.items[0].student_id})">${ICON.plus} Add</button>
        </div>
        ${grp.items.map(c=>`
          <div class="cred-row" style="align-items:flex-start;padding:6px 0">
            <div style="min-width:0;flex:1">
              <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:2px">${c.site_name||c.hostname||'Credential'}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${c.username ? `<span style="font-family:var(--font-mono,monospace);font-size:11px;background:var(--surface2);padding:2px 6px;border-radius:4px">${c.username}</span>
                  <span class="copy-btn" onclick="copyValue(event,'${(c.username||'').replace(/'/g,"\\'")}','Username')" title="Copy">${ICON.copy}</span>` : ''}
                ${c.password ? `<span style="font-family:var(--font-mono,monospace);font-size:11px;background:var(--surface2);padding:2px 6px;border-radius:4px">••••••</span>
                  <span class="copy-btn" onclick="copyValue(event,'${(c.password||'').replace(/'/g,"\\'")}','Password')" title="Copy password">${ICON.copy}</span>` : ''}
                ${c.url ? `<a href="#" onclick="window.api.openExternal('${c.url}')" style="font-size:11px;color:var(--accent)">${c.url.slice(0,30)}</a>` : ''}
                ${c.notes ? `<span style="font-size:11px;color:var(--text3)">${c.notes}</span>` : ''}
              </div>
            </div>
            <div class="inline-actions" style="flex-shrink:0;margin-left:6px">
              <button class="btn btn-icon btn-sm" onclick="CredForms.edit(${c.id})">${ICON.edit}</button>
              <button class="btn btn-icon btn-sm" onclick="confirmDelete('credential',${c.id},'${(c.site_name||'credential').replace(/'/g,"\\'")}')">${ICON.trash}</button>
            </div>
          </div>`).join('<hr style="border:none;border-top:0.5px solid var(--border);margin:2px 0"/>')}
      </div>`).join('')||
      '<div class="empty-state" style="grid-column:1/-1"><div>No credentials yet</div></div>';
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  async render_reports(root) {
    try {
      State.students    = await window.api.students.getAll();
      State.assignments = await window.api.assignments.getAll();
      State.payments    = await window.api.payments.getAll();
      State.courses     = await window.api.courses.getAll();
    } catch {}
    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    root.innerHTML = `
    <div style="display:grid;grid-template-columns:280px 1fr;gap:16px">
      <div class="card" style="align-self:start">
        <div class="card-header"><span class="card-title">Generate Report</span></div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Report Type</label>
          <select id="r-type" onchange="Reports.generate()">
            <option value="student-weekly">Student — Weekly Progress</option>
            <option value="student-course">Student — Course & Assignment</option>
            <option value="payment-student">Payments — By Student</option>
            <option value="late">Late Submissions</option>
            <option value="pending">All Pending Assignments</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Student *</label>
          <select id="r-student" onchange="Reports.generate()">
            <option value="">All Students</option>${sOpts}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Week (optional)</label>
          <select id="r-week" onchange="Reports.generate()">
            <option value="">All Weeks</option>
            ${Array.from({length:18},(_,i)=>`<option value="${i+1}">Week ${i+1}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="Reports.generate()">Generate</button>
      </div>
      <div class="card" id="report-output" style="min-height:300px">
        <div class="empty-state"><div>Select options and click Generate</div></div>
      </div>
    </div>`;
  },

  // ── Import/Export ──────────────────────────────────────────────────────────
  async render_import(root) {
    root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Import Data</span></div>
        <div class="drop-zone" onclick="IO.importExcel()" ondragover="IO.dragOver(event)" ondrop="IO.drop(event)">
          <svg viewBox="0 0 24 24" style="width:32px;height:32px;stroke:var(--text3);fill:none;stroke-width:1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style="font-size:13px;color:var(--text2);margin-bottom:4px">Drag & drop Excel file here</div>
          <div style="font-size:12px;color:var(--text3)">or click to browse</div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="IO.importExcel()">Import from Excel</button>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Export Data</span></div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
          <button class="btn" onclick="IO.exportCsv('assignments')">Export Assignments (CSV)</button>
          <button class="btn" onclick="IO.exportPaymentsXlsx()">Export Payments (Excel — Course + Individual sheets)</button>
          <button class="btn" onclick="IO.exportCsv('students')">Export Students (CSV)</button>
          <button class="btn" onclick="IO.exportCsv('labs')">Export Credentials (CSV)</button>
        </div>
        <div style="padding-top:16px;border-top:0.5px solid var(--border)">
          <div class="card-title" style="margin-bottom:10px">Backup & Restore</div>
          <div style="display:flex;gap:8px">
            <button class="btn" style="flex:1" onclick="IO.backup()">Backup DB</button>
            <button class="btn" style="flex:1" onclick="IO.restore()">Restore DB</button>
          </div>
        </div>
        <div style="padding-top:16px;border-top:0.5px solid var(--border);margin-top:16px">
          <div class="card-title" style="margin-bottom:10px;color:var(--warning)">Archive Semester</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:10px">Archives all current data and starts fresh for a new semester.</p>
          <button class="btn" style="width:100%;border-color:var(--warning);color:var(--warning)" onclick="IO.archiveSemester()">Archive & Start New Semester</button>
        </div>
      </div>
    </div>`;
  },
};

// ── Inline assignment updates (from table dropdowns/inputs) ───────────────────
async function updateAssignStatus(id, status) {
  try {
    const a = State.assignments.find(x=>x.id===id);
    if (!a) return;
    await window.api.assignments.update(id, { ...a, status });
    State.assignments = await window.api.assignments.getAll();
  } catch { const a=State.assignments.find(x=>x.id===id); if(a) a.status=status; }
  Views._buildWeekGrid();
  Toast.show(`Status updated to "${status}"`, 'info');
}

async function updateAssignRemark(id, remarks) {
  try {
    const a = State.assignments.find(x=>x.id===id);
    if (!a || a.remarks === remarks) return;
    await window.api.assignments.update(id, { ...a, remarks });
    State.assignments = await window.api.assignments.getAll();
  } catch { const a=State.assignments.find(x=>x.id===id); if(a) a.remarks=remarks; }
}

function setSemesterStart(val) {
  localStorage.setItem('semesterStart', val);
  State.week = currentWeekNumber();
  Views._buildWeekGrid();
  Views._refreshAssignTable();
  Toast.show('Semester start set — week auto-selected', 'info');
}

// ── Student Forms ─────────────────────────────────────────────────────────────
const StudentForms = {
  _modal(s={}) {
    const cOpts = State.courses.map(c=>
      `<option value="${c.id}"${(s.courses||[]).includes(c.id)?' selected':''}>${c.name}</option>`).join('');
    return `
    <div class="modal-header"><span class="modal-title">${s.id?'Edit':'Add'} Student</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Full Name *</label><input id="s-name" value="${s.name||''}"/></div>
      <div class="form-group"><label>College</label><input id="s-college" value="${s.college||''}"/></div>
      <div class="form-group"><label>Email</label><input id="s-email" type="email" value="${s.email||''}"/></div>
      <div class="form-group"><label>Phone</label><input id="s-phone" value="${s.phone||''}"/></div>
      <div class="form-group"><label>Telegram ID</label><input id="s-telegram" value="${s.telegram_id||''}"/></div>
      <div class="form-group"><label>Username (LMS)</label><input id="s-username" value="${s.username||''}"/></div>
      <div class="form-group"><label>Password ${s.id?'(blank=keep)':''}</label><input id="s-password" type="password"/></div>
      <div class="form-group"><label>LMS Login Link</label><input id="s-link" value="${s.login_link||''}"/></div>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label>Enrolled Courses (hold Ctrl/Cmd for multiple)</label>
      <select id="s-courses" multiple style="height:110px">${cOpts}</select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="StudentForms.save(${s.id||0})">Save Student</button>
    </div>`;
  },
  async add() {
    try { State.courses = await window.api.courses.getAll(); } catch {}
    Modal.open(this._modal());
  },
  async edit(id) {
    try { State.courses=await window.api.courses.getAll(); State.students=await window.api.students.getAll(); } catch {}
    Modal.open(this._modal(State.students.find(x=>x.id===id)||{}));
  },
  async view(id) {
    const s = State.students.find(x=>x.id===id)||{};
    const asgns = State.assignments.filter(a=>a.student_id===id);
    const pays  = State.payments.filter(p=>p.student_id===id&&p.earned);
    const done  = asgns.filter(a=>a.status==='Completed').length;
    const unpaid= pays.filter(p=>p.status!=='Paid').reduce((t,p)=>t+p.amount,0);
    Modal.open(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="width:42px;height:42px;font-size:15px">${initials(s.name)}</div>
        <div><div class="modal-title">${s.name}</div><div style="font-size:12px;color:var(--text2)">${s.college||''}</div></div>
      </div>${closeBtn()}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:14px;font-size:13px">
      <div><span style="color:var(--text2)">Email:</span> ${s.email||'—'}</div>
      <div><span style="color:var(--text2)">Phone:</span> ${s.phone||'—'}</div>
      <div><span style="color:var(--text2)">Telegram:</span> ${s.telegram_id||'—'}</div>
      <div><span style="color:var(--text2)">Username:</span> ${s.username||'—'}</div>
      ${s.login_link?`<div style="grid-column:1/-1"><span style="color:var(--text2)">LMS:</span>
        <a href="#" onclick="window.api.openExternal('${s.login_link}')" style="color:var(--accent)">${s.login_link}</a>
        <span class="copy-btn" onclick="copyValue(event,'${(s.login_link||'').replace(/'/g,"\\'")}','Login Link')">${ICON.copy}</span>
        <span class="copy-btn" onclick="copyValue(event,'${(s.password||'').replace(/'/g,"\\'")}','Password')">${ICON.copy} pw</span>
      </div>`:''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div style="background:var(--surface2);padding:10px;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:600">${asgns.length}</div><div style="font-size:11px;color:var(--text2)">Assignments</div></div>
      <div style="background:var(--surface2);padding:10px;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:600;color:var(--success)">${done}</div><div style="font-size:11px;color:var(--text2)">Completed</div></div>
      <div style="background:var(--surface2);padding:10px;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:600;color:var(--danger)">${fmtRs(unpaid)}</div><div style="font-size:11px;color:var(--text2)">Unpaid</div></div>
    </div>
    <div style="font-weight:600;font-size:12px;margin-bottom:8px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Courses</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
      ${(s.courses||[]).map(cid=>`<span class="badge badge-blue">${getCourse(cid).name||cid}</span>`).join('')||'<span style="color:var(--text3)">None</span>'}
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Close</button>
      <button class="btn btn-primary" onclick="Modal.close();StudentForms.edit(${id})">Edit</button>
    </div>`);
  },
  async save(id) {
    const name = $('#s-name').value.trim();
    if (!name) { Toast.show('Name required','error'); return; }
    const courses = Array.from($('#s-courses').selectedOptions).map(o=>parseInt(o.value));
    const data = { name, courses, college:$('#s-college').value, email:$('#s-email').value,
      phone:$('#s-phone').value, telegram_id:$('#s-telegram').value,
      username:$('#s-username').value, login_link:$('#s-link').value,
      password:$('#s-password').value||undefined };
    try {
      if (id) await window.api.students.update(id, data);
      else    await window.api.students.add(data);
      State.students = await window.api.students.getAll();
    } catch {}
    Modal.close(); Views.render('students'); Toast.show(id?'Student updated':'Student added');
  }
};

// ── Course Forms ──────────────────────────────────────────────────────────────
const CourseForms = {
  _modal(c={}) {
    const sOpts = State.students.map(s=>
      `<option value="${s.id}"${(s.courses||[]).includes(c.id)?' selected':''}>${s.name}</option>`).join('');
    const toolList = ['VS Code','IntelliJ IDEA','PyCharm','GitHub','Excel','MySQL Workbench',
      'Postman','Docker','Jupyter','Eclipse','NetBeans','Android Studio','Figma','Slack'];
    const selTools = (c.tools||'').split(',').map(t=>t.trim()).filter(Boolean);
    return `
    <div class="modal-header"><span class="modal-title">${c.id?'Edit':'Add'} Course</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group col-span-2"><label>Course Name *</label><input id="c-name" value="${c.name||''}"/></div>
      <div class="form-group"><label>Professor</label><input id="c-prof" value="${c.professor||''}"/></div>
      <div class="form-group"><label>Rate (Rs/hr)</label><input id="c-rate" type="number" value="${c.rate||500}"/></div>
      <div class="form-group"><label>Credit Hours (×rate = weekly charge)</label><input id="c-credits" type="number" min="1" max="6" value="${c.credits||3}"/></div>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Enrolled Students</label>
      <select id="c-students" multiple style="height:100px">${sOpts}</select>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label>Required Tools (hold Ctrl/Cmd for multiple)</label>
      <select id="c-tools" multiple style="height:90px">
        ${toolList.map(t=>`<option${selTools.includes(t)?' selected':''}>${t}</option>`).join('')}
        <option value="__custom">+ Custom tool…</option>
      </select>
      <input id="c-custom-tool" placeholder="Custom tool name (optional)" style="margin-top:6px;padding:6px 10px;border:0.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;width:100%;font-family:inherit"/>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="CourseForms.save(${c.id||0})">Save Course</button>
    </div>`;
  },
  async add() {
    try { State.students = await window.api.students.getAll(); } catch {}
    Modal.open(this._modal(), true);
  },
  async edit(id) {
    try { State.students = await window.api.students.getAll(); State.courses = await window.api.courses.getAll(); } catch {}
    Modal.open(this._modal(State.courses.find(c=>c.id===id)||{}), true);
  },
  async save(id) {
    const name = $('#c-name').value.trim();
    if (!name) { Toast.show('Name required','error'); return; }
    const tools = [...Array.from($('#c-tools').selectedOptions).map(o=>o.value).filter(v=>v!=='__custom'),
      ...($('#c-custom-tool').value.trim() ? [$('#c-custom-tool').value.trim()] : [])].join(',');
    const data = { name, professor:$('#c-prof').value, credits:parseInt($('#c-credits').value)||3,
      rate:parseFloat($('#c-rate').value)||500, tools };
    try {
      let cid = id;
      if (id) await window.api.courses.update(id, data);
      else    cid = await window.api.courses.add(data);
      // Update enrollments: add selected students to this course
      const selStudents = Array.from($('#c-students').selectedOptions).map(o=>parseInt(o.value));
      for (const sid of selStudents) {
        const s = State.students.find(x=>x.id===sid);
        if (s && !((s.courses||[]).includes(cid))) {
          await window.api.enrollments.set(sid, [...(s.courses||[]), cid]);
        }
      }
      State.courses  = await window.api.courses.getAll();
      State.students = await window.api.students.getAll();
    } catch {}
    Modal.close(); Views.render('courses'); Toast.show(id?'Course updated':'Course added');
  }
};

// ── Assignment Forms ──────────────────────────────────────────────────────────
const ASSIGN_TYPES = ['Weekly Assignment','Quiz','Discussion','Midterm Exam','Final Exam','Group Project','Solo Project','Lab','Reading','Other'];

const AssignForms = {
  _sOpts(sel) { return State.students.map(s=>`<option value="${s.id}"${s.id===sel?' selected':''}>${s.name}</option>`).join(''); },
  _cOpts(sel) { return State.courses.map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${c.name}</option>`).join(''); },
  _typeOpts(sel) { return ASSIGN_TYPES.map(t=>`<option${t===sel?' selected':''}>${t}</option>`).join(''); },

  add() {
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Add Assignment</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="a-sid">${this._sOpts()}</select></div>
      <div class="form-group"><label>Course</label><select id="a-cid">${this._cOpts()}</select></div>
      <div class="form-group col-span-2"><label>Assignment Name *</label><input id="a-name"/></div>
      <div class="form-group"><label>Type</label><select id="a-type">${this._typeOpts()}</select></div>
      <div class="form-group"><label>Week</label><input id="a-week" type="number" min="1" max="18" value="${State.week}"/></div>
      <div class="form-group"><label>Due Date</label><input id="a-due" type="date"/></div>
      <div class="form-group"><label>Status</label>
        <select id="a-status"><option>Not Started</option><option>In Progress</option><option>Completed</option><option>Late</option></select>
      </div>
      <div class="form-group col-span-2"><label>Remarks</label><textarea id="a-remarks"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="AssignForms.save(0)">Save</button>
    </div>`);
  },

  edit(id) {
    const a = State.assignments.find(x=>x.id===id)||{};
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Edit Assignment</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="a-sid">${this._sOpts(a.student_id)}</select></div>
      <div class="form-group"><label>Course</label><select id="a-cid">${this._cOpts(a.course_id)}</select></div>
      <div class="form-group col-span-2"><label>Assignment Name *</label><input id="a-name" value="${a.name||''}"/></div>
      <div class="form-group"><label>Type</label><select id="a-type">${this._typeOpts(a.atype||'')}</select></div>
      <div class="form-group"><label>Week</label><input id="a-week" type="number" min="1" max="18" value="${a.week||State.week}"/></div>
      <div class="form-group"><label>Due Date</label><input id="a-due" type="date" value="${a.due_date||''}"/></div>
      <div class="form-group"><label>Status</label>
        <select id="a-status">${['Not Started','In Progress','Completed','Late'].map(s=>`<option${s===a.status?' selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group col-span-2"><label>Remarks</label><textarea id="a-remarks">${a.remarks||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="AssignForms.save(${id})">Save</button>
    </div>`);
  },

  bulk() {
    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Bulk Add Assignments</span>${closeBtn()}</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Add one assignment to multiple students at once.</p>
    <div class="form-grid">
      <div class="form-group col-span-2"><label>Assignment Name *</label><input id="b-name"/></div>
      <div class="form-group"><label>Course</label><select id="b-cid">${this._cOpts()}</select></div>
      <div class="form-group"><label>Type</label><select id="b-type">${this._typeOpts()}</select></div>
      <div class="form-group"><label>Week</label><input id="b-week" type="number" min="1" max="18" value="${State.week}"/></div>
      <div class="form-group"><label>Due Date</label><input id="b-due" type="date"/></div>
    </div>
    <div class="form-group"><label>Students (Ctrl/Cmd = multi-select)</label>
      <select id="b-students" multiple style="height:130px">${sOpts}</select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="AssignForms.saveBulk()">Add for Selected</button>
    </div>`);
  },

  recurring() {
    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Add Recurring Assignment</span>${closeBtn()}</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Create the same assignment for multiple weeks automatically.</p>
    <div class="form-grid">
      <div class="form-group col-span-2"><label>Assignment Name *</label>
        <input id="r-name" placeholder="e.g. Weekly Quiz"/>
      </div>
      <div class="form-group"><label>Type</label><select id="r-type-a">${this._typeOpts('Quiz')}</select></div>
      <div class="form-group"><label>Course</label><select id="r-cid">${this._cOpts()}</select></div>
      <div class="form-group"><label>From Week</label><input id="r-wfrom" type="number" min="1" max="18" value="1"/></div>
      <div class="form-group"><label>To Week</label><input id="r-wto" type="number" min="1" max="18" value="18"/></div>
      <div class="form-group"><label>Due Day of Week</label>
        <select id="r-day"><option value="0">Sunday</option><option value="1">Monday</option>
          <option value="2">Tuesday</option><option value="3">Wednesday</option>
          <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
        </select>
      </div>
      <div class="form-group"><label>Status</label>
        <select id="r-status"><option>Not Started</option><option>In Progress</option><option>Completed</option></select>
      </div>
    </div>
    <div class="form-group"><label>Students (Ctrl/Cmd = multi-select)</label>
      <select id="r-students" multiple style="height:120px">${sOpts}</select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="AssignForms.saveRecurring()">Create Recurring</button>
    </div>`, true);
  },

  async save(id) {
    const name = $('#a-name').value.trim();
    if (!name) { Toast.show('Assignment name required','error'); return; }
    const data = { student_id:parseInt($('#a-sid').value), course_id:parseInt($('#a-cid').value),
      week:parseInt($('#a-week').value), name, atype:$('#a-type').value,
      due_date:$('#a-due').value, status:$('#a-status').value, remarks:$('#a-remarks').value };
    try {
      if (id) await window.api.assignments.update(id, data);
      else    await window.api.assignments.add(data);
      State.assignments = await window.api.assignments.getAll();
    } catch {}
    Modal.close(); Views._buildWeekGrid(); Views._refreshAssignTable();
    Toast.show(id?'Assignment updated':'Assignment added');
  },

  async saveBulk() {
    const name = $('#b-name').value.trim();
    if (!name) { Toast.show('Name required','error'); return; }
    const sids = Array.from($('#b-students').selectedOptions).map(o=>parseInt(o.value));
    if (!sids.length) { Toast.show('Select at least one student','error'); return; }
    const items = sids.map(sid=>({ student_id:sid, course_id:parseInt($('#b-cid').value),
      week:parseInt($('#b-week').value), name, atype:$('#b-type').value,
      due_date:$('#b-due').value, status:'Not Started', remarks:'' }));
    try { await window.api.assignments.addBulk(items); State.assignments = await window.api.assignments.getAll(); } catch {}
    Modal.close(); Views._buildWeekGrid(); Views._refreshAssignTable();
    Toast.show(`Added for ${sids.length} student(s)`);
  },

  async saveRecurring() {
    const name   = $('#r-name').value.trim();
    const wfrom  = parseInt($('#r-wfrom').value)||1;
    const wto    = parseInt($('#r-wto').value)||18;
    const sids   = Array.from($('#r-students').selectedOptions).map(o=>parseInt(o.value));
    const cid    = parseInt($('#r-cid').value);
    const atype  = $('#r-type-a').value;
    const status = $('#r-status').value;
    const semStart = localStorage.getItem('semesterStart');

    if (!name) { Toast.show('Name required','error'); return; }
    if (!sids.length) { Toast.show('Select at least one student','error'); return; }

    const items = [];
    for (let w=wfrom; w<=wto; w++) {
      let due_date = '';
      if (semStart) {
        const d = new Date(semStart);
        d.setDate(d.getDate() + (w-1)*7 + parseInt($('#r-day').value));
        due_date = d.toISOString().slice(0,10);
      }
      sids.forEach(sid => items.push({ student_id:sid, course_id:cid, week:w,
        name:`${name} (Wk ${w})`, atype, due_date, status, remarks:'' }));
    }
    try { await window.api.assignments.addBulk(items); State.assignments = await window.api.assignments.getAll(); } catch {}
    Modal.close(); Views._buildWeekGrid(); Views._refreshAssignTable();
    Toast.show(`Created ${items.length} recurring assignments (Wk ${wfrom}–${wto})`);
  }
};

// ── Payment Forms ─────────────────────────────────────────────────────────────
const PayForms = {
  edit(id) {
    const p = State.payments.find(x=>x.id===id)||{};
    const sOpts = State.students.map(s=>`<option value="${s.id}"${s.id===p.student_id?' selected':''}>${s.name}</option>`).join('');
    const cOpts = State.courses.map(c=>`<option value="${c.id}"${c.id===p.course_id?' selected':''}>${c.name}</option>`).join('');
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Edit Payment</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="p-sid">${sOpts}</select></div>
      <div class="form-group"><label>Course</label><select id="p-cid">${cOpts}</select></div>
      <div class="form-group"><label>Week</label><input id="p-week" type="number" value="${p.week||0}"/></div>
      <div class="form-group"><label>Amount (Rs)</label><input id="p-amount" type="number" value="${p.amount||0}"/></div>
      <div class="form-group"><label>Status</label>
        <select id="p-status">${['Pending','Paid','Overdue'].map(s=>`<option${s===p.status?' selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Mode</label>
        <select id="p-mode">${['Bank','Cash','Loan'].map(m=>`<option${m===p.mode?' selected':''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="PayForms.save(${id})">Save</button>
    </div>`);
  },
  async save(id) {
    const data = { student_id:parseInt($('#p-sid').value), course_id:parseInt($('#p-cid').value),
      week:parseInt($('#p-week').value)||0, amount:parseFloat($('#p-amount').value),
      due_date:'', status:$('#p-status').value, paid_date:'', mode:$('#p-mode').value, earned:1 };
    try { await window.api.payments.update(id, data); State.payments = await window.api.payments.getAll(); } catch {}
    Modal.close(); Views.render('payments'); Toast.show('Payment updated');
  },
  addIndiv() {
    const sOpts = State.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Add Individual Payment</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="ip-sid">${sOpts}</select></div>
      <div class="form-group"><label>Assignment Name *</label><input id="ip-name"/></div>
      <div class="form-group"><label>Start Date</label><input id="ip-start" type="date"/></div>
      <div class="form-group"><label>Due Date</label><input id="ip-due" type="date"/></div>
      <div class="form-group"><label>Price (Rs)</label><input id="ip-price" type="number" value="0"/></div>
      <div class="form-group"><label>Status</label><select id="ip-status"><option>Pending</option><option>Paid</option></select></div>
      <div class="form-group col-span-2"><label>Remarks</label><textarea id="ip-remarks"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="PayForms.saveIndiv(0)">Save</button>
    </div>`);
  },
  editIndiv(id) {
    const p = State.indivPayments.find(x=>x.id===id)||{};
    const sOpts = State.students.map(s=>`<option value="${s.id}"${s.id===p.student_id?' selected':''}>${s.name}</option>`).join('');
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Edit Individual Payment</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="ip-sid">${sOpts}</select></div>
      <div class="form-group"><label>Assignment Name *</label><input id="ip-name" value="${p.name||''}"/></div>
      <div class="form-group"><label>Start Date</label><input id="ip-start" type="date" value="${p.start_date||''}"/></div>
      <div class="form-group"><label>Due Date</label><input id="ip-due" type="date" value="${p.due_date||''}"/></div>
      <div class="form-group"><label>Price (Rs)</label><input id="ip-price" type="number" value="${p.price||0}"/></div>
      <div class="form-group"><label>Status</label>
        <select id="ip-status">${['Pending','Paid'].map(s=>`<option${s===p.status?' selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group col-span-2"><label>Remarks</label><textarea id="ip-remarks">${p.remarks||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="PayForms.saveIndiv(${id})">Save</button>
    </div>`);
  },
  async saveIndiv(id) {
    const name = $('#ip-name').value.trim();
    if (!name) { Toast.show('Name required','error'); return; }
    const data = { student_id:parseInt($('#ip-sid').value), name,
      start_date:$('#ip-start').value, due_date:$('#ip-due').value,
      price:parseFloat($('#ip-price').value)||0, status:$('#ip-status').value,
      remarks:$('#ip-remarks').value };
    try {
      if (id) await window.api.indivPayments.update(id, data);
      else    await window.api.indivPayments.add(data);
      State.indivPayments = await window.api.indivPayments.getAll();
    } catch {}
    Modal.close(); Views.render('payments'); Toast.show(id?'Updated':'Payment added');
  }
};

// ── Credential Forms ──────────────────────────────────────────────────────────
const CredForms = {
  _modal(c={}, defaultSid) {
    const sOpts = State.students.map(s=>
      `<option value="${s.id}"${(s.id===(c.student_id||defaultSid))?' selected':''}>${s.name}</option>`).join('');
    return `
    <div class="modal-header"><span class="modal-title">${c.id?'Edit':'Add'} Credential</span>${closeBtn()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Student</label><select id="l-sid">${sOpts}</select></div>
      <div class="form-group"><label>Site / Service Name *</label><input id="l-site" value="${c.site_name||c.hostname||''}" placeholder="e.g. GitHub, College Portal, LMS"/></div>
      <div class="form-group"><label>URL</label><input id="l-url" value="${c.url||c.login_link||''}" placeholder="https://..."/></div>
      <div class="form-group"><label>Username / Email</label><input id="l-user" value="${c.username||''}"/></div>
      <div class="form-group"><label>Password</label><input id="l-pass" type="password" placeholder="${c.id?'Leave blank to keep':'Enter password'}"/></div>
      <div class="form-group col-span-2"><label>Notes</label><input id="l-notes" value="${c.notes||''}" placeholder="e.g. MFA enabled, expires Jan 2026"/></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="CredForms.save(${c.id||0})">Save</button>
    </div>`;
  },
  add() { Modal.open(this._modal()); },
  addForStudent(sid) { Modal.open(this._modal({}, sid)); },
  edit(id) { Modal.open(this._modal(State.credentials.find(c=>c.id===id)||{})); },
  async save(id) {
    const site = $('#l-site').value.trim();
    if (!site) { Toast.show('Site name required','error'); return; }
    const data = { student_id:parseInt($('#l-sid').value), site_name:site,
      hostname:site, url:$('#l-url').value, username:$('#l-user').value,
      password:$('#l-pass').value||undefined, notes:$('#l-notes').value,
      ip_address:'', github_user:'', github_token:'', mysql_user:'', mysql_password:'' };
    try {
      if (id) await window.api.labs.update(id, data);
      else    await window.api.labs.add(data);
      State.credentials = await window.api.labs.getAll();
    } catch {}
    Modal.close(); Views._refreshCreds(); Toast.show(id?'Credential updated':'Credential added');
  }
};

// ── Pay tab switch ────────────────────────────────────────────────────────────
const PayViews = {
  show(tab) {
    $$('.tab-row .tab').forEach(t=>t.classList.remove('active'));
    $('#tab-'+tab)?.classList.add('active');
    $('#pay-course-section').style.display = tab==='course'?'block':'none';
    $('#pay-indiv-section').style.display  = tab==='indiv' ?'block':'none';
  }
};

// ── Reports ───────────────────────────────────────────────────────────────────
const Reports = {
  generate() {
    const type   = $('#r-type').value;
    const sid    = parseInt($('#r-student').value)||0;
    const week   = parseInt($('#r-week').value)||0;
    const out    = $('#report-output');
    if (!out) return;

    const students  = sid ? State.students.filter(s=>s.id===sid) : State.students;
    const asgns     = State.assignments;
    const pays      = State.payments.filter(p=>p.earned);

    let html = '';

    if (type === 'student-weekly') {
      html = '<div class="card-title" style="margin-bottom:12px">Student — Weekly Progress</div>';
      students.forEach(s => {
        const weeks = [...new Set(asgns.filter(a=>a.student_id===s.id).map(a=>a.week))].sort((a,b)=>a-b);
        if (!weeks.length) return;
        html += `<div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div class="avatar">${initials(s.name)}</div>
            <strong>${s.name}</strong>
          </div>`;
        const filteredWeeks = week ? weeks.filter(w=>w===week) : weeks;
        filteredWeeks.forEach(w => {
          const wa   = asgns.filter(a=>a.student_id===s.id&&a.week===w);
          const done = wa.filter(a=>a.status==='Completed').length;
          const pct  = wa.length?Math.round(done/wa.length*100):0;
          const range= weekDateRange(w);
          html += `<div class="metric-row">
            <span style="font-size:12px;min-width:80px">Week ${w}${range?` <span style="color:var(--text3);font-size:10px">(${range})</span>`:''}</span>
            <div style="flex:1;margin:0 10px"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>
            <span style="font-size:12px;color:var(--text2)">${done}/${wa.length} (${pct}%)</span>
          </div>`;
        });
        html += '</div>';
      });

    } else if (type === 'student-course') {
      html = '<div class="card-title" style="margin-bottom:12px">Student — Course & Assignment Detail</div>';
      students.forEach(s => {
        const sAsgns = asgns.filter(a=>a.student_id===s.id&&(!week||a.week===week));
        if (!sAsgns.length) return;
        // Group by course
        const byCourse = {};
        sAsgns.forEach(a => { const k=a.course_id; if(!byCourse[k]) byCourse[k]={name:a.course_name||getCourse(k).name,items:[]}; byCourse[k].items.push(a); });
        html += `<div style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="avatar">${initials(s.name)}</div><strong>${s.name}</strong>
          </div>`;
        Object.values(byCourse).forEach(grp => {
          const done=grp.items.filter(a=>a.status==='Completed').length;
          html += `<div style="margin-left:36px;margin-bottom:10px">
            <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">${grp.name} — ${done}/${grp.items.length} completed</div>`;
          grp.items.sort((a,b)=>a.week-b.week).forEach(a => {
            html += `<div class="deadline-item" style="padding:5px 0">
              <span style="font-size:11px;min-width:48px;color:var(--text3)">Wk ${a.week}</span>
              <span style="flex:1;font-size:12px">${a.name}${a.atype?` <span style="font-size:10px;color:var(--text3)">[${a.atype}]</span>`:''}</span>
              ${statusBadge(a.status)}
              <span style="font-size:11px;color:var(--text3);margin-left:6px">${a.due_date||''}</span>
            </div>`;
          });
          html += '</div>';
        });
        html += '</div>';
      });

    } else if (type === 'payment-student') {
      html = '<div class="card-title" style="margin-bottom:12px">Payments — By Student</div>';
      students.forEach(s => {
        const sPays = pays.filter(p=>p.student_id===s.id&&(!week||p.week===week));
        if (!sPays.length) return;
        const total=sPays.reduce((t,p)=>t+p.amount,0);
        const paid=sPays.filter(p=>p.status==='Paid').reduce((t,p)=>t+p.amount,0);
        html += `<div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div class="avatar">${initials(s.name)}</div><strong>${s.name}</strong>
            <span style="margin-left:auto;font-size:12px;color:var(--text2)">${fmtRs(paid)} / ${fmtRs(total)}</span>
          </div>`;
        sPays.forEach(p => {
          html += `<div class="metric-row" style="margin-left:36px">
            <div><div style="font-size:12px">${p.course_name||''} · Wk ${p.week}</div></div>
            <div style="display:flex;align-items:center;gap:8px">${statusBadge(p.status)}<strong>${fmtRs(p.amount)}</strong></div>
          </div>`;
        });
        html += '</div>';
      });

    } else if (type === 'late') {
      html = '<div class="card-title" style="margin-bottom:12px">Late Submissions</div>';
      let late = asgns.filter(a=>a.status==='Late'&&(!sid||a.student_id===sid)&&(!week||a.week===week));
      html += late.length ? late.map(a=>`
        <div class="deadline-item">
          <div class="avatar" style="width:22px;height:22px;font-size:9px">${initials(a.student_name||'')}</div>
          <div style="flex:1"><div>${a.name}</div><div style="font-size:11px;color:var(--text3)">${a.student_name} · ${a.course_name} · Wk ${a.week} · Due ${a.due_date||'—'}</div></div>
          ${statusBadge(a.status)}
        </div>`).join('')
        : '<div style="color:var(--success);padding:12px 0">No late submissions!</div>';

    } else if (type === 'pending') {
      html = '<div class="card-title" style="margin-bottom:12px">All Pending Assignments</div>';
      let pending = asgns.filter(a=>a.status!=='Completed'&&(!sid||a.student_id===sid)&&(!week||a.week===week));
      pending.sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));
      html += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${pending.length} pending</div>`;
      html += pending.map(a=>`
        <div class="deadline-item">
          <div class="avatar" style="width:22px;height:22px;font-size:9px">${initials(a.student_name||'')}</div>
          <div style="flex:1"><div style="font-size:13px">${a.name}</div>
            <div style="font-size:11px;color:var(--text3)">${a.student_name} · ${a.course_name} · Wk ${a.week}</div></div>
          <div style="text-align:right">${statusBadge(a.status)}<div style="font-size:11px;color:var(--text3)">${a.due_date||''}</div></div>
        </div>`).join('');
    }

    out.innerHTML = html || '<div style="color:var(--text3);padding:20px;text-align:center">No data for selected filters</div>';
  }
};

// ── IO ────────────────────────────────────────────────────────────────────────
const IO = {
  async importExcel() {
    try {
      const r = await window.api.io.importExcel();
      if (r.cancelled) return;
      if (r.success) {
        const {students,assignments,payments,labs} = r.imported;
        const sk = r.skipped||{};
        const skTotal = (sk.assignments||0)+(sk.labs||0)+(sk.payments||0);
        Toast.show(`Imported: ${students} students, ${assignments} assignments, ${labs} labs, ${payments} payments${skTotal?` · ⚠ ${skTotal} skipped`:''}`, skTotal?'warning':'success');
      }
    } catch { Toast.show('Import dialog (desktop only)','info'); }
  },
  async exportCsv(type) {
    try {
      const r = await window.api.io.exportCsv(type);
      if (!r.cancelled) Toast.show(`${type} exported`);
    } catch { Toast.show('Export dialog (desktop only)','info'); }
  },
  async exportPaymentsXlsx() {
    try {
      const r = await window.api.io.exportPaymentsXlsx();
      if (!r.cancelled) Toast.show('Payments exported (Excel with 2 sheets)');
    } catch { Toast.show('Export dialog (desktop only)','info'); }
  },
  async backup()  { try { const r=await window.api.io.backupCreate(); if(!r.cancelled) Toast.show('Backup saved'); } catch { Toast.show('Backup dialog (desktop only)','info'); } },
  async restore() { try { const r=await window.api.io.backupRestore(); if(!r.cancelled){Toast.show('Restored — reloading…');setTimeout(()=>location.reload(),1500);} } catch { Toast.show('Restore dialog (desktop only)','info'); } },
  dragOver(e) { e.preventDefault(); },
  drop(e) { e.preventDefault(); this.importExcel(); },
  archiveSemester() {
    Modal.open(`
    <div class="modal-header"><span class="modal-title">Archive Semester</span>${closeBtn()}</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">This will archive all current assignments, payments and data, then reset for a new semester. A backup will be created automatically.</p>
    <div class="form-group" style="margin-bottom:16px"><label>Semester Label (e.g. "Fall 2025")</label><input id="sem-label" placeholder="Fall 2025"/></div>
    <div class="modal-footer">
      <button class="btn" onclick="Modal.close()">Cancel</button>
      <button class="btn" style="background:var(--warning);color:#fff;border-color:var(--warning)" onclick="IO.doArchive()">Archive & Start Fresh</button>
    </div>`);
  },
  async doArchive() {
    const label = $('#sem-label').value.trim() || `Semester ${new Date().toLocaleDateString()}`;
    try { await window.api.io.backupCreate(); } catch {}
    // Save archive record in localStorage
    const arc = JSON.parse(localStorage.getItem('archivedSemesters')||'[]');
    arc.push({ label, date: new Date().toISOString(), note:'Archived — see backup' });
    localStorage.setItem('archivedSemesters', JSON.stringify(arc));
    localStorage.removeItem('semesterStart');
    Modal.close();
    Toast.show(`"${label}" archived. Start a new semester by setting the semester start date in Assignments.`,'info');
  }
};

// ── Global helpers ────────────────────────────────────────────────────────────
async function markAssignDone(id) {
  try { await window.api.assignments.markComplete(id); State.assignments = await window.api.assignments.getAll(); }
  catch { const a=State.assignments.find(x=>x.id===id); if(a) a.status='Completed'; }
  Views._buildWeekGrid(); Views._refreshAssignTable(); Toast.show('Marked complete');
}

async function markPayPaid(id) {
  try { await window.api.payments.markPaid(id); State.payments = await window.api.payments.getAll(); }
  catch { const p=State.payments.find(x=>x.id===id); if(p){p.status='Paid';p.paid_date=new Date().toISOString().slice(0,10);} }
  Views.render('payments'); Toast.show('Payment marked paid');
}

function copyValue(e, val, label) {
  e.stopPropagation();
  try { window.api.clipboard.write(val); } catch { navigator.clipboard?.writeText(val); }
  Toast.show(`${label} copied`, 'info');
}

function confirmDelete(type, id, name) {
  Modal.open(`
  <div class="modal-header"><span class="modal-title">Confirm Delete</span>${closeBtn()}</div>
  <p style="font-size:13px;color:var(--text2)">Delete <strong>${name}</strong>? This cannot be undone.</p>
  <div class="modal-footer">
    <button class="btn" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-danger" onclick="doDelete('${type}',${id})">Delete</button>
  </div>`);
}

async function doDelete(type, id) {
  try {
    if      (type==='student')      await window.api.students.delete(id);
    else if (type==='course')       await window.api.courses.delete(id);
    else if (type==='assignment')   await window.api.assignments.delete(id);
    else if (type==='payment')      await window.api.payments.delete(id);
    else if (type==='indivPayment') await window.api.indivPayments.delete(id);
    else if (type==='credential')   await window.api.labs.delete(id);
  } catch {
    if      (type==='student')      State.students        = State.students.filter(x=>x.id!==id);
    else if (type==='course')       State.courses         = State.courses.filter(x=>x.id!==id);
    else if (type==='assignment')   State.assignments     = State.assignments.filter(x=>x.id!==id);
    else if (type==='payment')      State.payments        = State.payments.filter(x=>x.id!==id);
    else if (type==='indivPayment') State.indivPayments   = State.indivPayments.filter(x=>x.id!==id);
    else if (type==='credential')   State.credentials     = State.credentials.filter(x=>x.id!==id);
  }
  Modal.close(); Views.render(State.view); Toast.show('Deleted');
}

// ── App bootstrap ─────────────────────────────────────────────────────────────
const App = {
  async init() {
    document.documentElement.setAttribute('data-theme', State.theme);
    try {
      [State.students, State.courses, State.assignments, State.payments, State.indivPayments, State.credentials] =
        await Promise.all([
          window.api.students.getAll(), window.api.courses.getAll(),
          window.api.assignments.getAll(), window.api.payments.getAll(),
          window.api.indivPayments.getAll(), window.api.labs.getAll()
        ]);
    } catch { console.log('Preview mode — Electron APIs not available'); }

    // Default week = based on current date
    State.week = currentWeekNumber();

    $('#sidebar-footer').textContent = `${State.students.length} students · ${State.courses.length} courses`;

    $$('.nav-item[data-view]').forEach(el => el.addEventListener('click', ()=>Nav.go(el.dataset.view)));
    Views.render('dashboard');

    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey||e.metaKey;
      if (mod&&e.key==='f') { e.preventDefault(); $('#global-search')?.focus(); }
      if (mod&&e.key==='n') { e.preventDefault(); this.quickAdd(); }
      if (mod&&e.key==='s') { e.preventDefault(); Toast.show('Auto-saved','info'); }
      if (e.key==='Escape') Modal.close();
    });

    $('#global-search')?.addEventListener('input', e=>{
      const q=e.target.value.toLowerCase().trim();
      if (!q) return;
      const hits=[...State.students.filter(s=>s.name.toLowerCase().includes(q)),
                  ...State.courses.filter(c=>c.name.toLowerCase().includes(q))];
      if (hits.length) Toast.show(`Found ${hits.length} result(s) for "${e.target.value}"`, 'info');
    });
  },
  quickAdd() {
    const map = { dashboard:()=>StudentForms.add(), students:()=>StudentForms.add(),
      courses:()=>CourseForms.add(), assignments:()=>AssignForms.add(),
      payments:()=>PayForms.addIndiv(), credentials:()=>CredForms.add() };
    (map[State.view]||map.dashboard)();
  },
  toggleTheme() {
    State.theme = State.theme==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme', State.theme);
    localStorage.setItem('theme', State.theme);
  }
};

// ── Expose to window (required for inline onclick= attributes) ────────────────
window.App=App; window.Nav=Nav; window.Modal=Modal; window.Toast=Toast;
window.Views=Views; window.StudentForms=StudentForms; window.CourseForms=CourseForms;
window.AssignForms=AssignForms; window.PayForms=PayForms; window.PayViews=PayViews;
window.LabForms=CredForms; window.CredForms=CredForms; window.Reports=Reports; window.IO=IO;
window.markAssignDone=markAssignDone; window.markPayPaid=markPayPaid;
window.copyValue=copyValue; window.confirmDelete=confirmDelete; window.doDelete=doDelete;
window.updateAssignStatus=updateAssignStatus; window.updateAssignRemark=updateAssignRemark;
window.setSemesterStart=setSemesterStart;

App.init();
