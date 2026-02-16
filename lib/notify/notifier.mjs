const QUEUE_CAP = 50

export function createNotifier(config) {
	const queue = []
	let processing = false
	let silent = false

	function log(msg) {
		if (!config.debug) return
		process.stderr.write(`[notifier] ${msg}\n`)
	}

	async function sendNotification(notifyType, message) {
		const typeMap = { status: 'info', done: 'success', review: 'warn', error: 'error' }
		const appType = typeMap[notifyType] || 'info'
		const params = new URLSearchParams({
			type: appType,
			message,
			app: 'Azure DevOps',
		})
		const url = `${config.notifyServerUrl}/notify/app?${params}`
		log(`fetching: ${url}`)
		const res = await fetch(url)
		log(`response: ${res.status}`)
	}

	async function processQueue() {
		if (queue.length === 0) {
			processing = false
			return
		}
		const event = queue.shift()
		if (!silent && config.notifyServerUrl) {
			try {
				await sendNotification(event.notifyType, event.message)
			} catch (err) {
				log(`fetch failed: ${err.message}`)
			}
		} else if (!config.notifyServerUrl) {
			log(`skipped (no NOTIFY_SERVER_URL): ${event.message}`)
		} else {
			log(`skipped (silent mode): ${event.message}`)
		}
		await processQueue()
	}

	async function startup() {
		if (!config.notifyServerUrl) {
			log('WARNING: NOTIFY_SERVER_URL is not set — notifications disabled')
			return
		}
		log(`server url: ${config.notifyServerUrl}`)
		try {
			await sendNotification('status', 'Azure DevOps Dashboard started')
		} catch (err) {
			log(`startup notification failed: ${err.message}`)
		}
	}

	return {
		startup,

		enqueue(events) {
			const newKeys = []
			for (const e of events) {
				log(`enqueue: [${e.type}] ${e.message}`)
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
