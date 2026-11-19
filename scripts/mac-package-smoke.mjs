import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const appPath = process.argv[2];
if (!appPath || !['darwin', 'win32'].includes(process.platform)) throw new Error('Pass a packaged .app on macOS or .exe on Windows.');
const executable = process.platform === 'darwin' ? path.join(appPath, 'Contents/MacOS/lumina-piano') : path.resolve(appPath);
const profile = await mkdtemp(path.join(tmpdir(), 'lumina-smoke-'));
const child = spawn(executable, [
  '--remote-debugging-port=9434', '--mute-audio', `--user-data-dir=${profile}`,
], { stdio: 'inherit' });
let socket;
let launchError;
child.on('error', error => { launchError = error; });
try {
  let page;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`App exited early: ${child.exitCode}`);
    try {
      const response = await fetch('http://127.0.0.1:9434/json/list');
      page = (await response.json()).find(item => item.type === 'page');
    } catch { /* Wait for the renderer to start. */ }
    if (page) break;
    await delay(1000);
  }
  if (!page) throw new Error('Packaged renderer did not start.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Renderer check timed out.')), 30_000);
    const check = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `Boolean(document.body?.innerText.includes('Trial · Sign in') && typeof window.electronAPI?.account?.signIn === 'function')`,
      returnByValue: true,
    } }));
    socket.onopen = check;
    socket.onerror = () => { clearTimeout(timeout); reject(new Error('Debug connection failed.')); };
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.result?.result?.value === true) {
        clearTimeout(timeout);
        resolve();
      } else {
        // The first target can still be navigating from about:blank. Retry in
        // its new execution context instead of treating navigation as failure.
        setTimeout(() => { if (socket.readyState === WebSocket.OPEN) check(); }, 500);
      }
    };
  });
  console.log('Packaged renderer and account bridge verified.');
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const duplicate = spawn(executable, ['--mute-audio', `--user-data-dir=${profile}`], { stdio: 'inherit' });
      const timeout = setTimeout(() => {
        duplicate.kill();
        reject(new Error('Second launch did not exit.'));
      }, 15_000);
      duplicate.on('error', error => { clearTimeout(timeout); reject(error); });
      duplicate.on('exit', code => {
        clearTimeout(timeout);
        if (code === 0 && child.exitCode === null) resolve();
        else reject(new Error(`Unexpected second-launch exit: ${code}`));
      });
    });
    console.log('Second launch exited while the original app remained running.');
  }
} finally {
  socket?.close();
  child.kill();
  await delay(1000);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
}
