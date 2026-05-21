/**
 * EduTrack - Main Electron Process
 * Uses sql.js (pure JS SQLite, no native compilation needed).
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const db   = require('./database');

let mainWindow;

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Init DB first (async because sql.js loads a WASM file)
  try {
    await db.initDB();
    console.log('[Main] Database ready');
  } catch (e) {
    console.error('[Main] DB init failed:', e);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  db.backup();
  if (process.platform !== 'darwin') app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'EduTrack',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
}

// ── IPC: Students ─────────────────────────────────────────────────────────────
ipcMain.handle('students:getAll',    ()           => db.getStudents());
ipcMain.handle('students:add',       (_, data)    => db.addStudent(data));
ipcMain.handle('students:update',    (_, id, d)   => db.updateStudent(id, d));
ipcMain.handle('students:delete',    (_, id)      => db.deleteStudent(id));

// ── IPC: Courses ──────────────────────────────────────────────────────────────
ipcMain.handle('courses:getAll',     ()           => db.getCourses());
ipcMain.handle('courses:add',        (_, data)    => db.addCourse(data));
ipcMain.handle('courses:update',     (_, id, d)   => db.updateCourse(id, d));
ipcMain.handle('courses:delete',     (_, id)      => db.deleteCourse(id));

// ── IPC: Enrollments ──────────────────────────────────────────────────────────
ipcMain.handle('enrollments:getByStudent', (_, sid)      => db.getEnrollmentsByStudent(sid));
ipcMain.handle('enrollments:set',          (_, sid, cids) => db.setEnrollments(sid, cids));

// ── IPC: Assignments ──────────────────────────────────────────────────────────
ipcMain.handle('assignments:getAll',       ()           => db.getAssignments());
ipcMain.handle('assignments:getByWeek',    (_, week)    => db.getAssignmentsByWeek(week));
ipcMain.handle('assignments:add',          (_, data)    => db.addAssignment(data));
ipcMain.handle('assignments:addBulk',      (_, items)   => db.addAssignmentsBulk(items));
ipcMain.handle('assignments:update',       (_, id, d)   => db.updateAssignment(id, d));
ipcMain.handle('assignments:delete',       (_, id)      => db.deleteAssignment(id));
ipcMain.handle('assignments:markComplete', (_, id)      => db.markAssignmentComplete(id));

// ── IPC: Payments ─────────────────────────────────────────────────────────────
ipcMain.handle('payments:getAll',    ()           => db.getPayments());
ipcMain.handle('payments:add',       (_, data)    => db.addPayment(data));
ipcMain.handle('payments:update',    (_, id, d)   => db.updatePayment(id, d));
ipcMain.handle('payments:delete',    (_, id)      => db.deletePayment(id));
ipcMain.handle('payments:markPaid',  (_, id)      => db.markPaymentPaid(id));

// ── IPC: Individual Payments ──────────────────────────────────────────────────
ipcMain.handle('indivPayments:getAll',   ()        => db.getIndivPayments());
ipcMain.handle('indivPayments:add',      (_, d)    => db.addIndivPayment(d));
ipcMain.handle('indivPayments:update',   (_, id,d) => db.updateIndivPayment(id, d));
ipcMain.handle('indivPayments:delete',   (_, id)   => db.deleteIndivPayment(id));

// ── IPC: Labs ─────────────────────────────────────────────────────────────────
ipcMain.handle('labs:getAll',   ()        => db.getLabs());
ipcMain.handle('labs:add',      (_, d)    => db.addLab(d));
ipcMain.handle('labs:update',   (_, id,d) => db.updateLab(id, d));
ipcMain.handle('labs:delete',   (_, id)   => db.deleteLab(id));

// ── IPC: Dashboard ────────────────────────────────────────────────────────────
ipcMain.handle('dashboard:stats', () => db.getDashboardStats());

// ── IPC: Import / Export / Backup ─────────────────────────────────────────────
ipcMain.handle('import:excel', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Excel File',
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  });
  if (!filePaths.length) return { cancelled: true };
  return db.importExcel(filePaths[0]);
});

ipcMain.handle('export:csv', async (_, type) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: `Export ${type} as CSV`,
    defaultPath: `${type}_export.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (!filePath) return { cancelled: true };
  return db.exportCsv(type, filePath);
});

ipcMain.handle('backup:create', async () => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Database Backup',
    defaultPath: `edutrack_backup_${new Date().toISOString().slice(0,10)}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (!filePath) return { cancelled: true };
  return db.manualBackup(filePath);
});

ipcMain.handle('backup:restore', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Database Backup',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (!filePaths.length) return { cancelled: true };
  return db.restoreBackup(filePaths[0]);
});

ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

ipcMain.handle('export:paymentsXlsx', async () => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Payments as Excel',
    defaultPath: `payments_export_${new Date().toISOString().slice(0,10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (!filePath) return { cancelled: true };
  return db.exportPaymentsXlsx(filePath);
});
