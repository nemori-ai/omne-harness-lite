const DEFAULT_SOCKET_DIRECTORY = '/run/omne-tenancy'
const READ_DEADLINE_MS = 5_000
const MAX_OUTPUT_BYTES = 65_536

export function fullHealthIsReady(text) {
  if (!text.endsWith('\n') || text.slice(0, -1).includes('\n')) return false
  let reply
  try {
    reply = JSON.parse(text)
  } catch {
    return false
  }
  return (
    reply !== null &&
    typeof reply === 'object' &&
    !Array.isArray(reply) &&
    reply.reachable === true &&
    reply.storageReachable === true &&
    reply.clockSane === true &&
    reply.deploymentKeyPresent === true &&
    reply.deploymentKeyComplete === true &&
    reply.defectCount === 0
  )
}

async function loadPublicMain() {
  const { main } = await import('../../dist/index.js')
  return main
}

/** Invoke the existing public ops command in this process. The socket owner closes on abort. */
export async function runHealthProbe({
  socketDirectory = DEFAULT_SOCKET_DIRECTORY,
  deadlineMs = READ_DEADLINE_MS,
  maxOutputBytes = MAX_OUTPUT_BYTES,
  loadCommand = loadPublicMain,
} = {}) {
  let output = ''
  let outputBytes = 0
  let expire
  let timedOut = false
  const deadline = performance.now() + deadlineMs
  const expired = () => timedOut || performance.now() >= deadline
  const shutdown = new Promise(resolve => {
    expire = resolve
  })
  const timer = setTimeout(() => {
    timedOut = true
    expire('health-read-deadline')
  }, deadlineMs)
  try {
    const runCommand = await loadCommand()
    if (expired()) return false
    const exit = await runCommand(['ops', '--socket-dir', socketDirectory, 'full-health'], {
      stdout: line => {
        outputBytes += Buffer.byteLength(line, 'utf8')
        if (outputBytes > maxOutputBytes) throw new Error('health-output-too-large')
        output += line
      },
      stderr: () => {},
      shutdownSignal: () => shutdown,
    })
    return !expired() && exit === 0 && fullHealthIsReady(output)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (!(await runHealthProbe())) process.exitCode = 1
}
