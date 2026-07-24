const ALERT_DIALOG_SELECTOR = 'div[role=alertdialog]'


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

// true will stop interval, false will continue
async function clickVoteButton() {
    const submitButton = document.querySelector('form button[type="submit"]')
    if (!submitButton) {
        console.error('ERROR: Submit button not found')
        chrome.runtime.sendMessage({ message: 'Submit button not found', ignoreReport: true })
        return false
    }

    if (submitButton.disabled) {
        return false
    }

    submitButton.click()

    await new Promise(resolve => setTimeout(resolve, 15000))

    if (document.querySelector(ALERT_DIALOG_SELECTOR)) {
        const message = document.querySelector(ALERT_DIALOG_SELECTOR).innerText
        if (message.length > 10) {
            if (message.toLowerCase().includes('success') || message.toLowerCase().includes('successfully')) {
                chrome.runtime.sendMessage({ successfully: true })
                return true
            }
        }
    } else if (checkAlreadyVoted()){
        return true
    }
}


async function vote(first) {
    const USERNAME_FIELD_SELECTOR = 'input[name="mc_username"]'

    await new Promise(resolve => setTimeout(resolve, 1000))

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
    setValueAndTrigger(usernameField, project.nick)

    async function runVoteLoop() {
        const shouldStop = await clickVoteButton()
        if (shouldStop) {
            return
        }
        setTimeout(runVoteLoop, 1000)
    }

    runVoteLoop()
}