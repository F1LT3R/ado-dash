function stripAnsi(str) {
	return String(str).replace(/\x1b\[[0-9;]*m/g, '')
}

export function createRenderer() {
	let currentBuffer = []
	let pendingTimers = []

	function cancelPending() {
		for (const t of pendingTimers) clearTimeout(t)
		pendingTimers = []
	}

	function drawLine(row, line) {
		process.stdout.write(`\x1b[${row + 1};1H${line}\x1b[K`)
	}

	return {
		// Instant render — compares raw strings INCLUDING ansi codes,
		// so style-only changes (like cursor inverse) are detected.
		render(lines) {
			cancelPending()

			for (let i = 0; i < lines.length; i++) {
				if ((lines[i] || '') !== (currentBuffer[i] || '')) {
					drawLine(i, lines[i] || '')
				}
			}
			for (let i = lines.length; i < currentBuffer.length; i++) {
				drawLine(i, '')
			}
			currentBuffer = [...lines]
		},

		// Cascading render — animated top-to-bottom. Use for data refreshes.
		renderCascade(lines, delayMs = 40) {
			cancelPending()

			const changedIndices = []
			for (let i = 0; i < lines.length; i++) {
				const stripped = stripAnsi(lines[i] || '')
				const existing = currentBuffer[i] ? stripAnsi(currentBuffer[i]) : undefined
				if (stripped !== existing) {
					changedIndices.push(i)
				}
			}
			for (let i = lines.length; i < currentBuffer.length; i++) {
				changedIndices.push(i)
			}

			currentBuffer = [...lines]

			changedIndices.forEach((row, idx) => {
				const t = setTimeout(() => {
					drawLine(row, lines[row] || '')
				}, idx * delayMs)
				pendingTimers.push(t)
			})
		},

		clear() {
			cancelPending()
			process.stdout.write('\x1b[2J\x1b[H')
			currentBuffer = []
		},

		getBuffer() {
			return [...currentBuffer]
		}
	}
}
