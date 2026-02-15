const QUEUE_CAP = 50

export function createNotifier(config) {
	const queue = []
	let processing = false
	let silent = false

	async function processQueue() {
		if (queue.length === 0) {
			processing = false
			return
		}
		const event = queue.shift()
		if (!silent && config.notifyServerUrl) {
			try {
				const params = new URLSearchParams({
					type: event.notifyType,
					message: event.message,
					workspaceDir: process.cwd(),
					app: 'ado-dash',
				})
				const url = `${config.notifyServerUrl}/notify/agent?${params}`
				await fetch(url)
			} catch (err) {
				process.stderr.write(`[notifier] fetch failed: ${err.message}\n`)
			}
		}
		await processQueue()
	}

	return {
		enqueue(events) {
			const newKeys = []
			for (const e of events) {
				if (queue.length >= QUEUE_CAP) {
					queue.shift()
				}
				queue.push(e)
				newKeys.push(e.cacheKey)
			}
			if (!processing && queue.length > 0) {
				processing = true
				processQueue()
			}
			return newKeys
		},

		setSilent(s) {
			silent = s
		},

		isSilent() {
			return silent
		},
	}
}
