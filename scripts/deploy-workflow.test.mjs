import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const digestCommit = 'b'.repeat(40);
const audioCommit = 'a'.repeat(40);

function checkHead(runSha, headSha, apiStatus = 0) {
  // Exercise the actual workflow shell with an offline GitHub API substitute.
  const block = workflow.match(/      - id: freshness\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/);
  assert.ok(block, 'deployment must check main immediately before publishing');
  const script = block[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'gm-deploy-'));
  try {
    writeFileSync(join(dir, 'gh'), `#!/bin/bash\n[[ "$*" == 'api repos/21ideas-org/gm-web/git/ref/heads/main --jq .object.sha' ]] || exit 99\nprintf '%s\\n' "$TEST_HEAD_SHA"\nexit "$TEST_API_STATUS"\n`, { mode: 0o755 });
    const output = join(dir, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: '21ideas-org/gm-web', GITHUB_SHA: runSha,
        TEST_HEAD_SHA: headSha, TEST_API_STATUS: String(apiStatus) },
    });
    return { ...result, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a current digest can deploy, but a delayed older audio build cannot replace it', () => {
  const current = checkHead(digestCommit, digestCommit);
  assert.equal(current.status, 0, current.stderr);
  assert.equal(current.output, 'is_current=true\n');
  const delayed = checkHead(audioCommit, digestCommit);
  assert.equal(delayed.status, 0, delayed.stderr);
  assert.equal(delayed.output, 'is_current=false\n');
});

test('a previously current build is rejected after main advances', () => {
  const result = checkHead(digestCommit, 'c'.repeat(40));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'is_current=false\n');
});

test('an unavailable or invalid main ref never authorizes deployment', () => {
  for (const [head, status] of [[digestCommit, 1], ['', 0], ['null', 0], ['invalid', 0]]) {
    const result = checkHead(digestCommit, head, status);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
  }
});

test('only main can deploy, and skipped deployments do not notify IndexNow', () => {
  const config = workflow.replace(/^ *#.*\n/gm, '');
  assert.match(config, /deploy:\n    if: github\.ref == 'refs\/heads\/main'/);
  assert.match(config, /deployed: \$\{\{ steps\.deployment\.outcome == 'success' \}\}/);
  assert.match(config, /- id: deployment\n        if: steps\.freshness\.outputs\.is_current == 'true'\n        uses: actions\/deploy-pages@/);
  assert.match(config, /indexnow:\n    needs: \[build, deploy\]\n    if: needs\.deploy\.outputs\.deployed == 'true'/);
  assert.match(config, /concurrency:\n  group: pages\n  cancel-in-progress: false/);
});
