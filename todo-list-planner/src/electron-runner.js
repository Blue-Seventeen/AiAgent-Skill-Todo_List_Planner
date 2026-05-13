'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findTodoExe() {
  const candidates = [
    process.env.TODO_EXE,
    'C:\\Program Files\\todo-list\\Todo清单.exe',
    'C:\\Program Files (x86)\\todo-list\\Todo清单.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return '';
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function runDbCommand(command, input = {}, options = {}) {
  const todoExe = options.todoExe || findTodoExe();
  if (!fs.existsSync(todoExe)) {
    throw new Error('Todo清单 executable not found. Set TODO_EXE to the full Todo清单.exe path.');
  }

  const runnerPath = path.join(__dirname, 'db-runner.js');
  const runnerCode = fs.readFileSync(runnerPath, 'utf8');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    TODO_RUNNER_CODE_B64: Buffer.from(runnerCode, 'utf8').toString('base64'),
    TODO_RUNNER_PAYLOAD_B64: encodeJson({ command, input })
  };

  const evalCode = "eval(Buffer.from(process.env.TODO_RUNNER_CODE_B64,'base64').toString('utf8'))";
  const child = spawnSync(todoExe, ['-e', evalCode], {
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });

  const output = `${child.stdout || ''}\n${child.stderr || ''}`;
  const marker = output.split(/\r?\n/).reverse().find((line) => line.startsWith('TODO_RESULT_JSON:'));
  if (!marker) {
    throw new Error(`Electron runner did not return JSON.\n${output.trim()}`);
  }

  const result = JSON.parse(marker.slice('TODO_RESULT_JSON:'.length));
  if (!result.success) {
    throw new Error(result.error || `Electron runner failed with exit code ${child.status}`);
  }
  return result;
}

module.exports = {
  findTodoExe,
  runDbCommand
};
