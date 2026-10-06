import { startServer } from './app.js';

async function main(): Promise<void> {
  try {
    await startServer();
  } catch (err) {
    console.error('[fatal] Failed to start TradePro CRM:', err);
    process.exit(1);
  }
}

void main();