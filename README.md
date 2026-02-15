<p align="center">
  <img src="logo.png" alt="Azure DevOps Dashboard" width="160" />
</p>

<h1 align="center">Azure DevOps Dashboard</h1>

<p align="center">
  A live, full-screen terminal dashboard for Azure DevOps — track PRs, work items, and branches at a glance.
</p>

---

## Overview

Azure DevOps Dashboard is a Node.js CLI tool that polls the Azure DevOps REST API and renders a rich, interactive terminal UI. It gives you a real-time view of your repository's pull requests, work items, and branches — with audio notifications when things change.

### Key Features

- **Three-panel layout** — PRs, Work Items, and Branches displayed simultaneously with dynamic row allocation
- **Live polling** — Automatic 60-second sync cycle with manual refresh on demand
- **Change detection** — Visual highlighting and audio notifications when PRs, work items, or branches change
- **"Mine" highlighting** — Your items are sorted to the top; other items are dimmed for contrast
- **Interactive navigation** — Arrow keys to browse items, Enter to open in your browser
- **Regex search** — Filter items in-place with live regex matching
- **Audio notifications** — Integrates with [agent-notify](https://github.com/F1LT3R/agent-notify) for TTS alerts on changes
- **Draft PR detection** — Clearly marks draft PRs with a distinct status indicator
- **Cascading redraw** — Smooth 40ms animated rendering on data refresh, instant redraw for navigation
- **Zero-config auto-detection** — Automatically detects the current user from the API

## Requirements

- **Node.js 18+** (uses native `fetch`)
- **Azure DevOps PAT** (Personal Access Token) with read access to Code, Work Items, and Project
- **macOS** (uses `open` command for browser launch — easily adaptable for Linux/Windows)

## Installation

```bash
git clone https://github.com/your-org/ado-dash.git
cd ado-dash
npm install
```

## Configuration

### 1. Create a `.env` file

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
AZURE_DEVOPS_PAT=        # Leave blank if using PAT file (see below)
ADO_ORG=your-org         # Azure DevOps organization name
ADO_PROJECT=your-project # Project name
ADO_REPO=your-repo       # Repository name
ADO_USER="Your Name"     # Your display name (for "mine" highlighting)
NOTIFY_SERVER_URL=http://localhost:8881  # agent-notify server (optional)
```

### 2. Set up your PAT

You can either set `AZURE_DEVOPS_PAT` directly in `.env`, or store it in a separate secrets file:

```bash
# Create a secrets file (outside the repo)
echo 'export ADO_PR_REVIEW_PAT="your-token-here"' > ~/.secrets/ADO_PR_REVIEW_PAT

# Source it before running
source ~/.secrets/ADO_PR_REVIEW_PAT
```

The dashboard checks for `AZURE_DEVOPS_PAT` first, then falls back to `ADO_PR_REVIEW_PAT`.

### 3. (Optional) Use the helper script

`load-env.sh` sources both the PAT and `.env` in one step:

```bash
source load-env.sh
```

## Usage

```bash
# Source your PAT, then start
source ~/.secrets/ADO_PR_REVIEW_PAT
node src/index.mjs

# Or use the helper script
source load-env.sh && npm start

# Enable debug logging
node src/index.mjs --debug
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between items (wraps across panels) |
| `Enter` | Open selected item in browser |
| `/` | Enter search mode (regex filter) |
| `Esc` | Clear search / exit search mode |
| `u` / `r` | Force immediate refresh |
| `a` | Toggle active-only / all PRs |
| `s` | Toggle silent mode (suppress audio notifications) |
| `y` | Clear change highlights (with confirmation) |
| `1` / `2` / `3` | Expand a single panel to full height |
| `0` | Reset to dynamic multi-panel layout |
| `q` / `Ctrl+C` | Quit |

## Notifications

The dashboard detects and notifies on the following changes:

| Event | Description |
|-------|-------------|
| New PR | A pull request appears that wasn't in the previous poll |
| PR title changed | A PR's title has been modified |
| PR comment activity | Active thread count changes on a PR |
| PR approved | A reviewer votes to approve |
| PR rejected | A reviewer requests changes |
| New work item | A work item appears that wasn't in the previous poll |
| Work item state change | A work item moves to a different state |
| Work item renamed | A work item's title has been modified |
| New branch | A branch appears that didn't exist before |
| Branch updated | A branch's commit hash changes (new push) |

Notifications are sent via HTTP to an [agent-notify](https://github.com/F1LT3R/agent-notify) server, which provides text-to-speech audio alerts. Set `NOTIFY_SERVER_URL` in your `.env` to enable.

## Architecture

```
src/
├── index.mjs              # Entry point, state management, keyboard wiring
├── loadEnv.mjs            # .env file loader (runs before imports)
├── config.mjs             # Centralized configuration from environment
├── api/
│   ├── client.mjs         # fetch wrapper with auth, retry, rate-limit handling
│   ├── prs.mjs            # PR fetcher with threads, votes, linked work items
│   ├── workItems.mjs      # WIQL query with pagination and relation extraction
│   └── branches.mjs       # Branch listing with ahead/behind stats
├── sync/
│   ├── poller.mjs         # Orchestrates fetch cycle (branches → WIs → PRs)
│   ├── differ.mjs         # State diffing and change event generation
│   └── cache.mjs          # JSON file persistence for state and notification dedup
├── notify/
│   └── notifier.mjs       # FIFO notification queue with HTTP playback
└── ui/
    ├── renderer.mjs       # Off-screen buffer with instant and cascading render
    ├── dashboard.mjs      # Layout engine with dynamic row allocation
    ├── prPanel.mjs        # PR table formatting with status, votes, threads
    ├── wiPanel.mjs        # Work item table with type emojis and state colors
    ├── branchPanel.mjs    # Branch table with commit hash and ahead/behind
    ├── statusBar.mjs      # Bottom bar with sync info, search, and mode indicators
    ├── keyboard.mjs       # Raw stdin handler with CSI escape sequence parsing
    └── search.mjs         # Regex filter-in-place search engine
```

## Dependencies

| Package | Purpose |
|---------|---------|
| [chalk](https://github.com/chalk/chalk) | Terminal string styling (sole runtime dependency) |

## License

MIT
