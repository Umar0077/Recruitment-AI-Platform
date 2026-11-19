/** Isolated, fictional Demo Mode only. Never signs in to the real API or edits a database. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium } = createRequire(resolve(rootDir, 'frontend/package.json'))('playwright-core');
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3300';
const label = process.env.PERF_LABEL ?? 'manual-production';
if (!/^http:\/\/127\.0\.0\.1:(3200|3300)$/.test(base) || !/^[a-z-]+$/.test(label)) throw Error('Local performance servers only');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
await context.addInitScript(() => {
  window.__perf = { cls: 0, lcp: 0, interactions: [], shifts: [], longTasks: [] };
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.longTasks.push(e.duration); }).observe({type:'longtask',buffered:true});
  let session = 0, first = 0, last = 0;
  new PerformanceObserver(list => { for (const e of list.getEntries()) {
    if (e.hadRecentInput) continue;
    if (e.startTime - last > 1000 || e.startTime - first > 5000) { first = e.startTime; session = 0; }
    session += e.value; last = e.startTime; window.__perf.cls = Math.max(window.__perf.cls, session);
    window.__perf.shifts.push({ value: e.value, tags: e.sources?.map(s => s.node?.tagName) });
  }}).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.interactionId) window.__perf.interactions.push(e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
});
const page = await context.newPage();
page.setDefaultTimeout(90000);
const errors = [], requests = [], rows = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().includes('/api/')) requests.push({ path: new URL(r.url()).pathname, status: r.status() }); });
async function navigate(name, path, locator) {
  await page.evaluate(({ path }) => {
    const main = document.querySelector('main');
    const header = document.querySelector('header');
    const oldHeading = main?.querySelector('h1')?.textContent;
    const oldText = main?.textContent;
    window.__navigation = null;
    document.addEventListener('click', () => {
      const start = performance.now(); let feedback = null, retained = true, headerRetained = true, frames = 0;
      const tick = () => {
        frames++;
        const content = document.querySelector('main');
        const loader = Array.from(document.querySelectorAll('[role=status], [aria-busy=true]')).some(e => e.getBoundingClientRect().height > 0);
        const ready = location.pathname === path && !!content && (content.textContent?.length ?? 0) > 20 && content.textContent !== oldText && !content.querySelector('.ios-loader:not(.inline-flex)');
        if (feedback === null && (loader || ready)) feedback = performance.now() - start;
        if (!ready && oldHeading && (!content?.textContent?.includes(oldHeading))) retained = false;
        if (header && !header.isConnected) headerRetained = false;
        if (ready || performance.now() - start > 60000) window.__navigation = { ms: performance.now() - start, startMs:start, feedbackMs: feedback, oldContentRetained: retained, headerRetained, frames, ready };
        else requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    }, { once: true, capture: true });
  }, { path });
  await locator.click();
  await page.waitForFunction(() => window.__navigation !== null, null, { timeout: 65000 });
  const result = await page.evaluate(() => window.__navigation);
  if (path === '/admin/analytics') {
    await page.locator('main .recharts-surface').first().waitFor();
    result.chartReadyMs = await page.evaluate(() => performance.now() - window.__navigation.startMs);
  }
  delete result.startMs;
  rows.push({ name, path, ...result }); console.log(JSON.stringify(rows.at(-1)));
}
async function login(role) {
  const t = performance.now();
  await page.goto(`${base}/${role}/login`, { waitUntil: 'networkidle' });
  await page.getByText('UI Demo Mode.', { exact: true }).waitFor();
  rows.push({ name: `${role} cold login`, ms: performance.now() - t, ...(await page.evaluate(() => ({ ...window.__perf, scripts: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script').reduce((a,r) => ({ count: a.count+1, bytes: a.bytes+r.transferSize }), { count: 0, bytes: 0 }) }))) });
  await page.getByLabel('Email address').fill(`performance-${role}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('Fictional-browser-only-92!');
  const t2 = performance.now();
  await page.getByRole('button', { name: /^(Sign In|Sign in|Continue)/ }).click();
  await page.waitForURL(`${base}/${role === 'admin' ? 'admin' : 'candidate/interview'}`);
  await page.locator('main h1').waitFor();
  rows.push({ name: `${role} sign in`, ms: performance.now() - t2 });
}
try {
  await login('admin');
  const paths = ['/admin/candidates','/admin/interviews','/admin/assessments','/admin/analytics','/admin/pipeline','/admin/interview-setup','/admin/settings','/admin/api-usage','/admin/assessments/rubrics','/admin/settings/accounts','/admin/team','/admin'];
  for (let round = 0; round < 2; round++) for (const path of paths) {
    await navigate(`${round ? 'warm' : 'first'} ${path}`, path, page.locator(`aside a[href="${path}"]`).first());
  }
  await page.locator('aside a[href="/admin/candidates"]').click();
  await page.waitForURL(`${base}/admin/candidates`);
  await page.getByRole('heading', { name: 'Candidates', exact: true }).waitFor();
  await page.locator('main tbody tr.cursor-pointer').first().waitFor();
  const candidate = page.locator('main a[href^="/admin/candidates/"]').first();
  if (await candidate.count()) await navigate('candidate detail', await candidate.getAttribute('href'), page.locator('main tbody tr.cursor-pointer').first());
  await page.locator('aside a[href="/admin"]').first().click();
  await page.waitForURL(`${base}/admin`);
  await page.getByRole('heading', { name: 'HR Dashboard', exact: true }).waitFor();
  const interview = page.locator('main a[href^="/admin/interviews/"]').first();
  if (await interview.count()) await navigate('interview review', await interview.getAttribute('href'), interview);
  await login('candidate');
  await navigate('candidate instructions', '/candidate/interview/instructions', page.locator('main a[href="/candidate/interview/instructions"]').first());
  await navigate('candidate consent', '/candidate/interview/consent', page.locator('main a[href="/candidate/interview/consent"]').first());
  await page.locator('#consent').click();
  await navigate('candidate equipment', '/candidate/interview/equipment', page.getByRole('button', {name:'Agree and Continue'}));
  await page.getByRole('button', {name:/Presenting without a microphone/}).click();
  await navigate('candidate practice', '/candidate/interview/practice', page.getByRole('button', {name:'Continue to Practice'}));
  rows.push({name:'candidate lab interactions',...await page.evaluate(() => ({interactionSamples:window.__perf.interactions,longTasks:window.__perf.longTasks}))});
  if (label.startsWith('after')) {
    const start = performance.now();
    await page.getByRole('button',{name:'Skip Practice'}).click();
    await page.waitForURL(`${base}/candidate/interview/session`);
    await page.getByRole('button',{name:'Start Voice Interview'}).waitFor();
    const timerVisible = await page.getByText('1:30',{exact:true}).count() > 0;
    await page.getByRole('button',{name:'Mute interviewer',exact:true}).click();
    await page.getByRole('button',{name:'Start Voice Interview'}).click();
    let confirmed = 0;
    while (!page.url().endsWith('/candidate/interview/complete') && confirmed < 40) {
      const typeInstead = page.getByRole('button',{name:'Prefer to type? Type your answer instead'});
      await typeInstead.waitFor();
      await typeInstead.click();
      await page.getByRole('textbox').fill(`Fictional performance test response ${confirmed+1}. I listen carefully, clarify the issue, and explain the next steps.`);
      const submit = page.getByRole('button',{name:'Confirm & Submit',exact:true});
      const final = await submit.count() > 0;
      await (final ? submit : page.getByRole('button',{name:'Confirm Answer',exact:true})).click();
      confirmed++;
      if (final) { await page.waitForURL(`${base}/candidate/interview/complete`); break; }
    }
    await page.locator('main h1').waitFor();
    rows.push({name:'fictional typed interview completion',confirmed,timerVisible,ms:performance.now()-start,completed:page.url().endsWith('/candidate/interview/complete'),physicalDevicesTested:false});
    if (!timerVisible || !page.url().endsWith('/candidate/interview/complete')) errors.push('Interview timer or fictional completion verification failed');
  }
  await navigate('candidate status', '/candidate/status', page.locator('header a[href="/candidate/status"]'));
  for (const width of [360,390,430,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:1000});
    for (const path of ['/admin','/admin/candidates','/admin/assessments/INT-1026','/candidate/status']) {
      await page.goto(`${base}${path}`, {waitUntil:'networkidle'});
      await page.locator('main h1').waitFor();
      rows.push({ name:'viewport',path,width,...await page.evaluate(() => ({overflow:document.documentElement.scrollWidth>innerWidth,cls:window.__perf.cls,lcp:window.__perf.lcp})) });
    }
  }
  if (label.startsWith('after')) {
    const previewDir = resolve(rootDir, 'frontend/.next-ui-preview/performance');
    await mkdir(previewDir, {recursive:true});
    for (const theme of ['light','dark']) {
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(theme => localStorage.setItem('interviewos-theme',theme),theme);
      await page.goto(`${base}/admin/assessments/INT-1026`,{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:/Section A — Candidate Overview/i}).waitFor();
      await page.getByPlaceholder(/Add an internal remark/i).fill('UNSAVED_DRAFT_EXCLUDED_FROM_PDF');
      await page.emulateMedia({media:'print'});
      const printCheck = await page.evaluate(() => {
        const area = document.querySelector('.print-area');
        return {
          sectionsPresent: ['Section A','Section B','Section C','Section D','Section E','Section F'].every(s => area?.textContent?.includes(s)),
          draftExcluded: !area?.textContent?.includes('UNSAVED_DRAFT_EXCLUDED_FROM_PDF'),
          asideHidden: getComputedStyle(document.querySelector('aside.no-print')).display === 'none',
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      const pdfBuf = await page.pdf({format:'A4',printBackground:true});
      await page.emulateMedia({media:'screen'});
      const pdfHeader = pdfBuf.subarray(0,5).toString('ascii');
      rows.push({name:'hr report pdf export',theme,bytes:pdfBuf.length,validPdf:pdfHeader==='%PDF-',...printCheck});
      if (pdfHeader !== '%PDF-' || !printCheck.sectionsPresent || !printCheck.draftExcluded || !printCheck.asideHidden) {
        errors.push(`HR Report PDF export validation failed in ${theme} mode`);
      }
    }
    for (const theme of ['light','dark']) {
      for (const width of [390,1440]) {
        await page.setViewportSize({width,height:1000});
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.evaluate(theme => localStorage.setItem('interviewos-theme',theme),theme);
        await page.goto(`${base}/admin`,{waitUntil:'networkidle'});
        await page.getByRole('heading',{name:'HR Dashboard',exact:true}).waitFor();
        await page.screenshot({path:resolve(previewDir, `${label}-${theme}-${width}.png`),fullPage:true});
        rows.push({name:'appearance',theme,width,reducedMotion:true,...await page.evaluate(() => ({overflow:document.documentElement.scrollWidth>innerWidth,cls:window.__perf.cls}))});
        if (width===390) {
          await page.getByRole('button',{name:'Open navigation'}).click();
          await page.getByRole('dialog').getByRole('link',{name:'Candidates',exact:true}).click();
          await page.waitForURL(`${base}/admin/candidates`);
          await page.getByRole('dialog').waitFor({state:'hidden'});
          rows.push({name:'mobile drawer navigation',theme,passed:true});
        }
      }
    }
    const transitioned = rows.filter(r => r.ready !== undefined);
    if (transitioned.some(r => !r.ready)) errors.push('A navigation did not render its destination');
    if (transitioned.some(r => !r.oldContentRetained || !r.headerRetained)) errors.push('A normal navigation removed existing content or its shared header');
    if (rows.some(r => r.overflow)) errors.push('Viewport horizontal overflow');
    const signedOut = await browser.newContext({viewport:{width:1440,height:1000}});
    await signedOut.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const publicPage = await signedOut.newPage();
    for (const path of ['/candidate/signup','/candidate/verify-email','/candidate/complete-profile','/candidate/onboarding','/admin']) {
      const t = performance.now();
      await publicPage.goto(`${base}${path}`,{waitUntil:'networkidle'});
      await publicPage.locator('h1').first().waitFor();
      rows.push({name:'signed-out route audit',path,finalPath:new URL(publicPage.url()).pathname,heading:await publicPage.locator('h1').first().textContent(),ms:performance.now()-t});
    }
    if (!publicPage.url().includes('/admin/login')) errors.push('Signed-out admin route did not redirect to login');
    await signedOut.close();
  }
} catch (e) { errors.push(e.message); console.error(e.message); }
finally {
  const perfDir = resolve(rootDir, 'docs/performance/full');
  await mkdir(perfDir, {recursive:true});
  await writeFile(resolve(perfDir, `${label}.json`), JSON.stringify({at:new Date().toISOString(),base,label,browser:browser.version(),method:'Headless installed Chrome, Demo Mode, no CPU/network throttling; click-to-first-frame with destination heading. Event Timing samples are lab interaction durations, not field INP.',rows,requests,errors},null,2));
  await browser.close();
}
if (errors.length) process.exitCode=1;
