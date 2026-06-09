async function vote(first) {
    if (checkAnswer()) return

    if (first) return

    const project = await getProject()
    // On the "already voted" page there is no vote form; guard so we don't throw (which would be
    // reported as an error and retried in 15 min instead of rescheduling for ~24h).
    const username = document.querySelector('#vote-form #username')
    if (!username) return
    username.value = project.nick
    document.querySelector('#vote-form button[type="submit"]')?.click()
}

const timer = setInterval(() => {
    try {
        checkAnswer()
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)

function checkAnswer() {
    // The result message lives in `.auth-msg`. It used to sit under an `#vote` id but the site now
    // wraps it in `class="vote ..."`, so match `.auth-msg` directly (works for both layouts).
    const authMsg = document.querySelector('.auth-msg')
    if (authMsg && authMsg.innerText.trim().length) {
        const request = {}
        request.message = authMsg.innerText.replace(/\s+/g, ' ').trim()
        if (request.message.includes('already voted') || request.message.includes('reached your daily voting limit')) {
            // "You can vote again in 23 hours, 59 minutes." -> reschedule precisely (parse by keyword
            // so a missing unit, or no number at all, never throws).
            const h = request.message.match(/(\d+)\s*hour/)
            const m = request.message.match(/(\d+)\s*minute/)
            if (h || m) {
                const ms = (h ? +h[1] * 60 * 60 * 1000 : 0) + (m ? +m[1] * 60 * 1000 : 0)
                chrome.runtime.sendMessage({later: Date.now() + ms + 60000})
            } else {
                chrome.runtime.sendMessage({later: true})
            }
        } else if (request.message.includes('Thanks for voting')) {
            chrome.runtime.sendMessage({successfully: true})
        } else {
            if (request.message.includes('session expired')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
        }
        clearInterval(timer)
        return true
    }
    return false
}
