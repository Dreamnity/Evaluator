var line = '', cursor = 0, history = [], historyi = 0, backup = [], scroll = 0;
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
var consoleLogs = [];
function fakeLog(...dat) {
  consoleLogs.push(...dat.map(e => typeof e !== 'string' ? inspect(e) : e).join(' ').split('\n'));
}
function fakeError(...dat) {
  consoleLogs.push(...dat.map(e => typeof e !== 'string' ? inspect(e) : e).join(' ').split('\n'));
}
const context = { require, console: { log: fakeLog, error: fakeError } };
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
show(0, CSI`7m` + " Evaluator".padEnd(cols - 14) + 'Dreamnity OSS ');
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
      setObj(vm.runInContext(line, context));
      objLines.push(...consoleLogs);
    } catch (e) {
      if (e?.stack) objLines = e.stack.split('\n');
      else setObj(e);
    }
    history.unshift([line, objLines]);
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
    show(10, JSON.stringify(backup));
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
    process.stdout.write(CSI`?25h` + CSI`${rows};${3 + line.length - cursor}H`);
    return;
  }
  if (c === '\u001b[D') {
    if (cursor < line.length) cursor++;
    process.stdout.write(CSI`?25h` + CSI`${rows};${3 + line.length - cursor}H`);
    return;
  }
  if (c.charCodeAt(0) === 127) {
    if (!line) return;
    if (!line[line.length - cursor - 1]) return;
    line = line.split('').toSpliced(line.length - cursor - 1, 1).join('');
  } else line = line.split('').toSpliced(line.length - cursor, 0, c).join('');
  show(rows, '\r> ' + line.slice(-cols + 35) + promptsuffix);
  process.stdout.write(CSI`?25h` + CSI`${rows};${3 + line.length - cursor}H`);
});
function errorHandler(err) {
  setObj(err);
  showObj();
}
objLines = ['Welcome to Evaluator', 'Type javascript code below to get started.'];
showObj();
process.on('uncaughtException', errorHandler);
process.on('unhandledRejection', errorHandler);
// #endregion