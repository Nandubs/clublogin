const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

// On a host with a persistent disk (e.g. Render), set DATA_DIR to that
// disk's mount path so the database survives deploys/restarts.
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'club.db');

// Minimal better-sqlite3-compatible surface (prepare/get/all/run, exec, transaction)
// backed by sql.js, so route files can use the familiar synchronous API.
const db = {};

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const value = args[0];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const named = {};
      for (const key of Object.keys(value)) {
        const sigilKey = /^[:@$]/.test(key) ? key : `@${key}`;
        named[sigilKey] = value[key];
      }
      return named;
    }
    return [value];
  }
  return args;
}

let inTransaction = false;

// db.export() implicitly ends any open transaction, so it must only be
// called when we're not in the middle of a multi-statement transaction.
function persist() {
  if (inTransaction) return;
  fs.writeFileSync(dbPath, Buffer.from(db._sql.export()));
}

db.prepare = (sql) => ({
  get(...args) {
    const stmt = db._sql.prepare(sql);
    try {
      stmt.bind(normalizeParams(args));
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      return row;
    } finally {
      stmt.free();
    }
  },
  all(...args) {
    const stmt = db._sql.prepare(sql);
    const rows = [];
    try {
      stmt.bind(normalizeParams(args));
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  },
  run(...args) {
    const stmt = db._sql.prepare(sql);
    try {
      stmt.bind(normalizeParams(args));
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = db._sql.getRowsModified();
    const idRow = db._sql.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = idRow.length ? idRow[0].values[0][0] : undefined;
    persist();
    return { changes, lastInsertRowid };
  }
});

db.exec = (sql) => {
  db._sql.exec(sql);
  persist();
};

db.transaction = (fn) => (...args) => {
  db._sql.exec('BEGIN');
  inTransaction = true;
  try {
    const result = fn(...args);
    db._sql.exec('COMMIT');
    inTransaction = false;
    persist();
    return result;
  } catch (err) {
    inTransaction = false;
    try { db._sql.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  }
};

db.ready = (async () => {
  const SQL = await initSqlJs();
  db._sql = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  db._sql.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      member_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT,
      whatsapp TEXT,
      address TEXT,
      location TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      whatsapp TEXT,
      address TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'not_paid',
      paid_at TEXT,
      UNIQUE(member_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      electricity_bill REAL NOT NULL DEFAULT 0,
      water_bill REAL NOT NULL DEFAULT 0,
      internet_bill REAL NOT NULL DEFAULT 0,
      miscellaneous REAL NOT NULL DEFAULT 0,
      total_expense REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Databases created before whatsapp/location existed (e.g. the live
  // Render deploy) won't get them from CREATE TABLE IF NOT EXISTS above,
  // so add them here if missing.
  function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  ensureColumn('members', 'whatsapp', 'TEXT');
  ensureColumn('members', 'location', 'TEXT');
  ensureColumn('registrations', 'whatsapp', 'TEXT');
  ensureColumn('registrations', 'location', 'TEXT');

  const memberCount = db.prepare('SELECT COUNT(*) AS count FROM members').get().count;
  if (memberCount === 0) {
    const passwordHash = bcrypt.hashSync('password', 10);
    db.prepare(`
      INSERT INTO members (member_id, name, mobile, address, password_hash, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('brahmastra01', 'Club Admin', '', '', passwordHash, 'admin');
    console.log('Seeded default admin: brahmastra01 / password');
  }
})();

db.LOCATIONS = ['India', 'UAE', 'Qatar', 'Canada', 'UK', 'USA', 'Other'];

module.exports = db;
