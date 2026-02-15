#!/usr/bin/env bash
# Load .env file and PAT secret, then export for the dashboard.

# Source PAT from secrets (keeps actual token out of repo)
source "$HOME/.secrets/ADO_PR_REVIEW_PAT"

# Load .env vars (skip comments and blank lines)
ENV_FILE="${BASH_SOURCE[0]%/*}/.env"
if [ -f "$ENV_FILE" ]; then
	set -a
	. "$ENV_FILE"
	set +a
fi

# Map PAT if needed
export AZURE_DEVOPS_PAT="${AZURE_DEVOPS_PAT:-$ADO_PR_REVIEW_PAT}"
