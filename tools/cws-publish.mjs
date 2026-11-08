// Uploads the store package to the Chrome Web Store and submits it for review, through the V2 API.
//
//   node tools/cws-publish.mjs build/auto-vote-rating-1.4.7.zip   upload, then submit for review
//   node tools/cws-publish.mjs --status                           only check the credentials and print the item status
//
// Environment:
//   CWS_SERVICE_ACCOUNT  the JSON key of the service account added under Account in the developer dashboard
//   CWS_PUBLISHER_ID     shown under Publisher > Settings in the developer dashboard
//   CWS_EXTENSION_ID     the item id from the store URL
//
// The API only takes items that already exist, and a version higher than the one in the store.

import {createSign} from 'node:crypto'
import {readFile} from 'node:fs/promises'

const API = 'https://chromewebstore.googleapis.com'
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'

const {CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID, CWS_EXTENSION_ID} = process.env
const missing = ['CWS_SERVICE_ACCOUNT', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'].filter(name => !process.env[name])
if (missing.length > 0) fail(`missing ${missing.join(', ')}`)

const item = `publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}`
const statusOnly = process.argv[2] === '--status'
const zipPath = process.argv[2]
if (!zipPath) fail('usage: node tools/cws-publish.mjs <zip> | --status')

const token = await accessToken(JSON.parse(CWS_SERVICE_ACCOUNT))

if (statusOnly) {
    console.log(JSON.stringify(await call('GET', `${API}/v2/${item}:fetchStatus`), null, 2))
    process.exit(0)
}

const zip = await readFile(zipPath)
console.log(`uploading ${zipPath} (${zip.length} bytes)`)
let upload = await call('POST', `${API}/upload/v2/${item}:upload`, zip, 'application/zip')
let state = upload.uploadState

// Large uploads are processed in the background, the docs name the pending state both ways
for (let tries = 0; isPending(state); tries++) {
    if (tries === 60) fail('the upload is still being processed after 5 minutes')
    await new Promise(resolve => setTimeout(resolve, 5000))
    state = (await call('GET', `${API}/v2/${item}:fetchStatus`)).lastAsyncUploadState
}
if (state !== 'SUCCEEDED') fail(`upload ended in state ${state}: ${JSON.stringify(upload)}`)
console.log(`uploaded${upload.crxVersion ? ' version ' + upload.crxVersion : ''}`)

// Without options the item goes to review and is published once Google accepts it
const published = await call('POST', `${API}/v2/${item}:publish`, JSON.stringify({}), 'application/json')
console.log(`submitted, item state ${published.state}`)
for (const warning of published.warningInfo?.warnings ?? []) {
    console.log(`warning ${warning.reason}: ${warning.description}`)
}

function isPending(state) {
    return state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS'
}

// A service account signs its own JWT and trades it for an access token
async function accessToken(key) {
    const now = Math.floor(Date.now() / 1000)
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = encode({alg: 'RS256', typ: 'JWT'}) + '.' + encode({
        iss: key.client_email,
        scope: SCOPE,
        aud: key.token_uri || 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    })
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

    const response = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: unsigned + '.' + signature
        })
    })
    const body = await response.json()
    if (!response.ok) fail(`token request failed (${response.status}): ${JSON.stringify(body)}`)
    return body.access_token
}

async function call(method, url, body, contentType) {
    const headers = {Authorization: `Bearer ${token}`}
    if (contentType) headers['Content-Type'] = contentType
    const response = await fetch(url, {method, headers, body})
    const text = await response.text()
    if (!response.ok) fail(`${method} ${url.replace(API, '')} failed (${response.status}): ${text}`)
    return text ? JSON.parse(text) : {}
}

function fail(message) {
    console.error(message)
    process.exit(1)
}
