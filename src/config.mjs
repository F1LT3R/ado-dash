export default {
	org: process.env.ADO_ORG || "",
	project: process.env.ADO_PROJECT || "",
	repo: process.env.ADO_REPO || "",
	pollIntervalMs: 60_000,
	notifyServerUrl: process.env.NOTIFY_SERVER_URL || "",
	silentMode: false,
	cacheFile: ".ado-dash-cache.json",
	maxBranchStats: 20,
	// Current user identity — used to highlight "mine" items.
	// Set via env or leave blank for auto-detection from first API response.
	currentUser: process.env.ADO_USER || "",
}
