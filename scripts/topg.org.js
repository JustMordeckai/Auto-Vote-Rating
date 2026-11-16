let submitted = false

async function vote(first) {
    // After a vote the site redirects back to the server page: .flash messages sit on the page, .alert ones inside the vote window
    const messages = [...document.querySelectorAll('.flash, #vote-dlg .alert')]
        .filter(element => element.textContent.trim().length > 0)
    let retryCaptcha = false

    // A success message can also say when to come back, so it is checked before the cooldown
    const success = messages.find(element => element.classList.contains('ok'))
    if (success != null) {
        chrome.runtime.sendMessage({successfully: nextVoteTime(success.textContent.toLowerCase()) ?? true})
        return
    }

    for (const element of messages) {
        const text = element.textContent.trim().toLowerCase()
        if (text.includes('already voted') || text.includes('vote again')) {
            chrome.runtime.sendMessage({later: nextVoteTime(text) ?? true})
            return
        }
    }

    for (const element of messages) {
        if (!element.classList.contains('err') && !element.classList.contains('warn')) continue
        const message = element.textContent.trim()
        // The captcha was not accepted (expired token, double submit): a new one is on the page, so we vote again
        if (/verification|double click|refresh/i.test(message)) {
            retryCaptcha = true
            continue
        }
        chrome.runtime.sendMessage({message})
        return
    }

    if (document.body.outerHTML.length < 200 && document.body.outerHTML.includes('must have cookies enabled in your browser')) {
        const request = {}
        request.errorVoteNoElement = document.body.innerText.trim()
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
    }

    const project = await getProject()

    if (document.location.pathname.replace(/\/+$/, '') === '/' + project.game) {
        const request = {}
        request.errorVoteNoElement = 'Redirected to server list'
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
    }

    const dialog = document.getElementById('vote-dlg')
    const form = dialog?.querySelector('form') ?? document.querySelector('form:has([name="game_username"])')
    const username = form?.querySelector('[name="game_username"]')
    if (form == null || username == null) {
        const voteText = document.getElementById('vote')?.innerText.toLowerCase() ?? ''
        if (voteText.includes('login to vote') || voteText.includes('connect with a social network to vote')) {
            chrome.runtime.sendMessage({auth: true})
            return
        }
        chrome.runtime.sendMessage({errorVoteNoElement: 'Vote form not found'})
        return
    }

    if (form.querySelector('.h-captcha, .g-recaptcha') && first) return

    // vote() can be called a second time when the captcha reports itself as solved
    if (submitted) return

    if (retryCaptcha) {
        // Never loop on a captcha the site keeps refusing, let the user see it instead
        const retries = Number(sessionStorage.getItem('AVR_topgRetries') || 0)
        if (retries >= 2) {
            sessionStorage.removeItem('AVR_topgRetries')
            chrome.runtime.sendMessage({captcha: true})
            return
        }
        sessionStorage.setItem('AVR_topgRetries', String(retries + 1))
    } else {
        sessionStorage.removeItem('AVR_topgRetries')
    }

    username.value = project.nick
    // The browser refuses to submit an invalid nick without any event we could wait for
    if (!username.checkValidity()) {
        chrome.runtime.sendMessage({message: username.validationMessage})
        return
    }

    submitted = true

    // The vote window only opens by itself with #vote in the URL, open it so a captcha asking for a click can be seen
    if (dialog != null && !dialog.open) {
        try {
            dialog.showModal()
        } catch (e) {
            dialog.setAttribute('open', '')
        }
    }

    if (form.querySelector('.cf-turnstile, [name="cf-turnstile-response"]') != null) {
        await waitTurnstileToken(dialog != null ? '#vote-dlg' : '')
    }
    form.requestSubmit()
}

// "You already voted, come back in 5 hours 12 minutes" style messages
function nextVoteTime(text) {
    const hours = Number(text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/)?.[1] ?? 0)
    const minutes = Number(text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/)?.[1] ?? 0)
    const seconds = Number(text.match(/(\d+)\s*(?:seconds?|secs?|s)\b/)?.[1] ?? 0)
    const milliseconds = ((hours * 60 + minutes) * 60 + seconds) * 1000
    if (milliseconds === 0) return null
    return Date.now() + milliseconds + 60000
}
