export function diffStates(oldState, newState, notificationKeys) {
	const events = []
	const changedPrIds = new Set()
	const changedWiIds = new Set()
	const changedBranchNames = new Set()

	if (oldState === null) {
		return { events, changedPrIds, changedWiIds, changedBranchNames }
	}

	const oldPrs = oldState.prs ?? []
	const newPrs = newState.prs ?? []
	const oldWi = oldState.workItems ?? []
	const newWi = newState.workItems ?? []
	const oldBranches = oldState.branches ?? []
	const newBranches = newState.branches ?? []

	const oldPrMap = new Map(oldPrs.map((p) => [p.id, p]))
	const newPrMap = new Map(newPrs.map((p) => [p.id, p]))
	const oldWiMap = new Map(oldWi.map((w) => [w.id, w]))
	const newWiMap = new Map(newWi.map((w) => [w.id, w]))
	const oldBranchSet = new Set((oldBranches ?? []).map((b) => b.name ?? b))
	const newBranchSet = new Set((newBranches ?? []).map((b) => b.name ?? b))

	const hasKey = (key) => notificationKeys && notificationKeys.has(key)

	for (const [id, pr] of newPrMap) {
		const oldPr = oldPrMap.get(id)
		if (!oldPr) {
			changedPrIds.add(id)
			const cacheKey = `new-pr:${id}`
			if (!hasKey(cacheKey)) {
				events.push({
					type: 'new-pr',
					entityId: id,
					message: `New PR #${id}: ${pr.title ?? ''}`,
					notifyType: 'status',
					cacheKey,
				})
			}
		} else {
			const oldActive = oldPr.threadCounts?.active ?? 0
			const newActive = pr.threadCounts?.active ?? 0
			if (newActive !== oldActive) {
				changedPrIds.add(id)
				const cacheKey = `pr-comment:${id}:${newActive}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'pr-comment',
						entityId: id,
						message: `New comment on PR #${id}: ${pr.title ?? ''}`,
						notifyType: 'status',
						cacheKey,
					})
				}
			}

			const oldVotes = new Map((oldPr.reviewers ?? []).map((r) => [r.name ?? r.id, r.vote ?? 0]))
			const newVotes = new Map((pr.reviewers ?? []).map((r) => [r.name ?? r.id, r.vote ?? 0]))
			for (const [name, vote] of newVotes) {
				const prevVote = oldVotes.get(name) ?? 0
				if (vote === 10 && prevVote !== 10) {
					changedPrIds.add(id)
					const cacheKey = `pr-approved:${id}:${name}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-approved',
							entityId: id,
							message: `PR #${id} approved by ${name}`,
							notifyType: 'done',
							cacheKey,
						})
					}
				}
				if (vote === -10 && prevVote !== -10) {
					changedPrIds.add(id)
					const cacheKey = `pr-rejected:${id}:${name}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-rejected',
							entityId: id,
							message: `Changes requested on PR #${id} by ${name}`,
							notifyType: 'review',
							cacheKey,
						})
					}
				}
			}
		}
	}

	for (const [id, wi] of newWiMap) {
		const oldWiItem = oldWiMap.get(id)
		if (!oldWiItem) {
			changedWiIds.add(id)
			const cacheKey = `new-wi:${id}`
			if (!hasKey(cacheKey)) {
				events.push({
					type: 'new-wi',
					entityId: id,
					message: `New work item #${id}: ${wi.title ?? ''}`,
					notifyType: 'status',
					cacheKey,
				})
			}
		} else {
			const oldStateVal = oldWiItem.state ?? ''
			const newStateVal = wi.state ?? ''
			if (oldStateVal !== newStateVal) {
				changedWiIds.add(id)
				const cacheKey = `wi-state:${id}:${newStateVal}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'wi-state',
						entityId: id,
						message: `WI #${id} moved to ${newStateVal}`,
						notifyType: 'status',
						cacheKey,
					})
				}
			}
		}
	}

	for (const b of newBranches) {
		const name = b.name ?? b
		if (!oldBranchSet.has(name)) {
			changedBranchNames.add(name)
		}
	}

	return { events, changedPrIds, changedWiIds, changedBranchNames }
}
