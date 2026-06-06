// Shared by the database setup scripts.
import readline from 'node:readline';

// Reads one line from the keyboard, printing * for each character, never the text itself.
// Falls back to a plain line read when stdin is not a terminal (for example a pipe).
export function askHidden(question) {
  process.stdout.write(question);
  const { stdin } = process;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
    });
  }
  return new Promise((resolve) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const ENTER = ['\r', '\n'];
    const CTRL_C = '\u0003';
    const BACKSPACE = ['\b', '\u007f'];
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ENTER.includes(ch)) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === CTRL_C) {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (BACKSPACE.includes(ch)) {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}
