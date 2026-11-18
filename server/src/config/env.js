export function databaseUrl(env) {
  try {
    const u = new URL(env.DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(u.protocol) ||
      !u.hostname ||
      u.hostname === 'HOST' ||
      u.username === 'USER' ||
      !u.pathname.slice(1)
    )
      throw Error();
    return u.href;
  } catch {
    throw new Error('Set DATABASE_URL to a valid PostgreSQL database URL.');
  }
}
export function configFrom(env) {
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV.');
  const production = mode === 'production';
  if (
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32 ||
    /replace-with|change-me/i.test(env.SESSION_SECRET)
  )
    throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
  let base;
  try {
    base = new URL(env.APP_BASE_URL);
  } catch {
    throw new Error('Set APP_BASE_URL to the public web origin.');
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.href !== base.origin + '/' ||
    (production && base.protocol !== 'https:')
  )
    throw new Error('APP_BASE_URL must be a web origin (HTTPS in production).');
  const port = Number(env.PORT || 3000),
    proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  if (![0, 1, 2].includes(proxyHops)) throw new Error('TRUST_PROXY_HOPS must be 0, 1 or 2.');
  return {
    databaseUrl: databaseUrl(env),
    secret: env.SESSION_SECRET,
    origin: base.origin,
    preview:
      mode === 'development' && base.protocol === 'https:' && base.hostname.endsWith('.e2b.app'),
    production,
    port,
    proxyHops,
  };
}
