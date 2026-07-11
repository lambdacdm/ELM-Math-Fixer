const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const packageJson = JSON.parse(read('package.json'));
const readme = read('README.md');
const content = read('content.js');
const storeNotes = read('STORE_SUBMISSION.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(packageJson.version === manifest.version, 'package.json version does not match manifest.json');
assert(readme.includes(`Extension version: ${manifest.version}.`), 'English README version is stale');
assert(readme.includes(`插件版本：${manifest.version}。`), 'Chinese README version is stale');

for (const relativePath of manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])) {
  assert(fs.existsSync(path.join(root, relativePath)), `manifest references missing file: ${relativePath}`);
}

assert(!content.includes('.__parse'), 'content.js relies on the private KaTeX __parse API');
assert(!storeNotes.includes('Keep the ELM prompt from `README.md` enabled'), 'store notes require an optional prompt');
assert(!storeNotes.includes('ELM-Math-Fixer-v1.0.zip'), 'store notes contain a fixed stale ZIP version');

console.log(`Metadata tests passed for version ${manifest.version}.`);
