async function vote(first) {
    if (first === false) return

    if (isVisibleElement(document.querySelector('.fc-dialog-container'))) {
        chrome.runtime.sendMessage({requiredConfirmTOS: true})
        await new Promise(resolve => {
            const timer2 = setInterval(() => {
                if (!document.querySelector('.fc-dialog-container')) {
                    clearInterval(timer2)
                    resolve()
                }
            }, 1000)
        })
    }

    //Если успешное авто-голосование
    if (document.querySelector('div.alert.alert-success') != null) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    // Détection de la page "déjà voté" via la section cooldown (nouvelle structure HTML)
    if (document.querySelector('.vote-cooldown-section') != null) {
        // Essayer d'abord d'utiliser le compteur digital qui est plus précis
        const digitalCountdown = document.getElementById('digitalCountdown')
        if (digitalCountdown) {
            const hoursSpan = digitalCountdown.querySelector('[data-unit="hours"]')
            const minutesSpan = digitalCountdown.querySelector('[data-unit="minutes"]')
            const secondsSpan = digitalCountdown.querySelector('[data-unit="seconds"]')
            
            if (hoursSpan && minutesSpan && secondsSpan) {
                const hours = parseInt(hoursSpan.textContent.trim(), 10) || 0
                const minutes = parseInt(minutesSpan.textContent.trim(), 10) || 0
                const seconds = parseInt(secondsSpan.textContent.trim(), 10) || 0
                const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
                chrome.runtime.sendMessage({later: Date.now() + milliseconds})
                return
            }
        }
        
        // Sinon, utiliser le voteTimer en secours
        const voteTimer = document.getElementById('voteTimer')
        if (voteTimer != null) {
            const timerText = voteTimer.textContent.trim()
            // Extraire les minutes et secondes (format: "91m 22s" ou "1h 31m")
            const numbers = timerText.match(/\d+/g)
            if (numbers && numbers.length > 0) {
                let milliseconds = 0
                if (timerText.includes('h')) {
                    // Format avec heures
                    const hours = parseInt(numbers[0], 10) || 0
                    const minutes = parseInt(numbers[1], 10) || 0
                    milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000)
                } else {
                    // Format sans heures (seulement minutes)
                    const minutes = parseInt(numbers[0], 10) || 0
                    const seconds = parseInt(numbers[1], 10) || 0
                    milliseconds = (minutes * 60 * 1000) + (seconds * 1000)
                }
                chrome.runtime.sendMessage({later: Date.now() + milliseconds})
                return
            }
        }
        // Si le timer n'est pas trouvé mais la section cooldown existe
        chrome.runtime.sendMessage({later: true})
        return
    }

    //Если есть предупреждение
    if (document.querySelector('div.alert.alert-warning') != null) {
        //Если вы уже голосовали
        if (document.getElementById('voteTimer') != null) {
            const numbers = document.getElementById('voteTimer').textContent.match(/\d+/g).map(Number)
            const milliseconds = /*(hour * 60 * 60 * 1000) + */(numbers[0] * 60 * 1000)/* + (sec * 1000)*/
            chrome.runtime.sendMessage({later: Date.now() + milliseconds})
            return
        } else {
            chrome.runtime.sendMessage({message: document.querySelector('div.alert.alert-warning').innerText})
            return
        }
    }
    //Если есть ошибка
    for (const el of document.querySelectorAll('div.alert.alert-danger')) {
        const request = {}
        request.message = el.innerText
        if (request.message.includes('cannot vote more than once at the same time') || request.message.includes('avant de pouvoir voter à nouveau')) {
            chrome.runtime.sendMessage({later: true})
            return
        } else if (request.message.includes('Captcha')) {
            // None
        } else {
            if (
                    request.message.includes('Sie können nicht wählen, weil Ihr Netzwerk kein')
                    || request.message.includes('cannot vote because your network')
                    || request.message.includes('не можете голосовать из-за того, что находитесь в частной или закрытой сети')
                    || request.message.includes('não pode votar porque sua rede não é uma rede')
                    || request.message.includes('ne pouvez pas voter car votre réseau n\'est pas un réseau')
                    || request.message.includes('puedes votar porque tu red no es una red')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
            return
        }
    }

    if (document.getElementById('playername') != null) {
        const project = await getProject()
        document.getElementById('playername').value = project.nick
    }

    const timer = setInterval(function() {
        try {
            if (document.querySelector('#captcha-content > div > div.grecaptcha-logo > iframe') != null) {
                //Ждёт загрузки reCaptcha
                const submitButton = document.querySelector('button#btnSubmitVote') || document.querySelector('form.vote-form button[type="submit"]') || document.querySelector('form.form-vote button[type="submit"]')
                if (submitButton) submitButton.click()
                clearInterval(timer)
            }
        } catch (e) {
            clearInterval(timer)
            throwError(e)
        }
    }, 1000)

    if (document.querySelector('.mtcaptcha') != null) {
        chrome.runtime.sendMessage({captcha: true})
    }

    const submitButton = document.querySelector('button#btnSubmitVote') || document.querySelector('form.vote-form button[type="submit"]') || document.querySelector('form.form-vote button[type="submit"]')
    if (submitButton && submitButton.disabled === true) {
        const timer = setInterval(() => {
            const btn = document.querySelector('button#btnSubmitVote') || document.querySelector('form.vote-form button[type="submit"]') || document.querySelector('form.form-vote button[type="submit"]')
            if (btn?.disabled === false) {
                clearInterval(timer)
                btn.click()
            }
        }, 1000)
    }
}