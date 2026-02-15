const SEARCH_DEBOUNCE_MS = 200
const ESC_TIMEOUT_MS = 50

export function createKeyboardHandler(callbacks) {
	let searchMode = false
	let searchBuffer = ''
	let searchDebounceTimer = null
	let stdinRaw = false
	let pendingBuf = ''
	let escTimer = null

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

	function processArrowKey(final) {
		if (final === 'A') {
			callbacks.onCursorUp?.()
		} else if (final === 'B') {
			callbacks.onCursorDown?.()
		}
	}

	function parseCSI(str, start) {
		// Parse CSI sequence starting after \x1b[
		let j = start
		// Collect parameter bytes (0x30-0x3F)
		while (j < str.length && str.charCodeAt(j) >= 0x30 && str.charCodeAt(j) <= 0x3F) j++
		// Collect intermediate bytes (0x20-0x2F)
		while (j < str.length && str.charCodeAt(j) >= 0x20 && str.charCodeAt(j) <= 0x2F) j++
		// Final byte
		if (j < str.length) {
			const final = str[j]
			j++
			return { final, end: j }
		}
		return { final: null, end: j }
	}

	function processBuffer() {
		const str = pendingBuf
		pendingBuf = ''
		let i = 0

		while (i < str.length) {
			const c = str[i]

			if (searchMode) {
				if (c === '\r' || c === '\n') {
					clearDebounce()
					searchMode = false
					callbacks.onSearchConfirm?.()
					callbacks.onEnter?.()
					i++
					continue
				}
				if (c === '\x1b') {
					// Check if we have the full sequence
					if (i + 1 < str.length && str[i + 1] === '[') {
						const { final, end } = parseCSI(str, i + 2)
						if (final) {
							processArrowKey(final)
						}
						i = end
						continue
					}
					if (i + 1 < str.length && str[i + 1] === 'O') {
						i += 3
						continue
					}
					if (i === str.length - 1) {
						// Bare escape at end of buffer — it's a real Esc press
						exitSearchMode()
						i++
						continue
					}
					// Bare escape mid-buffer — treat as Esc
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
					const { final, end } = parseCSI(str, i + 2)
					if (final) {
						processArrowKey(final)
					}
					i = end
					continue
				}
				if (i + 1 < str.length && str[i + 1] === 'O') {
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
			} else if (c === 'r' || c === 'u') {
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

	function handleData(chunk) {
		pendingBuf += String(chunk)

		// If the buffer ends with a bare \x1b, wait briefly for the rest
		// of the escape sequence to arrive in the next chunk
		if (escTimer) {
			clearTimeout(escTimer)
			escTimer = null
		}

		if (pendingBuf.endsWith('\x1b')) {
			escTimer = setTimeout(() => {
				escTimer = null
				processBuffer()
			}, ESC_TIMEOUT_MS)
			return
		}

		processBuffer()
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
			if (escTimer) {
				clearTimeout(escTimer)
				escTimer = null
			}
			pendingBuf = ''
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
