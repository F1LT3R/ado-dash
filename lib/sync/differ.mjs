function by(name) {
	if (!name) return ''
	const first = name.split(' ')[0]
	return ` by ${first}`
}

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
					message: `New PR #${id}${by(pr.createdBy)}: ${pr.title ?? ''}`,
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
						message: `PR #${id} ${newStatus}${by(pr.createdBy)}: ${pr.title ?? ''}`,
						notifyType: newStatus === 'completed' ? 'done' : 'status',
						cacheKey,
					})
				}
			}

			// --- Comment attribution ---
			const oldCommentIds = new Set((oldPr.commentAuthors ?? []).map(c => c.id))
			const newCommentAuthors = pr.commentAuthors ?? []
			if (oldPr.commentAuthors !== undefined) {
				const added = newCommentAuthors.filter(c => !oldCommentIds.has(c.id))
				if (added.length > 0) {
					changedPrIds.add(id)
					const names = [...new Set(added.map(c => c.author.split(' ')[0]).filter(Boolean))]
					const who = names.length > 0 ? names.join(' & ') : 'Someone'
					const cacheKey = `pr-comments:${id}:${newCommentAuthors.length}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-comments',
							entityId: id,
							message: `${who} commented on PR #${id}: ${pr.title ?? ''}`,
							notifyType: 'status',
							cacheKey,
						})
					}
				}
			}

			// --- Title ---
			const oldTitle = oldPr.title ?? ''
			const newTitle = pr.title ?? ''
			if (newTitle !== oldTitle) {
				changedPrIds.add(id)
				const cacheKey = `pr-title:${id}:${newTitle}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'pr-title',
						entityId: id,
						message: `PR #${id} renamed${by(pr.createdBy)}: ${newTitle}`,
						notifyType: 'status',
						cacheKey,
					})
				}
			}

			// --- Draft status ---
			const oldDraft = oldPr.isDraft ?? false
			const newDraft = pr.isDraft ?? false
			if (oldDraft !== newDraft) {
				changedPrIds.add(id)
				const label = newDraft ? 'marked as draft' : 'published'
				const cacheKey = `pr-draft:${id}:${newDraft}`
				if (!hasKey(cacheKey)) {
					events.push({
						type: 'pr-draft',
						entityId: id,
						message: `PR #${id} ${label}${by(pr.createdBy)}: ${pr.title ?? ''}`,
						notifyType: 'status',
						cacheKey,
					})
				}
			}

			// --- Reviewer votes (any change, not just approve/reject) ---
			const oldVotes = new Map((oldPr.reviewers ?? []).map((r) => [r.name ?? r.id, r.vote ?? 0]))
			const newVotes = new Map((pr.reviewers ?? []).map((r) => [r.name ?? r.id, r.vote ?? 0]))
			const oldReviewerNames = new Set(oldVotes.keys())
			const newReviewerNames = new Set(newVotes.keys())

			// New reviewers added
			for (const name of newReviewerNames) {
				if (!oldReviewerNames.has(name)) {
					changedPrIds.add(id)
					const cacheKey = `pr-reviewer-added:${id}:${name}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-reviewer-added',
							entityId: id,
							message: `${name} added as reviewer on PR #${id}`,
							notifyType: 'status',
							cacheKey,
						})
					}
				}
			}

			// Reviewers removed
			for (const name of oldReviewerNames) {
				if (!newReviewerNames.has(name)) {
					changedPrIds.add(id)
					const cacheKey = `pr-reviewer-removed:${id}:${name}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-reviewer-removed',
							entityId: id,
							message: `${name} removed from PR #${id}`,
							notifyType: 'status',
							cacheKey,
						})
					}
				}
			}

			// Vote changes
			const voteLabels = { 10: 'approved', 5: 'approved with suggestions', 0: 'no vote', '-5': 'waiting for author', '-10': 'rejected' }
			for (const [name, vote] of newVotes) {
				const prevVote = oldVotes.get(name) ?? 0
				if (vote !== prevVote && oldReviewerNames.has(name)) {
					changedPrIds.add(id)
					const label = voteLabels[vote] ?? `vote ${vote}`
					const cacheKey = `pr-vote:${id}:${name}:${vote}`
					if (!hasKey(cacheKey)) {
						const notifyType = vote === 10 ? 'done' : vote === -10 ? 'review' : 'status'
						events.push({
							type: 'pr-vote',
							entityId: id,
							message: `${name} ${label} PR #${id}: ${pr.title ?? ''}`,
							notifyType,
							cacheKey,
						})
					}
				}
			}

			// --- Linked work items ---
			const oldWiIds = new Set((oldPr.workItemIds ?? []).map(String))
			const newWiIds = new Set((pr.workItemIds ?? []).map(String))
			for (const wiId of newWiIds) {
				if (!oldWiIds.has(wiId)) {
					changedPrIds.add(id)
					const cacheKey = `pr-wi-linked:${id}:${wiId}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-wi-linked',
							entityId: id,
							message: `Work item #${wiId} linked to PR #${id}`,
							notifyType: 'status',
							cacheKey,
						})
					}
				}
			}
			for (const wiId of oldWiIds) {
				if (!newWiIds.has(wiId)) {
					changedPrIds.add(id)
					const cacheKey = `pr-wi-unlinked:${id}:${wiId}`
					if (!hasKey(cacheKey)) {
						events.push({
							type: 'pr-wi-unlinked',
							entityId: id,
							message: `Work item #${wiId} unlinked from PR #${id}`,
							notifyType: 'status',
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
					message: `New work item #${id}${by(wi.assignedTo || wi.createdBy)}: ${wi.title ?? ''}`,
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
						message: `WI #${id} moved to ${newStateVal}${by(wi.assignedTo || wi.createdBy)}`,
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
						message: `WI #${id} renamed${by(wi.assignedTo || wi.createdBy)}: ${newWiTitle}`,
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
					message: `New branch${by(b.author)}: ${name}`,
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
						message: `Branch ${name} updated${by(b.author)} (${oldHash} → ${newHash})`,
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
