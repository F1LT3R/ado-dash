import chalk from 'chalk'
import { formatPRPanel } from './prPanel.mjs'
import { formatWIPanel } from './wiPanel.mjs'
import { formatBranchPanel } from './branchPanel.mjs'
import { formatStatusBar } from './statusBar.mjs'

export function createDashboard(renderer) {
	let lastData = null

	function getDims() {
		return {
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24
		}
	}

	function allocateRows(contentRows, counts, expandedPanel) {
		// Each panel needs 2 header rows + N data rows
		const HEADER = 2
		if (expandedPanel === 1) return [contentRows, 0, 0]
		if (expandedPanel === 2) return [0, contentRows, 0]
		if (expandedPanel === 3) return [0, 0, contentRows]

		// How many rows each panel actually needs (header + item count)
		const needs = counts.map(c => HEADER + c)
		const total = contentRows

		// Start with equal split
		const alloc = [0, 0, 0]
		const third = Math.floor(total / 3)
		for (let i = 0; i < 3; i++) alloc[i] = third
		alloc[2] += total - third * 3 // remainder to last panel

		// Redistribute: panels that need less give surplus to those that need more
		for (let pass = 0; pass < 3; pass++) {
			let surplus = 0
			const hungry = []
			for (let i = 0; i < 3; i++) {
				if (alloc[i] > needs[i]) {
					surplus += alloc[i] - needs[i]
					alloc[i] = needs[i]
				} else if (alloc[i] < needs[i]) {
					hungry.push(i)
				}
			}
			if (surplus === 0 || hungry.length === 0) break
			const share = Math.floor(surplus / hungry.length)
			let remainder = surplus - share * hungry.length
			for (const i of hungry) {
				alloc[i] += share
				if (remainder > 0) {
					alloc[i]++
					remainder--
				}
			}
		}

		// Ensure minimums: at least HEADER rows if there's data, 0 if no data
		for (let i = 0; i < 3; i++) {
			if (counts[i] === 0 && alloc[i] > 0) {
				// Give away space from empty panels
				const give = alloc[i] - HEADER
				if (give > 0) {
					alloc[i] = HEADER
					// Distribute to non-empty neighbors
					const others = [0, 1, 2].filter(j => j !== i && counts[j] > 0)
					if (others.length > 0) {
						const each = Math.floor(give / others.length)
						let rem = give - each * others.length
						for (const j of others) {
							alloc[j] += each
							if (rem > 0) { alloc[j]++; rem-- }
						}
					}
				}
			}
		}

		return alloc
	}

	function buildLines(data) {
		const { cols, rows } = getDims()
		const contentRows = Math.max(1, rows - 1)

		const user = data.currentUser || ''
		const cursor = data.cursor || { panel: 0, index: 0 }
		const searchMatchIds = data.searchMatchIds || null

		// Filter data for search
		let prs = data.prs || []
		let workItems = data.workItems || []
		let branches = data.branches || []

		if (searchMatchIds) {
			prs = prs.filter(pr => searchMatchIds.prs.has(pr.id))
			workItems = workItems.filter(wi => searchMatchIds.wis.has(wi.id))
			branches = branches.filter(b => searchMatchIds.branches.has(b.name))
		}

		const expandedPanel = data.expandedPanel ?? 0
		const [prRows, wiRows, branchRows] = allocateRows(
			contentRows,
			[prs.length, workItems.length, branches.length],
			expandedPanel
		)

		const allLines = []
		const allEntities = []
		const panelMeta = []

		if (prRows > 0) {
			const prCursor = cursor.panel === 0 ? cursor.index : -1
			const result = formatPRPanel(prs, prRows, cols, data.changedPrIds || new Set(), user, prCursor)
			const dataRowCount = result.entities.length
			panelMeta.push({ panel: 0, startLine: allLines.length, dataRowCount, headerRows: 2 })
			allLines.push(...result.lines)
			allEntities.push(...result.entities)
		}
		if (wiRows > 0) {
			const wiCursor = cursor.panel === 1 ? cursor.index : -1
			const result = formatWIPanel(workItems, wiRows, cols, data.changedWiIds || new Set(), user, wiCursor)
			const dataRowCount = result.entities.length
			panelMeta.push({ panel: 1, startLine: allLines.length, dataRowCount, headerRows: 2 })
			allLines.push(...result.lines)
			allEntities.push(...result.entities)
		}
		if (branchRows > 0) {
			const brCursor = cursor.panel === 2 ? cursor.index : -1
			const result = formatBranchPanel(branches, branchRows, cols, data.changedBranchNames || new Set(), user, brCursor)
			const dataRowCount = result.entities.length
			panelMeta.push({ panel: 2, startLine: allLines.length, dataRowCount, headerRows: 2 })
			allLines.push(...result.lines)
			allEntities.push(...result.entities)
		}

		allLines.push(formatStatusBar({
			lastSyncTime: data.lastSyncTime,
			nextSyncIn: data.nextSyncIn,
			silentMode: data.silentMode,
			searchQuery: data.searchQuery,
			errorMessage: data.errorMessage,
			confirmPrompt: data.confirmPrompt
		}, cols))

		return { lines: allLines.slice(0, rows), entities: allEntities, panelMeta }
	}

	const dash = {
		update(data, cascade = false) {
			lastData = data
			const result = buildLines(data)
			if (cascade) {
				renderer.renderCascade(result.lines, 40)
			} else {
				renderer.render(result.lines)
			}
			return result
		},

		onResize() {
			if (lastData) {
				const result = buildLines(lastData)
				renderer.render(result.lines)
				return result
			}
			return null
		},

		getPanelMeta() {
			if (!lastData) return []
			return buildLines(lastData).panelMeta
		}
	}

	process.stdout.on('resize', () => {
		dash.onResize()
	})

	return dash
}
