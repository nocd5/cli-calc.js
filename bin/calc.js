#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const mathjs = require('mathjs');
const keypress = require('keypress');
const clipboardy = require('clipboardy');
const readline = require('readline');

const colPromptBg = '\x1b[44m';
const colInfoBg = '\x1b[42m';
const colErrorFg = '\x1b[91m';
const colWarningFg = '\x1b[93m';
const colResetBg = '\x1b[49m';
const colResetFg = '\x1b[39m';

const math = mathjs.create(mathjs.all, { number: 'BigNumber', precision: 256 });
const parser = math.parser();

const reader = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Formatting functions
parser.set('hex', v => {
  let j = math.number(v);
  if (j < 0) {
    j += (1 << (math.ceil((math.log2(-j) + 1) / 4) * 4));
  }
  return `0x${math.number(j).toString(16).toUpperCase()}`;
});
parser.set('bin', v => {
  let j = math.number(v);
  if (j < 0) {
    j += (1 << (math.ceil((math.log2(-j) + 1) / 4) * 4));
  }
  return `0b${math.number(j).toString(2)}`;
});
parser.set('eng', v => math.format(v, { notation: 'engineering' }));
parser.set('fix', v => math.format(v, { notation: 'fixed' }));
parser.set('_exp', v => math.format(v, { notation: 'exponential' }));

// Ignore formatting function rules
const rules = [
  'hex(n)->n',
  'bin(n)->n',
  'eng(n)->n',
  'fix(n)->n',
  '_exp(n)->n'
];

const parseHex = s => {
  (s.match(/\b0x[\.0-9A-F_]+\b/gi) || []).forEach(m => {
    let p = m.match(/\./g);
    if (p != null && p.length > 1) throw new SyntaxError;

    let w = 0;
    p = m.match(/\./);
    if (p != null) {
      w = (m.length - p.index - 1) * 4;
    }
    s = s.replace(m, e => math.divide(math.bignumber(e.replace(/\./, '').replace(/_/g, '')), math.bignumber(2).pow(w)));
  });
  return s;
};
const parseBin = s => {
  (s.match(/\b0b[\.01_]+\b/g) || []).forEach(m => {
    let p = m.match(/\./g);
    if (p != null && p.length > 1) throw new SyntaxError;

    let w = 0;
    p = m.match(/\./);
    if (p != null) {
      w = m.length - p.index - 1;
    }
    s = s.replace(m, e => math.divide(math.bignumber(e.replace(/\./, '').replace(/_/g, '')), math.bignumber(2).pow(w)));
  });
  return s;
};
const parseSIUnit = s => s
  .replace(/([0-9]*\.?[0-9]+)k\b/gi, '$1e3')
  .replace(/([0-9]*\.?[0-9]+)m\b/gi, '$1e6')
  .replace(/([0-9]*\.?[0-9]+)g\b/gi, '$1e9')
  .replace(/([0-9]*\.?[0-9]+)t\b/gi, '$1e12')
  .replace(/([0-9]*\.?[0-9]+)p\b/gi, '$1e15')
  .replace(/([0-9]*\.?[0-9]+)ee\b/gi, '$1e18')
  .replace(/([0-9]*\.?[0-9]+)z\b/gi, '$1e21')
  .replace(/([0-9]*\.?[0-9]+)y\b/gi, '$1e24')
  .replace(/([0-9]*\.?[0-9]+)mm\b/gi, '$1e-3')
  .replace(/([0-9]*\.?[0-9]+)uu\b/gi, '$1e-6')
  .replace(/([0-9]*\.?[0-9]+)nn\b/gi, '$1e-9')
  .replace(/([0-9]*\.?[0-9]+)pp\b/gi, '$1e-12')
  .replace(/([0-9]*\.?[0-9]+)ff\b/gi, '$1e-15')
  .replace(/([0-9]*\.?[0-9]+)aa\b/gi, '$1e-18')
  .replace(/([0-9]*\.?[0-9]+)zz\b/gi, '$1e-21')
  .replace(/([0-9]*\.?[0-9]+)yy\b/gi, '$1e-24');

// initialize
if (process.stdin.isTTY) {
  // title
  process.stdout.write('\x1b]0;Calc\x07');
  // prompt
  reader.setPrompt(`${colPromptBg} Calc ${colResetBg} > `);
  reader.prompt();
  // history
  const home = process.env[process.platform == 'win32' ? 'USERPROFILE' : 'HOME'];
  const HistoryFile = path.join(home, '.calc.history');
  try {
    reader.history = JSON.parse(fs.readFileSync(HistoryFile));
  }
  catch (e) { }
  reader.on('close', () => {
    fs.writeFileSync(HistoryFile, JSON.stringify(reader.history, null, '  '));
    process.exit(0);
  });

  // disable Ctrl-C
  reader.on('SIGINT', () => {});

  // Clipboard
  // Ctrl-C : Copy last result to the clipboard
  // Ctrl-V : Paste from the clipboard
  keypress(process.stdin);
  process.stdin.on('keypress', (ch, key) => {
    if (key && key.ctrl) {
      switch (key.name) {
        case 'c':
          let at = parser.scope['__at__']
          if (at != null) {
            let last = evaluate(at);
            clipboardy.write(last);
            setTimeout(() => {
              const pos = reader.cursor;
              reader.prompt();
              for (let i = 0; i < pos; i++) {
                reader.write(null, { name: 'right' });
              }
            }, 1000);
            process.stdout.write(`\x1b[0G${' '.repeat(process.stdout.columns)}`);
            process.stdout.write(`\x1b[0G${colInfoBg} Copy ${colResetBg} < ${truncate(last, 80)}`);
          }
          break;
        case 'v':
          let cb = '';
          try {
            cb = clipboardy.readSync();
          }
          catch {}
          finally {
            reader.write(cb);
          }
          break;
      }
    }
  });
  process.stdin.setRawMode(true);
  process.stdin.resume();
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
};

