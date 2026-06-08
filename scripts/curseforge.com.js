async function vote(first) {
    if (checkAnswer()) return

    if (first) return

    const project = await getProject()

    // Pick the 5-star rating (a rating is required before the vote is accepted).
    const stars = document.querySelector('form div.items-center.justify-center')
    if (stars && stars.lastElementChild) stars.lastElementChild.click()

    // Fill the Minecraft username.
    const nick = document.querySelector('input[maxlength="16"]')
    if (nick) {
        nick.value = project.nick
        nick.dispatchEvent(new Event('input', {bubbles: true}))
    }

    // Submit. The reCAPTCHA is solved beforehand by a captcha-solver extension or by the user
    // (see the extension wiki); this script intentionally does not handle the captcha itself.
    const submit = [...document.querySelectorAll('button[type="submit"]')]
        .find(b => b.textContent.includes('Vote for this server'))
    if (submit) submit.click()
}

const timer = setInterval(() => {
    try {
        if (checkAnswer()) clearInterval(timer)
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)

function checkAnswer() {
    // Success: a "Thanks for voting" message replaces the form.
    if ([...document.querySelectorAll('h1, h2, h3')].some(h => h.textContent.includes('Thanks for voting'))) {
        chrome.runtime.sendMessage({successfully: true})
        return true
    }
    // Errors are shown inline in one of several `<p class="text-error">` (empty until filled).
    // The form heading "What's your Minecraft username?" is always present, so these must be
    // checked independently (the old `if (h2) ... else if (error)` never reached the error case).
    for (const p of document.querySelectorAll('p.text-error')) {
        const message = p.textContent.replace(/\s+/g, ' ').trim()
        if (!message.length) continue
        const low = message.toLowerCase()
        if (low.includes('already voted')) {
            chrome.runtime.sendMessage({later: true})
            return true
        }
        // Captcha not solved yet: not a terminal state, keep waiting for it to be solved.
        if (low.includes('captcha')) return false
        chrome.runtime.sendMessage({message})
        return true
    }
    return false
}
