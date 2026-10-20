// serveur-minecraft-vote.fr moved to a React app (/serveur/<id>/voter) with a visible Cloudflare Turnstile:
//  - Form     : form.srvp-vote-form, controlled input #vote-pseudo, submit button disabled until Turnstile passes
//  - Success  : .srvp-vote-done ("Merci pour ton vote !")
//  - Error    : .srvp-vote-card .field-error (server toast text, cooldown included)
//  - Flagged  : .srvp-vote-confirm, an anti-cheat question left to the user
// There is no "already voted" state on load, the cooldown is only returned after a submit.

const TURNSTILE_TIMEOUT = 60

let started = false

async function vote(/*first*/) {
    // vote() runs again on captchaPassed, the loop below already handles every state
    if (started) return
    started = true

    const project = await getProject()

    let submitted = false
    let captchaAlerted = false
    let ticks = 0

    // Returns true once a result has been reported
    function tick() {
        ticks++

        if (document.querySelector('.srvp-vote-done')) {
            chrome.runtime.sendMessage({successfully: true})
            return true
        }

        const error = document.querySelector('.srvp-vote-card .field-error')
        if (submitted && error && error.textContent.trim().length) {
            const message = error.textContent.replace(/\s+/g, ' ').trim()
            const low = message.toLowerCase()
            const ms = parseDuration(low)
            if (ms != null && (low.includes('attendre') || low.includes('déjà') || low.includes('prochain') || low.includes('dans'))) {
                chrome.runtime.sendMessage({later: Date.now() + ms})
            } else if (low.includes('déjà voté')) {
                chrome.runtime.sendMessage({later: true})
            } else {
                const request = {message}
                if (low.includes('impossible de voter pour le serveur')) {
                    request.ignoreReport = true
                }
                chrome.runtime.sendMessage(request)
            }
            return true
        }

        if (document.querySelector('.srvp-vote-confirm')) {
            if (!captchaAlerted) {
                captchaAlerted = true
                chrome.runtime.sendMessage({captcha: true})
            }
            return false
        }

        const form = document.querySelector('form.srvp-vote-form')
        if (!form || submitted) return false

        const input = form.querySelector('#vote-pseudo')
        if (input && input.value !== project.nick) {
            // React ignores a plain .value assignment, go through the native setter
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, project.nick)
            input.dispatchEvent(new Event('input', {bubbles: true}))
            return false
        }

        const button = form.querySelector('button[type="submit"]')
        if (button && !button.disabled) {
            submitted = true
            button.click()
        } else if (ticks >= TURNSTILE_TIMEOUT && !captchaAlerted) {
            // Keep polling, the user can still solve it by hand
            captchaAlerted = true
            chrome.runtime.sendMessage({captcha: true})
        }
        return false
    }

    const timer = setInterval(() => {
        try {
            if (tick()) clearInterval(timer)
        } catch (e) {
            clearInterval(timer)
            throwError(e)
        }
    }, 1000)
}

// "1 heure 29 minutes 5 secondes" or "1h29m5s" in milliseconds, null if no duration is found
function parseDuration(text) {
    const h = text.match(/(\d+)\s*h/)
    const m = text.match(/(\d+)\s*m(?:in|$|\s|\d)/)
    const s = text.match(/(\d+)\s*s(?:ec|$|\s)/)
    if (!h && !m && !s) return null
    const ms = (h ? +h[1] * 3600000 : 0) + (m ? +m[1] * 60000 : 0) + (s ? +s[1] * 1000 : 0)
    return ms > 0 ? ms : null
}
