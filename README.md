# EduTrack Desktop App

Student, Assignment, Payment & Lab Credential Tracker — Electron + SQLite desktop application.

---

## Quick Start

### Requirements
- **Node.js** 18+ (https://nodejs.org)
- **npm** 9+ (bundled with Node.js)
- Windows 10+, macOS 11+, or Ubuntu 20+

### Install & Run

```bash
# 1. Extract this folder, then open a terminal inside it
cd edutrack

# 2. Install dependencies (one-time)
npm install

# 3. Rebuild native modules for your Electron version
npx electron-rebuild

# 4. Start the app
npm start
```

The app opens immediately. Your database is created automatically at:
- **Windows:** `%APPDATA%\edutrack\edutrack.db`
- **macOS:**   `~/Library/Application Support/edutrack/edutrack.db`
- **Linux:**   `~/.config/edutrack/edutrack.db`

---

## Build Executable

### Windows (.exe installer)
```bash
npm run build:win
# Output: dist/EduTrack Setup 1.0.0.exe
```

### macOS (.dmg)
```bash
npm run build:mac
# Output: dist/EduTrack-1.0.0.dmg
```

### Linux (.AppImage)
```bash
npm run build:linux
# Output: dist/EduTrack-1.0.0.AppImage
```

### All platforms at once (cross-compile)
```bash
npm run build:all
```

---

## Importing Your Excel File

1. Go to **Import & Export** in the sidebar
2. Click **Import from Excel** and select your `.xlsx` file
3. Expected sheet names:
   | Sheet Name          | Imports            |
   |---------------------|--------------------|
   | `Tracker`           | Assignments        |
   | `Course Info`       | Students & logins  |
   | `System Labs Info`  | Lab credentials    |
   | `Individual Payments` | One-off payments |

4. Column names the importer looks for:
   - **Tracker:** `Student Name`, `Course Name`, `Week`, `Assignment`, `Due Date`, `Status`, `Remarks`
   - **Course Info:** `Student Name`, `College`, `Email`, `Phone`, `Login Link`, `Username`, `Password`
   - **System Labs Info:** `Student Name`, `Hostname`, `Username`, `Password`, `IP Address`, `GitHub User`, `GitHub Token`, `MySQL User`, `MySQL Password`
   - **Individual Payments:** `Student Name`, `Assignment`, `Start Date`, `Due Date`, `Price`, `Status`, `Remarks`

---

## Features

| Feature               | Details                                                    |
|-----------------------|------------------------------------------------------------|
| Dashboard             | Stats, deadlines, progress bars, student glance            |
| Student Management    | CRUD, multi-course enrollment, detail popup                |
| Course Catalog        | 9 pre-loaded courses, add/edit/delete                      |
| Assignment Tracker    | 18-week grid, bulk add, one-click complete, filters        |
| Payment Tracking      | Course & individual payments, mark paid, summaries         |
| Lab Credentials       | AES-256 encrypted, clipboard copy, per-student cards       |
| Reports               | Pending, payment summary, weekly progress, late submissions|
| Import / Export       | Excel import, CSV export, DB backup & restore              |
| Dark / Light theme    | Toggle from top bar or auto via system preference          |
| Keyboard shortcuts    | Ctrl+N (new), Ctrl+F (search), Ctrl+S (save), Esc (close) |

---

## Security

- **Passwords, GitHub tokens, MySQL passwords** are encrypted with AES-256-GCM before being stored
- The encryption key is stored in your OS user profile directory with restricted permissions (`chmod 600`)
- No data ever leaves your machine — fully offline

---

## Backup

- Auto-backup runs every time the app closes
- Up to 5 rolling backups kept in:
  - Windows: `%APPDATA%\edutrack\backups\`
  - macOS:   `~/Library/Application Support/edutrack/backups/`
  - Linux:   `~/.config/edutrack/backups/`
- Manual backup/restore available from the **Import & Export** screen

---

## Portable Mode

To run from a USB drive, copy the entire project folder and run `npm start`. The database will be created relative to the app's userData path. If you want the database next to the app instead, edit `database.js`:

```js
// Change this line in src/main/database.js:
const DB_PATH = path.join(USER_DATA, 'edutrack.db');
// To:
const DB_PATH = path.join(app.getAppPath(), '..', 'edutrack.db');
```

---

## Project Structure

```
edutrack/
├── src/
│   ├── main/
│   │   ├── main.js        ← Electron main process, IPC handlers
│   │   └── database.js    ← SQLite layer, encryption, import/export
│   ├── preload/
│   │   └── preload.js     ← Secure bridge to renderer
│   └── renderer/
│       ├── index.html     ← App shell
│       ├── style.css      ← All styles (dark/light)
│       └── app.js         ← All UI logic
├── assets/                ← App icons (add icon.ico, icon.icns, icon.png)
├── package.json
└── README.md
```

---

## Customization

- **Add a course:** Students → Courses → Add Course
- **Change payment rates:** Edit any course and update the Rate/hr field
- **Add more weeks:** The tracker supports Weeks 1–18 by default; the UI auto-expands
- **Modify encryption:** See `src/main/database.js` — `encrypt()` / `decrypt()` functions

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `better-sqlite3` native build error | Run `npx electron-rebuild` |
| App won't start | Make sure Node.js 18+ is installed |
| Database corrupted | Use Restore Backup from Import & Export |
| Excel import fails | Check that sheet names match exactly (case-sensitive) |

---

## License
MIT — free to use and modify.
