import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, post } from '../client/src/services/api.js';

const wrongType = 'The workspace API did not return JSON. Check the service address.';

describe('Browser API response contract', () => {
  it('reads JSON and preserves intentional 204 command responses', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.equal(options.credentials, 'same-origin');
      if (options.method === 'POST') {
        assert.equal(options.headers['X-QuizX-Request'], 'workspace');
        return new Response(null, { status: 204 });
      }
      return Response.json(
        { status: 'ready' },
        { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } },
      );
    });
    assert.deepEqual(await api('/health'), { status: 'ready' });
    assert.equal(await post('/auth/logout'), null);
  });

  it('rejects a 200 HTML fallback and mislabeled JSON instead of reporting success', async (t) => {
    const replies = [
      new Response('<html>Not the API</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('{"status":"ready"}', { headers: { 'Content-Type': 'text/plain' } }),
    ];
    t.mock.method(globalThis, 'fetch', async () => replies.shift());
    await assert.rejects(api('/auth/me'), { message: wrongType });
    await assert.rejects(api('/health'), { message: wrongType });
  });

  it('rejects invalid JSON without displaying the response body', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      new Response('not a JSON document', { headers: { 'Content-Type': 'application/json' } }),
    );
    await assert.rejects(api('/health'), { message: 'The workspace API returned invalid JSON.' });
  });

  it('keeps real JSON authentication errors distinct from a proxy error page', async (t) => {
    const replies = [
      Response.json({ error: 'Please log in.' }, { status: 401 }),
      new Response('<html>Proxy response</html>', {
        status: 401,
        headers: { 'Content-Type': 'text/html' },
      }),
    ];
    t.mock.method(globalThis, 'fetch', async () => replies.shift());
    await assert.rejects(api('/auth/me'), { status: 401, message: 'Please log in.' });
    // App.jsx treats a real 401 from /me as an anonymous user; a routing failure is not one.
    await assert.rejects(api('/auth/me'), (e) => e.status === undefined && e.message === wrongType);
  });
});
