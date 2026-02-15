import config from "../config.mjs"

const { org, project } = config
const baseUrl = `https://dev.azure.com/${org}/${project}/_apis`

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function adoFetch(path, options = {}) {
	const pat = process.env.AZURE_DEVOPS_PAT || process.env.ADO_PR_REVIEW_PAT
	const authHeader = pat ? { Authorization: `Basic ${btoa(":" + pat)}` } : {}

	let url = baseUrl + (path.startsWith("/") ? path : "/" + path)
	if (options.method === "POST" && !url.includes("api-version")) {
		url += (url.includes("?") ? "&" : "?") + "api-version=7.0"
	}

	let lastError
	for (let attempt = 0; attempt <= 3; attempt++) {
		try {
			const res = await fetch(url, {
				...options,
				headers: {
					"Content-Type": "application/json",
					...authHeader,
					...options.headers,
				},
			})

			const rateLimitRemaining = res.headers.get("X-RateLimit-Remaining")
			if (rateLimitRemaining !== null && parseInt(rateLimitRemaining, 10) < 50) {
				console.error(`[adoFetch] Warning: X-RateLimit-Remaining=${rateLimitRemaining}`)
			}

			if (res.status === 429) {
				const retryAfter = res.headers.get("Retry-After")
				const delayMs = retryAfter
					? parseInt(retryAfter, 10) * 1000
					: Math.pow(2, attempt) * 1000
				if (attempt < 3) {
					await sleep(delayMs)
					continue
				}
			}

			if (!res.ok) {
				const text = await res.text()
				throw new Error(
					`ADO API error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`
				)
			}

			return res
		} catch (err) {
			lastError = err
			if (err.message?.startsWith("ADO API error") && !err.message.includes("429")) {
				throw err
			}
			if (attempt < 3) {
				const delayMs = Math.pow(2, attempt) * 1000
				await sleep(delayMs)
			} else {
				throw lastError
			}
		}
	}
	throw lastError
}
