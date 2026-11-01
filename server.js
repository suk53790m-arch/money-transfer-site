require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { quote, createTransfer, MODE } = require('./provider');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('Set JWT_SECRET in .env first'); process.exit(1); }

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple file database. Replace with PostgreSQL/MySQL before real use.
const DB = path.join(__dirname, 'db.json');
const load = () => (fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : { users: [], transfers: [] });
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

// Edit this list to the banks your provider supports
const BANKS = [
  { id: 'bank1', name: 'Bank 1' }, { id: 'bank2', name: 'Bank 2' },
  { id: 'bank3', name: 'Bank 3' }, { id: 'wallet1', name: 'Wallet 1' },
  { id: 'wallet2', name: 'Wallet 2' },
];

const auth = (req, res, next) => {
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    req.uid = jwt.verify(t, SECRET).uid;
    next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ error: 'Name, valid email and password (8+ chars) required' });
  const db = load();
  if (db.users.find((u) => u.email === email.toLowerCase()))
    return res.status(400).json({ error: 'Email already registered' });
  const user = { id: crypto.randomUUID(), name, email: email.toLowerCase(),
    hash: await bcrypt.hash(password, 10), kycApproved: false };
  db.users.push(user); save(db);
  res.json({ token: jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' }) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = load().users.find((x) => x.email === (email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(password || '', u.hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: jwt.sign({ uid: u.id }, SECRET, { expiresIn: '7d' }) });
});

app.get('/api/info', (req, res) => res.json({ mode: MODE, banks: BANKS }));

app.post('/api/quote', auth, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter a valid amount' });
  try { res.json(await quote(amount)); } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post('/api/transfers', auth, async (req, res) => {
  const { amount, bankId, account, recipientName } = req.body || {};
  const a = Number(amount);
  if (!(a > 0) || !BANKS.find((b) => b.id === bankId) || !account || !recipientName)
    return res.status(400).json({ error: 'Amount, bank, account and recipient name required' });
  const db = load();
  const user = db.users.find((u) => u.id === req.uid);
  if (MODE !== 'mock' && !user.kycApproved)
    return res.status(403).json({ error: 'Identity check (KYC) not approved yet' });
  const t = { id: crypto.randomUUID(), uid: user.id, amount: a, bankId, account,
    recipientName, createdAt: new Date().toISOString(), status: 'pending' };
  try {
    const r = await createTransfer({ ...t, reference: t.id.slice(0, 8) });
    t.providerId = r.providerId; t.status = r.status;
  } catch (e) { t.status = 'failed'; t.error = e.message; }
  db.transfers.push(t); save(db);
  res.status(t.status === 'failed' ? 502 : 200).json(t);
});

app.get('/api/transfers', auth, (req, res) =>
  res.json(load().transfers.filter((t) => t.uid === req.uid).reverse()));

app.listen(process.env.PORT || 3000, () =>
  console.log('Running on http://localhost:' + (process.env.PORT || 3000) + ' | provider mode: ' + MODE));
