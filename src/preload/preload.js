/**
 * EduTrack - Preload Script
 * Exposes a safe, typed API to the renderer via contextBridge.
 * No direct Node.js access in the renderer.
 */

const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Students
  students: {
    getAll:  ()         => ipcRenderer.invoke('students:getAll'),
    add:     (data)     => ipcRenderer.invoke('students:add', data),
    update:  (id, data) => ipcRenderer.invoke('students:update', id, data),
    delete:  (id)       => ipcRenderer.invoke('students:delete', id),
  },

  // Courses
  courses: {
    getAll:  ()         => ipcRenderer.invoke('courses:getAll'),
    add:     (data)     => ipcRenderer.invoke('courses:add', data),
    update:  (id, data) => ipcRenderer.invoke('courses:update', id, data),
    delete:  (id)       => ipcRenderer.invoke('courses:delete', id),
  },

  // Enrollments
  enrollments: {
    getByStudent: (sid)            => ipcRenderer.invoke('enrollments:getByStudent', sid),
    set:          (sid, courseIds) => ipcRenderer.invoke('enrollments:set', sid, courseIds),
  },

  // Assignments
  assignments: {
    getAll:        ()          => ipcRenderer.invoke('assignments:getAll'),
    getByWeek:     (week)      => ipcRenderer.invoke('assignments:getByWeek', week),
    add:           (data)      => ipcRenderer.invoke('assignments:add', data),
    addBulk:       (items)     => ipcRenderer.invoke('assignments:addBulk', items),
    update:        (id, data)  => ipcRenderer.invoke('assignments:update', id, data),
    delete:        (id)        => ipcRenderer.invoke('assignments:delete', id),
    markComplete:  (id)        => ipcRenderer.invoke('assignments:markComplete', id),
  },

  // Payments
  payments: {
    getAll:   ()          => ipcRenderer.invoke('payments:getAll'),
    add:      (data)      => ipcRenderer.invoke('payments:add', data),
    update:   (id, data)  => ipcRenderer.invoke('payments:update', id, data),
    delete:   (id)        => ipcRenderer.invoke('payments:delete', id),
    markPaid: (id)        => ipcRenderer.invoke('payments:markPaid', id),
  },

  // Individual Payments
  indivPayments: {
    getAll:  ()          => ipcRenderer.invoke('indivPayments:getAll'),
    add:     (data)      => ipcRenderer.invoke('indivPayments:add', data),
    update:  (id, data)  => ipcRenderer.invoke('indivPayments:update', id, data),
    delete:  (id)        => ipcRenderer.invoke('indivPayments:delete', id),
  },

  // Lab Credentials
  labs: {
    getAll:  ()          => ipcRenderer.invoke('labs:getAll'),
    add:     (data)      => ipcRenderer.invoke('labs:add', data),
    update:  (id, data)  => ipcRenderer.invoke('labs:update', id, data),
    delete:  (id)        => ipcRenderer.invoke('labs:delete', id),
  },

  // Dashboard
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
  },

  // Import / Export / Backup
  io: {
    importExcel:   ()       => ipcRenderer.invoke('import:excel'),
    exportCsv:     (type)   => ipcRenderer.invoke('export:csv', type),
    exportPaymentsXlsx: ()   => ipcRenderer.invoke('export:paymentsXlsx'),
    backupCreate:  ()       => ipcRenderer.invoke('backup:create'),
    backupRestore: ()       => ipcRenderer.invoke('backup:restore'),
  },

  // Clipboard (secure copy without exposing full clipboard API)
  clipboard: {
    write: (text) => clipboard.writeText(text),
  },

  // Open external URL
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
