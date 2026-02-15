import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function createCache(cacheFilePath) {
	let lastState = null
	let lastNotificationKeys = new Set()

	return {
		load() {
			try {
				const path = resolve(process.cwd(), cacheFilePath)
				const raw = readFileSync(path, 'utf8')
				const data = JSON.parse(raw)
				lastState = data.state ?? { prs: [], workItems: [], branches: [] }
				lastNotificationKeys = new Set(data.notificationKeys ?? [])
				return { state: lastState, notificationKeys: lastNotificationKeys }
			} catch {
				return null
			}
		},

		save(state, notificationKeys) {
			lastState = state
			lastNotificationKeys = new Set(notificationKeys)
			const path = resolve(process.cwd(), cacheFilePath)
			const data = {
				state: lastState,
				notificationKeys: [...lastNotificationKeys],
			}
			writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
		},

		getState() {
			return lastState
		},

		getNotificationKeys() {
			return lastNotificationKeys
		},
	}
}
