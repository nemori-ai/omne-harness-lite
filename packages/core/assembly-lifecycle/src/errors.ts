/** Startup lost its assembly qualification. This is not a quiescence result. */
export class AssemblyWorkStopped extends Error {
  override readonly name = 'AssemblyWorkStopped'
  constructor() {
    super('Assembly work has stopped')
  }
}
