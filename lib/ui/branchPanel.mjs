import chalk from 'chalk'
import config from '../config.mjs'

const { icons } = config

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
	// Walk through visible characters, preserving ANSI codes
	let visible = 0
	let result = ''
	const ansiRe = /\x1b\[[0-9;]*m/g
	let lastIdx = 0
	let match
	while ((match = ansiRe.exec(str)) !== null) {
		const before = str.slice(lastIdx, match.index)
		for (const ch of before) {
			if (visible >= max - 1) {
				result += '…'
				return result
			}
			result += ch
			visible++
		}
		result += match[0]
		lastIdx = match.index + match[0].length
	}
	const rest = str.slice(lastIdx)
	for (const ch of rest) {
		if (visible >= max - 1) {
			result += '…'
			return result
		}
		result += ch
		visible++
	}
	return result
}

function formatAheadBehind(aheadCount, behindCount) {
	if (aheadCount == null && behindCount == null) {
		return chalk.dim('— —')
	}
	const ahead = aheadCount != null && aheadCount > 0
		? chalk.green(icons.branchAhead + aheadCount)
		: chalk.dim(icons.branchAhead + '0')
	const behind = behindCount != null && behindCount > 0
		? chalk.red(icons.branchBehind + behindCount)
		: chalk.dim(icons.branchBehind + '0')
	return `${ahead} ${behind}`
}

export function isMyBranch(b, currentUser) {
	if (!currentUser) return false
	const u = currentUser.toLowerCase()
	return (b.author || '').toLowerCase().includes(u)
}

export function formatBranchPanel(branches, rows, cols, changedIds = new Set(), currentUser = '', cursorIndex = -1) {
	const lines = []
	const entities = []
	lines.push(chalk.bold.white('Branches'))
	lines.push(chalk.dim('─'.repeat(cols)))

	const availableRows = Math.max(0, rows - 2)
	if (availableRows <= 0 || !branches || branches.length === 0) {
		while (lines.length < rows) lines.push('')
		return { lines: lines.slice(0, rows), entities }
	}

	// Sort: mine first
	const sorted = [...branches]
	if (currentUser) {
		sorted.sort((a, b) => {
			const aMine = isMyBranch(a, currentUser) ? 0 : 1
			const bMine = isMyBranch(b, currentUser) ? 0 : 1
			return aMine - bMine
		})
	}

	const nameWidth = Math.max(8, Math.floor(cols * 0.3))
	const authorWidth = Math.max(6, Math.floor(cols * 0.15))

	for (let i = 0; i < availableRows && i < sorted.length; i++) {
		const b = sorted[i]
		const name = b.name || ''
		const mine = isMyBranch(b, currentUser)
		const hash = (b.commitHash || '').slice(0, 7)

		let row = ''
		row += mine ? chalk.cyan('▎') : ' '
		row += chalk.cyan(truncate(name, nameWidth).padEnd(nameWidth))
		row += '  '
		row += truncate(b.author || '', authorWidth).padEnd(authorWidth)
		row += '  '
		row += chalk.dim(hash)
		row += '  '
		row += formatAheadBehind(b.aheadCount, b.behindCount)

		let formatted = truncateAnsi(row, cols)

		if (currentUser && !mine) {
			formatted = chalk.dim(formatted)
		}

		if (cursorIndex === i) {
			formatted = chalk.inverse(formatted)
		}

		entities.push({ type: 'branch', id: name, webUrl: b.webUrl })
		lines.push(formatted)
	}

	while (lines.length < rows) {
		lines.push('')
	}
	return { lines: lines.slice(0, rows), entities }
}
