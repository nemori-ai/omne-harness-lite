import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

for (const entry of ['../src/schema.ts', '../dist/schema.js']) {
  it(`keeps the built resource identity before first use through ${entry}`, () => {
    const url = new URL(entry, import.meta.url).href
    const resource = import.meta.resolve('@omne-harness-lite/model-response/schema')
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `
        import assert from 'node:assert/strict';
        const { validate } = await import(${JSON.stringify(url)});
        const { default: resource } = await import(${JSON.stringify(resource)}, { with: { type: 'json' } });
        resource.$defs.ResponseId = false;
        assert.equal(resource.$defs.ResponseId, false, 'mutation must actually reach the imported object');
        assert.equal(validate('ResponseId', 'resp_4c1e9a').valid, true);
        assert.equal(validate('ResponseId', '').valid, false);
        console.log('built resource identity preserved');
        `,
      ],
      { encoding: 'utf8' },
    )
    expect(output.trim()).toBe('built resource identity preserved')
  })
}
