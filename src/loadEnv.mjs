// Loads .env file into process.env before any other module reads it.
// No dependencies — pure Node.js fs.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env')

try {
	const contents = readFileSync(envPath, 'utf8')
	for (const line of contents.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eqIdx = trimmed.indexOf('=')
		if (eqIdx < 0) continue
		const key = trimmed.slice(0, eqIdx).trim()
		let val = trimmed.slice(eqIdx + 1).trim()
		// Strip surrounding quotes
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1)
		}
		// Only set if not already in env (shell exports take priority)
		if (!(key in process.env) || process.env[key] === '') {
			process.env[key] = val
		}
	}
} catch {
	// .env file missing is fine — env vars may come from shell
}
