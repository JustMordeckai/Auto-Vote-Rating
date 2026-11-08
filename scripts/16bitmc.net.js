let started = false

async function vote(first) {
    // After a vote the site flashes "Thanks for voting", a text the normal page never has
    if (hasThanksFlash()) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    // The form posts back to /vote/<id>, which shows the server's answer in a box under the title
    const result = document.querySelector('.container > .success-box, .container > .error-box')
    if (result != null && result.textContent.trim().length > 0) {
        const text = result.textContent.trim()
        if (result.classList.contains('success-box')) {
            chrome.runtime.sendMessage({successfully: true})
        } else if (/cannot vote|already voted|check back/i.test(text)) {
            chrome.runtime.sendMessage({later: nextVoteTime(text)})
        } else {
            chrome.runtime.sendMessage({message: text})
        }
        return
    }

    // vote() is called again when the Turnstile token shows up, the first call already drives the whole flow
    if (started) return
    started = true

    const project = await getProject()
    const button = document.querySelector('#vote-form button[onclick^="showVoteModal"]')
    if (button == null) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Vote button not found'})
        return
    }
    // Opens the modal once the site has checked whether this browser can vote
    button.click()

    let phase = 'eligibility'
    let ticks = 0
    const timer = setInterval(() => {
        try {
            ticks++
            if (!document.getElementById('vote-modal').classList.contains('open')) {
                if (ticks >= 30) finish({errorVoteNoElement: 'The vote modal never opened'})
                return
            }

            const error = document.getElementById('modal-error')
            if (isShown(error) && error.textContent.trim().length > 0) {
                const text = error.textContent.trim()
                if (/cannot vote/i.test(text)) {
                    finish({later: nextVoteTime(text)})
                } else {
                    finish({message: text, ignoreReport: /captcha|username/i.test(text)})
                }
                return
            }

            const ineligible = document.getElementById('ineligible-message')
            if (isShown(ineligible)) {
                finish({later: nextVoteTime(ineligible.textContent)})
                return
            }

            if (phase === 'eligibility' && isShown(document.getElementById('vote-section'))) {
                phase = 'captcha'
                const username = document.getElementById('modal-username')
                username.value = project.nick
                // The site renders the Turnstile from an input listener, a plain value change does not fire it
                username.dispatchEvent(new Event('input', {bubbles: true}))
                // The widget callback copies the token into the form, which is what the site sends
                waitTurnstileToken('#vote-form').then(() => {
                    if (phase !== 'captcha') return
                    phase = 'submitted'
                    ticks = 0
                    // The site checks the nick cooldown, then submits the form
                    document.getElementById('vote-btn').click()
                })
                return
            }

            if (phase === 'submitted' && ticks >= 30) {
                finish({errorVoteNoElement: 'The vote form was not sent'})
            }
        } catch (e) {
            phase = 'done'
            clearInterval(timer)
            throwError(e)
        }
    }, 1000)

    function finish(request) {
        phase = 'done'
        clearInterval(timer)
        chrome.runtime.sendMessage(request)
    }
}

// The flash markup was never captured, so we look for its text. Only text nodes count, since a container's text
// also holds the reviews and description, and everything the server owner or voters write sits in a .form-section
function hasThanksFlash() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
        if (!/thanks?( you)? for voting/i.test(node.textContent)) continue
        if (node.parentElement.closest('script, style, .form-section') == null) return true
    }
    return false
}

// The modals are hidden with the "hidden" class rather than inline styles
function isShown(element) {
    return element != null && !element.classList.contains('hidden')
}

// The site writes the cooldown as "Check back in 5 hours 3 minutes", or "a few seconds", without the seconds
function nextVoteTime(text) {
    const hours = Number(text.match(/(\d+)\s*hour/i)?.[1] ?? 0)
    const minutes = Number(text.match(/(\d+)\s*minute/i)?.[1] ?? 0)
    return Date.now() + ((hours * 60 + minutes + 1) * 60 + 30) * 1000
}
