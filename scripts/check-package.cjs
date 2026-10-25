const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

const [archive] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
assert.equal(archive.name, pkg.name);
assert.equal(archive.version, pkg.version);
assert.equal(archive.bundled.length, 0);
assert.equal(pkg.dependencies, undefined);
for (const { path } of archive.files) {
  assert.ok(['LICENSE', 'README.md', 'package.json', 'dist/package.json'].includes(path) ||
    /^dist\/(credentials|nodes)\/[A-Za-z0-9_./-]+\.(js|json|map|svg|ts)$/.test(path), `Unexpected archive entry: ${path}`);
  assert.ok(!path.split('/').includes('..'));
}
for (const path of [...pkg.n8n.nodes, ...pkg.n8n.credentials, 'LICENSE', 'README.md', 'package.json']) {
  assert.ok(archive.files.some(file => file.path === path), `Missing archive entry: ${path}`);
}
console.log(JSON.stringify({ name: archive.name, version: archive.version, files: archive.files.length, integrity: archive.integrity }));
