#!/usr/bin/env node
// sqlew hook/MCP launcher for the Muse Code bundle.
//
// Why this exists: Muse plugin hooks spawn argv directly (no shell), so a
// bare `sqlew` argv cannot start on Windows where npm installs `sqlew.cmd`
// (CreateProcess cannot execute .cmd shims). A bare `node` argv works on all
// platforms, so plugin hooks run `node hooks/muse-<hook>.cjs` and each
// entry delegates here; this launcher resolves sqlew through a shell on
// Windows only. Per-hook entry files are required because Muse rejects a
// hook source file shared by multiple hook capabilities
// (`duplicate-hook-source`).
//
// stdin/stdout/stderr and the exit code are passed through untouched, which
// preserves sqlew hook semantics (plain-text/JSON stdout, exit 2 = block).
// Run directly with no arguments it starts the sqlew MCP server (used by
// the bundle's mcpServers entry).
//
// Fail-open: if sqlew is not installed, warn on stderr and exit 0 so a
// missing sqlew never breaks the Muse session.
const { spawnSync } = require('node:child_process');

function run(args) {
  const result = spawnSync('sqlew', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    process.stderr.write(
      `[sqlew-hook] failed to launch sqlew: ${result.error.message}\n` +
        'Install the sqlew MCP server globally: npm i -g sqlew\n',
    );
    process.exit(0);
  }

  process.exit(result.status ?? 0);
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run };
