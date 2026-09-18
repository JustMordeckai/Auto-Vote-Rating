// End to end checks for scripts/main/captchaclicker.js.
//
// The captcha hosts are intercepted so window.location.href really matches the
// regexes the script branches on, then the real file runs in a real page against
// stubbed extension APIs. Run it before and after touching the clicker.
//
//   PLAYWRIGHT=<path to the playwright module> node tools/e2e-captchaclicker.mjs
//
// CHROME can point at another Chrome build. Playwright is not a dependency of the
// extension, so this stays out of the CI and is run by hand.
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')

const REPO_POSIX = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = platform() === 'win32' ? REPO_POSIX.replace(/\//g, '\\') : REPO_POSIX
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const clickerSource = readFileSync(join(REPO_POSIX, 'scripts/main/captchaclicker.js'), 'utf8')

const results = []
function check(name, ok, detail) {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`)
}

const STUBS = `
window.__sent = [];
window.__ticks = 0;
window.__errors = [];
window.chrome = {
    runtime: { sendMessage: (m) => { window.__sent.push(m); }, onMessage: { addListener: () => {} } },
    dom: { openOrClosedShadowRoot: () => document.body }
};
window.addEventListener('error', e => window.__errors.push(String(e.message)));
const __setInterval = window.setInterval;
window.setInterval = function (fn, delay) {
    const wrapped = function () { window.__ticks++; return fn.apply(this, arguments); };
    return __setInterval(wrapped, delay);
};
`

async function captchaPage(context, urlGlob, gotoUrl, body, setup) {
    const page = await context.newPage()
    await page.route(urlGlob, route => route.fulfill({ status: 200, contentType: 'text/html', body }))
    await page.goto(gotoUrl)
    if (setup) await page.evaluate(setup)
    await page.evaluate(STUBS)
    await page.evaluate(clickerSource)
    await page.evaluate('run()')
    return page
}

const userDataDir = mkdtempSync(join(tmpdir(), 'avr-e2e-'))
let context

try {
    context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME,
        headless: false,
        args: ['--enable-unsafe-extension-debugging']
    })

    // ------------------------------------------------------------- extension installs
    const cdp = await context.browser().newBrowserCDPSession()
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: REPO })
    check('extension loads unpacked', Boolean(id), id)

    // Note: Chrome 153 refuses --load-extension, blocks top level navigation to
    // options.html and does not start the service worker for a CDP loaded extension,
    // so the checks below drive captchaclicker.js directly on intercepted captcha URLs.

    // ------------------------------------------------- cloudflare branch: polling rate
    const cf = await captchaPage(context, 'https://challenges.cloudflare.com/**',
        'https://challenges.cloudflare.com/turnstile/test',
        '<html><body><div id="nothing"></div></body></html>')
    await cf.waitForTimeout(3000)
    const cfTicks = await cf.evaluate(() => window.__ticks)
    // Two 1s pollers over 3s is about 6 ticks. A timer with no delay produces hundreds.
    check('cloudflare pollers are throttled', cfTicks <= 20, `${cfTicks} ticks in 3s`)

    // ------------------------------------------ cloudflare branch: success still detected
    const cfOk = await captchaPage(context, 'https://challenges.cloudflare.com/**',
        'https://challenges.cloudflare.com/turnstile/ok',
        '<html><body><div id="success" style="display:none">ok</div></body></html>')
    await cfOk.evaluate(() => { document.querySelector('#success').style.display = 'block' })
    await cfOk.waitForTimeout(2500)
    const cfSent = await cfOk.evaluate(() => window.__sent)
    check('cloudflare success sends captchaPassed',
        cfSent.some(m => m.captchaPassed === true), JSON.stringify(cfSent).slice(0, 80))

    // ---------------------------------------- hcaptcha branch: solver error sent once
    const hc = await captchaPage(context, 'https://newassets.hcaptcha.com/**',
        'https://newassets.hcaptcha.com/captcha.v1/test',
        `<html><body class="no-selection" aria-hidden="true">
         <div style="text-align: right; color: rgb(218, 94, 94);">captcha failed</div></body></html>`,
        // The parser moves an unknown element out of <head>, so it is added afterwards
        () => document.head.appendChild(document.createElement('yandex-captcha-solver')))
    await hc.waitForTimeout(4000)
    const hcState = await hc.evaluate(() => ({
        sent: window.__sent, errors: window.__errors,
        solver: Boolean(document.querySelector('head > yandex-captcha-solver')),
        errDiv: Boolean(document.querySelector('div[style="text-align: right; color: rgb(218, 94, 94);"]'))
    }))
    const hcSent = hcState.sent.filter(m => m.errorCaptcha)
    check('hcaptcha solver error is reported once', hcSent.length === 1,
        `${hcSent.length} messages in 4s, solver=${hcState.solver}, errDiv=${hcState.errDiv}, errors=${hcState.errors.slice(0, 1)}`)

    // ------------------------------- hcaptcha branch: solved checkbox still reported
    const hcOk = await captchaPage(context, 'https://newassets.hcaptcha.com/**',
        'https://newassets.hcaptcha.com/captcha.v1/ok',
        '<html><body><div id="checkbox" aria-checked="true" style="width:30px;height:30px"></div></body></html>')
    await hcOk.waitForTimeout(2500)
    const hcOkSent = await hcOk.evaluate(() => window.__sent)
    check('hcaptcha solved sends captchaPassed',
        hcOkSent.some(m => m.captchaPassed === true), JSON.stringify(hcOkSent).slice(0, 80))

    // ------------------------- recaptcha branch: missing error container must not throw
    const rc = await captchaPage(context, 'https://www.google.com/recaptcha/**',
        'https://www.google.com/recaptcha/api2/anchor?k=test',
        `<html><body>
         <div id="recaptcha-anchor"><div class="recaptcha-checkbox-border"
            style="width:30px;height:30px" onclick="window.__clicked = true"></div></div>
         </body></html>`)
    await rc.waitForTimeout(3000)
    const rcState = await rc.evaluate(() => ({ clicked: Boolean(window.__clicked), errors: window.__errors }))
    check('recaptcha checkbox is clicked without the error container', rcState.clicked,
        rcState.clicked ? 'clicked' : (rcState.errors.slice(0, 1).join(' | ') || 'never clicked'))
    check('recaptcha branch throws nothing', rcState.errors.length === 0, rcState.errors.slice(0, 2).join(' | '))

} finally {
    if (context) await context.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
