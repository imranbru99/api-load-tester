import fs from 'fs';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';

export interface RunCliOptions {
  vus?: string;
  duration?: string;
  rps?: string;
  env?: string;
  thresholds?: string;
  reporters?: string;
  output?: string;
  api?: string;
}

export async function runCommand(fileOrUrl: string, options: RunCliOptions): Promise<void> {
  console.log(chalk.bold.cyan(`\n⚡ ALT (API Load Tester) Runner v1.0.0`));
  console.log(chalk.gray(`Target: ${fileOrUrl}`));

  let targetContent: any = null;

  // Check if file exists locally
  if (fs.existsSync(fileOrUrl)) {
    try {
      const raw = fs.readFileSync(fileOrUrl, 'utf8');
      targetContent = JSON.parse(raw);
    } catch (err: any) {
      console.error(chalk.red(`Error reading config file: ${err.message}`));
      process.exit(1);
    }
  } else if (fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://')) {
    // Direct URL load test target
    targetContent = {
      targetUrl: fileOrUrl,
      stages: [
        { duration: parseDuration(options.duration || '10s'), targetVUs: parseInt(options.vus || '10', 10) }
      ],
      maxRps: options.rps ? parseInt(options.rps, 10) : undefined
    };
  } else {
    console.error(chalk.red(`File or URL not found: ${fileOrUrl}`));
    process.exit(1);
  }

  // Load environment variables if provided
  let envVars: Record<string, any> = {};
  if (options.env) {
    if (fs.existsSync(options.env)) {
      try {
        const rawEnv = fs.readFileSync(options.env, 'utf8');
        envVars = JSON.parse(rawEnv);
      } catch (e: any) {
        console.warn(chalk.yellow(`Warning: Could not parse env file: ${e.message}`));
      }
    } else {
      try {
        envVars = JSON.parse(options.env);
      } catch {
        // ignore
      }
    }
  }

  // Parse thresholds if provided on CLI
  const thresholds: Array<{ metric: string; operator: string; value: number }> = [];
  if (options.thresholds) {
    // Example: "p95<500,error_rate<0.01"
    const parts = options.thresholds.split(',');
    for (const part of parts) {
      const match = part.match(/(p50|p90|p95|p99|error_rate|rps)\s*(<|<=|>|>=)\s*([0-9.]+)/);
      if (match) {
        thresholds.push({
          metric: match[1],
          operator: match[2],
          value: parseFloat(match[3])
        });
      }
    }
  }

  const isLoadTest = targetContent.targetUrl || options.vus || options.duration;

  if (isLoadTest) {
    await executeCliLoadTest(targetContent, options, thresholds);
  } else {
    await executeCliFunctionalTest(targetContent, envVars, options);
  }
}

