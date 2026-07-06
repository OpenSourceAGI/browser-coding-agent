const fs = require('fs');
const content = fs.readFileSync('/home/admin/Wedit/src/lib/extension-loader.ts', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, i) => {
  if (line.includes('entryPoints = [')) {
    console.log(`Line ${i + 1}: ${line}`);
  }
});
