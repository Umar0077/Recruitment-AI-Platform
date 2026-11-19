/* Live HTTP + PostgreSQL + private MinIO integration. Fictional dedicated lab ONLY.
 * Never loads the real app .env, never prints tokens/passwords/signed URLs. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { parse } = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { validateEnv } = require('../../dist/config/env.validation');
const runtime = resolve(__dirname, '../../../infrastructure/recording-lab/runtime');
const env = parse(readFileSync(resolve(runtime, 'backend.env')));
validateEnv(env);
assert.equal(env.RECORDING_MODE, 'local_test');
assert.equal(new URL(env.DATABASE_URL).pathname, '/interviewos_recording_lab');
const origin = 'http://127.0.0.1:3100', base = 'http://127.0.0.1:4100/api/v1';
let phase = 'configuration', db, cookie = '', lastStatus, lastEndpoint;
const checks = [];
async function api(path, { token, admin, method = 'GET', body, expected = 200, headers = {} } = {}) {
  lastEndpoint = path.split("?")[0];
  const response = await fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(admin ? { Cookie: cookie, 'X-Admin-Request': '1' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(55000) });
  lastStatus = response.status;
  assert.equal(response.status, expected, `Unexpected HTTP status during ${phase}`);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie && admin) { assert(/HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie)); cookie = setCookie.split(';')[0]; }
  const json = await response.json();
  return json.data;
}
async function candidate(auth, suffix) {
  const email = `http-${suffix}-${randomUUID()}@example.test`, password = `Fixture-${randomBytes(24).toString('hex')}Aa1!`;
  await auth.createUser({ email, password, emailVerified: true, displayName: 'Fictional HTTP Recording Fixture' });
  const response = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fictional-emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200); const { idToken } = await response.json(); assert(idToken);
  await api('/auth/me', { token: idToken }); return idToken;
}
async function main() {
  const media = readFileSync(resolve(runtime, 'synthetic-pattern.webm'));
  assert.equal(media.subarray(0, 4).toString('hex'), '1a45dfa3');
  assert(media.length < 5242880);
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
  const auth = getAuth(initializeApp({ projectId: 'demo-interviewos-recording' }, 'recording-http'));
  phase = 'fictional candidate login and role selection';
  const token = await candidate(auth, 'owner'), stranger = await candidate(auth, 'other');
  assert.equal((await api('/interviews/initial', { token, method: 'POST', body: {} })).state, 'select_role');
  const assigned = await api('/interviews/initial', { token, method: 'POST', body: { roleCode: 'CSR-FRESHER' } });
  const sessionId = assigned.interviewId; assert(sessionId);
  await api(`/interviews/${sessionId}/start`, { token, method: 'POST', body: { consent: true } });
  checks.push('Firebase emulator password login', 'role selection', 'automatic assignment', 'consented interview start');
  phase = 'live private storage policy';
  const policy = await api('/recordings/policy', { token }); assert(policy.available); assert.equal(policy.mode, 'local_test'); assert.deepEqual(policy.blockers, []);
  const create = { sessionId, clientId: randomUUID(), consent: true, policyReference: policy.policyReference, cameraConsent: true, monitoringConsent: true, systemAudioConsent: false, displaySurface: 'browser', contentType: 'video/webm' };
  await api('/recordings', { token, method: 'POST', body: { ...create, consent: false }, expected: 400 });
  const recording = await api('/recordings', { token, method: 'POST', body: create, expected: 201 });
  assert.equal((await api('/recordings', { token, method: 'POST', body: create, expected: 201 })).id, recording.id);
  await api(`/recordings?sessionId=${sessionId}`, { token: stranger, expected: 404 });
  await api(`/recordings/${recording.id}/parts`, { token: stranger, method: 'POST', body: { partNumber: 1, sizeBytes: media.length }, expected: 404 });
  phase = 'real multipart upload and database confirmation';
  const part = await api(`/recordings/${recording.id}/parts`, { token, method: 'POST', body: { partNumber: 1, sizeBytes: media.length }, expected: 201 });
  await api(`/recordings/${recording.id}/complete`, { token, method: 'POST', body: { partsCount: 1, durationMs: 2000 }, expected: 409 });
  const put = await fetch(part.url, { method: 'PUT', body: media, headers: { Origin: origin } });
  assert.equal(put.status, 200); assert(put.headers.get('etag')); assert.equal(put.headers.get('access-control-allow-origin'), origin);
  for (const type of ['RECORDING_STARTED', 'TAB_HIDDEN', 'TAB_VISIBLE', 'SCREEN_SHARE_STOPPED']) {
    const event = { id: randomUUID(), type, occurredAt: new Date().toISOString(), captureState: 'RECORDING' };
    await api(`/recordings/${recording.id}/events`, { token, method: 'POST', body: event, expected: 201 });
    await api(`/recordings/${recording.id}/events`, { token, method: 'POST', body: event, expected: 201 });
  }
  await api(`/recordings/${recording.id}/complete`, { token, method: 'POST', body: { partsCount: 1, durationMs: 2000 }, expected: 201 });
  const metadata = await db.interviewRecording.findUniqueOrThrow({ where: { id: recording.id } });
  assert.equal(metadata.status, 'UPLOADED'); assert.equal(metadata.sizeBytes, media.length);
  assert.equal(await db.interviewSessionEvent.count({ where: { recordingId: recording.id } }), 4);
  checks.push('consent rejection', 'candidate ownership', 'idempotent creation', 'premature completion rejected', 'signed PUT with ETag and exact CORS', 'storage-confirmed size/type', 'PostgreSQL metadata', 'event deduplication');
  phase = 'separate admin login and mandatory password change';
  const accountsPath = resolve(runtime, 'test-accounts.json'), accounts = JSON.parse(readFileSync(accountsPath, 'utf8'));
  const credential = await db.adminCredential.findUniqueOrThrow({ where: { email: accounts.adminEmail } });
  const currentPassword = credential.mustChangePassword ? accounts.adminPassword : accounts.adminNextPassword;
  await api('/admin-auth/me', { expected: 401 });
  await api('/admin-auth/login', { admin: true, method: 'POST', body: { email: accounts.adminEmail, password: currentPassword } });
  assert.equal((await api('/admin-auth/me', { admin: true })).mustChangePassword, credential.mustChangePassword);
  if (credential.mustChangePassword) {
    await api(`/recordings/${recording.id}/playback`, { admin: true, expected: 403 });
    await api('/admin-auth/change-password', { admin: true, method: 'POST', body: { currentPassword, newPassword: accounts.adminNextPassword } });
    accounts.adminPasswordChanged = true; writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
    await api('/admin-auth/me', { admin: true, expected: 401 });
    await api('/admin-auth/login', { admin: true, method: 'POST', body: { email: accounts.adminEmail, password: accounts.adminNextPassword } });
  }
  assert.equal((await api('/admin-auth/me', { admin: true })).mustChangePassword, false);
  await api(`/recordings/${recording.id}/playback`, { admin: true, expected: 409 });
  phase = 'confirmed fictional answers and completion';
  const detail = await api(`/interviews/${sessionId}`, { token });
  for (const q of detail.questions) await api(`/interviews/${sessionId}/answers/${q.code}`, { token, method: 'PUT', body: { transcript: `Fictional test answer for ${q.code}. I would listen carefully and ask a clear follow-up question.`, source: 'TYPED_FALLBACK', responseDurationSec: 2 } });
  await api(`/interviews/${sessionId}/submit`, { token, method: 'POST' });
  const before = await db.interviewAnswer.findMany({ where: { sessionId }, orderBy: { id: 'asc' } });
  assert.equal(before.length, 4);
  phase = 'authorized private playback delivery';
  await api(`/recordings/${recording.id}/playback`, { expected: 401 });
  await api(`/recordings/${recording.id}/playback`, { token, expected: 403 });
  const access = await api(`/recordings/${recording.id}/playback`, { admin: true });
  const url = new URL(access.url); assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
  const anonymous = new URL(url); anonymous.search = '';
  assert.equal((await fetch(anonymous)).status, 403);
  const download = await fetch(url, { headers: { Origin: origin } }); assert.equal(download.status, 200);
  assert.equal(download.headers.get('access-control-allow-origin'), origin);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(media).digest('hex'));
  const range = await fetch(url, { headers: { Range: 'bytes=0-31', Origin: origin } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
  writeFileSync(resolve(runtime, 'downloaded-pattern.webm'), bytes);
  checks.push('admin login HttpOnly SameSite=Strict session', 'mandatory first password change', 'playback blocked during interview', 'four confirmed answers preserved', 'anonymous object GET denied', 'candidate playback denied', '60-second signed reviewer GET', 'byte-identical video delivery', 'HTTP Range 206');
  phase = 'authorized test deletion';
  await api(`/recordings/${recording.id}`, { admin: true, method: 'DELETE', expected: 403, headers: { Origin: 'https://untrusted.example.test' } });
  await api(`/recordings/${recording.id}`, { token, method: 'DELETE', expected: 403 });
  await api(`/recordings/${recording.id}`, { admin: true, method: 'DELETE' });
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await db.interviewRecording.findUniqueOrThrow({ where: { id: recording.id } })).status, 'DELETED');
  assert.equal(await db.recordingSegment.count({ where: { recordingId: recording.id } }), 0);
  assert.equal(await db.interviewSessionEvent.count({ where: { recordingId: recording.id } }), 0);
  assert.deepEqual(await db.interviewAnswer.findMany({ where: { sessionId }, orderBy: { id: 'asc' } }), before);
  assert.equal(await db.auditLog.count({ where: { entityId: recording.id, action: 'recording.deletion_verified' } }), 1);
  checks.push('cross-origin mutation denied', 'candidate deletion denied', 'reviewer deletion verified by storage GET 404', 'event/segment cleanup', 'deletion audit', 'answers unchanged');
  const report = { status: 'passed', at: new Date().toISOString(), sessionId, recordingId: recording.id, database: 'interviewos_recording_lab', syntheticMediaOnly: true, physicalBrowserCapture: 'not tested by this script', bytes: media.length, checks };
  writeFileSync(resolve(runtime, 'http-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(() => { console.error(JSON.stringify({ status: 'failed', phase, httpStatus: lastStatus, endpoint: lastEndpoint, checksCompleted: checks, details: 'Raw errors withheld to protect local credentials.' })); process.exitCode = 1; }).finally(async () => { await db?.$disconnect(); });
