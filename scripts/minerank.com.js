async function vote(first) {
    const USERNAME_FIELD_SELECTOR = 'input[name="mc_username"]'
    const ALERT_DIALOG_SELECTOR = 'div[role=alertdialog]'

    await new Promise(resolve => setTimeout(resolve, 1000))

    if (document.querySelector(ALERT_DIALOG_SELECTOR)?.textContent.toLowerCase().includes('submitting vote in')) {
        return
    }

    if (document.querySelector(ALERT_DIALOG_SELECTOR)) {
        const message = document.querySelector(ALERT_DIALOG_SELECTOR).innerText
        if (message.length > 10) {
            if (message.toLowerCase().includes('Success') || message.toLowerCase().includes('successfully')) {
                chrome.runtime.sendMessage({ successfully: true })
                return
            }
        }
    }
    if (document.querySelector('div.bg-green-100')) {
        chrome.runtime.sendMessage({ successfully: true })
        return
    }
    if (document.querySelector('div.bg-stone-400\\/20')) {
        if (document.querySelector('div.bg-stone-400\\/20').textContent.toLowerCase().includes('already voted')) {
            console.log("Already voted 1")
            chrome.runtime.sendMessage({ later: true })
            return
        }
    }

    if (document.querySelector('div.bg-red-200')) {
        if (document.querySelector('div.bg-red-200').textContent.toLowerCase().includes('already voted')) {
            console.log("Already voted 2")
            chrome.runtime.sendMessage({ later: true })
            return
        }
    }

    if (document.querySelector('.site-body .text-center')?.textContent.includes('Page Not Found')) {
        chrome.runtime.sendMessage({ message: document.querySelector('.site-body .text-center')?.textContent.trim(), ignoreReport: true, retryCoolDown: 21600000 })
    }

    if (first) {
        // Instead of attempting to click the Cloudflare Turnstile, ask the user to solve it manually.
        console.log('Asking user to solve CAPTCHA manually (filled username)')
        chrome.runtime.sendMessage({ captcha: true })
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
    console.log('Username set to:', project.nick)

    const submitButton = document.querySelector('form button[type="submit"]')
    if (!submitButton) {
        console.error('ERROR: Submit button not found')
        chrome.runtime.sendMessage({ message: 'Submit button not found', ignoreReport: true })
        return
    }
    console.log('Submit button found:', submitButton)
    submitButton.click()
}