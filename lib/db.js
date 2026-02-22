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
  try {
    await neonSql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`;
    await neonSql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (_) {}
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
    try { sqliteDb.exec('ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0'); } catch (_) {}
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id)
      )
    `);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
    await neonSql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id),
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await neonSql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
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
      SELECT p.id, p.user_id, p.username, p.title, p.body, p.image_path, p.likes, p.created_at, COALESCE(p.pinned, false) AS pinned
      FROM posts p ORDER BY p.pinned DESC NULLS LAST, p.created_at DESC
    `;
    return rows.map(r => ({ id: r.id, user_id: r.user_id, username: r.username || 'anon', title: r.title, body: r.body, image_path: r.image_path, likes: r.likes || 0, created_at: r.created_at, pinned: !!r.pinned }));
  }
  const db = getSqlite();
  return db.prepare('SELECT id, user_id, username, title, body, image_path, likes, created_at, COALESCE(pinned, 0) AS pinned FROM posts ORDER BY pinned DESC, created_at DESC').all().map(r => ({ ...r, username: r.username || 'anon', pinned: !!r.pinned }));
}

async function setPinnedPost(postId) {
  await ensurePgInit();
  const numId = parseInt(postId, 10);
  if (usePostgres && neonSql) {
    await neonSql`UPDATE posts SET pinned = false`;
    if (numId) await neonSql`UPDATE posts SET pinned = true WHERE id = ${numId}`;
    return;
  }
  const db = getSqlite();
  db.prepare('UPDATE posts SET pinned = 0').run();
  if (numId) db.prepare('UPDATE posts SET pinned = 1 WHERE id = ?').run(numId);
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
    await neonSql`DELETE FROM comments WHERE post_id = ${numId}`;
    await neonSql`DELETE FROM posts WHERE id = ${numId}`;
    return;
  }
  const db = getSqlite();
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(numId);
  db.prepare('DELETE FROM posts WHERE id = ?').run(numId);
}

// --- Comments ---
async function getComments(postId) {
  await ensurePgInit();
  const numId = parseInt(postId, 10);
  if (!numId) return [];
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      SELECT id, post_id, username, body, created_at
      FROM comments WHERE post_id = ${numId} ORDER BY created_at ASC
    `;
    return rows.map(r => ({ id: r.id, post_id: r.post_id, username: r.username || 'anon', body: r.body, created_at: r.created_at }));
  }
  const db = getSqlite();
  return db.prepare('SELECT id, post_id, username, body, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(postId).map(r => ({ ...r, username: r.username || 'anon' }));
}

async function createComment(postId, username, body) {
  await ensurePgInit();
  const numId = parseInt(postId, 10);
  if (!numId || !body || !(body = String(body).trim())) return null;
  const name = (username || '').trim() || 'anon';
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      INSERT INTO comments (post_id, username, body) VALUES (${numId}, ${name}, ${body})
      RETURNING id, post_id, username, body, created_at
    `;
    return rows[0] || null;
  }
  const db = getSqlite();
  db.prepare('INSERT INTO comments (post_id, username, body) VALUES (?, ?, ?)').run(numId, name, body);
  return db.prepare('SELECT id, post_id, username, body, created_at FROM comments WHERE id = last_insert_rowid()').get();
}

// --- Chatboard (pulizia messaggi > 12h) ---
const CHAT_PRUNE_HOURS = 12;

async function getChatMessages(limit = 200) {
  await ensurePgInit();
  const pruneBefore = new Date(Date.now() - CHAT_PRUNE_HOURS * 60 * 60 * 1000);
  const pruneIso = pruneBefore.toISOString();
  if (usePostgres && neonSql) {
    await neonSql`DELETE FROM chat_messages WHERE created_at < ${pruneIso}`;
    const rows = await neonSql`
      SELECT id, username, body, created_at FROM chat_messages ORDER BY created_at ASC LIMIT ${limit}
    `;
    return rows.map(r => ({ id: r.id, username: r.username || 'anon', body: r.body, created_at: r.created_at }));
  }
  const db = getSqlite();
  db.prepare('DELETE FROM chat_messages WHERE created_at < ?').run(pruneIso);
  return db.prepare('SELECT id, username, body, created_at FROM chat_messages ORDER BY created_at ASC LIMIT ?').all(limit).map(r => ({ ...r, username: r.username || 'anon' }));
}

async function getLastChatMessageByUsername(username) {
  await ensurePgInit();
  if (!username) return null;
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      SELECT id, username, body, created_at FROM chat_messages WHERE username = ${username} ORDER BY created_at DESC LIMIT 1
    `;
    return rows[0] || null;
  }
  const db = getSqlite();
  return db.prepare('SELECT id, username, body, created_at FROM chat_messages WHERE username = ? ORDER BY created_at DESC LIMIT 1').get(username) || null;
}

async function addChatMessage(username, body) {
  await ensurePgInit();
  const name = (username || '').trim() || 'anon';
  const text = (body || '').trim();
  if (!text) return null;
  if (usePostgres && neonSql) {
    const rows = await neonSql`
      INSERT INTO chat_messages (username, body) VALUES (${name}, ${text})
      RETURNING id, username, body, created_at
    `;
    return rows[0] || null;
  }
  const db = getSqlite();
  db.prepare('INSERT INTO chat_messages (username, body) VALUES (?, ?)').run(name, text);
  return db.prepare('SELECT id, username, body, created_at FROM chat_messages WHERE id = last_insert_rowid()').get();
}

async function deleteChatMessage(id) {
  await ensurePgInit();
  const numId = parseInt(id, 10);
  if (!numId) return;
  if (usePostgres && neonSql) {
    await neonSql`DELETE FROM chat_messages WHERE id = ${numId}`;
    return;
  }
  const db = getSqlite();
  db.prepare('DELETE FROM chat_messages WHERE id = ?').run(numId);
}

module.exports = { init, createUser, getUserByUsername, getUserById, getPosts, getPost, createPost, createPostAnon, incrementLikes, deletePost, setPinnedPost, getComments, createComment, getChatMessages, getLastChatMessageByUsername, addChatMessage, deleteChatMessage, usePostgres };
