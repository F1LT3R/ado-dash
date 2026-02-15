import config from "../config.mjs"
import { adoFetch } from "./client.mjs"

const { org, project } = config

const WIQL_QUERY =
	"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC"
const BATCH_SIZE = 200

function extractPrIdsFromRelations(relations) {
	const ids = []
	if (!Array.isArray(relations)) return ids
	for (const r of relations) {
		const rel = (r.rel || "").toLowerCase().replace(/\s/g, "")
		if (rel === "artifactlink" && (r.url || "").includes("vstfs:///Git/PullRequestId/")) {
			const m = (r.url || "").match(/vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/)
			if (m) ids.push(parseInt(m[1], 10))
		}
	}
	return ids
}

export async function fetchWorkItems() {
	const allIds = []
	let skipIds = []

	do {
		let query = WIQL_QUERY
		if (skipIds.length > 0) {
			const notIn = skipIds.join(",")
			query = WIQL_QUERY.replace(
				" ORDER BY ",
				` AND [System.Id] NOT IN (${notIn}) ORDER BY `
			)
		}
		const path = `/wit/wiql?$top=${BATCH_SIZE}&api-version=7.0`
		const res = await adoFetch(path, {
			method: "POST",
			body: JSON.stringify({ query }),
		})
		const data = await res.json()
		const workItems = data.workItems || []
		const ids = workItems.map((w) => w.id)
		allIds.push(...ids)
		skipIds = ids
	} while (skipIds.length === BATCH_SIZE)

	const result = []
	for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
		const batch = allIds.slice(i, i + BATCH_SIZE)
		const idsParam = batch.join(",")
		const res = await adoFetch(
			`/wit/workitems?ids=${idsParam}&$expand=relations&api-version=7.0`
		)
		const data = await res.json()
		const items = data.value || data
		for (const wi of items) {
			const fields = wi.fields || {}
			const webUrl =
				wi._links?.html?.href ||
				`https://dev.azure.com/${org}/${project}/_workitems/edit/${wi.id}`
		const assignedTo = fields["System.AssignedTo"]
		const createdBy = fields["System.CreatedBy"]
		result.push({
			id: wi.id,
			type: fields["System.WorkItemType"] || "Unknown",
			title: fields["System.Title"] || "",
			state: fields["System.State"] || "",
			assignedTo: assignedTo?.displayName || "",
			assignedToUniqueName: assignedTo?.uniqueName || "",
			createdBy: createdBy?.displayName || "",
			createdByUniqueName: createdBy?.uniqueName || "",
			boardColumn: fields["System.BoardColumn"] ?? fields["Microsoft.VSTS.Common.BacklogPriority"] ?? "",
			commentCount: fields["System.CommentCount"] ?? 0,
			linkedPrIds: extractPrIdsFromRelations(wi.relations),
			webUrl,
		})
		}
	}

	return result
}
