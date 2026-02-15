import { fetchBranches } from '../api/branches.mjs'
import { fetchWorkItems } from '../api/workItems.mjs'
import { fetchPRs } from '../api/prs.mjs'
import { diffStates } from './differ.mjs'

export function createPoller({ cache, notifier, onData, onError, config }) {
	let intervalId = null
	let includeAllPRs = false
	let running = false
	let pollIntervalMs = config.pollIntervalMs
	let lastPollTime = null

	async function poll() {
		if (running) return
		running = true
		try {
			const branches = await fetchBranches()
			const workItems = await fetchWorkItems()
			const prs = await fetchPRs(includeAllPRs)

			const newState = { prs, workItems, branches }
			const oldState = cache.getState()
			const notificationKeys = cache.getNotificationKeys()

			const diff = diffStates(oldState, newState, notificationKeys)

			if (diff.events.length > 0) {
				const newKeys = notifier.enqueue(diff.events)
				for (const key of newKeys) {
					notificationKeys.add(key)
				}
			}

			cache.save(newState, notificationKeys)
			lastPollTime = new Date()

			onData({
				prs,
				workItems,
				branches,
				changedPrIds: diff.changedPrIds,
				changedWiIds: diff.changedWiIds,
				changedBranchNames: diff.changedBranchNames,
			})
		} catch (err) {
			onError(err)
		} finally {
			running = false
		}
	}

	function start() {
		poll()
		intervalId = setInterval(poll, pollIntervalMs)
	}

	function stop() {
		if (intervalId) {
			clearInterval(intervalId)
			intervalId = null
		}
	}

	function refresh() {
		poll()
	}

	function setIncludeAllPRs(val) {
		includeAllPRs = val
	}

	function getLastPollTime() {
		return lastPollTime
	}

	function getIntervalMs() {
		return pollIntervalMs
	}

	return {
		start,
		stop,
		refresh,
		setIncludeAllPRs,
		getLastPollTime,
		getIntervalMs,
	}
}
