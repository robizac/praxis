'use strict';

const { processDueReminders } = require('./reminders.job');

const intervalMs = process.env.REMINDER_WORKER_INTERVAL_MS || 30000;

async function loop() {
  try {
    const result = await processDueReminders();
    console.log(JSON.stringify({ time: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(JSON.stringify({ time: new Date().toISOString(), error: error.message }));
  }
}

function start() {
  console.log(`[reminder-worker] iniciado; intervalo ${intervalMs}ms`);
  loop();
  setInterval(loop, intervalMs);
}

if (require.main === module) {
  start();
}

module.exports = { start, loop };
