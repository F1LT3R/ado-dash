import './loadEnv.mjs'
import { exec } from 'node:child_process'
import config from './config.mjs'
import { createCache } from './sync/cache.mjs'
import { createNotifier } from './notify/notifier.mjs'
import { createPoller } from './sync/poller.mjs'
import { createRenderer } from './ui/renderer.mjs'
import { createDashboard } from './ui/dashboard.mjs'
import { createKeyboardHandler } from './ui/keyboard.mjs'
import { filterData } from './ui/search.mjs'

// ─── Validate environment ──────────────────────────────────────────────────────

if (!process.env.AZURE_DEVOPS_PAT && !process.env.ADO_PR_REVIEW_PAT) {
	console.error('Error: AZURE_DEVOPS_PAT (or ADO_PR_REVIEW_PAT) is not set.')
	console.error('Run: source ./load-env.sh   (or source ~/.secrets/ADO_PR_REVIEW_PAT)')
	process.exit(1)
}

// Normalize PAT env var
if (!process.env.AZURE_DEVOPS_PAT && process.env.ADO_PR_REVIEW_PAT) {
	process.env.AZURE_DEVOPS_PAT = process.env.ADO_PR_REVIEW_PAT
}

// ─── Current user detection ────────────────────────────────────────────────────

let currentUser = config.currentUser || ''

async function detectCurrentUser() {
	if (currentUser) return
	try {
		const { adoFetch } = await import('./api/client.mjs')
		const res = await adoFetch(`/connectionData?api-version=7.0`)
		const data = await res.json()
		const user = data.authenticatedUser
		if (user) {
			currentUser = user.providerDisplayName || user.customDisplayName || ''
			if (currentUser) {
				process.stderr.write(`[ado-dash] Detected user: ${currentUser}\n`)
			}
		}
	} catch {
		// connectionData may fail — we'll detect from first poll data
	}
}

// ─── State ─────────────────────────────────────────────────────────────────────

let silentMode = config.silentMode
let expandedPanel = 0
let searchQuery = ''
let searchMatchIds = null
let errorMessage = null
let confirmPending = false
let includeAllPRs = false

// Cursor state: { panel: 0|1|2, index: 0-based row within panel }
let cursor = { panel: 0, index: 0 }

// Track panel sizes from last render so cursor can wrap correctly
let lastPanelMeta = []
let lastEntities = []

let currentData = {
	prs: [],
	workItems: [],
	branches: [],
}

const changedPrIds = new Set()
const changedWiIds = new Set()
const changedBranchNames = new Set()

// ─── Initialize modules ────────────────────────────────────────────────────────

const cache = createCache(config.cacheFile)
const notifier = createNotifier(config)
const renderer = createRenderer()
const dashboard = createDashboard(renderer)

// Fire a startup notification to confirm the notify pipeline works
notifier.startup()

// Load cached state on startup
const cached = cache.load()
if (cached) {
	currentData = cached.state || currentData
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date) {
	if (!date) return '—'
	const h = String(date.getHours()).padStart(2, '0')
	const m = String(date.getMinutes()).padStart(2, '0')
	const s = String(date.getSeconds()).padStart(2, '0')
	return `${h}:${m}:${s}`
}

function getNextSyncIn() {
	const last = poller.getLastPollTime()
	if (!last) return '—'
	const elapsed = Date.now() - last.getTime()
	const remaining = Math.max(0, Math.ceil((poller.getIntervalMs() - elapsed) / 1000))
	return String(remaining)
}

function getItemCountForPanel(panelIndex) {
	const meta = lastPanelMeta.find(m => m.panel === panelIndex)
	return meta ? meta.dataRowCount : 0
}

function openInBrowser(url) {
	if (!url) return
	// macOS
	exec(`open "${url}"`)
}

