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
	const oldBranchMap = new Map((oldBranches ?? []).map((b) => [b.name ?? b, b]))
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
			const oldStatus = oldPr.status ?? ''
			const newStatus = pr.status ?? ''
			if (oldStatus !== newStatus) {
				changedPrIds.add(id)
				const cacheKey = `pr-status:${id}:${newStatus}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'pr-status',
						entityId: id,
						message: `PR #${id} ${newStatus}: ${pr.title ?? ''}`,
						notifyType: newStatus === 'completed' ? 'done' : 'status',
						cacheKey,
					})
				}
			}

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

			const oldTitle = oldPr.title ?? ''
			const newTitle = pr.title ?? ''
			if (newTitle !== oldTitle) {
				changedPrIds.add(id)
				const cacheKey = `pr-title:${id}:${newTitle}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'pr-title',
						entityId: id,
						message: `PR #${id} renamed: ${newTitle}`,
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

			const oldWiTitle = oldWiItem.title ?? ''
			const newWiTitle = wi.title ?? ''
			if (newWiTitle !== oldWiTitle) {
				changedWiIds.add(id)
				const cacheKey = `wi-title:${id}:${newWiTitle}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'wi-title',
						entityId: id,
						message: `WI #${id} renamed: ${newWiTitle}`,
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
			const cacheKey = `new-branch:${name}`
			if (!hasKey(cacheKey)) {
				events.push({
					type: 'new-branch',
					entityId: name,
					message: `New branch: ${name}`,
					notifyType: 'status',
					cacheKey,
				})
			}
		} else {
			const oldBranch = oldBranchMap.get(name)
			const oldHash = oldBranch?.commitHash ?? ''
			const newHash = b.commitHash ?? ''
			if (oldHash && newHash && oldHash !== newHash) {
				changedBranchNames.add(name)
				const cacheKey = `branch-updated:${name}:${newHash}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'branch-updated',
						entityId: name,
						message: `Branch ${name} updated (${oldHash} → ${newHash})`,
						notifyType: 'status',
						cacheKey,
					})
				}
			}
		}
	}

	for (const name of oldBranchSet) {
		if (!newBranchSet.has(name)) {
			changedBranchNames.add(name)
			const cacheKey = `branch-deleted:${name}`
			if (!hasKey(cacheKey)) {
				events.push({
					type: 'branch-deleted',
					entityId: name,
					message: `Branch deleted: ${name}`,
					notifyType: 'status',
					cacheKey,
				})
			}
		}
	}

	return { events, changedPrIds, changedWiIds, changedBranchNames }
}
