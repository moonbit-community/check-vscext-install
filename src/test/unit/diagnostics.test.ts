import * as assert from 'node:assert/strict';
import {
  formatCommand,
  formatBytes,
  formatDuration,
  formatEnvValue,
  formatJson,
  formatMooncVersionCheckFailure,
  formatMooncVersionCheckLogs,
  formatOfficialMooncVersionCheckFailure,
  formatOfficialMooncVersionCheckLogs,
  logStep
} from '../diagnostics.js';

describe('diagnostic formatting', () => {
  it('formats durations with seconds and milliseconds', () => {
    assert.equal(formatDuration(42), '42ms');
    assert.equal(formatDuration(1_234), '1.2s (1234ms)');
    assert.equal(formatDuration(65_432), '65.4s (65432ms)');
  });

  it('formats byte counts for downloads', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1_536), '1.5 KiB (1536 B)');
    assert.equal(formatBytes(5_242_880), '5.0 MiB (5242880 B)');
  });

  it('formats missing and empty environment values explicitly', () => {
    assert.equal(formatEnvValue(undefined), '<unset>');
    assert.equal(formatEnvValue(''), '<empty>');
    assert.equal(formatEnvValue('/tmp/moon-home'), '/tmp/moon-home');
  });

  it('formats command arguments safely for CI logs', () => {
    assert.equal(
      formatCommand('/tmp/VS Code/bin/code', ['--user-data-dir', '/tmp/user data', '--force']),
      "'/tmp/VS Code/bin/code' --user-data-dir '/tmp/user data' --force"
    );
  });

  it('serializes diagnostic JSON without throwing on errors', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    assert.equal(formatJson({ platform: 'darwin', arch: 'arm64' }), '{"platform":"darwin","arch":"arm64"}');
    assert.equal(formatJson(new Error('boom')), '{"name":"Error","message":"boom"}');
    assert.equal(formatJson(cyclic), '<unserializable>');
  });

  it('logs step start and end markers with elapsed time', async () => {
    const messages: string[] = [];

    await logStep('demo', async () => 'done', {
      now: (() => {
        const values = [1_000, 1_250];
        return () => values.shift() ?? 1_250;
      })(),
      log: (message) => messages.push(message)
    });

    assert.deepEqual(messages, ['[diag] >>> demo', '[diag] <<< demo completed in 250ms']);
  });

  it('formats successful moonc version checks with the downloaded version', () => {
    const successMessage = 'moonc version check succeeded: 1.2.3';
    const border = `+${'-'.repeat(successMessage.length + 2)}+`;
    const spacer = `|${' '.repeat(successMessage.length + 2)}|`;

    assert.deepEqual(formatMooncVersionCheckLogs('1.2.3', '1.2.3'), [
      'plugin requested moonc version: 1.2.3',
      'downloaded moonc version: 1.2.3',
      border,
      spacer,
      `| \u001b[32m${successMessage}\u001b[0m |`,
      spacer,
      border
    ]);
  });

  it('formats failed moonc version checks with requested and downloaded versions', () => {
    assert.deepEqual(formatMooncVersionCheckLogs('1.2.3', '1.2.4'), [
      'plugin requested moonc version: 1.2.3',
      'downloaded moonc version: 1.2.4',
      'moonc version check failed'
    ]);

    assert.equal(
      formatMooncVersionCheckFailure('/extension/node/moonbit-lsp', '1.2.3', '1.2.4'),
      'installed moonc version should match the compiler version carried by /extension/node/moonbit-lsp; plugin requested moonc version=1.2.3; downloaded moonc version=1.2.4'
    );
  });

  it('formats successful official installer moonc version checks', () => {
    const successMessage = 'official installer moonc version check succeeded: 1.2.3';
    const border = `+${'-'.repeat(successMessage.length + 2)}+`;
    const spacer = `|${' '.repeat(successMessage.length + 2)}|`;

    assert.deepEqual(formatOfficialMooncVersionCheckLogs('1.2.3', '1.2.3', 'pre-release'), [
      'VS Code extension-installed moonc version: 1.2.3',
      'official installer channel: pre-release',
      'official installer moonc version: 1.2.3',
      border,
      spacer,
      `| \u001b[32m${successMessage}\u001b[0m |`,
      spacer,
      border
    ]);
  });

  it('formats failed official installer moonc version checks', () => {
    assert.deepEqual(formatOfficialMooncVersionCheckLogs('1.2.3', '1.2.4', 'latest'), [
      'VS Code extension-installed moonc version: 1.2.3',
      'official installer channel: latest',
      'official installer moonc version: 1.2.4',
      'official installer moonc version check failed'
    ]);

    assert.equal(
      formatOfficialMooncVersionCheckFailure(
        '/tmp/moon-home/bin/moonc',
        '/tmp/official-moon-home/bin/moonc',
        'latest',
        '1.2.3',
        '1.2.4'
      ),
      'VS Code extension-installed moonc version should match the official installer version; extension moonc path=/tmp/moon-home/bin/moonc; official moonc path=/tmp/official-moon-home/bin/moonc; official installer channel=latest; extension moonc version=1.2.3; official installer moonc version=1.2.4'
    );
  });
});
