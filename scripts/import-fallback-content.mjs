// One-shot importer: take a fallback-content authoring run (the Workflow output
// JSON), validate every encounter against encounter.v1, enforce per-pool rules,
// stamp templateIds, and write the modular pool JSON files. Run with:
//   node scripts/import-fallback-content.mjs <workflow-output.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { parseEncounter } = require('@unlikelyland/contracts');

const here = dirname(fileURLToPath(import.meta.url));
const fallbackDir = join(here, '..', 'apps', 'api', 'src', 'content', 'fallback');

const FILE_BY_KEY = {
  exploration: 'exploration-b.json',
  combat: 'combat-b.json',
  social: 'social-b.json',
  training: 'training-b.json',
  scavenging: 'scavenging-b.json',
  mystery: 'mystery.json',
  work: 'work.json',
};
// Extras share their base pool's templateId namespace via a "-b" suffix.
const TEMPLATE_NS = {
  exploration: 'exploration-b',
  combat: 'combat-b',
  social: 'social-b',
  training: 'training-b',
  scavenging: 'scavenging-b',
  mystery: 'mystery',
  work: 'work',
};

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/import-fallback-content.mjs <workflow-output.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(src, 'utf8'));
const pools = Array.isArray(data) ? data : data.result;

let totalWritten = 0;
const problems = [];

for (const pool of pools) {
  const { key, type, encounters } = pool;
  const file = FILE_BY_KEY[key];
  if (!file) {
    problems.push(`unknown pool key: ${key}`);
    continue;
  }

  const out = [];
  encounters.forEach((enc, i) => {
    const withMeta = { ...enc, encounterType: type, templateId: `fallback:${TEMPLATE_NS[key]}:${i}` };
    // Validate against encounter.v1 (throws on any schema violation).
    try {
      parseEncounter(withMeta);
    } catch (e) {
      problems.push(`${key}[${i}] "${enc.title}" failed schema: ${e.message?.slice(0, 200)}`);
      return;
    }
    // Unique choice ids.
    const ids = new Set(enc.choices.map((c) => c.id));
    if (ids.size !== enc.choices.length) problems.push(`${key}[${i}] duplicate choice id`);
    // Combat pool must offer a fight AND a non-fight choice.
    if (type === 'combat') {
      const hasFight = enc.choices.some((c) => c.mayStartCombat);
      const hasSafe = enc.choices.some((c) => !c.mayStartCombat);
      if (!hasFight || !hasSafe) problems.push(`${key}[${i}] "${enc.title}" missing combat dual-choice`);
    }
    out.push(withMeta);
  });

  writeFileSync(join(fallbackDir, file), JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`wrote ${file}: ${out.length} encounters`);
  totalWritten += out.length;
}

console.log(`\nTotal new encounters written: ${totalWritten}`);
if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(2);
}
console.log('All encounters valid.');