function buildRenderData() {
	return {
		prs: currentData.prs,
		workItems: currentData.workItems,
		branches: currentData.branches,
		currentUser,
		lastSyncTime: formatTime(poller.getLastPollTime()),
		nextSyncIn: getNextSyncIn(),
		silentMode,
		searchQuery: keyboard.isSearchMode() ? (keyboard.getSearchQuery() || '') : searchQuery || null,
		isSearchMode: keyboard.isSearchMode(),
		errorMessage,
		confirmPrompt: confirmPending ? 'Clear notifications? (y/N)' : null,
		expandedPanel,
		changedPrIds,
		changedWiIds,
		changedBranchNames,
		cursor,
		searchMatchIds,
	}
}

function render(cascade = false) {
	const result = dashboard.update(buildRenderData(), cascade)
	lastPanelMeta = result.panelMeta
	lastEntities = result.entities
}

// ─── Cursor navigation ────────────────────────────────────────────────────────

function getVisiblePanels() {
	// Returns ordered list of panel indices that have items
	const panels = []
	for (const meta of lastPanelMeta) {
		if (meta.dataRowCount > 0) panels.push(meta.panel)
	}
	return panels
}

function moveCursorDown() {
	const visible = getVisiblePanels()
	if (visible.length === 0) return

	const count = getItemCountForPanel(cursor.panel)
	if (count === 0 || !visible.includes(cursor.panel)) {
		// Current panel is empty — jump to first visible panel
		cursor = { panel: visible[0], index: 0 }
	} else if (cursor.index < count - 1) {
		cursor.index++
	} else {
		// Move to next panel's top
		const idx = visible.indexOf(cursor.panel)
		const nextPanel = visible[(idx + 1) % visible.length]
		cursor = { panel: nextPanel, index: 0 }
	}
	render()
}

function moveCursorUp() {
	const visible = getVisiblePanels()
	if (visible.length === 0) return

	const count = getItemCountForPanel(cursor.panel)
	if (count === 0 || !visible.includes(cursor.panel)) {
		// Current panel is empty — jump to last visible panel's last item
		const lastPanel = visible[visible.length - 1]
		const lastCount = getItemCountForPanel(lastPanel)
		cursor = { panel: lastPanel, index: Math.max(0, lastCount - 1) }
	} else if (cursor.index > 0) {
		cursor.index--
	} else {
		// Move to previous panel's bottom
		const idx = visible.indexOf(cursor.panel)
		const prevPanel = visible[(idx - 1 + visible.length) % visible.length]
		const prevCount = getItemCountForPanel(prevPanel)
		cursor = { panel: prevPanel, index: Math.max(0, prevCount - 1) }
	}
	render()
}

function handleEnter() {
	// Find which entity the cursor is on
	// Entities are accumulated across panels in order
	let offset = 0
	for (const meta of lastPanelMeta) {
		if (meta.panel === cursor.panel) {
			const entityIdx = offset + cursor.index
			if (entityIdx >= 0 && entityIdx < lastEntities.length) {
				const entity = lastEntities[entityIdx]
				if (entity?.webUrl) {
					openInBrowser(entity.webUrl)
				}
			}
			return
		}
		offset += meta.dataRowCount
	}
}

// ─── Countdown timer ───────────────────────────────────────────────────────────

let countdownId = null

function startCountdown() {
	if (countdownId) clearInterval(countdownId)
	countdownId = setInterval(() => {
		render()
	}, 5000)
}

// ─── Poller callbacks ──────────────────────────────────────────────────────────

