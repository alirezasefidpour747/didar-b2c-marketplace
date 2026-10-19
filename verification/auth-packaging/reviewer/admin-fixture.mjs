import assert from 'node:assert/strict';

// Test fixture only: use both existing identity authorities. Never grant a link
// in SQL or treat native authentication alone as DIDAR authorization.
export async function connectAdminFixture({ request, login, api, source }) {
  const native = await request(api, '/auth/user/emailpass', {
    source, body: { email: 'native-admin@didar.test', password: 'DidarNative2026!' },
  });
  assert.equal(native.status, 200);
  assert.ok(native.body.token);
  const headers = { authorization: 'Bearer ' + native.body.token };
  const context = () => request(api, '/admin/didar/context', { method: 'GET', source, headers });
  const unlinked = await context();
  assert.equal(unlinked.status, 403, 'Disposable Admin must initially require canonical proof');
  const proof = await login(api, source, { email: 'admin@didar.test', password: 'DidarDemo2026!' });
  assert.equal(proof.status, 200);
  assert.equal(proof.body.user.id, 'demo-admin');
  assert.equal(proof.body.user.role, 'admin');
  assert.ok(proof.body.token);
  const linked = await request(api, '/admin/didar/connect', { source, headers, body: { didar_token: proof.body.token } });
  assert.equal(linked.status, 200);
  const authorized = await context();
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.user.id, 'demo-admin');
  assert.equal(authorized.body.user.role, 'admin');
  // Return only sanitized outcomes, never bearer or canonical session tokens.
  return { native_login_status: native.status, unlinked_context_status: unlinked.status,
    canonical_login_status: proof.status, canonical_identity: proof.body.user.id,
    dual_link_status: linked.status, linked_context_status: authorized.status };
}
