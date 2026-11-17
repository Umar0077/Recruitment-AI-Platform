/** Built Nest controllers/guards + real PostgreSQL, fictional rollback fixtures only. Build first. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parse } = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { AdminAuthController } = require('../../dist/modules/auth/admin-auth.controller');
const { AdminAuthService, passwordHash } = require('../../dist/modules/auth/admin-auth.service');
const { AuthGuard } = require('../../dist/modules/auth/auth.guard');
const { AuditService } = require('../../dist/modules/audit/audit.module');
const { AllExceptionsFilter, ResponseEnvelopeInterceptor } = require('../../dist/common/http');
let phase = 'configuration';
async function main() {
  const env = parse(readFileSync(resolve(__dirname, '../../.env')));
  const url = new URL(env.TEST_DATABASE_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && /_test$/.test(url.pathname) && env.TEST_DATABASE_URL !== env.DATABASE_URL);
  const db = new PrismaClient({ datasources: { db: { url: env.TEST_DATABASE_URL } }, log: [] });
  const email = `fictional-http-${randomUUID()}@example.test`;
  const password = `Fictional-${randomUUID()}Aa1!`, next = `Changed-${randomUUID()}Bb2!`;
  const rollback = new Error('ROLLBACK');
  let app;
  try {
    const before = { credentials: await db.adminCredential.count(), sessions: await db.adminSession.count() };
    try {
      await db.$transaction(async tx => {
        phase = 'fictional fixture';
        const user = await tx.user.create({ data: { firebaseUid: `fictional-http:${randomUUID()}`, email, displayName: 'Fictional HTTP administrator', roles: { create: { role: { connect: { code: 'SUPER_ADMIN' } } } } } });
        await tx.adminCredential.create({ data: { userId: user.id, email, passwordHash: await passwordHash(password) } });
        const adapter = new Proxy(tx, { get: (object, prop) => prop === '$transaction' ? async fn => fn(tx) : Reflect.get(object, prop) });
        const config = new ConfigService({ FRONTEND_ORIGINS: 'http://localhost:3000', NODE_ENV: 'development', AUTH_MODE: 'firebase', AUTH_ALLOWED_PROVIDERS: 'google.com,password' });
        const service = new AdminAuthService(adapter, new AuditService(adapter), config);
        class FixtureModule {}
        Module({ controllers: [AdminAuthController], providers: [{ provide: AdminAuthService, useValue: service }] })(FixtureModule);
        app = await NestFactory.create(FixtureModule, { logger: false });
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        app.useGlobalFilters(new AllExceptionsFilter()); app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
        app.useGlobalGuards(new AuthGuard(new Reflector(), { configured: true, verify: async () => { throw new Error('Firebase must not verify admin requests'); } }, {}, config, service));
        await app.listen(0, '127.0.0.1');
        const base = `${await app.getUrl()}/api/v1/admin-auth`;
        let cookie = '';
        async function call(path, method = 'GET', body, extra = {}) {
          const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', 'X-Admin-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          return { status: response.status, body: await response.json(), setCookie };
        }
        phase = 'expected signed-out state and credential checks';
        assert.equal((await call('/me')).status, 401);
        assert.equal((await call('/me', 'GET', undefined, { Authorization: 'Bearer fictional-candidate' })).status, 401);
        assert.equal((await call('/login', 'POST', { email, password }, { Origin: 'https://untrusted.example.test' })).status, 403);
        assert.equal((await call('/login', 'POST', { email, password }, { 'X-Admin-Request': '' })).status, 403);
        assert.equal((await call('/login', 'POST', { email, password: 'incorrect' })).status, 401);
        phase = 'POST login and cookie session verification';
        const login = await call('/login', 'POST', { email, password });
        assert.equal(login.status, 200); assert.equal(login.body.data.authenticated, true);
        for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) assert(login.setCookie.includes(attribute));
        assert(!login.setCookie.includes('Secure')); // local HTTP only; production Secure tested in auth suite
        const first = await call('/me'); assert.equal(first.status, 200); assert.equal(first.body.data.mustChangePassword, true);
        assert(!JSON.stringify(first.body).includes('passwordHash'));
        assert.equal((await call('/accounts')).body.error.code, 'PASSWORD_CHANGE_REQUIRED');
        phase = 'mandatory password change and revocation';
        assert.equal((await call('/change-password', 'POST', { currentPassword: password, newPassword: next }, { Origin: 'https://untrusted.example.test' })).status, 403);
        const changed = await call('/change-password', 'POST', { currentPassword: password, newPassword: next });
        assert.equal(changed.status, 200); assert(changed.setCookie.includes('Max-Age=0'));
        assert.equal((await call('/me')).status, 401);
        assert.equal((await call('/login', 'POST', { email, password: next })).status, 200);
        const verified = await call('/me'); assert.equal(verified.status, 200); assert.equal(verified.body.data.mustChangePassword, false);
        assert.equal((await call('/accounts')).status, 200);
        assert.equal((await call('/logout', 'POST')).status, 200); assert.equal((await call('/me')).status, 401);
        await app.close(); app = null;
        throw rollback;
      }, { timeout: 90000 });
    } catch (e) { if (e !== rollback) throw e; }
    phase = 'rollback verification';
    assert.equal(await db.adminCredential.count({ where: { email } }), 0);
    assert.equal(await db.adminCredential.count(), before.credentials); assert.equal(await db.adminSession.count(), before.sessions);
    console.log(JSON.stringify({ status: 'passed', realHttp: true, realPostgres: true, login: '200', initialMe: '200 / mandatory change', passwordChange: '200 / sessions revoked', newLoginAndMe: '200 / change completed', csrf: '403', logoutMe: '401', fixturesRolledBack: true, existingCredentialsModified: false }));
  } finally { if (app) await app.close(); await db.$disconnect(); }
}
main().catch(() => { console.error(JSON.stringify({ status: 'failed', phase, sensitiveDetailsSuppressed: true })); process.exitCode = 1; });
