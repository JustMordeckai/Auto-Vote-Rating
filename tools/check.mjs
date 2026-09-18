// Static checks for the extension. Run with: node tools/check.mjs
// Kept dependency free on purpose, the repository has no package.json.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = dirname(fileURLToPath(new URL('.', import.meta.url))).replace(/[\\/]tools$/, '')
const problems = []
const skipped = ['libs', 'node_modules', '.git', 'build', '.playwright-mcp', '.remember', 'tools']

function fail(file, message) {
    problems.push(`${file}: ${message}`)
}

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (skipped.includes(entry)) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, out)
        else out.push(full)
    }
    return out
}

const files = walk(repo)
const scripts = files.filter(f => f.endsWith('.js'))
const rel = f => relative(repo, f).replace(/\\/g, '/')

// 1. every first party script parses
for (const file of scripts) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    } catch (error) {
        fail(rel(file), 'syntax error\n' + String(error.stderr).trim())
    }
}

// 2. a timer without a delay runs as fast as the event loop allows, and hacktimer.js
//    turns that into a message storm between the page and the service worker
function findTimersWithoutDelay(source) {
    const found = []
    const pattern = /\b(setInterval|setTimeout)\s*\(/g
    let match
    while ((match = pattern.exec(source)) !== null) {
        let depth = 1
        let i = pattern.lastIndex
        let hasArgumentSeparator = false
        while (i < source.length && depth > 0) {
            const char = source[i]
            if (char === '(' || char === '[' || char === '{') depth++
            else if (char === ')' || char === ']' || char === '}') depth--
            else if (char === ',' && depth === 1) hasArgumentSeparator = true
            else if (char === '"' || char === "'" || char === '`') {
                const quote = char
                i++
                while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1
            }
            i++
        }
        if (!hasArgumentSeparator) {
            found.push({ name: match[1], line: source.slice(0, match.index).split('\n').length })
        }
    }
    return found
}

for (const file of scripts) {
    if (rel(file) === 'scripts/main/hacktimer.js') continue // it defines the timers
    for (const timer of findTimersWithoutDelay(readFileSync(file, 'utf8'))) {
        fail(`${rel(file)}:${timer.line}`, `${timer.name} called without a delay`)
    }
}

// 3. the manifest must stay loadable by Chrome
const manifestPath = join(repo, 'manifest.json')
let manifest
try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
    fail('manifest.json', 'invalid JSON: ' + error.message)
}

if (manifest) {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('manifest.json', `unexpected version "${manifest.version}"`)

    const referenced = []
    if (manifest.background?.service_worker) referenced.push(manifest.background.service_worker)
    if (manifest.icons) referenced.push(...Object.values(manifest.icons))
    for (const resource of manifest.web_accessible_resources ?? []) referenced.push(...resource.resources)
    for (const reference of referenced) {
        if (!existsSync(join(repo, reference))) fail('manifest.json', `references a missing file: ${reference}`)
    }

    if (manifest.default_locale && !existsSync(join(repo, '_locales', manifest.default_locale, 'messages.json'))) {
        fail('manifest.json', `default_locale ${manifest.default_locale} has no messages.json`)
    }
}

// 4. a broken translation file stops the whole extension from loading
for (const locale of readdirSync(join(repo, '_locales'))) {
    const file = join(repo, '_locales', locale, 'messages.json')
    try {
        const messages = JSON.parse(readFileSync(file, 'utf8'))
        for (const [key, entry] of Object.entries(messages)) {
            if (typeof entry?.message !== 'string') fail(`_locales/${locale}/messages.json`, `"${key}" has no message`)
        }
    } catch (error) {
        fail(`_locales/${locale}/messages.json`, 'invalid JSON: ' + error.message)
    }
}

// 5. every rating declared in projects.js must have the script that votes for it
const projectsSource = readFileSync(join(repo, 'projects.js'), 'utf8')
const declared = [...projectsSource.matchAll(/^ {4}'([^']+)':\s*\{/gm)].map(m => m[1])
const aliased = new Set([...projectsSource.matchAll(/^allProjects\['([^']+)'\]\s*=/gm)].map(m => m[1]))
for (const rating of declared) {
    if (aliased.has(rating)) continue
    // a rating that votes without opening a tab only ships the silent variant
    if (existsSync(join(repo, 'scripts', rating + '.js'))) continue
    if (existsSync(join(repo, 'scripts', rating + '_silentvote.js'))) continue
    fail('projects.js', `rating "${rating}" has no script in scripts/`)
}

console.log(`checked ${scripts.length} scripts, ${declared.length} ratings`)
if (problems.length) {
    console.error('\n' + problems.join('\n'))
    console.error(`\n${problems.length} problem(s)`)
    process.exit(1)
}
console.log('all checks passed')
