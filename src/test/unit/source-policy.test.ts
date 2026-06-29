import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

describe('source policy', () => {
  it('does not depend on extension-bundled language server artifacts', () => {
    const obsoletePatterns = [
      'moonbit-' + 'lsp',
      'node/moonbit-' + 'lsp',
      'findBundled' + 'Lsp',
      'lspVersion' + 'Output',
      'formatMoonc' + 'VersionCheck'
    ];
    const scannedFiles = [...sourceFiles(path.join(process.cwd(), 'src')), path.join(process.cwd(), 'INTERNAL.md')];
    const matches: string[] = [];

    for (const filePath of scannedFiles) {
      const content = readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');

      for (const obsoletePattern of obsoletePatterns) {
        if (content.includes(obsoletePattern)) {
          matches.push(`${relativePath}: ${obsoletePattern}`);
        }
      }
    }

    assert.deepEqual(matches, []);
  });
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const entryPath = path.join(directory, entry);
    const entryStat = statSync(entryPath);

    if (entryStat.isDirectory()) {
      files.push(...sourceFiles(entryPath));
    } else if (entryPath.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}
