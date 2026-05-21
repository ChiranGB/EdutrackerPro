/**
 * EduTrack - Database Layer
 * sql.js (pure JS SQLite), AES-256-GCM encryption for passwords/tokens.
 *
 * Payment logic:
 *   - Each payment row = one student + one course + one week
 *   - Amount = course.rate (Rs/hr) × course.credits (hrs)  per week
 *   - A week's payment is automatically created/updated when ALL assignments
 *     for that student+course+week are marked Completed.
 *   - If a completed assignment is later edited back to incomplete, the payment
 *     row reverts to amount=0 / status=Pending.
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

// ── Paths ─────────────────────────────────────────────────────────────────────
const USER_DATA  = app.getPath('userData');
const DB_PATH    = path.join(USER_DATA, 'edutrack.db');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const KEY_PATH   = path.join(USER_DATA, '.enc_key');
const WASM_PATH  = path.join(
  app.isPackaged ? process.resourcesPath
                 : path.join(__dirname, '../../node_modules/sql.js/dist'),
  'sql-wasm.wasm'
);

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Encryption ────────────────────────────────────────────────────────────────
function getEncKey() {
  if (!fs.existsSync(KEY_PATH))
    fs.writeFileSync(KEY_PATH, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
}
const ENC_KEY = getEncKey();

function encrypt(text) {
  if (!text) return '';
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc    = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc.toString('hex');
}

function decrypt(data) {
  if (!data || !data.includes(':')) return data || '';
  try {
    const [ivH, tagH, encH] = data.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivH, 'hex'));
    d.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([d.update(Buffer.from(encH, 'hex')), d.final()]).toString('utf8');
  } catch { return '[encrypted]'; }
}

// ── sql.js bootstrap ──────────────────────────────────────────────────────────
let SQL;
let db;

async function initDB() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({ locateFile: () => WASM_PATH });
  db  = fs.existsSync(DB_PATH)
      ? new SQL.Database(fs.readFileSync(DB_PATH))
      : new SQL.Database();
  createSchema();
  seedIfEmpty();
  persist();
}

function persist() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// ── Query helpers ─────────────────────────────────────────────────────────────
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function transaction(fn) {
  db.run('BEGIN');
  try { fn(); db.run('COMMIT'); } catch (e) { db.run('ROLLBACK'); throw e; }
  persist();
}

function queryOne(sql, params = []) {
  return query(sql, params)[0] || null;
}

// ── Schema ────────────────────────────────────────────────────────────────────
function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      college TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      telegram_id TEXT DEFAULT '',
      login_link TEXT DEFAULT '',
      username TEXT DEFAULT '',
      password_enc TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      professor TEXT DEFAULT '',
      credits INTEGER DEFAULT 3,
      rate REAL DEFAULT 500
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      student_id INTEGER,
      course_id  INTEGER,
      PRIMARY KEY (student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      course_id  INTEGER,
      week INTEGER NOT NULL,
      name TEXT NOT NULL,
      due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'Not Started',
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    /*
     * payments — one row per student + course + week
     * amount   = course.rate × course.credits  (Rs/hr × credit hrs)
     * earned   = 1 when ALL assignments for that student+course+week are Completed
     * status   = 'Pending' until manually marked Paid
     */
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      course_id  INTEGER,
      week       INTEGER NOT NULL DEFAULT 0,
      amount     REAL NOT NULL DEFAULT 0,
      due_date   TEXT DEFAULT '',
      status     TEXT DEFAULT 'Pending',
      paid_date  TEXT DEFAULT '',
      mode       TEXT DEFAULT 'Bank',
      earned     INTEGER DEFAULT 0,
      UNIQUE(student_id, course_id, week)
    );

    CREATE TABLE IF NOT EXISTS indiv_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      name TEXT NOT NULL,
      start_date TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'Pending',
      remarks TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS labs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      hostname TEXT DEFAULT '',
      username TEXT DEFAULT '',
      password_enc TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      github_user TEXT DEFAULT '',
      github_token_enc TEXT DEFAULT '',
      mysql_user TEXT DEFAULT '',
      mysql_password_enc TEXT DEFAULT ''
    );
  `);

  // Migration: add week/earned columns to existing payments tables if missing
  try { db.run("ALTER TABLE payments ADD COLUMN week INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE payments ADD COLUMN earned INTEGER DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE assignments ADD COLUMN atype TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE courses ADD COLUMN tools TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE labs ADD COLUMN site_name TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE labs ADD COLUMN url TEXT DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE labs ADD COLUMN notes TEXT DEFAULT ''"); } catch {}
  // Update rate default label — no schema change needed, just cosmetic
}

// ── Seed ──────────────────────────────────────────────────────────────────────
function seedIfEmpty() {
  if (queryOne('SELECT COUNT(*) as n FROM students').n > 0) return;

  transaction(() => {
    // Courses — rate in Rs/hr
    [
      ['MIS Capstone',                          'Dr. Smith',  3, 500],
      ['OOP using Java',                        'Dr. Lee',    3, 500],
      ['Introduction to Databases',             'Dr. Patel',  3, 500],
      ['INET 4031 Systems-Lab',                 'Dr. Brown',  2, 400],
      ['Problem Solving With Programming',      'Dr. Kim',    3, 500],
      ['Business Intelligence & Analytics',     'Dr. Davis',  3, 600],
      ['IT Infrastructure Operations Capstone', 'Dr. Wilson', 3, 500],
      ['DSA-INET2002',                          'Dr. Chen',   3, 500],
      ['INET 4707-Intro to Database Hands-on',  'Dr. Patel',  2, 400],
    ].forEach(([name, prof, cr, rate]) =>
      db.run('INSERT INTO courses(name,professor,credits,rate) VALUES(?,?,?,?)', [name, prof, cr, rate])
    );

    // Students
    [
      ['Mohammed Tarabi',   'm.tarabi@metro.edu',      '+1-555-0101', '@mtarabi',    'mtarabi'],
      ['Mohamed Abdullahi', 'm.abdullahi@metro.edu',   '+1-555-0102', '@mabdullahi', 'mabdullahi'],
      ['Sadaq Abdullahi',   's.abdullahi@metro.edu',   '+1-555-0103', '@sabdullahi', 'sabdullahi'],
      ['Wily Omar',         'w.omar@metro.edu',        '+1-555-0104', '@womar',      'womar'],
      ['Adnan Mohamed',     'a.mohamed@metro.edu',     '+1-555-0105', '@amohamed',   'amohamed'],
      ['Tenzing Lungthok',  't.lungthok@metro.edu',    '+1-555-0106', '@tlungthok',  'tlungthok'],
    ].forEach(([name, email, phone, tg, uname]) =>
      db.run(
        'INSERT INTO students(name,college,email,phone,telegram_id,login_link,username,password_enc) VALUES(?,?,?,?,?,?,?,?)',
        [name, 'Metro State', email, phone, tg, 'https://portal.metro.edu', uname, encrypt('pass1234')]
      )
    );

    // Enrollments
    [[1,1],[1,2],[1,3],[1,4],[2,1],[2,5],[2,6],[2,7],
     [3,2],[3,3],[3,8],[3,9],[4,1],[4,4],[4,5],[5,6],[5,7],[5,8],[6,3],[6,9]]
      .forEach(([sid, cid]) => db.run('INSERT OR IGNORE INTO enrollments VALUES(?,?)', [sid, cid]));

    // Assignments (some completed so payment auto-calc can be demonstrated)
    [
      [1,2,1,'Lab 1 - Hello World',       '2025-01-20','Completed',  'Submitted on time'],
      [1,2,2,'Lab 2 - OOP Basics',        '2025-01-27','Completed',  ''],
      [1,3,1,'ER Diagram Assignment',      '2025-01-22','Completed',  'Good work'],
      [2,1,1,'Project Proposal',          '2025-01-19','Late',        'Submitted 2 days late'],
      [2,5,2,'Algorithm Analysis',        '2025-01-28','In Progress', ''],
      [3,2,3,'Lab 3 - Inheritance',       '2025-02-03','Not Started', ''],
      [3,8,3,'Sorting Algorithms',        '2025-02-05','In Progress', 'Need help with merge sort'],
      [4,1,4,'Literature Review',         '2025-02-10','Not Started', ''],
      [4,4,4,'Network Lab Config',        '2025-02-12','In Progress', ''],
      [5,6,5,'BI Dashboard',              '2025-02-17','Not Started', ''],
      [5,7,5,'Infrastructure Report',     '2025-02-18','Not Started', ''],
      [6,3,5,'SQL Queries HW',            '2025-02-19','Not Started', ''],
      [1,2,5,'Lab 5 - Collections',       '2025-02-20','Not Started', ''],
      [2,1,5,'Capstone Milestone 2',      '2025-02-21','Not Started', ''],
    ].forEach(([sid, cid, wk, name, due, st, rem]) =>
      db.run(
        'INSERT INTO assignments(student_id,course_id,week,name,due_date,status,remarks) VALUES(?,?,?,?,?,?,?)',
        [sid, cid, wk, name, due, st, rem]
      )
    );

    // Labs
    [
      [1,'lab-server-01','mtarabi',   '192.168.1.101','m-tarabi',   'mtarabi_db'],
      [2,'lab-server-02','mabdullahi','192.168.1.102','m-abdullahi','mabdullahi_db'],
      [3,'lab-server-01','sabdullahi','192.168.1.101','sadaq-a',    'sabdullahi_db'],
      [4,'lab-server-03','womar',     '192.168.1.103','wily-omar',  'womar_db'],
      [5,'lab-server-02','amohamed',  '192.168.1.102','adnan-m',    'amohamed_db'],
      [6,'lab-server-04','tlungthok', '192.168.1.104','tenzing-l',  'tlungthok_db'],
    ].forEach(([sid, host, uname, ip, ghuser, mysqluser]) =>
      db.run(
        'INSERT INTO labs(student_id,hostname,username,password_enc,ip_address,github_user,github_token_enc,mysql_user,mysql_password_enc) VALUES(?,?,?,?,?,?,?,?,?)',
        [sid, host, uname, encrypt('lab_pass_'+sid), ip, ghuser,
         encrypt('ghp_token'+sid+sid+sid+sid), mysqluser, encrypt('mysql_pass'+sid)]
      )
    );

    // Individual payments
    [
      [2,'Extra Tutoring Session', '2025-01-10','2025-01-24',1500,'Paid',   '2hr session'],
      [4,'Resume Review',          '2025-01-15','2025-01-30', 500,'Pending',''],
      [5,'Mock Interview Prep',    '2025-01-20','2025-02-05',1000,'Pending','3 sessions'],
    ].forEach(([sid, name, start, due, price, st, rem]) =>
      db.run(
        'INSERT INTO indiv_payments(student_id,name,start_date,due_date,price,status,remarks) VALUES(?,?,?,?,?,?,?)',
        [sid, name, start, due, price, st, rem]
      )
    );
  });

  // Auto-calculate payments for any completed weeks in seed data
  recalcAllPayments();
  console.log('[DB] Seeded initial data');
}

// ── Payment auto-calculation ──────────────────────────────────────────────────

/**
 * Called whenever an assignment status changes.
 * Checks if ALL assignments for this student+course+week are Completed.
 * If yes  → upsert a payment row with amount = rate × credits, mark earned=1
 * If no   → upsert a payment row with amount = 0, mark earned=0 (keeps due_date/mode)
 *
 * Does NOT change status ('Paid') once a payment is already paid.
 */
function recalcWeekPayment(student_id, course_id, week) {
  const course = queryOne('SELECT rate, credits FROM courses WHERE id=?', [course_id]);
  if (!course) return;

  const total   = queryOne(
    'SELECT COUNT(*) as n FROM assignments WHERE student_id=? AND course_id=? AND week=?',
    [student_id, course_id, week]
  ).n;
  const done    = queryOne(
    "SELECT COUNT(*) as n FROM assignments WHERE student_id=? AND course_id=? AND week=? AND status='Completed'",
    [student_id, course_id, week]
  ).n;

  const allDone = total > 0 && done === total;
  const amount  = allDone ? Math.round(course.rate * course.credits) : 0;
  const earned  = allDone ? 1 : 0;
  const today   = new Date().toISOString().slice(0, 10);

  const existing = queryOne(
    'SELECT id, status FROM payments WHERE student_id=? AND course_id=? AND week=?',
    [student_id, course_id, week]
  );

  if (existing) {
    // Never downgrade a payment that's already been paid
    if (existing.status === 'Paid') {
      db.run('UPDATE payments SET amount=?, earned=? WHERE id=?', [amount, earned, existing.id]);
    } else {
      db.run(
        'UPDATE payments SET amount=?, earned=?, status=? WHERE id=?',
        [amount, earned, allDone ? 'Pending' : 'Pending', existing.id]
      );
    }
  } else if (allDone) {
    // Only create the payment row when actually earned (avoids clutter)
    db.run(
      'INSERT INTO payments(student_id,course_id,week,amount,due_date,status,earned) VALUES(?,?,?,?,?,?,?)',
      [student_id, course_id, week, amount, today, 'Pending', 1]
    );
  }
  persist();
}

/** Recalculate payments for every distinct student+course+week combination in assignments */
function recalcAllPayments() {
  const combos = query(
    'SELECT DISTINCT student_id, course_id, week FROM assignments'
  );
  combos.forEach(({ student_id, course_id, week }) =>
    recalcWeekPayment(student_id, course_id, week)
  );
}

// ── Students ──────────────────────────────────────────────────────────────────
function getStudents() {
  return query('SELECT * FROM students ORDER BY name').map(s => ({
    ...s,
    password: decrypt(s.password_enc),
    courses:  query('SELECT course_id FROM enrollments WHERE student_id=?', [s.id]).map(r => r.course_id),
  }));
}

function addStudent(data) {
  db.run(
    'INSERT INTO students(name,college,email,phone,telegram_id,login_link,username,password_enc) VALUES(?,?,?,?,?,?,?,?)',
    [data.name, data.college||'', data.email||'', data.phone||'',
     data.telegram_id||'', data.login_link||'', data.username||'', encrypt(data.password||'')]
  );
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  if (data.courses) setEnrollments(id, data.courses);
  persist();
  return id;
}

function updateStudent(id, data) {
  if (data.password) {
    db.run(
      'UPDATE students SET name=?,college=?,email=?,phone=?,telegram_id=?,login_link=?,username=?,password_enc=? WHERE id=?',
      [data.name, data.college||'', data.email||'', data.phone||'',
       data.telegram_id||'', data.login_link||'', data.username||'', encrypt(data.password), id]
    );
  } else {
    db.run(
      'UPDATE students SET name=?,college=?,email=?,phone=?,telegram_id=?,login_link=?,username=? WHERE id=?',
      [data.name, data.college||'', data.email||'', data.phone||'',
       data.telegram_id||'', data.login_link||'', data.username||'', id]
    );
  }
  if (data.courses) setEnrollments(id, data.courses);
  persist();
}

function deleteStudent(id) { run('DELETE FROM students WHERE id=?', [id]); }

// ── Courses ───────────────────────────────────────────────────────────────────
function getCourses() { return query('SELECT * FROM courses ORDER BY name'); }

function addCourse(data) {
  db.run('INSERT INTO courses(name,professor,credits,rate) VALUES(?,?,?,?)',
    [data.name, data.professor||'', data.credits||3, data.rate||500]);
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  persist();
  return id;
}

function updateCourse(id, data) {
  db.run('UPDATE courses SET name=?,professor=?,credits=?,rate=? WHERE id=?',
    [data.name, data.professor||'', data.credits||3, data.rate||500, id]);
  // Recalculate all payments for this course since rate/credits may have changed
  const combos = query('SELECT DISTINCT student_id, week FROM assignments WHERE course_id=?', [id]);
  combos.forEach(({ student_id, week }) => recalcWeekPayment(student_id, id, week));
  persist();
}

function deleteCourse(id) { run('DELETE FROM courses WHERE id=?', [id]); }

// ── Enrollments ───────────────────────────────────────────────────────────────
function getEnrollmentsByStudent(sid) {
  return query('SELECT course_id FROM enrollments WHERE student_id=?', [sid]).map(r => r.course_id);
}

function setEnrollments(sid, courseIds) {
  db.run('DELETE FROM enrollments WHERE student_id=?', [sid]);
  courseIds.forEach(cid => db.run('INSERT OR IGNORE INTO enrollments VALUES(?,?)', [sid, cid]));
  persist();
}

// ── Assignments ───────────────────────────────────────────────────────────────
const ASSIGN_JOIN = `
  SELECT a.*, s.name as student_name, c.name as course_name
  FROM assignments a
  JOIN students s ON s.id=a.student_id
  JOIN courses  c ON c.id=a.course_id`;

function getAssignments()        { return query(ASSIGN_JOIN + ' ORDER BY a.due_date ASC'); }
function getAssignmentsByWeek(w) { return query(ASSIGN_JOIN + ' WHERE a.week=? ORDER BY a.due_date ASC', [w]); }

function addAssignment(data) {
  db.run(
    'INSERT INTO assignments(student_id,course_id,week,name,due_date,status,remarks) VALUES(?,?,?,?,?,?,?)',
    [data.student_id, data.course_id, data.week, data.name,
     data.due_date||'', data.status||'Not Started', data.remarks||'']
  );
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  recalcWeekPayment(data.student_id, data.course_id, data.week);
  return id;
}

function addAssignmentsBulk(items) {
  transaction(() =>
    items.forEach(a =>
      db.run(
        'INSERT INTO assignments(student_id,course_id,week,name,due_date,status,remarks) VALUES(?,?,?,?,?,?,?)',
        [a.student_id, a.course_id, a.week, a.name, a.due_date||'', a.status||'Not Started', a.remarks||'']
      )
    )
  );
  // Recalc for all affected combos
  const seen = new Set();
  items.forEach(a => {
    const key = `${a.student_id}_${a.course_id}_${a.week}`;
    if (!seen.has(key)) { seen.add(key); recalcWeekPayment(a.student_id, a.course_id, a.week); }
  });
}

function updateAssignment(id, data) {
  // Get old values to recalc old combo too (in case week/course/student changed)
  const old = queryOne('SELECT student_id, course_id, week FROM assignments WHERE id=?', [id]);
  db.run(
    'UPDATE assignments SET student_id=?,course_id=?,week=?,name=?,due_date=?,status=?,remarks=? WHERE id=?',
    [data.student_id, data.course_id, data.week, data.name,
     data.due_date||'', data.status, data.remarks||'', id]
  );
  // Recalc both old and new combo
  if (old) recalcWeekPayment(old.student_id, old.course_id, old.week);
  recalcWeekPayment(data.student_id, data.course_id, data.week);
}

function deleteAssignment(id) {
  const old = queryOne('SELECT student_id, course_id, week FROM assignments WHERE id=?', [id]);
  run('DELETE FROM assignments WHERE id=?', [id]);
  if (old) recalcWeekPayment(old.student_id, old.course_id, old.week);
}

function markAssignmentComplete(id) {
  const a = queryOne('SELECT student_id, course_id, week FROM assignments WHERE id=?', [id]);
  db.run("UPDATE assignments SET status='Completed' WHERE id=?", [id]);
  if (a) recalcWeekPayment(a.student_id, a.course_id, a.week);
  persist();
}

// ── Payments ──────────────────────────────────────────────────────────────────
const PAY_JOIN = `
  SELECT p.*, s.name as student_name, c.name as course_name,
         (c.rate * c.credits) as week_rate
  FROM payments p
  JOIN students s ON s.id=p.student_id
  JOIN courses  c ON c.id=p.course_id`;

function getPayments() {
  return query(PAY_JOIN + ' ORDER BY p.student_id, p.course_id, p.week ASC');
}

function addPayment(data) {
  // Manual payment entry — insert with IGNORE so unique constraint is respected
  db.run(
    'INSERT OR IGNORE INTO payments(student_id,course_id,week,amount,due_date,status,paid_date,mode,earned) VALUES(?,?,?,?,?,?,?,?,?)',
    [data.student_id, data.course_id, data.week||0, data.amount||0,
     data.due_date||'', data.status||'Pending', data.paid_date||'', data.mode||'Bank', data.earned||0]
  );
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  persist();
  return id;
}

function updatePayment(id, data) {
  run(
    'UPDATE payments SET student_id=?,course_id=?,week=?,amount=?,due_date=?,status=?,paid_date=?,mode=? WHERE id=?',
    [data.student_id, data.course_id, data.week||0, data.amount,
     data.due_date||'', data.status, data.paid_date||'', data.mode, id]
  );
}

function deletePayment(id) { run('DELETE FROM payments WHERE id=?', [id]); }

function markPaymentPaid(id) {
  run("UPDATE payments SET status='Paid', paid_date=? WHERE id=?",
    [new Date().toISOString().slice(0, 10), id]);
}

// ── Individual Payments ───────────────────────────────────────────────────────
function getIndivPayments() {
  return query(`
    SELECT ip.*, s.name as student_name FROM indiv_payments ip
    JOIN students s ON s.id=ip.student_id ORDER BY ip.due_date ASC
  `);
}

function addIndivPayment(data) {
  db.run(
    'INSERT INTO indiv_payments(student_id,name,start_date,due_date,price,status,remarks) VALUES(?,?,?,?,?,?,?)',
    [data.student_id, data.name, data.start_date||'', data.due_date||'',
     data.price||0, data.status||'Pending', data.remarks||'']
  );
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  persist();
  return id;
}

function updateIndivPayment(id, data) {
  run(
    'UPDATE indiv_payments SET student_id=?,name=?,start_date=?,due_date=?,price=?,status=?,remarks=? WHERE id=?',
    [data.student_id, data.name, data.start_date||'', data.due_date||'',
     data.price||0, data.status, data.remarks||'', id]
  );
}

function deleteIndivPayment(id) { run('DELETE FROM indiv_payments WHERE id=?', [id]); }

// ── Labs ──────────────────────────────────────────────────────────────────────
function getLabs() {
  return query(`
    SELECT l.*, s.name as student_name FROM labs l
    JOIN students s ON s.id=l.student_id ORDER BY s.name
  `).map(l => ({
    ...l,
    password:       decrypt(l.password_enc),
    github_token:   decrypt(l.github_token_enc),
    mysql_password: decrypt(l.mysql_password_enc),
  }));
}

function addLab(data) {
  db.run(
    'INSERT INTO labs(student_id,hostname,username,password_enc,ip_address,github_user,github_token_enc,mysql_user,mysql_password_enc) VALUES(?,?,?,?,?,?,?,?,?)',
    [data.student_id, data.hostname||'', data.username||'', encrypt(data.password||''),
     data.ip_address||'', data.github_user||'', encrypt(data.github_token||''),
     data.mysql_user||'', encrypt(data.mysql_password||'')]
  );
  const id = queryOne('SELECT last_insert_rowid() as id').id;
  persist();
  return id;
}

function updateLab(id, data) {
  const cur = queryOne('SELECT * FROM labs WHERE id=?', [id]) || {};
  db.run(
    'UPDATE labs SET student_id=?,hostname=?,username=?,password_enc=?,ip_address=?,github_user=?,github_token_enc=?,mysql_user=?,mysql_password_enc=? WHERE id=?',
    [data.student_id, data.hostname||'', data.username||'',
     data.password       ? encrypt(data.password)       : cur.password_enc||'',
     data.ip_address||'', data.github_user||'',
     data.github_token   ? encrypt(data.github_token)   : cur.github_token_enc||'',
     data.mysql_user||'',
     data.mysql_password ? encrypt(data.mysql_password) : cur.mysql_password_enc||'',
     id]
  );
  persist();
}

function deleteLab(id) { run('DELETE FROM labs WHERE id=?', [id]); }

// ── Dashboard ─────────────────────────────────────────────────────────────────
function getDashboardStats() {
  const totalStudents = queryOne('SELECT COUNT(*) as n FROM students').n;
  const totalCourses  = queryOne('SELECT COUNT(*) as n FROM courses').n;
  const pendingAssign = queryOne("SELECT COUNT(*) as n FROM assignments WHERE status!='Completed'").n;
  const dueThisWeek   = queryOne("SELECT COUNT(*) as n FROM assignments WHERE status!='Completed' AND due_date BETWEEN date('now') AND date('now','+7 days')").n;
  const unpaidAmount  = queryOne("SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE status!='Paid' AND earned=1").t;

  const upcomingDeadlines = query(ASSIGN_JOIN + " WHERE a.status!='Completed' ORDER BY a.due_date ASC LIMIT 8");
  const weeklyProgress    = query("SELECT week, COUNT(*) as total, SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) as done FROM assignments GROUP BY week ORDER BY week");
  const recentPayments    = query(PAY_JOIN    + " WHERE p.earned=1 ORDER BY p.student_id, p.week DESC LIMIT 6");
  const studentProgress   = query(`
    SELECT s.id, s.name,
           COUNT(a.id) as total,
           SUM(CASE WHEN a.status='Completed' THEN 1 ELSE 0 END) as done
    FROM students s LEFT JOIN assignments a ON a.student_id=s.id
    GROUP BY s.id ORDER BY s.name
  `);

  return { totalStudents, totalCourses, pendingAssign, dueThisWeek, unpaidAmount,
           upcomingDeadlines, weeklyProgress, recentPayments, studentProgress };
}

// ── Import ────────────────────────────────────────────────────────────────────
function findStudent(name) {
  if (!name) return null;
  const n = String(name).trim();
  return queryOne('SELECT id FROM students WHERE name=?', [n])
      || queryOne('SELECT id FROM students WHERE LOWER(name)=LOWER(?)', [n])
      || queryOne('SELECT id FROM students WHERE LOWER(name) LIKE LOWER(?)', [`%${n}%`]);
}

function findCourse(name) {
  if (!name) return null;
  const n = String(name).trim();
  return queryOne('SELECT id FROM courses WHERE name=?', [n])
      || queryOne('SELECT id FROM courses WHERE LOWER(name)=LOWER(?)', [n])
      || queryOne('SELECT id FROM courses WHERE LOWER(name) LIKE LOWER(?)', [`%${n}%`]);
}

function importExcel(filePath) {
  const XLSX = require('xlsx');
  const wb   = XLSX.readFile(filePath);
  let imported = { students:0, assignments:0, payments:0, labs:0 };
  let skipped  = { assignments:[], labs:[], payments:[] };

  if (wb.SheetNames.includes('Course Info')) {
    XLSX.utils.sheet_to_json(wb.Sheets['Course Info']).forEach(row => {
      const name = String(row['Student Name'] || row['Name'] || '').trim();
      if (!name || findStudent(name)) return;
      db.run(
        'INSERT INTO students(name,college,email,phone,telegram_id,login_link,username,password_enc) VALUES(?,?,?,?,?,?,?,?)',
        [name, row['College']||'', row['Email']||'', row['Phone']||'',
         row['Telegram']||'', row['Login Link']||'', row['Username']||'', encrypt(row['Password']||'')]
      );
      imported.students++;
    });
    persist();
  }

  if (wb.SheetNames.includes('Tracker')) {
    const valid = new Set(['Not Started','In Progress','Completed','Late']);
    XLSX.utils.sheet_to_json(wb.Sheets['Tracker']).forEach((row, i) => {
      const sname = String(row['Student Name']||row['Student']||'').trim();
      const cname = String(row['Course Name'] ||row['Course'] ||'').trim();
      const aname = String(row['Assignment']  ||row['Assignment Name']||row['Task']||'').trim();
      if (!sname||!cname||!aname) return;
      const student = findStudent(sname);
      const course  = findCourse(cname);
      if (!student) { skipped.assignments.push(`Row ${i+2}: student "${sname}" not found`); return; }
      if (!course)  { skipped.assignments.push(`Row ${i+2}: course "${cname}" not found`);  return; }
      const status = valid.has(String(row['Status']||'').trim()) ? String(row['Status']).trim() : 'Not Started';
      db.run(
        'INSERT INTO assignments(student_id,course_id,week,name,due_date,status,remarks) VALUES(?,?,?,?,?,?,?)',
        [student.id, course.id, parseInt(row['Week'])||1, aname,
         excelDateToStr(row['Due Date']||row['DueDate']||''), status,
         String(row['Remarks']||row['Remark']||'').trim()]
      );
      imported.assignments++;
    });
    persist();
    recalcAllPayments(); // recalc after all assignments imported
  }

  if (wb.SheetNames.includes('System Labs Info')) {
    XLSX.utils.sheet_to_json(wb.Sheets['System Labs Info']).forEach((row, i) => {
      const sname = String(row['Student Name']||row['Student']||'').trim();
      if (!sname) return;
      const student = findStudent(sname);
      if (!student) { skipped.labs.push(`Row ${i+2}: student "${sname}" not found`); return; }
      db.run(
        'INSERT INTO labs(student_id,hostname,username,password_enc,ip_address,github_user,github_token_enc,mysql_user,mysql_password_enc) VALUES(?,?,?,?,?,?,?,?,?)',
        [student.id, row['Hostname']||'', row['Username']||'', encrypt(row['Password']||''),
         row['IP Address']||row['IP']||'', row['GitHub User']||row['Github User']||'',
         encrypt(row['GitHub Token']||row['Github Token']||''),
         row['MySQL User']||'', encrypt(row['MySQL Password']||'')]
      );
      imported.labs++;
    });
    persist();
  }

  if (wb.SheetNames.includes('Individual Payments')) {
    XLSX.utils.sheet_to_json(wb.Sheets['Individual Payments']).forEach((row, i) => {
      const sname = String(row['Student Name']||row['Student']||'').trim();
      if (!sname) return;
      const student = findStudent(sname);
      if (!student) { skipped.payments.push(`Row ${i+2}: student "${sname}" not found`); return; }
      db.run(
        'INSERT INTO indiv_payments(student_id,name,start_date,due_date,price,status,remarks) VALUES(?,?,?,?,?,?,?)',
        [student.id, String(row['Assignment']||row['Name']||'Imported').trim(),
         excelDateToStr(row['Start Date']||''), excelDateToStr(row['Due Date']||''),
         parseFloat(row['Price'])||0, String(row['Status']||'Pending').trim(),
         String(row['Remarks']||row['Remark']||'').trim()]
      );
      imported.payments++;
    });
    persist();
  }

  if (skipped.assignments.length) console.warn('[Import] Skipped assignments:\n', skipped.assignments.join('\n'));
  if (skipped.labs.length)        console.warn('[Import] Skipped labs:\n',        skipped.labs.join('\n'));
  if (skipped.payments.length)    console.warn('[Import] Skipped indiv payments:\n', skipped.payments.join('\n'));

  return { success:true, imported, skipped: {
    assignments: skipped.assignments.length,
    labs: skipped.labs.length,
    payments: skipped.payments.length,
    details: skipped,
  }};
}

function excelDateToStr(val) {
  if (!val) return '';
  if (typeof val === 'number') return new Date(Math.round((val-25569)*86400*1000)).toISOString().slice(0,10);
  return String(val).slice(0,10);
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCsv(type, filePath) {
  let csv = '';
  if (type === 'assignments') {
    csv = 'Student,Course,Week,Assignment,Due Date,Status,Remarks\n' +
      getAssignments().map(r =>
        `"${r.student_name}","${r.course_name}",${r.week},"${r.name}",${r.due_date},${r.status},"${r.remarks||''}"`
      ).join('\n');
  } else if (type === 'payments') {
    csv = 'Student,Course,Week,Amount (Rs),Status,Mode,Paid Date,Earned\n' +
      getPayments().map(r =>
        `"${r.student_name}","${r.course_name}",${r.week},${r.amount},${r.status},${r.mode},${r.paid_date||''},${r.earned?'Yes':'No'}`
      ).join('\n');
  } else if (type === 'students') {
    csv = 'Name,College,Email,Phone,Telegram,Username\n' +
      getStudents().map(r =>
        `"${r.name}","${r.college||''}","${r.email||''}","${r.phone||''}","${r.telegram_id||''}","${r.username||''}"`
      ).join('\n');
  } else if (type === 'labs') {
    csv = 'Student,Hostname,Username,IP Address,GitHub User,MySQL User\n' +
      getLabs().map(r =>
        `"${r.student_name}","${r.hostname||''}","${r.username||''}","${r.ip_address||''}","${r.github_user||''}","${r.mysql_user||''}"`
      ).join('\n');
  }
  fs.writeFileSync(filePath, csv, 'utf8');
  return { success:true, path:filePath };
}

// ── Backup ────────────────────────────────────────────────────────────────────
function backup() {
  if (!db) return;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const dest  = path.join(BACKUP_DIR, `backup_${stamp}.db`);
    fs.writeFileSync(dest, Buffer.from(db.export()));
    const files = fs.readdirSync(BACKUP_DIR).filter(f=>f.startsWith('backup_')).sort().reverse();
    files.slice(5).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch(e) { console.error('[DB] Backup failed:', e.message); }
}

function manualBackup(destPath) {
  fs.writeFileSync(destPath, Buffer.from(db.export()));
  return { success:true, path:destPath };
}

function restoreBackup(srcPath) {
  db = new SQL.Database(fs.readFileSync(srcPath));
  persist();
  return { success:true };
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  initDB,
  getStudents, addStudent, updateStudent, deleteStudent,
  getCourses,  addCourse,  updateCourse,  deleteCourse,
  getEnrollmentsByStudent, setEnrollments,
  getAssignments, getAssignmentsByWeek, addAssignment, addAssignmentsBulk,
  updateAssignment, deleteAssignment, markAssignmentComplete,
  getPayments, addPayment, updatePayment, deletePayment, markPaymentPaid,
  getIndivPayments, addIndivPayment, updateIndivPayment, deleteIndivPayment,
  getLabs, addLab, updateLab, deleteLab,
  getDashboardStats,
  importExcel, exportCsv, exportPaymentsXlsx,
  backup, manualBackup, restoreBackup,
};

function exportPaymentsXlsx(filePath) {
  const XLSX = require('xlsx');
  const wb   = XLSX.utils.book_new();

  // Sheet 1: Course Payments
  const courseRows = getPayments().filter(p=>p.earned).map(p=>({
    'Student':    p.student_name,
    'Course':     p.course_name,
    'Week':       p.week,
    'Amount (Rs)': p.amount,
    'Status':     p.status,
    'Mode':       p.mode,
    'Paid Date':  p.paid_date||''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(courseRows), 'Course Payments');

  // Sheet 2: Individual Payments
  const indivRows = getIndivPayments().map(p=>({
    'Student':    p.student_name,
    'Assignment': p.name,
    'Start Date': p.start_date||'',
    'Due Date':   p.due_date||'',
    'Price (Rs)': p.price,
    'Status':     p.status,
    'Remarks':    p.remarks||''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(indivRows), 'Individual Payments');

  XLSX.writeFile(wb, filePath);
  return { success:true, path:filePath };
}
