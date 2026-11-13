import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {value as dual} from '../packages/dual/index.js';
import {value as client} from '../packages/client/index.js';

const requireClient = createRequire(new URL('../packages/client/package.json', import.meta.url));
const linked = requireClient.resolve('mixed-dual');
assert.equal(realpathSync(linked), fileURLToPath(new URL('../packages/dual/index.js', import.meta.url)));
assert.equal((await import(pathToFileURL(linked))).value, 42);
assert.equal(dual, 42);
assert.equal(client, 42);
console.log('PASS: both npm members execute and the native workspace dependency resolves locally');
