// Runs every suite in this directory and reports what passed.
//
// Suites ending in _test.js run against the compiled source in node. The
// rest drive the application in a browser and need both the development
// server and a browser listening for the debugging protocol:
//
//   npm start
//   msedge --headless --remote-debugging-port=9222 about:blank
//
// Run them with `npm test`, or one at a time with `node tests/<suite>.js`.
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PAGE = 'http://localhost:8080/';
const DEBUGGER = 9222;

function reach(url) {
  return new Promise(resolve => {
    const request = http.get(url, response => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function compile() {
  const root = path.resolve(__dirname, '..');
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p', root, '--module', 'commonjs', '--moduleResolution', 'bundler',
    '--outDir', path.join(__dirname, 'cjs')
  ], {stdio: 'pipe'});
}

function suites() {
  return fs.readdirSync(__dirname).filter(
    name => name.endsWith('.js') && name !== 'run.js').sort();
}

async function main() {
  if(!await reach(PAGE)) {
    console.log(`No development server at ${PAGE}. Start one with ` +
      '`npm start`.');
    process.exit(1);
  }
  if(!await reach(`http://127.0.0.1:${DEBUGGER}/json/version`)) {
    console.log(`No browser listening on port ${DEBUGGER}. Start one with ` +
      '`msedge --headless --remote-debugging-port=9222 about:blank`.');
    process.exit(1);
  }
  compile();
  const failed = [];
  const skipped = [];
  for(const suite of suites()) {
    const run = spawnSync(process.execPath, [path.join(__dirname, suite)],
      {encoding: 'utf8'});
    const lines = (run.stdout || '').split('\n').filter(
      line => line.trim() !== '');
    const last = (() => {
      if(lines.length === 0) {
        return '(no output)';
      }
      return lines[lines.length - 1];
    })();
    if(run.status !== 0) {
      failed.push({suite, output: run.stdout, error: run.stderr});
    }
    const mark = (() => {
      if(run.status !== 0) {
        return 'FAIL';
      }
      if(last.startsWith('skipped')) {
        skipped.push(suite);
        return 'skip';
      }
      return 'ok  ';
    })();
    console.log(`${mark}  ${suite.replace('.js', '').padEnd(14)}${last}`);
  }
  console.log('');
  if(failed.length === 0) {
    const tail = (() => {
      if(skipped.length === 0) {
        return '';
      }
      return `, ${skipped.length} skipped for want of the specifications`;
    })();
    console.log(`all ${suites().length} suites pass${tail}`);
    return;
  }
  for(const failure of failed) {
    console.log(`--- ${failure.suite} ---`);
    console.log(failure.output);
    if(failure.error !== '') {
      console.log(failure.error);
    }
  }
  console.log(`${failed.length} of ${suites().length} suites failed`);
  process.exit(1);
}

main();
