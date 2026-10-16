// ps -o command= is available on both macOS/BSD and Linux.
// Reject an unrelated/reused PID before sending any shutdown signal.
export function ownedDevCommand(command) {
  return /^(?:\S*\/)?node\s+(?:\S*\/)?scripts\/local\.mjs\s+dev$/.test(command.trim())
}
