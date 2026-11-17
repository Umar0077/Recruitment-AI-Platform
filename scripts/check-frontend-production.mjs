/** Local production-build HTTP smoke; no sign-in, provider calls or application writes. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const port = 3103, base = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let phase = 'port availability', child, exited = false;
const evidence = { mode: 'api', production: true, apiUrl: 'https://api.example.invalid/api/v1', deploymentReady: false, routes: [], applicationWrites: 0 };
try {
  await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve())); });
  phase = 'startup'; const began = performance.now();
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port), '--hostname', '127.0.0.1'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_APP_MODE: 'api', NEXT_PUBLIC_API_BASE_URL: evidence.apiUrl, NEXT_TELEMETRY_DISABLED: '1' } });
  child.on('error', () => { exited = true; }); child.on('exit', () => { exited = true; });
  let ready = false;
  while (!exited && performance.now() - began < 45000) {
    try { ready = (await fetch(base + '/candidate/login', {signal: AbortSignal.timeout(1500)})).status === 200; } catch { /* Await startup only. */ }
    if (ready) break; await pause(200);
  }
  assert(ready && !exited); evidence.startupAndFirstResponseMs = Math.round(performance.now() - began);
  phase = 'page and asset checks'; let loginHtml = '';
  for (const route of ['/candidate/login','/admin/login','/admin/api-usage','/privacy']) {
    const start = performance.now(), response = await fetch(base + route, {signal: AbortSignal.timeout(8000)}), body = await response.text();
    assert.equal(response.status, 200);
    evidence.routes.push({route,status:response.status,htmlResponseMs:Math.round(performance.now()-start),cacheControl:response.headers.get('cache-control'),poweredBy:response.headers.get('x-powered-by'),nosniff:response.headers.get('x-content-type-options'),framePolicy:response.headers.get('x-frame-options'),csp:response.headers.has('content-security-policy')});
    if (route === '/candidate/login') { loginHtml = body; assert(!body.includes('UI Demo Mode')); }
    if (route === '/admin/api-usage') assert(!body.includes('fictional request samples'));
  }
  const asset = loginHtml.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/);
  assert(asset); const assetResponse = await fetch(new URL(asset[1], base), {signal: AbortSignal.timeout(8000)});
  assert.equal(assetResponse.status,200); const cacheControl=assetResponse.headers.get('cache-control'); assert(cacheControl?.includes('immutable'));
  evidence.staticAsset={status:assetResponse.status,cacheControl}; evidence.status='passed';
} catch { evidence.status='failed'; evidence.failurePhase=phase; process.exitCode=1; }
finally {
  if(child&&!exited){ child.kill(); for(let i=0;i<30&&!exited;i++) await pause(100); if(!exited)child.kill('SIGKILL'); }
  evidence.processStopped = !child || exited;
  await writeFile('docs/performance/frontend-production.json',JSON.stringify(evidence,null,2)+'\n');
  process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
}
