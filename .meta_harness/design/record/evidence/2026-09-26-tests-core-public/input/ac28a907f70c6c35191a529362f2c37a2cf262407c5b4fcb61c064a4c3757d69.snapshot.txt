// Actual Alloy evaluation of the adopted model; see provenance.querySuffix.
// Relations below are copied from the solver result, not recomputed by a test oracle.
export const affiliationFixture = {
  provenance: {
    model:
      '.meta_harness/design/spec/capabilities/organization-governance/v1/formal/Affiliation.als',
    modelSha256: '1a72efa2f9b7c8199ae3aac797154120cf714a9b6dc674961621c8187cd1526f',
    tool: 'Alloy 6.2.0',
    solver: 'SAT4J',
    sourceSha256: 'bae82bdc1c92435c200141478e30ac1ea6807caca99585880df353686c08d7aa',
    scope: 'exactly 6 Organization, exactly 1 Config, exactly 1 FixtureResult',
    querySuffix:
      '\n// W1 pure-module correspondence fixture: use the adopted definitions unchanged.\none sig Root, Branch, Leaf, Other, PersonalOne, PersonalTwo extends Organization {}\none sig FixtureResult {\n    ancestors : Organization -> Organization,\n    shared : Organization -> Organization\n}\npred coreCorrespondenceFixture {\n    TeamOrganization = Root + Branch + Leaf + Other\n    PersonalOrganization = PersonalOne + PersonalTwo\n    Config.parent = Branch -> Root + Leaf -> Branch\n    FixtureResult.ancestors = { o, a : Organization | a in ancestorChain[Config, o] }\n    FixtureResult.shared = { a, b : Organization | shareAncestor[Config, a, b] }\n}\nrun coreCorrespondenceFixture for 6 but exactly 6 Organization, exactly 1 Config, exactly 1 FixtureResult\n',
  },
  organizations: ['Branch$0', 'Leaf$0', 'Other$0', 'PersonalOne$0', 'PersonalTwo$0', 'Root$0'],
  parent: [
    ['Branch$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
  ],
  ancestors: [
    ['Branch$0', 'Root$0'],
    ['Leaf$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
  ],
  shared: [
    ['Root$0', 'Root$0'],
    ['Root$0', 'Branch$0'],
    ['Root$0', 'Leaf$0'],
    ['Branch$0', 'Root$0'],
    ['Branch$0', 'Branch$0'],
    ['Branch$0', 'Leaf$0'],
    ['Leaf$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
    ['Leaf$0', 'Leaf$0'],
    ['Other$0', 'Other$0'],
    ['PersonalOne$0', 'PersonalOne$0'],
    ['PersonalTwo$0', 'PersonalTwo$0'],
  ],
} as const
