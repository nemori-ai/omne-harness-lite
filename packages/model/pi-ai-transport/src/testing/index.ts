// The subpath entry `./testing`: checks for the tests of a family package that binds through the
// gateway engine. It reads files, so it is for tests and scripts, not for a running assembly.
export {
  checkChatCompletionsFixtures,
  fixtureDirectory,
  FIXTURE_FILES,
  GATEWAY_END_MARKER,
  type FixtureReport,
} from './fixtures.ts'
export {
  appendAdoptionFingerprints,
  checkAdoptionFingerprints,
  renderFingerprints,
  type AdoptionFingerprint,
  type FingerprintReport,
} from './adoptions.ts'
