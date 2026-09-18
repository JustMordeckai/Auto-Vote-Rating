async function vote(first) {
    //Если успешное авто-голосование
    if (document.querySelector('.fullscreen-flash-message-container')) {
        const message = document.querySelector('.fullscreen-flash-message-container').innerText.trim()
        if (message.toLowerCase().includes('cпасибо за голосование') || message.toLowerCase().includes('thank you for your vote')) {
            chrome.runtime.sendMessage({successfully: true})
        } else {
            chrome.runtime.sendMessage({message})
        }
        return
    }

    //Если вы уже голосовали
    if (document.querySelector('div[class="tabs-content-without-tabs"]') != null && document.querySelector('div[class="tabs-content-without-tabs"]').innerText.includes('already voted')) {
        let leftTime = parseInt(document.querySelector('span[class="time-left"]').innerText.match(/\d/g).join(''))
        leftTime = leftTime + 1
        leftTime = leftTime * 3600000
        chrome.runtime.sendMessage({later: Date.now() + leftTime})
        return
    }

    //Если есть ошибка
    // The vote form used to be #w1, it is now #w0, so we look for the error in any of them
    if (document.querySelector('form div.error-message > div')) {
        const message = document.querySelector('form div.error-message > div').textContent
        //Если вы уже голосовали
        if (message.includes('сможете повторно проголосовать') || message.includes('already voted') || message.includes('can re-vote')) {
            let leftTime = parseInt(message.match(/\d/g).join(''))
            leftTime = leftTime + 1
            leftTime = leftTime * 3600000
            chrome.runtime.sendMessage({later: Date.now() + leftTime})
            return
        } else if (message.includes('I\'m not a robot') || message.includes('enter a nickname')
            || message.toLowerCase().includes('verification code') || message.toLowerCase().includes('проверочный код')) {
            // None
        } else {
            chrome.runtime.sendMessage({message})
            return
        }
    }

    const project = await getProject()
    document.querySelector('#playercollector-nickname').value = project.nick

    // The rating dropped reCAPTCHA for its own image captcha, which has to be typed in by hand
    const captchaField = document.querySelector('#captchacollector-captcha')
    if (captchaField != null && captchaField.value.trim().length === 0) {
        chrome.runtime.sendMessage({captcha: true})
        return
    }

    document.querySelector('#w0 button[type=submit]')?.click()
    document.querySelector('#w1 button[type=submit]')?.click()
}