function onData(data) {
	currentData = {
		prs: data.prs,
		workItems: data.workItems,
		branches: data.branches,
	}

	// Auto-detect current user from PR createdBy if not yet known
	if (!currentUser && data.prs?.length > 0) {
		const creators = {}
		for (const pr of data.prs) {
			const name = pr.createdBy
			if (name) creators[name] = (creators[name] || 0) + 1
		}
		const sorted = Object.entries(creators).sort((a, b) => b[1] - a[1])
		if (sorted.length > 0) {
			currentUser = sorted[0][0]
			process.stderr.write(`[ado-dash] Auto-detected user: ${currentUser}\n`)
		}
	}

	for (const id of data.changedPrIds) changedPrIds.add(id)
	for (const id of data.changedWiIds) changedWiIds.add(id)
	for (const name of data.changedBranchNames) changedBranchNames.add(name)

	// Re-apply search filter if active
	if (searchQuery) {
		searchMatchIds = filterData(searchQuery, currentData)
	}

	// Clamp cursor if items disappeared
	const dataCounts = [currentData.prs.length, currentData.workItems.length, currentData.branches.length]
	const curCount = dataCounts[cursor.panel] ?? 0
	if (curCount > 0 && cursor.index >= curCount) {
		cursor.index = curCount - 1
	} else if (curCount === 0) {
		const firstWithData = dataCounts.findIndex(c => c > 0)
		if (firstWithData >= 0) {
			cursor = { panel: firstWithData, index: 0 }
		}
	}

	errorMessage = null
	render(true) // cascade on data refresh
}

function onError(err) {
	errorMessage = err.message || 'Unknown error'
	process.stderr.write(`[poll error] ${err.message}\n`)
	render()
}

// ─── Create poller ─────────────────────────────────────────────────────────────

const poller = createPoller({
	cache,
	notifier,
	onData,
	onError,
	config,
})

// ─── Keyboard callbacks ───────────────────────────────────────────────────────

const keyboard = createKeyboardHandler({
	onSearch(query) {
		const changed = query !== searchQuery
		if (!query) {
			searchMatchIds = null
			searchQuery = ''
		} else {
			searchQuery = query
			searchMatchIds = filterData(query, currentData)
		}
		// Only reset cursor when the query text actually changed
		if (changed) {
			cursor = { panel: cursor.panel, index: 0 }
		}
		render()
	},

	onSearchConfirm() {
		// Search stays applied, just exit typing mode
		render()
	},

	onSearchCancel() {
		searchMatchIds = null
		searchQuery = ''
		cursor = { panel: cursor.panel, index: 0 }
		render()
	},

	onCursorUp() {
		if (confirmPending) return
		moveCursorUp()
	},

	onCursorDown() {
		if (confirmPending) return
		moveCursorDown()
	},

	onEnter() {
		if (confirmPending) return
		handleEnter()
	},

	onToggleAllPRs() {
		if (confirmPending) return
		includeAllPRs = !includeAllPRs
		poller.setIncludeAllPRs(includeAllPRs)
		poller.refresh()
	},

	onToggleSilent() {
		if (confirmPending) return
		silentMode = !silentMode
		notifier.setSilent(silentMode)
		render()
	},

	onRefresh() {
		if (confirmPending) return
		poller.refresh()
	},

	onClearHighlights() {
		if (confirmPending) {
			changedPrIds.clear()
			changedWiIds.clear()
			changedBranchNames.clear()
			confirmPending = false
			render()
			return
		}
		confirmPending = true
		render()
		setTimeout(() => {
			if (confirmPending) {
				confirmPending = false
				render()
			}
		}, 5000)
	},

	onQuit() {
		shutdown()
	},

	onExpandPanel(n) {
		if (confirmPending) {
			confirmPending = false
			render()
			return
		}
		expandedPanel = n
		// Move cursor to the expanded panel
		if (n >= 1 && n <= 3) {
			cursor = { panel: n - 1, index: 0 }
		}
		render()
	},
})

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown() {
	poller.stop()
	keyboard.stop()
	if (countdownId) clearInterval(countdownId)
	renderer.clear()
	process.stdout.write('\x1b[?25h') // Show cursor
	process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ─── Start ─────────────────────────────────────────────────────────────────────

process.stdout.write('\x1b[?25l') // Hide cursor
renderer.clear()
keyboard.start()
detectCurrentUser().then(() => {
	poller.start()
	startCountdown()
})
