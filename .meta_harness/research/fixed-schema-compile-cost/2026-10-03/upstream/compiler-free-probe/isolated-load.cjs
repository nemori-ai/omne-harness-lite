const Module = require('node:module'); const original = Module._load; const seen = [];
Module._load = function(specifier, ...args) { seen.push(specifier); return original.call(this, specifier, ...args); };
const validators = require("/data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation/tmp/test-tiers-mutation/compiler-free-probe/cases.cjs");
const {handoff} = require("/data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation/tmp/test-tiers-mutation/compiler-free-probe/native-helper.mjs");
const result = handoff(validators.Case0, '1.0000000000000000000001');
const forbidden = seen.filter(s => /ajv.*(?:2020|core|compile|standalone)/u.test(s));
if (forbidden.length) throw new Error(JSON.stringify(forbidden));
console.log(JSON.stringify({result, forbidden, seen}));