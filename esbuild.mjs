import esbuild from 'esbuild';
import { spawn } from 'node:child_process';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function startCssWatcher() {
  const child = spawn(
    'pnpm',
    ['exec', 'postcss', 'webview/styles.css', '-o', 'dist/style.css', '--watch'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  const stopWatcher = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  process.once('SIGINT', stopWatcher);
  process.once('SIGTERM', stopWatcher);
  process.once('exit', stopWatcher);

  child.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`postcss watcher exited with code ${code}`);
    }
  });
}

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin],
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['webview/main.tsx'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    startCssWatcher();
    return;
  }

  await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
  await runCommand('pnpm', ['exec', 'postcss', 'webview/styles.css', '-o', 'dist/style.css']);
  await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
