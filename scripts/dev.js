import { spawn, execFileSync } from 'node:child_process';
const node = process.execPath;
execFileSync(node, ['client/build.js'], { stdio: 'inherit' });
const children = [
  spawn(node, ['client/build.js', '--watch'], { stdio: 'inherit' }),
  spawn(
    node,
    [
      '--env-file-if-exists=.local/dev.env',
      '--env-file-if-exists=.env',
      '--watch',
      'server/src/index.js',
    ],
    { stdio: 'inherit' },
  ),
];
let closing = false;
function stop(code) {
  if (!closing) {
    closing = true;
    children.forEach((p) => p.kill());
    process.exitCode = code;
  }
}
children.forEach((p) => p.on('exit', (code) => stop(code ?? 0)));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
