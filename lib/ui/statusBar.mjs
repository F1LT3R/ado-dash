import chalk from 'chalk'
import config from '../config.mjs'

const { icons } = config

function stripAnsi(str) {
	return String(str).replace(/\x1b\[[0-9;]*m/g, '')
}

function visLen(str) {
	return stripAnsi(str).length
}

export function formatStatusBar(state, cols) {
	const { lastSyncTime, nextSyncIn, silentMode, searchQuery, isSearchMode, errorMessage, confirmPrompt } = state

	const leftParts = []
	if (lastSyncTime != null) {
		leftParts.push(chalk.cyan(`Synced: ${lastSyncTime}`))
	}
	if (nextSyncIn != null) {
		leftParts.push(chalk.cyan(`Next: ${nextSyncIn}s`))
	}
	const left = leftParts.join('  ')

	const center = confirmPrompt
		? chalk.yellowBright(confirmPrompt)
		: (isSearchMode || searchQuery)
			? chalk.green(`Search: /${searchQuery || ''}`)
			: ''

	const rightParts = []
	if (silentMode) {
		rightParts.push(chalk.yellow(`${icons.silentMode} SILENT`))
	}
	if (errorMessage) {
		rightParts.push(chalk.red.bold(`${icons.error} ` + errorMessage))
	}
	const right = rightParts.join(' ')

	const usedLen = visLen(left) + visLen(center) + visLen(right)
	const totalPad = Math.max(0, cols - usedLen)
	const padLeft = Math.floor(totalPad / 2)
	const padRight = totalPad - padLeft
	const bar = left + ' '.repeat(padLeft) + center + ' '.repeat(padRight) + right

	return chalk.inverse(bar)
}
