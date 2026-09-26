import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { evaluate } from '../src/index.ts'
import { assignment, definition, holding, root, shell, simple, tenant, tool } from './fixtures.ts'

describe('bounded structural properties corresponding to Alloy obligations', () => {
  for (const factoryLocked of [false, true])
    for (const orgDisabled of [false, true])
      for (const tenantDisabled of [false, true])
        for (const orgLocked of [false, true])
          for (const tenantLocked of [false, true])
            it(`Flock=${factoryLocked}, Odisabled=${orgDisabled}, Tdisabled=${tenantDisabled}, Olock=${orgLocked}, Tlock=${tenantLocked}`, () => {
              const base = simple()
              const input = {
                ...base,
                definitions: [
                  ...base.definitions,
                  definition('ast_org', shell, tool('shell', 'PT10S'), 'customized', tenant, true),
                  definition('ast_tenant', shell, tool('shell', 'PT20S'), 'customized'),
                ],
                holdings: [
                  ...base.holdings.map(entry =>
                    entry.asset === 'ast_value' ? { ...entry, immutable: factoryLocked } : entry,
                  ),
                  holding(
                    'organization',
                    shell,
                    'ast_org',
                    [assignment('disabled', orgDisabled)],
                    orgLocked,
                  ),
                  holding(
                    'tenant',
                    shell,
                    'ast_tenant',
                    [assignment('disabled', tenantDisabled)],
                    tenantLocked,
                  ),
                ],
              }
              const outcome = evaluate(input)
              if (!('ok' in outcome)) throw new Error(writeJsonLossless(outcome))
              const expected = factoryLocked
                ? 'ast_value'
                : !orgDisabled && orgLocked
                  ? 'ast_org'
                  : !tenantDisabled
                    ? 'ast_tenant'
                    : !orgDisabled
                      ? 'ast_org'
                      : 'ast_value'
              const value = outcome.ok.assets.find(entry => entry.capability.name === 'shell')
              expect(value?.asset).toBe(expected)
              expect(value?.from).toBe(
                expected === 'ast_tenant'
                  ? 'tenant'
                  : expected === 'ast_org'
                    ? 'organization'
                    : 'factory',
              )
              expect(value?.lockedAt).toBe(
                factoryLocked
                  ? 'factory'
                  : !orgDisabled && orgLocked
                    ? 'organization'
                    : expected === 'ast_tenant' && tenantLocked
                      ? 'tenant'
                      : undefined,
              )
              expect(outcome.ok.assets).toHaveLength(2)
              expect(
                outcome.ok.assets.some(
                  entry =>
                    entry.capability.category === 'agent_definition' && entry.asset === 'ast_root',
                ),
              ).toBe(true)
              expect(
                new Set(
                  outcome.ok.assets.map(
                    entry => `${entry.capability.category}:${entry.capability.name}`,
                  ),
                ).size,
              ).toBe(outcome.ok.assets.length)
              expect(outcome.ok.composition).toEqual([shell])
              expect(outcome.ok.composition).not.toContainEqual(root)
              for (const entry of outcome.ok.assets)
                expect(
                  input.holdings.some(
                    holding =>
                      holding.asset === entry.asset &&
                      holding.capability.name === entry.capability.name,
                  ),
                ).toBe(true)
              expect(outcome.ok.values.find(entry => entry.item === 'timeout')?.value).toBe(
                expected === 'ast_tenant' ? 'PT20S' : expected === 'ast_org' ? 'PT10S' : 'PT60S',
              )
              expect(
                outcome.ok.values.find(entry => entry.item === 'execute')?.tenantAutoWritable,
              ).toBe(expected === 'ast_tenant')
              const expectedFiltered = [
                ...(orgDisabled
                  ? [{ capability: shell, from: 'organization', reason: 'disabled' }]
                  : factoryLocked
                    ? [{ capability: shell, from: 'organization', reason: 'locked_below' }]
                    : []),
                ...(tenantDisabled
                  ? [{ capability: shell, from: 'tenant', reason: 'disabled' }]
                  : factoryLocked || (!orgDisabled && orgLocked)
                    ? [{ capability: shell, from: 'tenant', reason: 'locked_below' }]
                    : []),
              ]
              expect(outcome.ok.filteredOut).toEqual(expect.arrayContaining(expectedFiltered))
              expect(outcome.ok.filteredOut).toHaveLength(expectedFiltered.length)
            })
})
