const SEARCH_DEBOUNCE_MS = 200

export function createKeyboardHandler(callbacks) {
	let searchMode = false
	let searchBuffer = ''
	let searchDebounceTimer = null
	let stdinRaw = false

	function clearDebounce() {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer)
			searchDebounceTimer = null
		}
	}

	function handleSearchInput() {
		clearDebounce()
		searchDebounceTimer = setTimeout(() => {
			callbacks.onSearch?.(searchBuffer)
			searchDebounceTimer = null
		}, SEARCH_DEBOUNCE_MS)
	}

	function exitSearchMode() {
		searchMode = false
		searchBuffer = ''
		clearDebounce()
		callbacks.onSearchCancel?.()
	}

	function handleData(chunk) {
		const str = String(chunk)
		let i = 0

		while (i < str.length) {
			const c = str[i]

			if (searchMode) {
				if (c === '\r' || c === '\n') {
					clearDebounce()
					searchMode = false
					callbacks.onSearchConfirm?.()
					i++
					continue
				}
				if (c === '\x1b') {
					// Check for arrow keys in search mode — ignore them
					if (i + 1 < str.length && (str[i + 1] === '[' || str[i + 1] === 'O')) {
						let j = i + 2
						while (j < str.length && j < i + 12) {
							const ch = str[j]
							if (/[A-Za-z]/.test(ch) || ch === '~') {
								j++
								break
							}
							j++
						}
						i = j
						continue
					}
					exitSearchMode()
					i++
					continue
				}
				if (c === '\x7f' || c === '\x08') {
					searchBuffer = searchBuffer.slice(0, -1)
					if (searchBuffer.length === 0) {
						exitSearchMode()
					} else {
						handleSearchInput()
					}
					i++
					continue
				}
				if (c >= ' ' && c <= '~') {
					searchBuffer += c
					handleSearchInput()
					i++
					continue
				}
				i++
				continue
			}

			// Normal mode — check for escape sequences (arrow keys)
			if (c === '\x1b') {
				if (i + 1 < str.length && str[i + 1] === '[') {
					// CSI sequence: \x1b[ followed by params and a final letter
					let j = i + 2
					// Collect parameter bytes (0x30-0x3F)
					while (j < str.length && str.charCodeAt(j) >= 0x30 && str.charCodeAt(j) <= 0x3F) j++
					// Collect intermediate bytes (0x20-0x2F)
					while (j < str.length && str.charCodeAt(j) >= 0x20 && str.charCodeAt(j) <= 0x2F) j++
					// Final byte
					if (j < str.length) {
						const final = str[j]
						j++
						if (final === 'A') {
							callbacks.onCursorUp?.()
						} else if (final === 'B') {
							callbacks.onCursorDown?.()
						}
						// Other CSI sequences silently ignored
					}
					i = j
					continue
				}
				if (i + 1 < str.length && str[i + 1] === 'O') {
					// SS3 sequence — skip
					i += 3
					continue
				}
				// Bare escape — ignore
				i++
				continue
			}

			if (c === '\r' || c === '\n') {
				callbacks.onEnter?.()
				i++
				continue
			}

			if (c === '\x03') {
				callbacks.onQuit?.()
				i++
				continue
			}

			if (c === '/') {
				searchMode = true
				searchBuffer = ''
				callbacks.onSearch?.('')
				i++
				continue
			}

			if (c === 'a') {
				callbacks.onToggleAllPRs?.()
			} else if (c === 's') {
				callbacks.onToggleSilent?.()
			} else if (c === 'r') {
				callbacks.onRefresh?.()
			} else if (c === 'y') {
				callbacks.onClearHighlights?.()
			} else if (c === 'q') {
				callbacks.onQuit?.()
			} else if (c >= '0' && c <= '3') {
				callbacks.onExpandPanel?.(Number(c))
			}
			i++
		}
	}

	return {
		start() {
			if (stdinRaw) return
			if (!process.stdin.isTTY) {
				console.error('[keyboard] stdin is not a TTY — keyboard shortcuts disabled')
				return
			}
			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.setEncoding('utf8')
			process.stdin.on('data', handleData)
			stdinRaw = true
		},

		stop() {
			if (!stdinRaw) return
			process.stdin.removeListener('data', handleData)
			process.stdin.setRawMode(false)
			process.stdin.pause()
			clearDebounce()
			searchMode = false
			searchBuffer = ''
			stdinRaw = false
		},

		isSearchMode() {
			return searchMode
		},

		getSearchQuery() {
			return searchBuffer
		},
	}
}
