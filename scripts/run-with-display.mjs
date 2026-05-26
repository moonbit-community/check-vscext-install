import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-with-display.mjs <command> [...args]');
  process.exit(2);
}

const needsVirtualDisplay = process.platform === 'linux' && !process.env.DISPLAY;
const command = needsVirtualDisplay ? 'xvfb-run' : args[0];
const commandArgs = needsVirtualDisplay ? ['-a', ...args] : args.slice(1);

if (needsVirtualDisplay && !hasCommand('xvfb-run')) {
  console.error(
    [
      'Linux headless test runs require xvfb-run, but it was not found on PATH.',
      'Install Xvfb (for example: sudo apt-get install xvfb) or rerun with DISPLAY set.'
    ].join('\n')
  );
  process.exit(1);
}

const result = spawnSync(command, commandArgs, {
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function hasCommand(name) {
  const result = spawnSync('sh', ['-lc', `command -v ${shellQuote(name)}`], {
    stdio: 'ignore'
  });

  return result.status === 0;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
