async function vote(first) {
    if (!document.getElementById('review-check')) return
    document.getElementById('review-check').checked = false
    const project = await getProject()
    document.getElementById('username-input').value = project.nick
    if (first) {
        document.querySelector('a#submitter').click()
    } else {
        document.querySelector('#vote button[type="submit"]').click()
    }
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
