const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');

const extension = resolve(__dirname, '../extension');
const profile = mkdtempSync(join(tmpdir(), 'better-pr-chromium-'));
const id = createHash('sha256').update(extension).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));
const browser = spawn(process.env.CHROMIUM || 'chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
  '--disable-dev-shm-usage', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--load-extension=${extension}`,
  `--disable-extensions-except=${extension}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let ws;
async function main() {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(output)), 15000);
    browser.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    browser.on('error', reject);
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const pending = new Map();
  let nextID = 0;
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      send('Fetch.fulfillRequest', {
        requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
        body: Buffer.from(`<!doctype html><title>GitHub fixture</title>
          <style>body{font:14px system-ui;margin:24px}.UnderlineNav-body{display:flex;list-style:none;padding:0;gap:12px;width:max-content}.UnderlineNav{display:flex;overflow:hidden;border-bottom:1px solid #ddd}.UnderlineNav-item{display:flex;align-items:center;padding:8px;color:#222;text-decoration:none;white-space:nowrap}.js-responsive-underlinenav-overflow{display:block}a{color:#0969da}</style>
          <nav class="js-responsive-underlinenav UnderlineNav" aria-label="Repository"><ul class="UnderlineNav-body">
          <li style="display:none"><a href="/octocat/hello-world" class="UnderlineNav-item js-responsive-underlinenav-item">Code</a></li>
          <li><a href="/octocat/hello-world/issues" class="UnderlineNav-item js-responsive-underlinenav-item">Issues</a></li>
          <li><a id="repo" href="/octocat/hello-world/pulls" class="UnderlineNav-item js-responsive-underlinenav-item">Pull requests</a></li>
          <li><a href="/octocat/hello-world/actions" class="UnderlineNav-item js-responsive-underlinenav-item">Actions</a></li>
          <li><a href="/octocat/hello-world/projects" class="UnderlineNav-item js-responsive-underlinenav-item">Projects</a></li>
          </ul><div class="js-responsive-underlinenav-overflow"><button>More</button><a id="overflow" href="/octocat/hello-world/pulls">Pull requests</a></div></nav>
          <a id="global" href="/pulls">Pull requests</a> <a id="explicit" href="/pulls?q=is%3Aclosed">Closed</a>`).toString('base64'),
      }, message.sessionId).catch(console.error);
    } else if (message.method === 'Runtime.exceptionThrown') {
      console.error('Browser exception:', JSON.stringify(message.params.exceptionDetails));
    }
  };
  function send(method, params = {}, sessionId) {
    const id = ++nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async function tab(url, mock = false) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    if (mock) await send('Fetch.enable', { patterns: [{ urlPattern: 'https://github.com/*' }] }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    return sessionId;
  }
  async function evaluate(sessionId, expression) {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  }
  async function until(sessionId, expression) {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(sessionId, expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const page = await evaluate(sessionId, 'JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText.slice(0,500),links:[...document.querySelectorAll("a[href*=pulls]")].slice(0,4).map(a=>a.outerHTML),dropdowns:document.querySelectorAll("[data-bpr-dropdown]").length})');
    throw new Error(`Condition not met: ${expression}\n${page}`);
  }

  async function setEnabled(value) {
    await evaluate(options, `new Promise(resolve => chrome.storage.sync.set({enabled:${value}}, resolve))`);
    await until(github, `document.querySelectorAll('[data-bpr-dropdown]').length ${value ? '>' : '==='} 0`);
  }

  const geometry = `JSON.stringify([...document.querySelectorAll('.UnderlineNav-body, .UnderlineNav-body > li, .UnderlineNav-item, [data-tab-item], li:has(> [data-tab-item]), ul:has(> li > [data-tab-item])')].map(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return [rect.x, rect.y, rect.width, rect.height, style.display, style.visibility];
  }))`;

  const options = await tab(`chrome-extension://${id}/options.html`);
  await until(options, 'document.querySelector("#settings")?.disabled === false');
  assert.equal(await evaluate(options, 'document.querySelector("#filter").value'), 'is:pr is:open');
  const github = await tab('https://github.com/octocat/hello-world', true);
  await until(github, 'document.querySelector("#repo")?.href.includes("q=")');
  assert.equal(await evaluate(github, 'new URL(document.querySelector("#repo").href).searchParams.get("q")'), 'is:pr is:open');
  assert.equal(await evaluate(github, 'document.querySelector("#explicit").getAttribute("href")'), '/pulls?q=is%3Aclosed');

  await evaluate(options, 'document.querySelector("#filter").value = "is:pr is:open review-requested:@me"; document.querySelector("#filter").dispatchEvent(new Event("input", {bubbles:true})); document.querySelector("form").requestSubmit()');
  await until(options, 'document.querySelector("#status").textContent.startsWith("Saved.")');
  await until(github, 'new URL(document.querySelector("#repo").href).searchParams.get("q") === "is:pr is:open review-requested:@me"');
  await evaluate(github, 'const a = document.createElement("a"); a.id="dynamic"; a.href="/new/repo/pulls"; document.body.append(a)');
  await until(github, 'document.querySelector("#dynamic").href.includes("q=")');

  const root = 'document.querySelector("#repo").nextElementSibling.shadowRoot';
  assert.equal(await evaluate(github, 'document.querySelectorAll("[data-bpr-dropdown]").length'), 4);
  assert.equal(await evaluate(github, 'getComputedStyle(document.querySelector(".js-responsive-underlinenav-overflow")).display'), 'block');
  assert.equal(await evaluate(github, 'getComputedStyle(document.querySelector(".UnderlineNav-body > li")).display'), 'none');
  assert.equal(await evaluate(github, `Math.abs(document.querySelector('#repo').getBoundingClientRect().top + document.querySelector('#repo').getBoundingClientRect().height / 2 - (${root}.querySelector('.trigger').getBoundingClientRect().top + 14)) < 1`), true);

  // Create a named action in the settings page, leaving the main action intact.
  await evaluate(options, 'document.querySelector("#add-action").click(); document.querySelector("[data-field=label]").value="My PRs"; document.querySelector("[data-field=filter]").value="is:pr is:open author:@me"; document.querySelector("form").requestSubmit()');
  await until(github, `${root}.querySelectorAll('a').length === 2`);
  await evaluate(github, `${root}.querySelector('.trigger').click()`);
  assert.equal(await evaluate(github, `${root}.querySelector('.trigger').getAttribute('aria-expanded')`), 'true');
  assert.equal(await evaluate(github, `new URL(${root}.querySelectorAll('a')[1].href).pathname`), '/octocat/hello-world/pulls');
  assert.equal(await evaluate(github, `new URL(${root}.querySelectorAll('a')[1].href).searchParams.get('q')`), 'is:pr is:open author:@me');
  assert.equal(await evaluate(github, 'new URL(document.querySelector("#repo").href).searchParams.get("q")'), 'is:pr is:open review-requested:@me');

  // Arrow keys navigate the menu; Escape returns focus to the caret.
  await evaluate(github, `${root}.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true,composed:true}))`);
  assert.equal(await evaluate(github, `${root}.activeElement === ${root}.querySelectorAll('a')[1]`), true);
  await evaluate(github, `${root}.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true,composed:true}))`);
  assert.equal(await evaluate(github, `${root}.activeElement === ${root}.querySelector('.trigger')`), true);
  assert.equal(await evaluate(github, `${root}.querySelector('.trigger').getAttribute('aria-expanded')`), 'false');

  // Add another action directly from the GitHub dropdown.
  await evaluate(github, `${root}.querySelector('.trigger').click(); ${root}.querySelector('#filters > button').click(); ${root}.querySelector('input[name=label]').value='Drafts'; ${root}.querySelector('input[name=filter]').value='is:pr is:open is:draft'; ${root}.querySelector('form').requestSubmit()`);
  await until(github, `${root}.querySelectorAll('a').length === 3`);
  await until(options, 'document.querySelectorAll(".action").length === 2');
  assert.equal(await evaluate(github, `new URL(${root}.querySelectorAll('a')[2].href).searchParams.get('q')`), 'is:pr is:open is:draft');

  // An actual click navigates using the selected extra filter.
  await evaluate(github, `${root}.querySelectorAll('a')[2].click()`);
  await until(github, 'new URL(location.href).searchParams.get("q") === "is:pr is:open is:draft" && document.querySelector("[data-bpr-dropdown]") !== null');
  await evaluate(github, `${root}.querySelector('.trigger').click()`);
  await evaluate(github, 'document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles:true,composed:true}))');
  assert.equal(await evaluate(github, `${root}.querySelector('.trigger').getAttribute('aria-expanded')`), 'false');

  // Editing/removing actions in settings updates all GitHub dropdowns.
  await evaluate(options, 'document.querySelector("[data-field=label]").value="Mine"; document.querySelector("[data-field=label]").dispatchEvent(new Event("input", {bubbles:true})); document.querySelectorAll(".action")[1].querySelector("button").click(); document.querySelector("form").requestSubmit()');
  await until(github, `${root}.querySelectorAll('a').length === 2 && ${root}.querySelectorAll('a')[1].textContent.startsWith('Mine')`);
  await evaluate(options, 'document.querySelector("#filter").value=""; document.querySelector("#filter").dispatchEvent(new Event("input", {bubbles:true})); document.querySelector("form").requestSubmit()');
  await until(github, 'document.querySelector("#repo").getAttribute("href") === "/octocat/hello-world/pulls"');
  assert.equal(await evaluate(github, 'document.querySelectorAll("[data-bpr-dropdown]").length'), 3);

  // GitHub's existing overflow menu and hidden tabs retain their own behavior.
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false }, github);
  assert.equal(await evaluate(github, 'getComputedStyle(document.querySelector(".js-responsive-underlinenav-overflow")).display'), 'block');
  assert.equal(await evaluate(github, 'getComputedStyle(document.querySelector("nav")).overflowX'), 'hidden');

  await evaluate(options, 'document.querySelector("#enabled").checked = false; document.querySelector("#enabled").dispatchEvent(new Event("input", {bubbles:true})); document.querySelector("form").requestSubmit()');
  await until(github, 'document.querySelectorAll("[data-bpr-dropdown]").length === 0');
  assert.equal(await evaluate(github, 'document.querySelector("[data-bpr-navigation]")'), null);
  await evaluate(options, 'document.querySelector("#enabled").checked = true; document.querySelector("#enabled").dispatchEvent(new Event("input", {bubbles:true})); document.querySelector("form").requestSubmit()');
  await until(github, 'document.querySelectorAll("[data-bpr-dropdown]").length === 3');
  assert.equal(await evaluate(options, 'document.querySelector("h1 img").naturalWidth'), 16);

  // Regression: the caret must add zero width or height to the tab row. The
  // previous in-flow sibling changed both widths and GitHub's overflow cutoff.
  for (const width of [1280, 960, 640, 400]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false }, github);
    await setEnabled(false);
    const baseline = await evaluate(github, geometry);
    const baselineScroll = await evaluate(github, 'document.querySelector("nav").scrollWidth');
    await setEnabled(true);
    assert.equal(await evaluate(github, geometry), baseline, `Tab geometry changed at ${width}px`);
    assert.equal(await evaluate(github, 'document.querySelector("nav").scrollWidth'), baselineScroll);
    assert.equal(await evaluate(github, 'getComputedStyle(document.querySelector("#repo").nextElementSibling).position'), 'absolute');
    assert.equal(await evaluate(github, `${root}.querySelector('.trigger').getBoundingClientRect().left >= document.querySelector('#repo').getBoundingClientRect().right - 4`), true);
  }
  await evaluate(github, 'document.querySelector("#repo").style.visibility="hidden"');
  await until(github, 'document.querySelector("#repo").nextElementSibling.hidden');
  await evaluate(github, 'document.querySelector("#repo").style.visibility=""');
  await until(github, '!document.querySelector("#repo").nextElementSibling.hidden');
  await evaluate(github, 'document.querySelector("#repo").parentElement.style.display="none"');
  await until(github, 'document.querySelector("#repo").nextElementSibling.hidden');
  await evaluate(github, 'document.querySelector("#repo").parentElement.style.display=""');
  await until(github, '!document.querySelector("#repo").nextElementSibling.hidden');

  // Optional check against the real site's responsive navigation implementation.
  if (process.env.LIVE_GITHUB) {
    const live = await tab('https://github.com/samuelhafsteins/better-pull-request-button');
    const liveLink = 'document.querySelector(\'#pull-requests-tab, a[data-tab-item="pull-requests"]\')';
    await until(live, `${liveLink}?.nextElementSibling?.hasAttribute('data-bpr-dropdown')`);
    await evaluate(live, 'document.fonts.ready.then(() => true)');
    for (const width of [1280, 1000, 800, 600, 420]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false }, live);
      await setEnabled(false);
      await until(live, 'document.querySelectorAll("[data-bpr-dropdown]").length === 0');
      await evaluate(live, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const baseline = await evaluate(live, geometry);
      await setEnabled(true);
      await until(live, 'document.querySelectorAll("[data-bpr-dropdown]").length > 0');
      await evaluate(live, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await evaluate(live, geometry), baseline, `Live GitHub tab geometry changed at ${width}px`);
      assert.equal(await evaluate(live, `[...document.querySelectorAll('[data-bpr-dropdown]')].every(host => {
        const link = host.previousElementSibling;
        const bounds = link.getBoundingClientRect();
        const visible = bounds.width > 0 && bounds.height > 0 && getComputedStyle(link).visibility === 'visible';
        return host.hidden === !visible;
      })`), true, `Caret visibility differs from its link at ${width}px`);
    }
    if (process.env.SCREENSHOT_PATH) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, live);
      await evaluate(live, `${liveLink}.nextElementSibling.shadowRoot.querySelector('button').click()`);
      const screenshot = await send('Page.captureScreenshot', { format: 'png' }, live);
      writeFileSync(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    }
    console.log('Live GitHub: identical tab geometry with the extension enabled/disabled at five viewport widths.');
  }
  console.log('Chromium checks passed: icons, settings, named actions, navigation, keyboard controls, live updates, and zero-width-impact dropdowns.');
  await send('Browser.close');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  ws?.close();
  if (browser.exitCode === null) {
    browser.kill();
    await new Promise(resolve => browser.once('exit', resolve));
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});
