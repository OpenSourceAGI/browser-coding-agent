const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.js'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('esbuild watching...');
  } else {
    await esbuild.build(options);
    console.log('esbuild build complete -> dist/extension.js');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
