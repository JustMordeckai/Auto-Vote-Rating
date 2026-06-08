// serveur-prive.net migrated its vote form to an AJAX submission (Vite build).
// The old selectors are gone -> new behaviour:
//  - Already voted : `.message-blured[data-vote-cooldown]` overlay holding `.timer[data-counter="<ISO>"]`
//                    (server-rendered on load, or inserted after a successful vote).
//  - Captcha       : MTCaptcha. For a subscriber (no captcha), `input.mtcaptcha-verifiedtoken` fills itself.
//  - Success       : `.ajax-msg .message-success` + `form#voteForm[data-vote-cooldown-pending="true"]`.
//  - Error         : `.ajax-msg .message-danger` (text = server message).

async function vote(first) {
    // The form is submitted via AJAX (no page reload), so a single watch loop
    // is enough to handle every state.
    if (window.__spnVoteStarted) return
    window.__spnVoteStarted = true

    const project = await getProject()

    let voteClicked = false      // we triggered the vote
    let captchaAlerted = false   // manual-captcha notification already sent
    let attempts = 0             // number of vote clicks performed
    let ticks = 0                // loop iterations (1/second)
    const MAX_ATTEMPTS = 3
    const WAIT_TOKEN_TICKS = 10  // grace period before asking for a manual captcha solve
    const MAX_TICKS = 120        // safety net if no state is recognized anymore (layout changed again?)

    // Returns true once a terminal state has been reported (the loop can stop)
    function tick() {
        ticks++

        // 1. AJAX message returned by the server (error shown in-place)
        const errEl = document.querySelector('.ajax-msg .message-danger')
        if (errEl && errEl.textContent.trim().length) {
            const message = errEl.textContent.replace(/\s+/g, ' ').trim()
            const low = message.toLowerCase()
            // Already voted (private/incognito: no overlay, the cooldown comes back as this AJAX
            // error with a relative time, e.g. "Prochain vote dans 54 minutes 23 secondes").
            if (low.includes('déjà voté')) {
                const ms = parseFrenchDuration(message)
                chrome.runtime.sendMessage({later: ms != null ? Date.now() + ms : true})
                return true
            }
            // Invalid/expired captcha: wait for a fresh solve then retry
            if (low.includes('captcha')) {
                voteClicked = false
                if (!captchaAlerted) {
                    captchaAlerted = true
                    chrome.runtime.sendMessage({captcha: true})
                }
                return false
            }
            // Other errors (IP, proxy/VPN, network, internal error...)
            const request = {message}
            if ((low.includes('proxy') && low.includes('vpn')) || low.includes('vpn')
                || low.includes('votre ip') || low.includes('erreur interne')
                || low.includes('réseau') || low.includes('interne')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
            return true
        }

        // 2. Successful vote (only after our own click)
        if (voteClicked && (document.querySelector('.ajax-msg .message-success')
                || document.querySelector('#voteForm[data-vote-cooldown-pending="true"]')
                || document.querySelector('.message-blured'))) {
            chrome.runtime.sendMessage({successfully: true})
            return true
        }

        // 3. Already voted, detected on load (cooldown overlay, before any click).
        // Two markup variants exist: server-rendered `.message-blured` (no data-vote-cooldown attr,
        // counter like "...+00:00") and client-inserted `.message-blured[data-vote-cooldown]`
        // (counter like "...Z"). Match both via the inner [data-counter]; Date.parse handles both.
        if (!voteClicked) {
            const counter = document.querySelector('.message-blured [data-counter]')
            if (counter) {
                const ts = Date.parse(counter.getAttribute('data-counter'))
                chrome.runtime.sendMessage({later: Number.isNaN(ts) ? true : ts})
                return true
            }
        }

        // 4. Form ready: fill the username and vote as soon as the captcha is solved
        if (!voteClicked && attempts < MAX_ATTEMPTS) {
            const btn = document.querySelector('#voteBtn:not([disabled])')
            if (btn) {
                const form = btn.closest('form') || document
                const usernameInput = form.querySelector('#username')
                if (usernameInput && !usernameInput.disabled && usernameInput.value !== project.nick) {
                    usernameInput.value = project.nick
                }

                // EasyVote (paid, no-captcha) replaces the captcha widget with a "Captcha validé"
                // image (no .mtcaptcha, no token) -> the captcha is pre-validated, vote right away.
                const easyVoteValidated = !!form.querySelector('.field-captcha img')
                const mtcaptcha = form.querySelector('.mtcaptcha')
                if (easyVoteValidated) {
                    voteClicked = true
                    attempts++
                    btn.click()
                } else if (mtcaptcha) {
                    const token = form.querySelector('input.mtcaptcha-verifiedtoken')
                    if (token && token.value && token.value.trim().length) {
                        // Token auto-filled (no-captcha subscription) -> vote
                        voteClicked = true
                        attempts++
                        btn.click()
                    } else if (ticks >= WAIT_TOKEN_TICKS && !captchaAlerted) {
                        // No automatic solve -> ask for a manual captcha solve
                        captchaAlerted = true
                        chrome.runtime.sendMessage({captcha: true})
                    }
                }
                // else: captcha widget not rendered yet -> wait for the next tick
            }
        }

        // Safety net: no state recognized and we are not waiting on a manual captcha
        if (ticks >= MAX_TICKS && !captchaAlerted && !voteClicked) {
            chrome.runtime.sendMessage({errorVoteNoElement: 'serveur-prive.net: no vote state detected (the site layout may have changed again)', ignoreReport: true})
            return true
        }

        return false
    }

    const loop = setInterval(() => {
        try {
            if (tick()) clearInterval(loop)
        } catch (e) {
            clearInterval(loop)
            throwError(e)
        }
    }, 1000)

    // Immediate first pass (don't wait 1s to detect an already-present cooldown)
    try {
        if (tick()) clearInterval(loop)
    } catch (e) {
        clearInterval(loop)
        throwError(e)
    }
}

// Parse a French "X heures Y minutes Z secondes" duration into milliseconds.
// Returns null if no duration is found (handles singular/plural).
function parseFrenchDuration(text) {
    const low = text.toLowerCase()
    const h = low.match(/(\d+)\s*heure/)
    const m = low.match(/(\d+)\s*minute/)
    const s = low.match(/(\d+)\s*seconde/)
    if (!h && !m && !s) return null
    const ms = (h ? +h[1] * 3600000 : 0) + (m ? +m[1] * 60000 : 0) + (s ? +s[1] * 1000 : 0)
    return ms > 0 ? ms : null
}