const execute = cmd => {
  let buf = {};
  let keys = Object.keys(parser.scope);
  keys.forEach(k => buf[k] = parser.scope[k]);
  switch (cmd) {
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
      buf['@'] = buf['__at__'];
      delete(buf['__at__']);
      keys.filter(k => !(buf[k] instanceof Function)).forEach(k => {
        if (typeof(buf[k]) != 'undefined') {
          console.log(`${k}: ${truncate(buf[k].toString(), 80)}`);
        }
      });
      break;
    case 'la':
      console.log(buf);
      break;
    case 'func':
      keys.filter(k => (buf[k] instanceof Function) && (buf[k].syntax == null))
          .forEach(k => console.log(`${k} = ${buf[k].toString()}\n`));
      const udf = keys.filter(k => (buf[k] instanceof Function) && (buf[k].syntax != null));
      if (udf.length > 0) {
        console.log('User Defined Function:\n');
        udf.forEach(k => console.log(`${buf[k].source}\n`));
      }
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
};

const assign = (n, t, v) => {
  for (let i = 0; i < n.length; i++) {
    let c = n[i].getContent();
    if (typeof(c.args) == 'undefined') {
      if (typeof(c.value) == 'undefined') {
        if (n[i].name == t) {
          n[i] = v;
        }
      }
      else {
        while (typeof(c.value) != 'undefined') {
          if ((c.value.name == t) && (typeof(c.value.value) == 'undefined')) {
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
};

const evaluate = n => {
  let result = null;
  if (n.args != null) {
    n.args = n.args.map(e => math.simplify(e, rules));
  }
  let evaled = n.evaluate(parser.scope);
  switch (typeof(evaled)) {
    case 'object':
      let v = n;
      while (typeof(v.value) != 'undefined') {
        v = v.value;
      }
      let k = n;
      while (typeof(k.value) != 'undefined') {
        if (typeof(k.name) != 'undefined') {
          parser.set(k.name, math.parse(v.toString()));
        }
        k = k.value;
      }
      if (evaled instanceof mathjs.BigNumber) {
        result = math.round(evaled, 128).toString();
      }
      else if (evaled instanceof math.Matrix) {
        result = evaled.toString();
      }
      else {
        result = evaled;
      }
      let s = math.simplify(n, rules);
      if (s.value instanceof math.Node) {
        parser.set('__at__', s.value);
      }
      else {
        parser.set('__at__', s);
      }
      break;
    case 'string':
      result = evaled;
      parser.set('__at__', math.simplify(n, rules));
      break;
    case 'number':
      result = evaled.toString();
      parser.set('__at__', math.simplify(n, rules));
      break;
    case 'function':
      result = n.toString();
      parser.scope[n.name].source = n.toString();
      break;
    case 'boolean':
      result = evaled.toString();
      break;
  }
  return result;
};

reader.on('line', l => {
  if (l.length > 0) {
    try {
      let exp = l.replace(/@/gi, '__at__');

      if (parser.scope['__at__'] != null) {
        // regexp error occur if top of list is '+'
        if (exp.match(/^(?:[-+\*\/\^\|&]|(?:<<)|(?:>>))/)) {
          exp = '__at__' + exp;
        }
      }

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

      if (node.name == '__at__' && node.value != null) {
        if (node instanceof math.Node) {
          throw new Error('Can not overwrite \'@\'');
        }
      }
      if (parser.scope['__at__'] == null && exp.includes('__at__')) {
        throw new Error('\'@\' is empty yet');
      }

      if (Object.keys(node).toString() == ['name', 'comment'].toString()) {
        reader.history.shift();
        execute(l);
      }
      else {
        console.log(truncate(evaluate(node), 80));
      }
    }
    catch (e) {
      if (e instanceof SyntaxError) {
        console.error('Invalid expression');
      }
      else if (e instanceof TypeError) {
        console.error('Invalid expression');
      }
      else if (e instanceof Error) {
        console.error(e.message);
      }
      console.error(`  ${colErrorFg}${l}${colResetFg}`);
    }
  }
  if (process.stdin.isTTY) {
    reader.prompt();
  }
});

