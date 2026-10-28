let submitted = false

async function vote(first) {
    if (!document.getElementById('review-check')) return
    // vote() can be called a second time when the captcha reports itself as solved, the first call already waits for it
    if (submitted) return
    submitted = true
    document.getElementById('review-check').checked = false
    const project = await getProject()
    document.getElementById('username-input').value = project.nick
    // Opens a 15s countdown, then a modal where the site renders the Turnstile
    document.querySelector('#submitter').click()

    // Counted from the click, so the timeout covers the 15s countdown plus a minute for the Turnstile
    await waitTurnstileToken('#vote', 75)
    document.querySelector('#captcha_submit').click()
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
