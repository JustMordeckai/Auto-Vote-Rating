// Counted from the click, so it covers the 15s countdown plus a minute for the Turnstile
const TURNSTILE_TIMEOUT = 75

let submitted = false

async function vote(first) {
    if (!document.getElementById('review-check')) return
    // vote() can be called a second time when the captcha reports itself as solved, the poller below already handles it
    if (submitted) return
    submitted = true
    document.getElementById('review-check').checked = false
    const project = await getProject()
    document.getElementById('username-input').value = project.nick
    // Opens a 15s countdown, then a modal where the site renders the Turnstile
    document.querySelector('#submitter').click()

    // The Turnstile never sends captchaPassed, so we wait for the token it writes into the form.
    // Its hidden field only appears once the widget has rendered, after the countdown
    let ticks = 0
    const captchaTimer = setInterval(() => {
        try {
            const field = document.querySelector('#vote input[name="cf-turnstile-response"]')
            if (field != null && field.value.length > 0) {
                clearInterval(captchaTimer)
                document.querySelector('#captcha_submit').click()
            } else if (++ticks === TURNSTILE_TIMEOUT) {
                // The widget asks for a click, we keep waiting so the vote goes through once the user solves it,
                // the background closes the tab when its vote timeout runs out
                chrome.runtime.sendMessage({captcha: true})
            }
        } catch (e) {
            clearInterval(captchaTimer)
            throwError(e)
        }
    }, 1000)
}

const timer = setInterval(()=>{
    try {
        const message = document.getElementById('message')
        if (message && message.textContent.trim().length > 0) {
            const request = {}
            request.message = message.textContent.trim()
            if (request.message.includes('Thank you for voting')) {
                chrome.runtime.sendMessage({successfully: true})
            } else if (request.message.includes('already voted')) {
                chrome.runtime.sendMessage({later: true})
            } else {
                if (request.message.includes('proxy') || request.message.includes('Captcha') || request.message.includes('Username can\'t be empty')) {
                    request.ignoreReport = true
                }
                chrome.runtime.sendMessage(request)
            }
            clearInterval(timer)
            return
        }

        for (const modalBody of document.querySelectorAll('.modal-body')) {
            const text = modalBody.textContent
            if (text.includes('Thank you for voting')) {
                clearInterval(timer)
                chrome.runtime.sendMessage({successfully: true})
                return
            }
            if (text.toLowerCase().includes('already voted')) {
                clearInterval(timer)
                chrome.runtime.sendMessage({later: true})
                return
            }
        }
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)
