export const expectedHelp = `omne

Show help or version. This build has no other commands.

  omne --help
  omne --version

  --home <directory>    State directory. Overrides OMNE_HOME.
  OMNE_HOME             State directory when --home is absent.

The default state directory is $HOME/.omne.
--help and --version do not open or create a state directory.
`

export const expectedVersion = '0.0.0\n'

export const identityFailure = 'omne: build identity is missing or invalid\n'
