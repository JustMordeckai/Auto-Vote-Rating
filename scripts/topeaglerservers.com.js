async function vote(first) {
    if (!document.querySelector('#username')) {
        await new Promise(resolve => {
            const waitTimer = setInterval(() => {
                if (document.querySelector('#username')) {
                    clearInterval(waitTimer)
                    resolve()
                }
            }, 100)
        })
    }

    if (first) {
        const project = await getProject()
        const input = document.querySelector('#username')
        input.value = project.nick
        input.dispatchEvent(new Event('input', {bubbles: true}))
        return
    }
    document.querySelector('form button[type="submit"]').click()
}

const timer = setInterval(() => {
    try {
        const alert = document.querySelector('[role="alert"], [role="status"]')
        if (alert && alert.textContent.trim().length > 0) {
            const text = alert.textContent.trim()
            clearInterval(timer)
            if (text.toLowerCase().includes('thank you') || text.toLowerCase().includes('success')) {
                chrome.runtime.sendMessage({successfully: true})
            } else if (text.toLowerCase().includes('already voted') || text.toLowerCase().includes('already cast')) {
                chrome.runtime.sendMessage({later: true})
            } else {
                chrome.runtime.sendMessage({message: text})
            }
            return
        }
        const mainText = (document.querySelector('main')?.innerText || '').toLowerCase()
        if (mainText.includes('thank you for voting')) {
            clearInterval(timer)
            chrome.runtime.sendMessage({successfully: true})
        } else if (mainText.includes('already voted') || mainText.includes('already cast your vote')) {
            clearInterval(timer)
            chrome.runtime.sendMessage({later: true})
        }
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)
