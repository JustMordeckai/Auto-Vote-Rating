const TURNSTILE_TIMEOUT = 60

let submitted = false

async function vote(first) {
    // The site is translated into the browser language, so every check relies on markup and never on text
    const countdown = document.querySelector('[data-vote-countdown]')
    const form = document.querySelector('form.vote-form')

    // Only the page right after a vote marks its countdown with data-voted
    if (document.querySelector('a.vote-done-back') || countdown?.hasAttribute('data-voted')) {
        chrome.runtime.sendMessage({successfully: nextVoteTime(countdown) ?? true})
        return
    }

    // Later visits during the cooldown replace the form with the countdown
    if (countdown != null && form == null) {
        chrome.runtime.sendMessage({later: nextVoteTime(countdown) ?? true})
        return
    }

    // .js-error is the site's own nick validation, it never blocks a vote we have not sent
    const error = [...document.querySelectorAll('.flash.err:not(.js-error)')].find(isVisibleElement)
    if (error != null && error.textContent.trim().length > 0) {
        chrome.runtime.sendMessage({message: error.textContent.trim()})
        return
    }

    if (form == null) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Vote form not found'})
        return
    }

    const project = await getProject()
    const username = form.querySelector('#username')
    username.value = project.nick
    // The browser refuses to submit a nick that does not match the field pattern, without any event we could wait for
    if (!username.checkValidity()) {
        chrome.runtime.sendMessage({message: username.getAttribute('data-l-pattern') || username.validationMessage})
        return
    }

    // vote() can be called a second time when the captcha reports itself as solved
    if (submitted) return
    submitted = true

    // Without a captcha there is nothing to wait for
    if (form.querySelector('.cf-turnstile, input[name="cf-turnstile-response"]') == null) {
        form.requestSubmit()
        return
    }

    // The Turnstile is invisible and solves itself, it only asks for a click when Cloudflare doubts,
    // so we wait for the token it writes into the form. Its hidden field only appears once the widget has rendered
    let ticks = 0
    const timer = setInterval(() => {
        try {
            const field = form.querySelector('input[name="cf-turnstile-response"]')
            if (field != null && field.value.length > 0) {
                clearInterval(timer)
                form.requestSubmit()
            } else if (++ticks === TURNSTILE_TIMEOUT) {
                // The widget turned interactive, we keep waiting so the vote goes through once the user solves it,
                // the background closes the tab when its vote timeout runs out
                chrome.runtime.sendMessage({captcha: true})
            }
        } catch (e) {
            clearInterval(timer)
            throwError(e)
        }
    }, 1000)
}

// The vote window opens at a fixed time of day, the countdown gives either the seconds left or the next window
function nextVoteTime(countdown) {
    if (countdown == null) return null
    const left = Number(countdown.getAttribute('data-left'))
    if (left > 0) return Date.now() + Math.round(left * 1000) + 60000
    const nextAt = Date.parse(countdown.getAttribute('data-next-at') || '')
    if (nextAt > Date.now()) return nextAt + 60000
    return null
}
