#!/usr/bin/env node

/**
 * DeepSeek MCP Bridge Startup Safety Checker
 * Prevents multiple instance conflicts and ensures clean startup
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const PID_FILE = '/tmp/deepseek-mcp-bridge.pid';
const LOG_FILE = '/tmp/deepseek-mcp-bridge-startup.log';

class StartupSafetyChecker {
  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    await fs.appendFile(LOG_FILE, logMessage).catch(() => {});
  }

  async checkExistingProcess() {
    try {
      // Check if PID file exists
      const pidContent = await fs.readFile(PID_FILE, 'utf8');
      const pid = parseInt(pidContent.trim());
      
      // Check if process is still running
      const { stdout } = await execAsync(`ps -p ${pid} -o pid= || true`);
      if (stdout.trim()) {
        return { exists: true, pid };
      } else {
        // PID file exists but process is dead, clean it up
        await fs.unlink(PID_FILE).catch(() => {});
        return { exists: false, pid: null };
      }
    } catch (error) {
      // PID file doesn't exist or is invalid
      return { exists: false, pid: null };
    }
  }

  async checkPortConflicts(ports = [3001, 8080]) {
    const conflicts = [];
    
    for (const port of ports) {
      try {
        const { stdout } = await execAsync(`ss -tulpn | grep :${port} || true`);
        if (stdout.trim()) {
          conflicts.push({ port, process: stdout.trim() });
        }
      } catch (error) {
        // Port check failed, assume it's free
      }
    }
    
    return conflicts;
  }

  async killConflictingProcesses() {
    try {
      // Kill any hanging Node.js processes running server.js (but be specific)
      const { stdout } = await execAsync(`ps aux | grep "node.*server.js" | grep deepseek | awk '{print $2}' || true`);
      const pids = stdout.split('\n').filter(pid => pid.trim() && !isNaN(pid.trim()));
      
      for (const pid of pids) {
        await this.log(`Killing existing DeepSeek server process: ${pid}`);
        await execAsync(`kill ${pid.trim()}`).catch(() => {});
      }
      
      return pids.length;
    } catch (error) {
      await this.log(`Error killing processes: ${error.message}`);
      return 0;
    }
  }

  async writePidFile(pid) {
    await fs.writeFile(PID_FILE, pid.toString());
    await this.log(`PID file written: ${PID_FILE} (PID: ${pid})`);
  }

  async cleanup() {
    await fs.unlink(PID_FILE).catch(() => {});
    await this.log('Cleanup complete');
  }

  async validateStartup() {
    await this.log('🔍 Starting DeepSeek MCP Bridge safety validation...');
    
    // 1. Check existing process
    const existing = await this.checkExistingProcess();
    if (existing.exists) {
      await this.log(`❌ DeepSeek server already running (PID: ${existing.pid})`);
      await this.log(`💡 Use 'kill ${existing.pid}' to stop existing server`);
      return false;
    }
    
    // 2. Check port conflicts
    const conflicts = await this.checkPortConflicts();
    if (conflicts.length > 0) {
      await this.log(`⚠️ Port conflicts detected:`);
      conflicts.forEach(conflict => {
        this.log(`   Port ${conflict.port}: ${conflict.process}`);
      });
      
      // Ask user if they want to kill conflicting processes
      await this.log(`🔧 Run with --force to automatically resolve conflicts`);
      return false;
    }
    
    // 3. All clear
    await this.log('✅ Startup safety validation passed');
    return true;
  }

  async forceCleanup() {
    await this.log('🧹 Force cleanup initiated...');
    
    // Kill existing processes
    const killedCount = await this.killConflictingProcesses();
    await this.log(`🔄 Killed ${killedCount} conflicting processes`);
    
    // Wait for processes to die
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Final validation
    const stillRunning = await this.checkExistingProcess();
    if (stillRunning.exists) {
      await this.log(`❌ Process ${stillRunning.pid} still running after cleanup`);
      return false;
    }
    
    await this.log('✅ Force cleanup completed');
    return true;
  }
}

// CLI interface
async function main() {
  const checker = new StartupSafetyChecker();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  
  try {
    if (force) {
      const success = await checker.forceCleanup();
      process.exit(success ? 0 : 1);
    } else {
      const isValid = await checker.validateStartup();
      process.exit(isValid ? 0 : 1);
    }
  } catch (error) {
    await checker.log(`💥 Startup safety check failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  const checker = new StartupSafetyChecker();
  await checker.cleanup();
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { StartupSafetyChecker };