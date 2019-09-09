'use strict';

const fs = require("fs");
const path = require("path");
const math = require('mathjs');

math.config({ number: 'BigNumber', precision: 256 });

const parser = math.parser();

// User define functions
parser.set('hex', v => {
  if (v >= 0) {
    return `0x${math.number(v).toString(16).toUpperCase()}`;
  }
  else {
    let j = math.number(v);
    j += (1 << (math.ceil((math.log(-j, 2)+1)/4)*4));
    return `0x${math.number(j).toString(16).toUpperCase()}`;
  }
});
parser.set('bin', v => {
  if (v >= 0) {
    return `0b${math.number(v).toString(2).toUpperCase()}`;
  }
  else {
    let j = math.number(v);
    j += (1 << (math.ceil((math.log(-j, 2)+1)/4)*4));
    return `0b${math.number(j).toString(2).toUpperCase()}`;
  }
});
parser.set('eng', v => math.format(v, {notation: 'engineering'}));
parser.set('fix', v => math.format(v, {notation: 'fixed'}));
parser.set('_exp', v => math.format(v, {notation: 'exponential'}));

const parseHex = s => s.replace(/\b0x[0-9A-F]+\b/gi, e => parseInt(e.substr(2), 16));
const parseBin = s => s.replace(/\b0b[01]+\b/gi, e => parseInt(e.substr(2), 2));
const parseSIUnit = s => s
  .replace(/([0-9]*\.?[0-9]+)k\b/gi, '$1e+3')
  .replace(/([0-9]*\.?[0-9]+)m\b/gi, '$1e+6')
  .replace(/([0-9]*\.?[0-9]+)g\b/gi, '$1e+9')
  .replace(/([0-9]*\.?[0-9]+)t\b/gi, '$1e+12')
  .replace(/([0-9]*\.?[0-9]+)p\b/gi, '$1e+15')
  .replace(/([0-9]*\.?[0-9]+)mm\b/gi, '$1e-3')
  .replace(/([0-9]*\.?[0-9]+)uu\b/gi, '$1e-6')
  .replace(/([0-9]*\.?[0-9]+)nn\b/gi, '$1e-9')
  .replace(/([0-9]*\.?[0-9]+)pp\b/gi, '$1e-12')
  .replace(/([0-9]*\.?[0-9]+)ff\b/gi, '$1e-15');

const reader = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const colPromptBg = '\x1b[44m';
const colErrorFg = '\x1b[91m';
const colWarningFg = '\x1b[93m';
const colResetBg = '\x1b[49m';
const colResetFg = '\x1b[39m';

// initialize
if (process.stdin.isTTY) {
  // title
  process.stdout.write('\x1b]0;Calc\x07');
  // prompt
  reader.setPrompt(`${colPromptBg} Calc ${colResetBg} > `);
  reader.prompt();
  // history
  const home = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];
  const HistoryFile = path.join(home, '.calc.history');
  try {
    reader.history = JSON.parse(fs.readFileSync(HistoryFile));
  }
  catch(e) { }
  reader.on('close', () => {
    fs.writeFileSync(HistoryFile, JSON.stringify(reader.history, null, "  "));
    process.exit(0);
  });
}

const truncate = (s, l) => {
    if (s.length <= l) {
      return s;
    }
    else {
      let m = /e[\+-]\d+/gim.exec(s);
      if (m != null) {
          let i = m.index;
          return `${s.substr(0, l - (s.length - i))}...${s.substr(i)}`;
      }
      else {
          return `${s.substr(0, l)}...`;
      }
    }
}

const execute = (cmd) => {
  let buf = {};
  Object.keys(parser.scope).forEach(k => buf[k] = parser.scope[k]);
  buf['@'] = buf['__at__'];
  delete(buf['__at__']);

  switch(cmd) {
    case 'history':
      console.log(reader.history);
      break;
    case 'clear':
      reader.history = [];
      break;
    case 'cls':
      process.stdout.write('\x1b[2J\x1b[0;0H');
      break;
    case 'ls':
      Object.keys(buf).filter(k => !(buf[k] instanceof Function)).forEach(k => {
        if (typeof(buf[k]) != 'undefined') {
          console.log(`${k}: ${truncate(buf[k].toString(), 80)}`);
        }
      });
      break;
    case 'la':
      console.log(buf);
      break;
    case 'func':
      Object.keys(buf).filter(k => buf[k] instanceof Function).forEach(k => {
        console.log(`${k} = ${buf[k].toString()}\n`);
      });
      break;
    case 'exit':
    case 'quit':
      reader.close();
      break;
    default :
      console.error('Unknown Command');
      console.error(`  ${colErrorFg}${cmd}${colResetFg}`);
      break;
  }
}

const assign = (n, t, v) => {
  for (let i = 0; i < n.length; i++)
  {
    let c = n[i].getContent();
    if (typeof(c.args) == 'undefined') {
      if (typeof(c.value) == 'undefined') {
        if (n[i].name == t) {
          n[i] = v;
        }
      }
      else {
        while (typeof(c.value) != 'undefined') {
          if ((c.value.name == t) &
              (typeof(c.value.value)=='undefined')
          ) {
            c.value = v
          }
          else {
            c = c.value;
          }
        }
        if (typeof(c.args) != 'undefined') {
          assign(c.args, t, v);
        }
      }
    }
    else {
      assign(c.args, t, v);
    }
  }
}

reader.on('line', l => {
  if (l.length > 0) {
    try {
      let exp = l.replace(/@/gi, '__at__');
      exp = parseSIUnit(parseBin(parseHex(exp)));
      let buf = [];
      buf[0] = math.parse(exp);
      Object.entries(parser.scope).filter(e => !(e[1] instanceof Function)).forEach(e => {
        let v = e[1];
        if (typeof(v) == 'string') {
          v = math.parse(parseSIUnit(parseBin(parseHex(v))));
        }
        assign(buf, e[0], v);
      });
      let node = buf[0];
      if ((typeof(node.name)  != 'undefined') &
          (typeof(node.value) == 'undefined') &
          (typeof(node.fn)    == 'undefined')
      ) {
        reader.history.shift();
        execute(node.name.replace(/__at__/gi, '@'));
      }
      else {
        let result = node.compile().eval(parser.scope);
        if (typeof(result) == 'undefined') {
        }
        else if (typeof(result) == 'string') {
          console.log(result);
        }
        else {
          let v = node;
          while (typeof(v.value) != 'undefined') {
            v = v.value;
          }
          let k = node;
          while (typeof(k.value) != 'undefined') {
            if (typeof(k.name) != 'undefined') {
              parser.set(k.name, math.parse(v.toString()));
            }
            k = k.value;
          }
          console.log(truncate(math.round(result, 128).toString(), 80));
        }
        parser.set('__at__', node);
      }
    }
    catch(e)
    {
      if (e instanceof SyntaxError) {
        console.error('Invalid expression');
        console.error(`  ${colErrorFg}${l}${colResetFg}`);
      }
      else if (e instanceof TypeError) {
        console.error('Invalid expression');
        console.error(`  ${colErrorFg}${l}${colResetFg}`);
      }
      else if (e instanceof Error) {
        reader.history.shift();
      }
    }
  }
  if (process.stdin.isTTY) {
    reader.prompt();
  }
});

// disable Ctrl-C
reader.on('SIGINT', function () {
  reader.clearLine();
  console.log(`${colWarningFg}Use \`exit\` or \`quit\` to exit${colResetFg}`);
  if (process.stdin.isTTY) {
    reader.prompt();
  }
});
