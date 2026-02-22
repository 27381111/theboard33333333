const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const db = require('./lib/db');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_COOKIE = 'board_admin';
const ADMIN_SALT = 'the_board_admin_salt';

function adminToken() {
  if (!ADMIN_PASSWORD) return null;
  return crypto.createHash('sha256').update(ADMIN_PASSWORD + ADMIN_SALT).digest('hex');
}

function isAdmin(req) {
  const token = adminToken();
  return token && req.cookies && req.cookies[ADMIN_COOKIE] === token;
}

const app = express();
const PORT = process.env.PORT || 31337;

function vagueDate(isoDate) {
  const now = new Date();
  const d = new Date(isoDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const postDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((today - postDay) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'this week';
  if (diffDays <= 30) return 'this month';
  return 'some time ago';
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.vagueDate = vagueDate;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('something went wrong');
});

app.get('/', async (req, res, next) => {
  try {
    const posts = await db.getPosts();
    res.render('index', { posts });
  } catch (e) {
    next(e);
  }
});

app.get('/post/:id', async (req, res, next) => {
  try {
    const post = await db.getPost(req.params.id);
    if (!post) return res.status(404).send('post not found');
    await db.incrementLikes(req.params.id);
    post.views = (post.likes || 0) + 1;
    const comments = await db.getComments(req.params.id);
    res.render('post', { post, comments });
  } catch (e) {
    next(e);
  }
});

app.post('/post/:id/comment', async (req, res, next) => {
  try {
    const post = await db.getPost(req.params.id);
    if (!post) return res.status(404).send('post not found');
    const username = (req.body.username || '').trim();
    const body = (req.body.body || req.body.comment || '').trim();
    if (!body) return res.redirect('/post/' + req.params.id + '?err=comment');
    await db.createComment(req.params.id, username, body);
    res.redirect('/post/' + req.params.id);
  } catch (e) {
    next(e);
  }
});

app.post('/post', async (req, res) => {
  const username = (req.body.username || '').trim();
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (!title || !body) return res.redirect('/?err=missing');
  await db.createPostAnon(username, title, body);
  res.redirect('/');
});

// --- Admin (solo con password da env ADMIN_PASSWORD) ---
app.get('/admin', async (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).send('admin not configured');
  if (!isAdmin(req)) return res.render('admin-login', { err: req.query.err });
  const posts = await db.getPosts();
  res.render('admin', { posts });
});

app.post('/admin', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).send('admin not configured');
  if (req.body.password !== ADMIN_PASSWORD) return res.redirect('/admin?err=bad');
  res.cookie(ADMIN_COOKIE, adminToken(), { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/admin');
});

app.post('/admin/delete/:id', (req, res) => {
  if (!ADMIN_PASSWORD || !isAdmin(req)) return res.redirect('/admin');
  db.deletePost(req.params.id).then(() => res.redirect('/admin'));
});

app.post('/admin/pin/:id', async (req, res) => {
  if (!ADMIN_PASSWORD || !isAdmin(req)) return res.redirect('/admin');
  await db.setPinnedPost(req.params.id);
  res.redirect('/admin');
});
app.post('/admin/unpin', async (req, res) => {
  if (!ADMIN_PASSWORD || !isAdmin(req)) return res.redirect('/admin');
  await db.setPinnedPost(null);
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.redirect('/');
});

// vecchie route rimosse
app.get('/login', (req, res) => res.redirect('/'));
app.get('/register', (req, res) => res.redirect('/'));

if (require.main === module) {
  db.init().then(() => {
    app.listen(PORT, () => {
      console.log('the board running at http://localhost:' + PORT);
    });
  }).catch(err => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
}

module.exports = app;
