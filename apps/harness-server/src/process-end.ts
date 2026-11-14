type Stream = Pick<NodeJS.WriteStream, 'write'>

const drained = (stream: Stream): Promise<void> =>
  new Promise(resolve => {
    stream.write('', () => resolve())
  })

export async function endProcess(
  code: number,
  streams: Readonly<{ stdout: Stream; stderr: Stream }> = process,
  exit: (code: number) => never = process.exit,
): Promise<never> {
  await drained(streams.stdout)
  await drained(streams.stderr)
  return exit(code)
}
