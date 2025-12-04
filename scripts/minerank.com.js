async function vote(first) {
    const USERNAME_FIELD_SELECTOR = 'input[name="mc_username"]'

    console.log('minerank.com vote() called, first =', first)

    await new Promise(resolve => setTimeout(resolve, 1000))

    const usernameField = document.querySelector(USERNAME_FIELD_SELECTOR)
    console.log('Username field found:', usernameField)
    
    if (!usernameField) {
        console.error('ERROR: Username field not found with selector', USERNAME_FIELD_SELECTOR)
        chrome.runtime.sendMessage({message: 'Username field not found', ignoreReport: true})
        return
    }

    // Scroll to trigger Cloudflare Turnstile CAPTCHA to load
    console.log('Scrolling to trigger CAPTCHA...')
    usernameField.scrollIntoView({block: 'center'})
    window.scrollTo(window.scrollX, window.scrollY + 16)
    document.dispatchEvent(new Event('scroll'))

    console.log('Getting project...')
    const project = await getProject()
    console.log('Project retrieved:', project)
    
    // Set the value and dispatch events so site frameworks detect the change
    function setValueAndTrigger(el, value) {
        try { el.focus(); } catch (e) {}
        el.value = value
        try { el.setAttribute('value', value); } catch (e) {}

        // Dispatch InputEvent (preferred) and fallback events
        try {
            el.dispatchEvent(new InputEvent('input', {bubbles: true, cancelable: true, data: value, inputType: 'insertText'}))
        } catch (e) {
            el.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}))
        }
        el.dispatchEvent(new Event('change', {bubbles: true, cancelable: true}))
        try { el.dispatchEvent(new Event('blur', {bubbles: true})); } catch (e) {}

        // Simulate last-key keyboard events to satisfy listeners that depend on key events
        try {
            const lastChar = value ? value.charAt(value.length - 1) : ''
            el.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: lastChar}))
            el.dispatchEvent(new KeyboardEvent('keypress', {bubbles: true, cancelable: true, key: lastChar}))
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, cancelable: true, key: lastChar}))
        } catch (e) {}
    }

    if (first){
        // Instead of attempting to click the Cloudflare Turnstile, ask the user to solve it manually.
        console.log('Asking user to solve CAPTCHA manually (filled username)')
        chrome.runtime.sendMessage({ captcha: true })
        return
    }

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
    
    return
}