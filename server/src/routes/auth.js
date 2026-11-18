import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { transaction } from '../db/pool.js';
import { check, empty, audited, HttpError } from '../middleware/http.js';
import { authenticated, publicUser, rotate, endSession } from '../middleware/session.js';
import { username, oldPassword, password } from '../services/credentials.js';
const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
const login = z.strictObject({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: oldPassword,
});
const activation = z.strictObject({
  newUsername: username,
  newPassword: password,
  confirmPassword: oldPassword,
});
const changes = z.strictObject({
  currentPassword: oldPassword,
  newUsername: username.optional(),
  newPassword: password.optional(),
  confirmPassword: oldPassword.optional(),
});
const limiter = (limit, options = {}) =>
  rateLimit({
    ...options,
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many unsuccessful requests. Try again in 15 minutes.' },
  });

export function authRoutes(pool, config) {
  const router = Router();
  router.post('/login', limiter(30), async (req, res) => {
    const value = login.safeParse(req.body);
    const input = value.success ? value.data : null;
    const user =
      input &&
      (
        await pool.query(
          'SELECT id,password_hash,is_active,credential_version FROM users WHERE username=$1',
          [input.username],
        )
      ).rows[0];
    const match = await bcrypt.compare(input?.password || '', user?.password_hash ?? dummyHash);
    if (!user?.is_active || !match) {
      audited('login_denied');
      throw new HttpError(401, 'Username or password is incorrect.');
    }
    await rotate(req, user);
    audited('login', user.id);
    res.sendStatus(204);
  });
  router.use(authenticated(pool, config));
  router.get('/me', (req, res) => res.json(publicUser(req.user)));
  router.post('/logout', async (req, res) => {
    empty.parse(req.body);
    await endSession(req, res, config);
    audited('logout', req.user.id);
    res.sendStatus(204);
  });
  const credentialLimit = limiter(10, { keyGenerator: (req) => `account:${req.user.id}` });
  function update(activate) {
    return async (req, res) => {
      const input = (activate ? activation : changes).parse(req.body);
      check(input.newPassword === input.confirmPassword, 400, 'The new passwords do not match.');
      try {
        const user = await transaction(pool, async (db) => {
          const {
            rows: [row],
          } = await db.query(
            'SELECT id,username,password_hash,role,must_change_credentials,credential_version FROM users WHERE id=$1 AND is_active FOR UPDATE',
            [req.user.id],
          );
          check(
            row && row.credential_version === req.session.version,
            401,
            'Log in again to update credentials.',
          );
          check(
            activate === row.must_change_credentials,
            403,
            activate ? 'Your account is already activated.' : 'Activate your account first.',
          );
          if (!activate)
            check(
              await bcrypt.compare(input.currentPassword, row.password_hash),
              400,
              'Current password is incorrect.',
            );
          const renamed = input.newUsername && input.newUsername !== row.username;
          check(!activate || renamed, 400, 'Choose a different username for your account.');
          check(renamed || input.newPassword, 400, 'Enter a new username or password.');
          let hash = row.password_hash;
          if (input.newPassword) {
            check(
              !(await bcrypt.compare(input.newPassword, hash)),
              400,
              'Choose a password different from your current password.',
            );
            hash = await bcrypt.hash(input.newPassword, 12);
          }
          return (
            await db.query(
              `UPDATE users SET username=$2,password_hash=$3,must_change_credentials=false,credential_version=credential_version+1,updated_at=now()
            WHERE id=$1 RETURNING id,username,role,must_change_credentials,credential_version`,
              [row.id, input.newUsername ?? row.username, hash],
            )
          ).rows[0];
        });
        await rotate(req, user);
        audited(activate ? 'activated' : 'credentials_changed', user.id);
        res.json(publicUser(user));
      } catch (e) {
        if (e.code === '23505')
          throw new HttpError(409, 'That username is not available. Choose another.');
        throw e;
      }
    };
  }
  router.post('/activate', credentialLimit, update(true));
  router.post('/change-credentials', credentialLimit, update(false));
  return router;
}
