const ALERT_DIALOG_SELECTOR = 'div[role=alertdialog]'
const USERNAME_FIELD_SELECTOR = 'input[name="mc_username"]'
const PAGE_READY_TIMEOUT = 15
const VOTE_RESULT_TIMEOUT = 15
const MAX_CAPTCHA_WAIT = 30
const MAX_VOTE_CLICKS = 3

// Polls once a second until the condition returns something truthy, null once the timeout is over.
// setInterval is used on purpose: hacktimer.js reroutes the timers and an awaited setTimeout can hang
function poll(condition, timeout) {
    return new Promise(resolve => {
        let ticks = 0
        const timer = setInterval(() => {
            const result = condition()
            if (result) {
                clearInterval(timer)
                resolve(result)
            } else if (++ticks >= timeout) {
                clearInterval(timer)
                resolve(null)
            }
        }, 1000)
    })
}

function checkAlreadyVoted() {
    const alreadyVotedSelectors = ['div.bg-stone-400\\/20', 'div.bg-red-200', 'div.flex.items-center.gap-1.text-sm.mb-4']
    for (const selector of alreadyVotedSelectors) {
        const element = document.querySelector(selector)
        if (element && element.textContent.toLowerCase().includes('voted')) {
            // Calculate next midnight UTC
            const now = new Date()
            const nextMidnightUTC = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0, 0, 0, 0
            ))
            chrome.runtime.sendMessage({ later: nextMidnightUTC.getTime() })
            return true
        }
    }
    return false
}

// 'stop' = the vote is over, 'waiting' = the captcha has not solved itself yet, 'retry' = clicked without an answer
async function clickVoteButton() {
    const submitButton = document.querySelector('form button[type="submit"]')
    if (!submitButton) {
        console.error('ERROR: Submit button not found')
        chrome.runtime.sendMessage({ message: 'Submit button not found', ignoreReport: true })
        return 'stop'
    }

    // The button stays disabled as long as the Turnstile captcha has not solved itself
    if (submitButton.disabled) {
        return 'waiting'
    }

    submitButton.click()

    const result = await poll(() => {
        if (document.querySelector('div.bg-green-100')) return { successfully: true }

        const message = document.querySelector(ALERT_DIALOG_SELECTOR)?.innerText?.trim()
        if (message && message.length > 10) {
            // The site asks us to wait, the vote has not been taken into account yet
            if (message.toLowerCase().includes('hang on')) return null
            if (message.toLowerCase().includes('success')) return { successfully: true }
            return { message, ignoreReport: true }
        }

        // checkAlreadyVoted() reports the result itself
        if (checkAlreadyVoted()) return { reported: true }

        return null
    }, VOTE_RESULT_TIMEOUT)

    if (!result) return 'retry'
    if (!result.reported) chrome.runtime.sendMessage(result)
    return 'stop'
}


async function vote(first) {
    // The rating renders its page on the client side, wait until there is something to work with
    await poll(() => document.querySelector(USERNAME_FIELD_SELECTOR)
        || document.querySelector(ALERT_DIALOG_SELECTOR)
        || document.querySelector('div.bg-green-100')
        || document.querySelector('body > main > div > p'), PAGE_READY_TIMEOUT)

    if (document.querySelector(ALERT_DIALOG_SELECTOR)?.textContent.toLowerCase().includes('hang on')) {
        return
    }

    if (document.querySelector('div.bg-green-100')) {
        chrome.runtime.sendMessage({ successfully: true })
        return
    }

    if (checkAlreadyVoted()){
        return
    }

    const pageNotFoundSelector = 'body > main > div > p'
    if (document.querySelector(pageNotFoundSelector)?.textContent.includes('does not exist')) {
        chrome.runtime.sendMessage({ message: document.querySelector(pageNotFoundSelector)?.textContent.trim(), ignoreReport: true, retryCoolDown: 21600000 })
        return
    }

    const project = await getProject()

    // Set the value and dispatch events so site frameworks detect the change
    function setValueAndTrigger(el, value) {
        try { el.focus(); } catch (e) { }
        el.value = value
        try { el.setAttribute('value', value); } catch (e) { }

        // Dispatch InputEvent (preferred) and fallback events
        try {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }))
        } catch (e) {
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        }
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) { }

        // Simulate last-key keyboard events to satisfy listeners that depend on key events
        try {
            const lastChar = value ? value.charAt(value.length - 1) : ''
            el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: lastChar }))
            el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: lastChar }))
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: lastChar }))
        } catch (e) { }
    }

    const usernameField = document.querySelector(USERNAME_FIELD_SELECTOR)
    if (!usernameField) {
        chrome.runtime.sendMessage({ message: 'Username field not found', ignoreReport: true })
        return
    }
    setValueAndTrigger(usernameField, project.nick)

    let waits = 0
    let clicks = 0
    let running = false
    const voteTimer = setInterval(async () => {
        if (running) return
        running = true
        try {
            const state = await clickVoteButton()
            if (state === 'stop') {
                clearInterval(voteTimer)
            } else if (state === 'waiting' && ++waits >= MAX_CAPTCHA_WAIT) {
                // The vote button never became clickable, the captcha did not solve itself
                clearInterval(voteTimer)
                chrome.runtime.sendMessage({ captcha: true })
            } else if (state === 'retry' && ++clicks >= MAX_VOTE_CLICKS) {
                clearInterval(voteTimer)
                chrome.runtime.sendMessage({ message: 'The rating did not answer the vote', ignoreReport: true })
            }
        } finally {
            running = false
        }
    }, 1000)
}