const NOTES = ['Buy milk', 'Call the plumber']

export function protocol() {
  return {
    contract: {
      name: 'notes',
      major: 1,
      operations: {
        list: {
          effect: 'read',
          limit: 'small',
          body: { kind: 'object', fields: {} },
          result: {
            kind: 'object',
            fields: { notes: { rule: { kind: 'array', item: { kind: 'text' } } } },
          },
        },
      },
    },
    handlers: {
      async list() {
        return { outcome: 'succeeded', body: { notes: NOTES } }
      },
    },
  }
}
