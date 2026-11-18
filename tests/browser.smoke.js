import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture, freshPassword } from './fixture.js';

async function fits(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Content exceeds viewport width',
  );
}
async function login(page, username, password) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
async function activate(page, username) {
  await page.waitForURL('**/activate');
  await fits(page);
  const password = freshPassword();
  await page.getByLabel('New username', { exact: true }).fill(username);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Activate account' }).click();
  return password;
}
async function nav(page, name) {
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Workspace menu' }).click();
  await nav.getByRole('link', { name, exact: true }).click();
}

describe('Chromium smoke: built React client + Express + real PostgreSQL', () => {
  let f, server, browser;
  const errors = [];
  before(async () => {
    f = await fixture();
    server = await new Promise((ok, bad) => {
      const s = f.app.listen(f.config.port, '127.0.0.1', () => ok(s));
      s.once('error', bad);
    });
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    });
  });
  after(async () => {
    await browser?.close();
    if (server) await new Promise((ok) => server.close(ok));
    await f?.close();
  });
  it('protects deep links, shows login loading/error, supports help and fits phone, tablet and desktop widths', async () => {
    const ctx = await browser.newContext(),
      page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.name));
    try {
      await page.goto(`${f.config.origin}/host/games/99`);
      await page.waitForURL('**/login');
      for (const width of [320, 360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 850 });
        await fits(page);
      }
      await page.getByRole('button', { name: 'Studio guide' }).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Activation guide' }).click();
      await page.getByRole('heading', { name: 'Your first login' }).waitFor();
      await page.getByRole('button', { name: 'Got it' }).click();
      let resume;
      const gate = new Promise((ok) => {
        resume = ok;
      });
      await page.route('**/api/auth/login', async (route) => {
        await gate;
        await route.continue();
      });
      await login(page, 'unknown_user', freshPassword());
      assert.equal(await page.getByRole('button', { name: 'Logging in…' }).isDisabled(), true);
      resume();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Username or password is incorrect.' })
        .waitFor();
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
    } finally {
      await ctx.close();
    }
  });
  it('completes mobile activation, desktop creation/edit/publish, assignment, player scoring, settings and independent logout', async () => {
    const hc = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
      pc = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const h = await hc.newPage(),
      p = await pc.newPage();
    h.on('pageerror', (e) => errors.push(e.name));
    p.on('pageerror', (e) => errors.push(e.name));
    try {
      await Promise.all([h.goto(f.config.origin), p.goto(f.config.origin)]);
      await Promise.all([
        login(h, 'hostdemo', f.secrets.hostPassword),
        login(p, 'player01', f.secrets.playerPassword),
      ]);
      const [, playerPassword] = await Promise.all([
        activate(h, 'workshop_host'),
        activate(p, 'mobile_learner'),
      ]);
      await h.waitForURL('**/host');
      await p.waitForURL('**/player');
      await h.getByRole('heading', { name: 'Your studio starts here.' }).waitFor();
      await p.getByRole('heading', { name: 'No games assigned yet.' }).waitFor();
      await fits(p);
      await nav(h, 'Create game');
      await h.getByLabel('Game title').fill('Field notes');
      await h.getByLabel('Instructions (optional)').fill('Choose one answer.');
      await h.getByLabel('Question text').fill('Which note is first?');
      await h.getByLabel('Option A', { exact: true }).fill('Alpha');
      await h.getByLabel('Option B', { exact: true }).fill('Beta');
      await h.getByRole('button', { name: 'Save draft' }).click();
      await h.getByText('Draft saved.', { exact: true }).waitFor();
      await h.getByRole('link', { name: 'Edit draft' }).click();
      await h.getByLabel('Points', { exact: true }).fill('15');
      await h.getByRole('button', { name: 'Publish game' }).click();
      await h.getByRole('link', { name: 'Manage assignments' }).click();
      await h.getByRole('checkbox', { name: 'mobile_learner' }).check();
      await h.getByRole('button', { name: 'Assign selected (1)' }).click();
      await h.getByRole('dialog').getByRole('button', { name: 'Confirm assignment' }).click();
      await h.getByText('Assigned to 1 player(s).', { exact: true }).waitFor();
      await p.getByRole('button', { name: 'Refresh' }).click();
      await p.getByRole('link').filter({ hasText: 'Field notes' }).click();
      await p.getByRole('button', { name: 'Start game' }).click();
      await p.getByRole('radio', { name: /Alpha/ }).check();
      await fits(p);
      await p.getByRole('button', { name: 'Submit answers' }).click();
      await p.getByRole('button', { name: 'Confirm submission' }).click();
      await p.getByRole('heading', { name: 'Game complete.' }).waitFor();
      assert.match(await p.locator('.big-score').innerText(), /15\s*\/\s*15/);
      await fits(p);
      await nav(h, 'Results');
      await h.getByText(/mobile_learner ·/).waitFor();
      await nav(p, 'Settings');
      await p.getByLabel('Current password', { exact: true }).fill(playerPassword);
      await p.getByLabel('New username (optional)').fill('renamed_learner');
      await p.getByRole('button', { name: 'Save changes' }).click();
      await p.getByText('Credentials updated. Use your new details next time.').waitFor();
      await h.getByRole('button', { name: 'Log out' }).click();
      await h.waitForURL('**/login');
      await p.reload();
      await p.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      await nav(p, 'My results');
      await p.getByRole('link').filter({ hasText: 'Field notes' }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await hc.close();
      await pc.close();
    }
  });
});
