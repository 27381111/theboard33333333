/**
 * Layer DB: SQLite in locale, Postgres (Neon) su Vercel.
 * Forum: users + posts con autore (user_id, username).
 */

const path = require('path');
const fs = require('fs');

const usePostgres = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

let sqliteDb = null;
let neonSql = null;
let pgInited = false;

if (usePostgres) {
  const { neon } = require('@neondatabase/serverless');
  neonSql = neon(connectionString);
}

async function ensurePgInit() {
  if (!usePostgres || pgInited) return;
  await init();
  pgInited = true;
}

function getSqlite() {
  if (!sqliteDb) {
    const Database = require('better-sqlite3');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    sqliteDb = new Database(path.join(dataDir, 'blog.db'));
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image_path TEXT,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    try { sqliteDb.exec('ALTER TABLE posts ADD COLUMN user_id INTEGER'); } catch (_) {}
    try { sqliteDb.exec('ALTER TABLE posts ADD COLUMN username TEXT'); } catch (_) {}
    // post esistenti senza user_id/username restano visibili (mostrati come "anon")
  }
  return sqliteDb;
}

async function init() {
  if (usePostgres && neonSql) {
    await neonSql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await neonSql`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image_path TEXT,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }
}

// --- Users ---
async function createUser(username, email, passwordHash) {
  await ensurePgInit();
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      INSERT INTO users (username, email, password_hash) VALUES (${username}, ${email || null}, ${passwordHash})
      RETURNING id, username, email, created_at
    `;
    return rows[0];
  }
  const db = getSqlite();
  db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email || null, passwordHash);
  return db.prepare('SELECT id, username, email, created_at FROM users WHERE id = last_insert_rowid()').get();
}

async function getUserByUsername(username) {
  await ensurePgInit();
  if (usePostgres && neonSql) {
    const rows = await neonSql`SELECT * FROM users WHERE username = ${username}`;
    return rows[0] || null;
  }
  const db = getSqlite();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

async function getUserById(id) {
  await ensurePgInit();
  const numId = parseInt(id, 10);
  if (!numId) return null;
  if (usePostgres && neonSql) {
    const rows = await neonSql`SELECT * FROM users WHERE id = ${numId}`;
    return rows[0] || null;
  }
  const db = getSqlite();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(numId) || null;
}

// --- Posts (con autore) ---
async function getPosts() {
  await ensurePgInit();
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      SELECT p.id, p.user_id, p.username, p.title, p.body, p.image_path, p.likes, p.created_at
      FROM posts p ORDER BY p.created_at DESC
    `;
    return rows.map(r => ({ id: r.id, user_id: r.user_id, username: r.username || 'anon', title: r.title, body: r.body, image_path: r.image_path, likes: r.likes || 0, created_at: r.created_at }));
  }
  const db = getSqlite();
  return db.prepare('SELECT id, user_id, username, title, body, image_path, likes, created_at FROM posts ORDER BY created_at DESC').all().map(r => ({ ...r, username: r.username || 'anon' }));
}

async function getPost(id) {
  await ensurePgInit();
  const numId = parseInt(id, 10);
  if (!numId) return null;
  if (usePostgres && neonSql) {
    const rows = await neonSql`SELECT * FROM posts WHERE id = ${numId}`;
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, user_id: r.user_id, username: r.username || 'anon', title: r.title, body: r.body, image_path: r.image_path, likes: r.likes || 0, created_at: r.created_at };
  }
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(numId);
  if (row && row.username == null) row.username = 'anon';
  return row || null;
}

async function createPost(userId, username, title, body, image_path) {
  await ensurePgInit();
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      INSERT INTO posts (user_id, username, title, body, image_path) VALUES (${userId}, ${username}, ${title}, ${body}, ${image_path})
      RETURNING id, user_id, username, title, body, image_path, likes, created_at
    `;
    return rows[0];
  }
  const db = getSqlite();
  db.prepare('INSERT INTO posts (user_id, username, title, body, image_path) VALUES (?, ?, ?, ?, ?)').run(userId, username, title, body, image_path);
  return db.prepare('SELECT * FROM posts WHERE id = last_insert_rowid()').get();
}

async function getAnonUserId() {
  await ensurePgInit();
  if (usePostgres && neonSql) {
    let rows = await neonSql`SELECT id FROM users WHERE username = '_anon'`;
    if (rows.length === 0) {
      await neonSql`INSERT INTO users (username, email, password_hash) VALUES ('_anon', NULL, '')`;
      rows = await neonSql`SELECT id FROM users WHERE username = '_anon'`;
    }
    return rows[0] ? rows[0].id : 1;
  }
  const db = getSqlite();
  try { db.prepare("INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (1, '_anon', NULL, '')").run(); } catch (_) {}
  return 1;
}

async function createPostAnon(username, title, body) {
  const anonId = await getAnonUserId();
  return createPost(anonId, (username || '').trim() || 'anon', title, body, null);
}

async function incrementLikes(id) {
  await ensurePgInit();
  const numId = parseInt(id, 10);
  if (!numId) return;
  if (usePostgres && neonSql) {
    await neonSql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${numId}`;
    return;
  }
  const db = getSqlite();
  db.prepare('UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ?').run(numId);
}

async function deletePost(id) {
  await ensurePgInit();
  const numId = parseInt(id, 10);
  if (!numId) return;
  if (usePostgres && neonSql) {
    await neonSql`DELETE FROM posts WHERE id = ${numId}`;
    return;
  }
  const db = getSqlite();
  db.prepare('DELETE FROM posts WHERE id = ?').run(numId);
}

module.exports = { init, createUser, getUserByUsername, getUserById, getPosts, getPost, createPost, createPostAnon, incrementLikes, deletePost, usePostgres };
