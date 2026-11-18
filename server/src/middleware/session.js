import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { check, audited } from './http.js';
const Store = pgSession(session);
export const cookieName = 'quizx.sid';
const idleMs = 30 * 60 * 1000,
  absoluteMs = 12 * 60 * 60 * 1000;
export function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.production || config.preview,
    sameSite: config.preview ? 'none' : 'lax',
    partitioned: config.preview,
    path: '/',
  };
}
export function sessionLayer(pool, config) {
  return session({
    name: cookieName,
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new Store({
      pool,
      tableName: 'sessions',
      createTableIfMissing: false,
      errorLog: () => console.error('[session] store error'),
    }),
    cookie: { ...cookieOptions(config), maxAge: idleMs },
  });
}
export async function rotate(req, user) {
  await new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
  Object.assign(req.session, { uid: user.id, version: user.credential_version, born: Date.now() });
  await new Promise((ok, fail) => req.session.save((e) => (e ? fail(e) : ok())));
}
export async function endSession(req, res, config) {
  await new Promise((ok, fail) => req.session.destroy((e) => (e ? fail(e) : ok())));
  res.clearCookie(cookieName, cookieOptions(config));
}
export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangeCredentials: row.must_change_credentials,
  };
}
export function authenticated(pool, config) {
  return async (req, res, next) => {
    check(req.session?.uid, 401, 'Please log in to your workspace.');
    const {
      rows: [user],
    } = await pool.query(
      'SELECT id,username,role,must_change_credentials,credential_version FROM users WHERE id=$1 AND is_active',
      [req.session.uid],
    );
    if (
      !user ||
      user.credential_version !== req.session.version ||
      !(req.session.born > Date.now() - absoluteMs)
    ) {
      await endSession(req, res, config);
      return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    }
    req.user = user;
    next();
  };
}
export function roleOnly(role) {
  return (req, _res, next) => {
    check(!req.user.must_change_credentials, 403, 'Activate your account first.');
    if (req.user.role !== role) {
      audited('role_denied', req.user.id);
      check(false, 403, 'This area is not available to your account.');
    }
    next();
  };
}
