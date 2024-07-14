#!/usr/bin/env bun
var line = '', cursor = 0, history = [], historyi = 0, backup = [], scroll = 0, _;
// #region Console library
const kEscape = "\x1b";
const { inspect } = require('util');
const [cols, rows] = process.stdout.getWindowSize();
var objLines = [];

function show(row, text) {
  return process.stdout.write(CSI`?25l` + CSI`${row};${1}H` + CSI`2K` + CSI`0m` + text);
}

function CSI(strings, ...args) {
  let ret = `${kEscape}[`;
  for (let n = 0; n < strings.length; n++) {
    ret += strings[n];
    if (n < args.length) ret += args[n];
  }
  return ret;
}

function setObj(obj) {
  objLines = inspect(obj, { colors: true, breakLength: cols }).split('\n');
}

function showObj(offset = 0) {
  for (let i = 0; i < rows - 2; i++) {
    if (i + offset >= objLines.length) show(i + 2, "");
    else show(i + 2, objLines[i + offset]);
  }
}
// #endregion

// #region Code Execution
const vm = require('vm');
const repl = require('repl');
var consoleLogs = [];
function log(...dat) {
  consoleLogs.push(...dat.map(e => typeof e !== 'string' ? inspect(e) : e).join(' ').split('\n'));
}
const Console = {};
for (const k of Object.keys(console)) Console[k] = log;
var context = { require, console: Console, _ };
if (typeof Bun !== "undefined" && repl?.context) {
  context = repl.context;
  context.console = Console;
  context._ = _;
} else if (repl?.builtinModules) {
  for (const module of repl.builtinModules) context[module] = require(module);
  context.console = Console;
}
vm.createContext(context);
// #endregion

// #region History
function processHistory() {
  const i = historyi - 1;
  if (i < 0) return;
  line = history[i][0];
  objLines = history[i][1];
  show(rows, '> ' + line);
  showObj(scroll);
}
// #endregion

// #region Main
// show "Evaluator" with inversed color on top, as like title bar
process.stdout.write("\u001bc");
const title = CSI`7m` + " Evaluator".padEnd(cols - 14) + 'Dreamnity OSS ';
show(0, title);
const actions = ["Scroll ↑↓", "History Ctrl+↑↓", "Eval ↩"].map(e => CSI`7m` + e + CSI`0m`).join(' ');
const promptsuffix = CSI`${rows};${cols - 31}H` + actions;
show(rows, "> " + promptsuffix);
process.stdout.write(CSI`?25h` + CSI`${rows};${3}H`);
const { stdin } = process;
stdin.setRawMode(true);
stdin.setEncoding('utf8');
stdin.resume();
stdin.on('data', cb => {
  const c = cb.toString();
  if (c.charCodeAt(0) === 3) {
    stdin.setRawMode(false);
    process.stdout.write('\u001bc');
    process.exit();
  }
  if (c.charCodeAt(0) === 13) {
    try {
      consoleLogs = [];
      context._ = _;
      setObj(_ = vm.runInContext(line, context));
      objLines.unshift(...consoleLogs);
    } catch (e) {
      if (e?.stack) objLines = e.stack.split('\n');
      else setObj(e);
    }
    history.unshift([line, objLines]);
    if (history.length > 50) history.pop();
    historyi = 0;
    scroll = Math.min(scroll, objLines.length);
    showObj(scroll);
    line = '';
    return show(rows, '\r> ' + promptsuffix);
  }
  if (c === '\u001b[1;5A') {
    if (historyi === 0) backup = [line, objLines];
    if (historyi < history.length) historyi++;
    processHistory();
    return;
  }
  if (c === '\u001b[1;5B') {
    if (historyi > 0) historyi--;
    if (historyi === 0) {
      line = backup[0], objLines = backup[1];
      show(rows, '\r> ' + line.slice(-cols + 35) + promptsuffix);
      showObj(scroll);
    }
    else processHistory();
    return;
  }
  if (c === '\u001b[A') {
    if (scroll <= 0) return;
    scroll--;
    showObj(scroll);
    return;
  }
  if (c === '\u001b[B') {
    if (scroll + rows - 5 > objLines.length) return;
    scroll++;
    showObj(scroll);
    return;
  }
  if (c === '\u001b[C') {
    if (cursor > 0) cursor--;
    fixCursor();
    return;
  }
  if (c === '\u001b[D') {
    if (cursor < line.length) cursor++;
    fixCursor();
    return;
  }
  if (c === '\u001b[H' || c === '\u001b[5~') {
    cursor = line.length;
    fixCursor();
    return;
  }
  if (c === '\u001b[F' || c === '\u001b[6~') {
    cursor = 0;
    fixCursor();
    return;
  }
  if (c.startsWith('\u001b')) return fixCursor();
  if (c.charCodeAt(0) === 127) {
    if (!line) return;
    if (!line[line.length - cursor - 1]) return;
    line = line.split('').toSpliced(line.length - cursor - 1, 1).join('');
  } else line = line.split('').toSpliced(line.length - cursor, 0, c).join('');
  show(rows, '\r> ' + line.slice(-cols + 35) + promptsuffix);
  fixCursor();
});
function errorHandler(err) {
  setObj(err);
  showObj();
}
objLines = ['Welcome to Evaluator', 'Type javascript code below to get started.'];
showObj();
process.on('uncaughtException', errorHandler);
process.on('unhandledRejection', errorHandler);
function fixCursor() {
  process.stdout.write(CSI`?25h` + CSI`${rows};${3 + line.length - cursor}H`);
}
// #endregion