async function executeCliLoadTest(config: any, options: RunCliOptions, cliThresholds: any[]) {
  const targetUrl = config.targetUrl || 'http://localhost:4000/health';
  const durationSec = config.stages?.[0]?.duration || parseDuration(options.duration || '10s');
  const vus = parseInt(options.vus || String(config.stages?.[0]?.targetVUs || 10), 10);
  const maxRps = options.rps ? parseInt(options.rps, 10) : config.maxRps;

  const mergedThresholds = cliThresholds.length > 0 ? cliThresholds : (config.thresholds || [
    { metric: 'p95', operator: '<', value: 2000 },
    { metric: 'error_rate', operator: '<', value: 0.05 }
  ]);

  console.log(chalk.yellow(`\n🚀 Initializing Load Test:`));
  console.log(`   - Target:     ${chalk.bold(targetUrl)}`);
  console.log(`   - VUs:        ${chalk.bold(vus)}`);
  console.log(`   - Duration:   ${chalk.bold(durationSec + 's')}`);
  if (maxRps) console.log(`   - RPS Limit:  ${chalk.bold(maxRps + ' req/s')}`);
  console.log(`   - Thresholds: ${mergedThresholds.map((t: any) => `${t.metric}${t.operator}${t.value}`).join(', ')}`);
  console.log(chalk.gray(`\nStreaming live performance metrics...`));

  const startTime = Date.now();
  let totalReqs = 0;
  let successReqs = 0;
  let failedReqs = 0;
  const latencies: number[] = [];

  let running = true;
  const endTimestamp = startTime + (durationSec * 1000);

  // Print header
  console.log(chalk.gray('─────────────────────────────────────────────────────────────────────────'));
  console.log(chalk.bold('Time     VUs   RPS    p50(ms)  p95(ms)  p99(ms)  Errors  Success%'));
  console.log(chalk.gray('─────────────────────────────────────────────────────────────────────────'));

  const interval = setInterval(async () => {
    const now = Date.now();
    if (now >= endTimestamp) {
      running = false;
      clearInterval(interval);
      return;
    }

    const elapsed = Math.round((now - startTime) / 1000);
    const waveSize = Math.max(1, Math.min(vus, 50));

    const batch = Array.from({ length: waveSize }).map(async () => {
      const t0 = Date.now();
      try {
        const res = await axios({
          url: targetUrl,
          method: config.method || 'GET',
          headers: config.headers,
          data: config.body,
          timeout: 4000,
          validateStatus: () => true
        });
        const lat = Date.now() - t0;
        latencies.push(lat);
        totalReqs++;
        if (res.status >= 200 && res.status < 400) successReqs++;
        else failedReqs++;
      } catch {
        totalReqs++;
        failedReqs++;
      }
    });

    await Promise.allSettled(batch);

    // Compute percentiles for recent window
    const recent = latencies.slice(-100).sort((a, b) => a - b);
    const p50 = recent[Math.floor(recent.length * 0.50)] || 0;
    const p95 = recent[Math.floor(recent.length * 0.95)] || 0;
    const p99 = recent[Math.floor(recent.length * 0.99)] || 0;
    const successRate = totalReqs > 0 ? ((successReqs / totalReqs) * 100).toFixed(1) : '100.0';

    const timeStr = `${elapsed}s`.padEnd(8);
    const vuStr = `${vus}`.padEnd(6);
    const rpsStr = `${waveSize}`.padEnd(7);
    const p50Str = `${p50}`.padEnd(9);
    const p95Str = `${p95}`.padEnd(9);
    const p99Str = `${p99}`.padEnd(9);
    const errStr = `${failedReqs}`.padEnd(8);
    const rateStr = `${successRate}%`;

    console.log(`${chalk.gray(timeStr)} ${vuStr} ${chalk.green(rpsStr)} ${p50Str} ${chalk.cyan(p95Str)} ${chalk.magenta(p99Str)} ${failedReqs > 0 ? chalk.red(errStr) : chalk.gray(errStr)} ${rateStr}`);
  }, 1000);

  // Wait for completion
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 200);
  });

  const totalDuration = Math.max(1, (Date.now() - startTime) / 1000);
  latencies.sort((a, b) => a - b);
  const finalP50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const finalP90 = latencies[Math.floor(latencies.length * 0.90)] || 0;
  const finalP95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const finalP99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avgRps = Math.round(totalReqs / totalDuration);
  const finalErrorRate = totalReqs > 0 ? failedReqs / totalReqs : 0;

  console.log(chalk.gray('─────────────────────────────────────────────────────────────────────────'));
  console.log(chalk.bold.green('\n📊 LOAD TEST SUMMARY'));
  console.log(`   Total Requests:     ${chalk.bold(totalReqs.toLocaleString())}`);
  console.log(`   Successful:         ${chalk.green(successReqs.toLocaleString())}`);
  console.log(`   Failed:             ${failedReqs > 0 ? chalk.red(failedReqs.toLocaleString()) : chalk.gray('0')}`);
  console.log(`   Average RPS:        ${chalk.bold(avgRps)} req/s`);
  console.log(`   p50 Latency:        ${finalP50} ms`);
  console.log(`   p90 Latency:        ${finalP90} ms`);
  console.log(`   p95 Latency:        ${chalk.cyan(finalP95)} ms`);
  console.log(`   p99 Latency:        ${chalk.magenta(finalP99)} ms`);
  console.log(`   Error Rate:         ${(finalErrorRate * 100).toFixed(2)} %`);

  // Check Thresholds
  let allPassed = true;
  console.log(chalk.bold('\n🚦 THRESHOLDS GATE EVALUATION'));
  for (const th of mergedThresholds) {
    let actual = 0;
    if (th.metric === 'p95') actual = finalP95;
    else if (th.metric === 'p99') actual = finalP99;
    else if (th.metric === 'p50') actual = finalP50;
    else if (th.metric === 'error_rate') actual = finalErrorRate;
    else if (th.metric === 'rps') actual = avgRps;

    let passed = false;
    if (th.operator === '<') passed = actual < th.value;
    else if (th.operator === '<=') passed = actual <= th.value;
    else if (th.operator === '>') passed = actual > th.value;
    else if (th.operator === '>=') passed = actual >= th.value;

    if (!passed) allPassed = false;
    const badge = passed ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
    console.log(`   ${badge} [${th.metric} ${th.operator} ${th.value}] (actual: ${actual})`);
  }

  // Handle Reporters
  if (options.reporters) {
    const outDir = options.output || './reports';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    if (options.reporters.includes('junit')) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Load Test" tests="${mergedThresholds.length}" failures="${allPassed ? 0 : 1}" time="${totalDuration.toFixed(2)}">
  <testsuite name="Thresholds" tests="${mergedThresholds.length}" failures="${allPassed ? 0 : 1}" time="${totalDuration.toFixed(2)}">
    ${mergedThresholds.map((t: any) => `<testcase name="${t.metric} ${t.operator} ${t.value}" time="${totalDuration.toFixed(2)}"/>`).join('\n')}
  </testsuite>
</testsuites>`;
      fs.writeFileSync(path.join(outDir, 'junit-load.xml'), xml);
      console.log(chalk.gray(`   Saved JUnit report to ${path.join(outDir, 'junit-load.xml')}`));
    }

    if (options.reporters.includes('json')) {
      const jsonReport = {
        totalRequests: totalReqs,
        successfulRequests: successReqs,
        failedRequests: failedReqs,
        avgRps,
        p50: finalP50,
        p95: finalP95,
        p99: finalP99,
        allPassed,
      };
      fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(jsonReport, null, 2));
      console.log(chalk.gray(`   Saved JSON report to ${path.join(outDir, 'report.json')}`));
    }
  }

  if (!allPassed) {
    console.log(chalk.red.bold('\n❌ Run failed: One or more threshold gates were violated.'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('\n✅ Run passed: All threshold gates satisfied!'));
    process.exit(0);
  }
}

async function executeCliFunctionalTest(collection: any, env: Record<string, any>, options: RunCliOptions) {
  console.log(chalk.yellow(`\n🧪 Running Functional Collection: ${chalk.bold(collection.name || 'Test Suite')}`));
  const items = collection.items || [];
  console.log(chalk.gray(`Found ${items.length} requests\n`));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const t0 = Date.now();
    try {
      const res = await axios({
        method: item.method || 'GET',
        url: item.url.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_: any, k: string) => env[k] || ''),
        headers: item.headers,
        data: item.body?.content,
        validateStatus: () => true,
        timeout: 5000
      });
      const duration = Date.now() - t0;
      const isOk = res.status < 400;
      if (isOk) {
        passed++;
        console.log(`   ${chalk.green('✓')} [${item.method}] ${item.name} - ${chalk.gray(res.status + ' (' + duration + 'ms)')}`);
      } else {
        failed++;
        console.log(`   ${chalk.red('✗')} [${item.method}] ${item.name} - ${chalk.red(res.status + ' (' + duration + 'ms)')}`);
      }
    } catch (err: any) {
      failed++;
      console.log(`   ${chalk.red('✗')} [${item.method}] ${item.name} - ${chalk.red(err.message)}`);
    }
  }

  console.log(chalk.bold(`\nCollection Results: ${passed} passed, ${failed} failed out of ${items.length}`));
  if (failed > 0) process.exit(1);
}

function parseDuration(durStr: string): number {
  const match = durStr.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 10;
  const val = parseInt(match[1], 10);
  const unit = match[2] || 's';
  if (unit === 'm') return val * 60;
  if (unit === 'h') return val * 3600;
  return val;
}
