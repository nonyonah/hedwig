import fs from 'fs';
import path from 'path';

const jwtFilePath = './node_modules/@coinbase/cdp-sdk/_cjs/auth/utils/jwt.js';

// Read the original file
const originalContent = fs.readFileSync(jwtFilePath, 'utf8');

// Replace require('jose') with dynamic import
const fixedContent = originalContent.replace(
  "const jose_1 = require(\"jose\");",
  `let jose_1;
(async () => {
  jose_1 = await import("jose");
})();`
);

// Replace function implementations to handle async imports
const finalContent = fixedContent
  .replace(
    /async function signJwt\(payload, secret, options\) {/,
    'async function signJwt(payload, secret, options) {\n    if (!jose_1) jose_1 = await import("jose");'
  )
  .replace(
    /async function verifyJwt\(token, secret\) {/,
    'async function verifyJwt(token, secret) {\n    if (!jose_1) jose_1 = await import("jose");'
  );

// Write the fixed content back to the file
fs.writeFileSync(jwtFilePath, finalContent, 'utf8');

console.log('Fixed ESM compatibility issue in @coinbase/cdp-sdk'); 