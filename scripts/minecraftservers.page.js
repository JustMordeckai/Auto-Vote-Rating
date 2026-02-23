async function vote(first) {
    if (document.querySelector('div.alert.alert-success')) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }
    if (document.querySelector('div.alert.alert-danger')) {
        const text = document.querySelector('div.alert.alert-danger').textContent.trim()
        if (text.toLowerCase().includes('already voted') || text.toLowerCase().includes('once per day')) {
            chrome.runtime.sendMessage({later: true})
        } else if (!text.toLowerCase().includes('captcha')) {
            chrome.runtime.sendMessage({message: text})
        }
        return
    }

    if (first) return

    const project = await getProject()
    document.querySelector('input[name="minecraft_name"]').value = project.nick

    const form = document.querySelector('#voteBtn')
    const response = await fetch(form.action, {method: 'POST', body: new FormData(form)})

    if (response.url.includes('vote=1')) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
    if (doc.querySelector('div.alert.alert-success')) {
        chrome.runtime.sendMessage({successfully: true})
    } else if (doc.querySelector('div.alert.alert-danger')) {
        const text = doc.querySelector('div.alert.alert-danger').textContent.trim()
        if (text.toLowerCase().includes('already voted') || text.toLowerCase().includes('once per day')) {
            chrome.runtime.sendMessage({later: true})
        } else {
            chrome.runtime.sendMessage({message: text})
        }
    } else {
        chrome.runtime.sendMessage({successfully: true})
    }
}
