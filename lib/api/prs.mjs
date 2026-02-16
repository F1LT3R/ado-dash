import config from "../config.mjs"
import { adoFetch } from "./client.mjs"

const { org, project, repo } = config

function stripRefsHeads(s) {
	if (!s || typeof s !== "string") return s
	return s.replace(/^refs\/heads\//, "")
}

function getThreadCategory(thread) {
	if (thread.isDeleted) return "closed"
	const status = thread.status
	if (status === "active" || status === 1) return "active"
	if (status === "closed" || status === 4) return "closed"
	return "resolved"
}

export async function fetchPRs(includeAll = false) {
	const statusParam = includeAll ? "all" : "active"
	const path = `/git/repositories/${repo}/pullrequests?searchCriteria.status=${statusParam}&api-version=7.0`
	const res = await adoFetch(path)
	const data = await res.json()
	const prs = data.value || []

	const result = await Promise.all(
		prs.map(async (pr) => {
			const id = pr.pullRequestId
			const [threadsRes, workItemsRes] = await Promise.all([
				adoFetch(
					`/git/repositories/${repo}/pullrequests/${id}/threads?api-version=7.0`
				),
				adoFetch(
					`/git/repositories/${repo}/pullrequests/${id}/workitems?api-version=7.0`
				),
			])
			const threadsData = await threadsRes.json()
			const workItemsData = await workItemsRes.json()

			const threads = threadsData.value || []
			const threadCounts = { active: 0, resolved: 0, closed: 0, total: 0 }
			let totalComments = 0
			const commentAuthors = []
			for (const t of threads) {
				const cat = getThreadCategory(t)
				threadCounts[cat] = (threadCounts[cat] || 0) + 1
				threadCounts.total++
				for (const c of (t.comments || [])) {
					totalComments++
					if (c.commentType !== 'system') {
						commentAuthors.push({
							id: `${t.id}:${c.id}`,
							author: c.author?.displayName || ''
						})
					}
				}
			}

			const workItemIds = (workItemsData.value || workItemsData || []).map(
				(r) => (typeof r.id === "string" ? parseInt(r.id, 10) : r.id)
			)

			const webUrl =
				pr._links?.web?.href ||
				`https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${id}`

			const reviewers = (pr.reviewers || []).map((r) => ({
				name: r.displayName || r.uniqueName || "Unknown",
				uniqueName: r.uniqueName || "",
				vote: r.vote ?? 0,
			}))

			const createdBy = pr.createdBy?.displayName || pr.createdBy?.uniqueName || ""

			return {
				id,
				title: pr.title || "",
				status: pr.status || "active",
				isDraft: pr.isDraft ?? false,
				createdBy,
				createdByUniqueName: pr.createdBy?.uniqueName || "",
				sourceBranch: stripRefsHeads(pr.sourceRefName),
				webUrl,
				reviewers,
				threadCounts,
				totalComments,
				commentAuthors,
				workItemIds,
			}
		})
	)

	return result
}
