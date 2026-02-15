import chalk from 'chalk'

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeRegex(query) {
	try {
		return new RegExp(query, 'i')
	} catch {
		return new RegExp(escapeRegex(query), 'i')
	}
}

// Returns sets of matching entity IDs for filter-in-place rendering
export function filterData(query, data) {
	if (!query || !data) return null

	const regex = safeRegex(query)
	const prs = new Set()
	const wis = new Set()
	const branches = new Set()

	for (const pr of (data.prs ?? [])) {
		const text = `PR #${pr.id} ${pr.title ?? ''} ${pr.status ?? ''} ${pr.sourceBranch ?? ''} ${pr.createdBy ?? ''}`
		try {
			if (regex.test(text)) prs.add(pr.id)
		} catch {
			if (text.toLowerCase().includes(query.toLowerCase())) prs.add(pr.id)
		}
	}

	for (const wi of (data.workItems ?? [])) {
		const text = `WI #${wi.id} ${wi.title ?? ''} ${wi.state ?? ''} ${wi.boardColumn ?? ''} ${wi.type ?? ''} ${wi.assignedTo ?? ''}`
		try {
			if (regex.test(text)) wis.add(wi.id)
		} catch {
			if (text.toLowerCase().includes(query.toLowerCase())) wis.add(wi.id)
		}
	}

	for (const b of (data.branches ?? [])) {
		const name = b.name ?? b
		const author = b.author ?? ''
		const text = `${name} ${author} ${b.commitHash ?? ''}`
		try {
			if (regex.test(text)) branches.add(name)
		} catch {
			if (text.toLowerCase().includes(query.toLowerCase())) branches.add(name)
		}
	}

	return { prs, wis, branches }
}
