/** BUILD_ID is a build artifact, never a login/state lookup. */
export async function versionText(
  _marker = new URL('../BUILD_ID', import.meta.url),
): Promise<string> {
  throw new Error('not-implemented')
}
