import chalk from 'chalk'
import config from '../config.mjs'

const { icons } = config

const TYPE_EMOJI = {
	'User Story': icons.wiUserStory,
	'Task': icons.wiTask,
	'Bug': icons.wiBug,
	'Feature': icons.wiFeature,
	'Epic': icons.wiEpic,
	'Issue': icons.wiIssue,
}

function getTypeEmoji(type) {
	if (!type) return icons.wiUnknown
	const key = Object.keys(TYPE_EMOJI).find(k => type.toLowerCase().includes(k.toLowerCase()))
	return TYPE_EMOJI[key] || icons.wiUnknown
}

const TYPE_PREFIX = {
	'User Story': 'US',
	'Task': 'Task',
	'Bug': 'Bug',
	'Feature': 'Feat',
	'Epic': 'Epic',
	'Issue': 'Issue',
}

function getTypePrefix(type) {
	if (!type) return 'WI'
	const key = Object.keys(TYPE_PREFIX).find(k => type.toLowerCase().includes(k.toLowerCase()))
	return TYPE_PREFIX[key] || 'WI'
}

function getStateColor(state) {
	if (!state) return chalk.white
	const s = state.toLowerCase()
	if (s.includes('new')) return chalk.blue
	if (s.includes('active')) return chalk.yellow
	if (s.includes('resolved')) return chalk.green
	if (s.includes('closed')) return chalk.green.dim
	return chalk.white
}

function getColumnColor(col) {
	if (!col) return chalk.white
	const c = col.toLowerCase()
	if (c.includes('backlog')) return chalk.dim
	if (c.includes('progress')) return chalk.white.bold
	if (c.includes('done') || c.includes('closed') || c.includes('resolved')) return chalk.green
	return chalk.white
}

function truncate(str, max) {
	if (!str || max <= 0) return ''
	return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function stripAnsi(str) {
	return String(str).replace(/\x1b\[[0-9;]*m/g, '')
}

function truncateAnsi(str, max) {
	if (!str || max <= 0) return ''
	if (stripAnsi(str).length <= max) return str
	let visible = 0
	let result = ''
	const ansiRe = /\x1b\[[0-9;]*m/g
	let lastIdx = 0
	let match
	while ((match = ansiRe.exec(str)) !== null) {
		const before = str.slice(lastIdx, match.index)
		for (const ch of before) {
			if (visible >= max - 1) { result += '…'; return result }
			result += ch
			visible++
		}
		result += match[0]
		lastIdx = match.index + match[0].length
	}
	const rest = str.slice(lastIdx)
	for (const ch of rest) {
		if (visible >= max - 1) { result += '…'; return result }
		result += ch
		visible++
	}
	return result
}

export function isMyWI(wi, currentUser) {
	if (!currentUser) return false
	const u = currentUser.toLowerCase()
	if ((wi.assignedTo || '').toLowerCase().includes(u)) return true
	if ((wi.assignedToUniqueName || '').toLowerCase().includes(u)) return true
	if ((wi.createdBy || '').toLowerCase().includes(u)) return true
	if ((wi.createdByUniqueName || '').toLowerCase().includes(u)) return true
	return false
}

export function formatWIPanel(workItems, rows, cols, changedIds = new Set(), currentUser = '', cursorIndex = -1) {
	const lines = []
	const entities = []
	lines.push(chalk.bold.white('Work Items'))
	lines.push(chalk.dim('─'.repeat(cols)))

	const availableRows = Math.max(0, rows - 2)
	if (availableRows <= 0 || !workItems || workItems.length === 0) {
		while (lines.length < rows) lines.push('')
		return { lines: lines.slice(0, rows), entities }
	}

	// Sort: mine first
	const sorted = [...workItems]
	if (currentUser) {
		sorted.sort((a, b) => {
			const aMine = isMyWI(a, currentUser) ? 0 : 1
			const bMine = isMyWI(b, currentUser) ? 0 : 1
			return aMine - bMine
		})
	}

	const titleWidth = Math.max(10, Math.floor(cols * 0.3))
	const showLinkedPrs = cols >= 50
	const showComments = cols >= 40
	const showBoardColumn = cols >= 30

	for (let i = 0; i < availableRows && i < sorted.length; i++) {
		const wi = sorted[i]
		const id = wi.id
		const mine = isMyWI(wi, currentUser)
		const typeEmoji = getTypeEmoji(wi.type)
		const title = truncate(wi.title || '', titleWidth)
		const stateColor = getStateColor(wi.state)
		const colColor = getColumnColor(wi.boardColumn)

		let row = ''
		row += mine ? chalk.cyan('▎') : ' '
		row += `${typeEmoji} ${getTypePrefix(wi.type)} #${id}  `
		row += truncate(title, titleWidth).padEnd(titleWidth)
		row += '  '
		row += stateColor(wi.state || '')
		row += '  '

		if (showBoardColumn && wi.boardColumn) {
			row += colColor(truncate(wi.boardColumn, 15))
			row += '  '
		}
		if (showComments) {
			const count = wi.commentCount ?? 0
			row += `${icons.wiComments}${count}  `
		}
		if (showLinkedPrs && wi.linkedPrIds && wi.linkedPrIds.length > 0) {
			row += `${icons.wiLinkedPr}PR#${wi.linkedPrIds[0]}`
		}

		let formatted = truncateAnsi(row, cols)

		if (currentUser && !mine) {
			formatted = chalk.dim(formatted)
		}

		if (cursorIndex === i) {
			formatted = chalk.inverse(formatted)
		}

		entities.push({ type: 'wi', id, webUrl: wi.webUrl })
		lines.push(formatted)
	}

	while (lines.length < rows) {
		lines.push('')
	}
	return { lines: lines.slice(0, rows), entities }
}
