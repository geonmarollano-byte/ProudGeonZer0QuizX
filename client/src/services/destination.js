export function homeFor(user) {
  if (!user) return '/login';
  if (user.mustChangeCredentials) return '/activate';
  return user.role === 'HOST' ? '/host' : '/player';
}
