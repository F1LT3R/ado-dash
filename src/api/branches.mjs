import config from "../config.mjs"
import { adoFetch } from "./client.mjs"

const { org, project, repo, maxBranchStats } = config

function stripRefsHeads(s) {
	if (!s || typeof s !== "string") return s
	return s.replace(/^refs\/heads\//, "")
}

export async function fetchBranches() {
	const refsPath = `/git/repositories/${repo}/refs?filter=heads/&api-version=7.0`
	const refsRes = await adoFetch(refsPath)
	const refsData = await refsRes.json()
	const refs = (refsData.value || []).slice(0, maxBranchStats)

	const statsRes = await adoFetch(
		`/git/repositories/${repo}/stats/branches?api-version=7.0`
	)
	const statsData = await statsRes.json()
	const statsList = statsData.value || []
	const statsByBranch = Object.fromEntries(
		statsList.map((s) => [s.name, s])
	)

	const result = refs.map((ref) => {
		const branchName = stripRefsHeads(ref.name)
		const stats = statsByBranch[branchName]
		const creator = ref.creator
		const author = (creator?.displayName || creator?.uniqueName || "unknown").trim()
		const objectId = ref.objectId || (stats?.commit?.commitId ?? "")
		const commitHash = objectId ? objectId.slice(0, 7) : ""
		const webUrl = `https://dev.azure.com/${org}/${project}/_git/${repo}?version=GB${encodeURIComponent(branchName)}`

		return {
			name: branchName,
			author,
			commitHash,
			aheadCount: stats?.aheadCount ?? null,
			behindCount: stats?.behindCount ?? null,
			webUrl,
		}
	})

	return result
}
