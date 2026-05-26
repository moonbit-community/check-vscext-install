import Mocha from 'mocha';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logDiagnostic, logStep } from '../diagnostics.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export async function run(): Promise<void> {
  logDiagnostic(`Mocha suite entry currentDir=${currentDir}`);
  const mocha = new Mocha({
    color: true,
    timeout: 20 * 60 * 1000,
    ui: 'bdd'
  });

  const testFile = path.resolve(currentDir, 'moonbit-install.test.js');
  logDiagnostic(`Mocha adding test file ${testFile}`);
  mocha.addFile(testFile);
  await logStep('load Mocha test files', () => mocha.loadFilesAsync());

  return new Promise<void>((resolve, reject) => {
    try {
      logDiagnostic('starting Mocha run');
      mocha.run((failures) => {
        logDiagnostic(`Mocha run completed with failures=${failures}`);
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
