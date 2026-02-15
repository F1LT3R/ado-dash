import chalk from 'chalk'
import config from '../config.mjs'

const { icons } = config

const STATUS_EMOJI = {
	active: icons.prStatusActive,
	completed: icons.prStatusCompleted,
	abandoned: icons.prStatusAbandoned,
}

const STATUS_COLOR = {
	active: chalk.yellow,
	completed: chalk.green,
	abandoned: chalk.red
}

function truncate(str, max) {
	if (!str || max <= 0) return ''
	return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function formatReviewers(reviewers) {
	if (!Array.isArray(reviewers) || reviewers.length === 0) return ''
	const counts = { approved: 0, rejected: 0, waiting: 0, suggestions: 0 }
	for (const r of reviewers) {
		const v = r.vote ?? 0
		if (v === 10) counts.approved++
		else if (v === 5) counts.suggestions++
		else if (v === -10) counts.rejected++
		else counts.waiting++
	}
	const parts = []
	if (counts.approved) parts.push(`${icons.reviewerApproved}${counts.approved}`)
	if (counts.rejected) parts.push(`${icons.reviewerRejected}${counts.rejected}`)
	if (counts.waiting) parts.push(`${icons.reviewerWaiting}${counts.waiting}`)
	if (counts.suggestions) parts.push(`${icons.reviewerSuggestions}${counts.suggestions}`)
	return parts.join(' ')
}

export function isMine(pr, currentUser) {
	if (!currentUser) return false
	const u = currentUser.toLowerCase()
	if ((pr.createdBy || '').toLowerCase().includes(u)) return true
	if ((pr.createdByUniqueName || '').toLowerCase().includes(u)) return true
	if (Array.isArray(pr.reviewers)) {
		for (const r of pr.reviewers) {
			if ((r.uniqueName || '').toLowerCase().includes(u)) return true
			if ((r.name || '').toLowerCase().includes(u)) return true
		}
	}
	return false
}

function firstName(name) {
	if (!name) return ''
	return name.split(/\s+/)[0]
}

export function formatPRPanel(prs, rows, cols, changedIds = new Set(), currentUser = '', cursorIndex = -1) {
	const lines = []
	const entities = []
	lines.push(chalk.bold.white('PRs'))
	lines.push(chalk.dim('─'.repeat(cols)))

	const availableRows = Math.max(0, rows - 2)
	if (availableRows <= 0 || !prs || prs.length === 0) {
		while (lines.length < rows) lines.push('')
		return { lines: lines.slice(0, rows), entities }
	}

	const authorWidth = Math.max(6, Math.floor(cols * 0.08))
	const titleWidth = Math.max(10, Math.floor(cols * 0.25))
	const branchWidth = Math.max(8, Math.floor(cols * 0.12))
	const showWorkItems = cols >= 80
	const showThreads = cols >= 60
	const showReviewers = cols >= 50
	const showBranch = cols >= 40
	const showAuthor = cols >= 35

	// Sort: mine first
	const sorted = [...prs]
	if (currentUser) {
		sorted.sort((a, b) => {
			const aMine = isMine(a, currentUser) ? 0 : 1
			const bMine = isMine(b, currentUser) ? 0 : 1
			return aMine - bMine
		})
	}

	for (let i = 0; i < availableRows && i < sorted.length; i++) {
		const pr = sorted[i]
		const id = pr.id
		const mine = isMine(pr, currentUser)
		const title = truncate(pr.title || '', titleWidth)
		const status = (pr.status || 'active').toLowerCase()
		const isDraft = pr.isDraft ?? false
		const statusEmoji = isDraft ? icons.prStatusDraft : (STATUS_EMOJI[status] || icons.prStatusActive)
		const statusLabel = isDraft ? 'draft' : status === 'completed' ? 'done' : status === 'abandoned' ? 'abandoned' : 'active'
		const colorFn = isDraft ? chalk.gray : (STATUS_COLOR[status] || chalk.yellow)

		let row = ''
		row += mine ? chalk.cyan('▎') : ' '
		row += `${icons.pr} PR #${id}  `
		if (showAuthor) {
			row += truncate(firstName(pr.createdBy), authorWidth).padEnd(authorWidth) + '  '
		}
		row += truncate(title, titleWidth).padEnd(titleWidth)
		row += '  '
		row += colorFn(`${statusEmoji}${statusLabel}`)
		row += '  '

		if (showBranch) {
			row += truncate(pr.sourceBranch || '', branchWidth).padEnd(branchWidth)
			row += '  '
		}
		if (showReviewers) {
			const revStr = formatReviewers(pr.reviewers)
			row += revStr + '  '
		}
		if (showThreads && pr.threadCounts) {
			const active = pr.threadCounts.active ?? 0
			row += `${icons.threads}${active}  `
		}
		if (showWorkItems && pr.workItemIds && pr.workItemIds.length > 0) {
			row += `${icons.linkedWorkItem}WI#${pr.workItemIds[0]}`
		} else if (showWorkItems) {
			row += '—'
		}

		let formatted = truncate(row, cols)

		// Dim non-mine items
		if (currentUser && !mine) {
			formatted = chalk.dim(formatted)
		}

		// Cursor highlight
		if (cursorIndex === i) {
			formatted = chalk.inverse(formatted)
		}

		entities.push({ type: 'pr', id, webUrl: pr.webUrl })
		lines.push(formatted)
	}

	while (lines.length < rows) {
		lines.push('')
	}
	return { lines: lines.slice(0, rows), entities }
}
