import assert from 'node:assert/strict';

// Run against a production build with Supabase variables intentionally unset.
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3010';
for (const path of ['/', '/features', '/showcase', '/pricing', '/download', '/login']) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  if (path === '/login') {
    assert.match(response.headers.get('cache-control'), /no-store/);
    const html = await response.text();
    assert.match(html, /Sign-in will be available/);
    assert.match(html, /disabled/);
  }
  console.log('PASS', path);
}
const response = await fetch(new URL('/account', base), { redirect: 'manual' });
assert.equal(response.status, 307);
assert.equal(response.headers.get('location'), '/login');
assert.match(response.headers.get('cache-control'), /no-store/);
console.log('PASS /account: signed-out redirect and private caching');
