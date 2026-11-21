/** The build profile, compiled in by scripts/bundle-build.ts. */
declare const OMNE_BUILD_PROFILE: 'dev' | 'test' | 'release'

/** Set by the main process of dev and test builds, for launchers that cannot read its output. */
declare var desktopBuildProfile: 'dev' | 'test' | undefined
