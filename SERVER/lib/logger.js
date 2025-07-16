// לוגים, לוגים מבניים, לוג סיכום
import fs from 'node:fs';
import path from 'node:path';

const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const todayLog = path.join(logDir, `${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(todayLog, { flags: 'a' });

export function log(...args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

export function logStructured(level, event, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data
  };
  const line = JSON.stringify(logEntry) + '\n';
  process.stdout.write(line);
  logStream.write(line);
}

export function logQuerySummary(summary) {
  logStructured('summary', 'query_summary', summary);
} 