// The end of the process, owned by the process entry. When the command has reported its result,
// the process ends: a handle that a stopped service left behind (a retry timer, an open socket)
// must not keep it alive, and what was written to the two output streams must reach the reader.

type Stream = Pick<NodeJS.WriteStream, 'write'>

/** Resolves when everything written to `stream` before this call was handed to the system. */
const drained = (stream: Stream): Promise<void> =>
  new Promise(resolve => {
    stream.write('', () => resolve())
  })

/**
 * Ends the process with `code` after both output streams drained. `exit` does not return.
 * Setting `process.exitCode` alone is not enough: it waits for every handle of the process.
 */
export async function endProcess(
  code: number,
  streams: Readonly<{ stdout: Stream; stderr: Stream }> = process,
  exit: (code: number) => never = process.exit,
): Promise<never> {
  await drained(streams.stdout)
  await drained(streams.stderr)
  return exit(code)
}
