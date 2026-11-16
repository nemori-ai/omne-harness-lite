import type { WireEntry } from '../../src/model/content.ts'

export const TOOL_CALL_ENTRY: WireEntry = {
  entryId: '2',
  revision: '2',
  kind: 'message.assistant',
  payload: {
    kind: 'object',
    entries: [
      {
        key: 'message',
        value: {
          kind: 'object',
          entries: [
            {
              key: 'id',
              value: {
                kind: 'string',
                value: 'msg_tool_1',
              },
            },
            {
              key: 'role',
              value: {
                kind: 'string',
                value: 'assistant',
              },
            },
            {
              key: 'blocks',
              value: {
                kind: 'array',
                items: [
                  {
                    kind: 'object',
                    entries: [
                      {
                        key: 'kind',
                        value: {
                          kind: 'string',
                          value: 'text',
                        },
                      },
                      {
                        key: 'id',
                        value: {
                          kind: 'string',
                          value: 'blk_1',
                        },
                      },
                      {
                        key: 'visibility',
                        value: {
                          kind: 'object',
                          entries: [
                            {
                              key: 'toHuman',
                              value: {
                                kind: 'boolean',
                                value: true,
                              },
                            },
                            {
                              key: 'toModel',
                              value: {
                                kind: 'boolean',
                                value: true,
                              },
                            },
                          ],
                        },
                      },
                      {
                        key: 'text',
                        value: {
                          kind: 'string',
                          value: '我去读一下。',
                        },
                      },
                    ],
                  },
                  {
                    kind: 'object',
                    entries: [
                      {
                        key: 'kind',
                        value: {
                          kind: 'string',
                          value: 'tool_call',
                        },
                      },
                      {
                        key: 'id',
                        value: {
                          kind: 'string',
                          value: 'blk_2',
                        },
                      },
                      {
                        key: 'visibility',
                        value: {
                          kind: 'object',
                          entries: [
                            {
                              key: 'toHuman',
                              value: {
                                kind: 'boolean',
                                value: true,
                              },
                            },
                            {
                              key: 'toModel',
                              value: {
                                kind: 'boolean',
                                value: true,
                              },
                            },
                          ],
                        },
                      },
                      {
                        key: 'callId',
                        value: {
                          kind: 'string',
                          value: 'call_1',
                        },
                      },
                      {
                        key: 'name',
                        value: {
                          kind: 'string',
                          value: 'Read',
                        },
                      },
                      {
                        key: 'arguments',
                        value: {
                          kind: 'object',
                          entries: [
                            {
                              key: 'kind',
                              value: {
                                kind: 'string',
                                value: 'object',
                              },
                            },
                            {
                              key: 'entries',
                              value: {
                                kind: 'array',
                                items: [
                                  {
                                    kind: 'object',
                                    entries: [
                                      {
                                        key: 'key',
                                        value: {
                                          kind: 'string',
                                          value: 'path',
                                        },
                                      },
                                      {
                                        key: 'value',
                                        value: {
                                          kind: 'object',
                                          entries: [
                                            {
                                              key: 'kind',
                                              value: {
                                                kind: 'string',
                                                value: 'string',
                                              },
                                            },
                                            {
                                              key: 'value',
                                              value: {
                                                kind: 'string',
                                                value: 'notes/todo.md',
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  },
                                  {
                                    kind: 'object',
                                    entries: [
                                      {
                                        key: 'key',
                                        value: {
                                          kind: 'string',
                                          value: 'limit',
                                        },
                                      },
                                      {
                                        key: 'value',
                                        value: {
                                          kind: 'object',
                                          entries: [
                                            {
                                              key: 'kind',
                                              value: {
                                                kind: 'string',
                                                value: 'number',
                                              },
                                            },
                                            {
                                              key: 'lexeme',
                                              value: {
                                                kind: 'string',
                                                value: '20',
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  },
                                  {
                                    kind: 'object',
                                    entries: [
                                      {
                                        key: 'key',
                                        value: {
                                          kind: 'string',
                                          value: 'range',
                                        },
                                      },
                                      {
                                        key: 'value',
                                        value: {
                                          kind: 'object',
                                          entries: [
                                            {
                                              key: 'kind',
                                              value: {
                                                kind: 'string',
                                                value: 'object',
                                              },
                                            },
                                            {
                                              key: 'entries',
                                              value: {
                                                kind: 'array',
                                                items: [
                                                  {
                                                    kind: 'object',
                                                    entries: [
                                                      {
                                                        key: 'key',
                                                        value: {
                                                          kind: 'string',
                                                          value: 'from',
                                                        },
                                                      },
                                                      {
                                                        key: 'value',
                                                        value: {
                                                          kind: 'object',
                                                          entries: [
                                                            {
                                                              key: 'kind',
                                                              value: {
                                                                kind: 'string',
                                                                value: 'number',
                                                              },
                                                            },
                                                            {
                                                              key: 'lexeme',
                                                              value: {
                                                                kind: 'string',
                                                                value: '1',
                                                              },
                                                            },
                                                          ],
                                                        },
                                                      },
                                                    ],
                                                  },
                                                  {
                                                    kind: 'object',
                                                    entries: [
                                                      {
                                                        key: 'key',
                                                        value: {
                                                          kind: 'string',
                                                          value: 'tags',
                                                        },
                                                      },
                                                      {
                                                        key: 'value',
                                                        value: {
                                                          kind: 'object',
                                                          entries: [
                                                            {
                                                              key: 'kind',
                                                              value: {
                                                                kind: 'string',
                                                                value: 'array',
                                                              },
                                                            },
                                                            {
                                                              key: 'items',
                                                              value: {
                                                                kind: 'array',
                                                                items: [
                                                                  {
                                                                    kind: 'object',
                                                                    entries: [
                                                                      {
                                                                        key: 'kind',
                                                                        value: {
                                                                          kind: 'string',
                                                                          value: 'string',
                                                                        },
                                                                      },
                                                                      {
                                                                        key: 'value',
                                                                        value: {
                                                                          kind: 'string',
                                                                          value: 'a',
                                                                        },
                                                                      },
                                                                    ],
                                                                  },
                                                                  {
                                                                    kind: 'object',
                                                                    entries: [
                                                                      {
                                                                        key: 'kind',
                                                                        value: {
                                                                          kind: 'string',
                                                                          value: 'boolean',
                                                                        },
                                                                      },
                                                                      {
                                                                        key: 'value',
                                                                        value: {
                                                                          kind: 'boolean',
                                                                          value: true,
                                                                        },
                                                                      },
                                                                    ],
                                                                  },
                                                                  {
                                                                    kind: 'object',
                                                                    entries: [
                                                                      {
                                                                        key: 'kind',
                                                                        value: {
                                                                          kind: 'string',
                                                                          value: 'null',
                                                                        },
                                                                      },
                                                                    ],
                                                                  },
                                                                ],
                                                              },
                                                            },
                                                          ],
                                                        },
                                                      },
                                                    ],
                                                  },
                                                ],
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
}
