const TOS_DIALOG_SELECTOR = 'div[role="dialog"]:not([class*="fc-"])'
const TURNSTILE_TIMEOUT = 60

let submitted = false

async function vote(first) {
    if (document.querySelector('#center > div > h1') != null && document.querySelector('#center > div > h1').textContent.includes('Successfully voted')) {
        chrome.runtime.sendMessage({successfully: true})
        return
    } else if (document.querySelector('#center > div > h1') != null && document.querySelector('#center > div > h1').textContent.includes('You already voted')) {
        chrome.runtime.sendMessage({later: true})
        return
    }

    if (document.querySelector('#center > .content > img[src*="not_found"]')) {
        const request = {}
        request.message = document.querySelector('#center > .content').innerText.trim()
        if (request.message.includes('Submission not available')) {
            request.ignoreReport = true
        }
        chrome.runtime.sendMessage(request)
        return
    }

    // div[role="dialog"] is also used by the Google consent banner (.fc-dialog), which does not block voting
    if (isVisibleElement(document.querySelector(TOS_DIALOG_SELECTOR))) {
        chrome.runtime.sendMessage({requiredConfirmTOS: true})
        await new Promise(resolve => {
            const timer2 = setInterval(() => {
                if (!document.querySelector(TOS_DIALOG_SELECTOR)) {
                    clearInterval(timer2)
                    resolve()
                }
            }, 1000)
        })
    }

    if (document.querySelector('#error_page div.notice_box')) {
        const request = {}
        request.message = document.querySelector('#error_page div.notice_box').innerText
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
    }

    // The rating replaced reCAPTCHA with an invisible Cloudflare Turnstile which solves itself,
    // so instead of waiting for a captchaPassed message we wait for the token it writes into the form
    const turnstileField = document.querySelector('#submit_vote_form input[name="cf-turnstile-response"]')
    const turnstileWidget = document.querySelector('#turnstile-widget') || document.querySelector('#submit_vote_form .cf-turnstile')
    if (turnstileField == null && turnstileWidget == null && first) {
        // Another kind of captcha is in use, we wait until it is solved
        return
    }

    const project = await getProject()
    if (document.querySelector('#submit_vote_form > input[name="mcname"]') != null) {
        document.querySelector('#submit_vote_form > input[name="mcname"]').value = project.nick
    } else {
        console.warn('Не удалось найти поле для никнейма, возможно это голосование без награды')
    }

    // The hidden token field only appears once the widget has rendered, so we poll for both
    if ((turnstileField != null || turnstileWidget != null) && !(turnstileField?.value.length > 0)) {
        const solved = await new Promise(resolve => {
            let ticks = 0
            const timer3 = setInterval(() => {
                const field = document.querySelector('#submit_vote_form input[name="cf-turnstile-response"]')
                if (field != null && field.value.length > 0) {
                    clearInterval(timer3)
                    resolve(true)
                } else if (++ticks >= TURNSTILE_TIMEOUT) {
                    clearInterval(timer3)
                    resolve(false)
                }
            }, 1000)
        })
        if (!solved) {
            chrome.runtime.sendMessage({captcha: true})
            return
        }
    }

    // vote() can be called a second time when the captcha reports itself as solved
    if (submitted) return
    submitted = true
    document.querySelector('#submit_vote_form > input[type="submit"]').click()
}