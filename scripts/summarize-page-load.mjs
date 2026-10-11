import strictAssert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

let assertionCount = 0;
const assert = {
  ok(value, message) { strictAssert.ok(value, message); assertionCount += 1; },
  equal(actual, expected, message) { strictAssert.equal(actual, expected, message); assertionCount += 1; },
};

const directory = process.argv[2] ?? 'output/performance';
function readProbe(name) {
  const text = readFileSync(`${directory}/${name}.txt`, 'utf8');
  const line = text.split(/\r?\n/).find((line) => line.startsWith('{"origin"'));
  assert.ok(line, `${name}: probe must return real measurements`);
  const probe = JSON.parse(line);
  assert.equal(probe.samples.length, 6);
  writeFileSync(`${directory}/${name}.json`, JSON.stringify(probe, null, 2) + '\n');
  return probe;
}

const before = readProbe('before');
const after = readProbe('after');
assert.equal(before.origin, after.origin);
assert.equal(before.conditions, after.conditions);
const rows = [1440, 390].map((width) => {
  const samples = (probe) => probe.samples.filter((sample) => sample.viewport.width === width);
  const median = (probe, key) => samples(probe).map((sample) => sample[key]).sort((a, b) => a - b)[1];
  assert.equal(samples(before).length, 3);
  assert.equal(samples(after).length, 3);
  const metrics = Object.fromEntries([
    'fcpMs', 'lcp', 'loadMs', 'cssBytes', 'imageBytes', 'totalResourceBytes',
    'fontBytes', 'requests', 'rscRequests', 'longTasks', 'cls',
  ].map((key) => [key, { before: median(before, key), after: median(after, key) }]));
  // These falsifiable field assertions prove only this local experiment's
  // payload/prefetch/paint results, without certifying live TTFB or CPU improvements.
  assert.equal(metrics.cssBytes.after < metrics.cssBytes.before, true);
  assert.equal(metrics.imageBytes.after < metrics.imageBytes.before, true);
  assert.equal(metrics.fcpMs.after < metrics.fcpMs.before, true);
  assert.equal(samples(after).every((sample) => sample.rscRequests === 0), true);
  assert.equal(samples(after).every((sample) => sample.overflow === 0), true);
  assert.equal(samples(after).every((sample) => sample.cssBytes > 0 && sample.imageBytes > 0), true);
  return { width, runs: 3, metrics };
});
const comparison = { beforeMeasuredAt: before.measuredAt, afterMeasuredAt: after.measuredAt, conditions: after.conditions, rows, assertions: { total: assertionCount, passed: assertionCount, failed: 0, skipped: 0 } };
writeFileSync(`${directory}/comparison.json`, JSON.stringify(comparison, null, 2) + '\n');
for (const { width, metrics } of rows) {
  console.log(JSON.stringify({ width, ...Object.fromEntries(['fcpMs', 'cssBytes', 'imageBytes', 'rscRequests'].map((key) => [key, metrics[key]])) }));
}
console.log(`assertions: ${assertionCount} passed, 0 failed, 0 skipped (local experiment only)`);
