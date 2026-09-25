export function generateJUnitXml(runData: any): string {
  const isLoad = runData.type === 'load';
  const name = escapeXml(runData.name || 'Test Run');
  const durationSec = ((new Date(runData.completed_at || Date.now()).getTime() - new Date(runData.started_at).getTime()) / 1000) || 1;

  if (isLoad) {
    const summary = runData.summary || {};
    const thresholdResults: any[] = summary.thresholdResults || [];
    const failures = thresholdResults.filter(t => !t.passed).length;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites name="${name}" tests="${Math.max(1, thresholdResults.length)}" failures="${failures}" errors="0" time="${durationSec.toFixed(2)}">\n`;
    xml += `  <testsuite name="Load Test Thresholds" tests="${thresholdResults.length}" failures="${failures}" errors="0" time="${durationSec.toFixed(2)}">\n`;

    for (const t of thresholdResults) {
      xml += `    <testcase name="Threshold: ${t.rule.metric} ${t.rule.operator} ${t.rule.value}" time="${(durationSec / Math.max(1, thresholdResults.length)).toFixed(2)}">\n`;
      if (!t.passed) {
        xml += `      <failure message="Threshold violated: actual value was ${t.actual}">${t.rule.metric} exceeded configured limit ${t.rule.value}</failure>\n`;
      }
      xml += `    </testcase>\n`;
    }

    if (thresholdResults.length === 0) {
      xml += `    <testcase name="Total Requests Run (${summary.totalRequests || 0})" time="${durationSec.toFixed(2)}"/>\n`;
    }

    xml += `  </testsuite>\n</testsuites>`;
    return xml;
  }

  // Functional test items
  const results = runData.results || [];
  const failures = results.filter((r: any) => !r.passed).length;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="${name}" tests="${results.length}" failures="${failures}" errors="0" time="${durationSec.toFixed(2)}">\n`;
  xml += `  <testsuite name="${name}" tests="${results.length}" failures="${failures}" errors="0" time="${durationSec.toFixed(2)}">\n`;

  for (const r of results) {
    const stepDuration = ((r.responseTimeMs || 0) / 1000).toFixed(3);
    xml += `    <testcase name="${escapeXml(r.name)}" classname="${escapeXml(r.method)} ${escapeXml(r.url)}" time="${stepDuration}">\n`;
    if (!r.passed) {
      const err = escapeXml(r.error || (r.assertions && r.assertions.find((a: any) => !a.passed)?.error) || 'Test failed');
      xml += `      <failure message="${err}">${err}</failure>\n`;
    }
    xml += `    </testcase>\n`;
  }

  xml += `  </testsuite>\n</testsuites>`;
  return xml;
}

export function generateHtmlReport(runData: any): string {
  const isLoad = runData.type === 'load';
  const name = escapeHtml(runData.name || 'Test Report');
  const summary = runData.summary || {};
  const status = runData.status || 'completed';
  const passed = status === 'completed' && (runData.threshold_passed !== false);
  const statusColor = passed ? '#10b981' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Load Tester Report: ${name}</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #3b82f6;
      --success: #10b981;
      --danger: #ef4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    .badge { padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px; text-transform: uppercase; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .metric-title { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .metric-value { font-size: 32px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; background: var(--card); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
    th, td { text-align: left; padding: 14px 18px; border-bottom: 1px solid var(--border); font-size: 14px; }
    th { background: #172033; color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 12px; }
    .tag { font-family: monospace; font-size: 12px; padding: 2px 6px; border-radius: 4px; background: #1f2937; }
    .print-btn { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    @media print { .print-btn { display: none; } body { background: #fff; color: #000; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 style="margin: 0; font-size: 26px;">${name}</h1>
        <div style="color: var(--muted); margin-top: 6px; font-size: 14px;">
          Type: <b style="color: #60a5fa;">${runData.type || 'load'}</b> &bull;
          Run ID: <code>${runData.id || ''}</code> &bull;
          Date: ${new Date(runData.started_at || Date.now()).toLocaleString()}
        </div>
      </div>
      <div>
        <span class="badge">${status}</span>
        <button class="print-btn" onclick="window.print()" style="margin-left: 12px;">Print / PDF</button>
      </div>
    </div>

    ${isLoad ? `
    <div class="grid">
      <div class="card">
        <div class="metric-title">Total Requests</div>
        <div class="metric-value">${(summary.totalRequests || 0).toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="metric-title">Avg / Peak RPS</div>
        <div class="metric-value">${summary.avgRps || 0} / <span style="font-size: 22px; color: var(--muted);">${summary.peakRps || 0}</span></div>
      </div>
      <div class="card">
        <div class="metric-title">Latency (p95 / p99)</div>
        <div class="metric-value" style="color: ${summary.p95Ms > 1000 ? 'var(--danger)' : 'var(--text)'};">${summary.p95Ms || 0}ms / <span style="font-size: 22px; color: var(--muted);">${summary.p99Ms || 0}ms</span></div>
      </div>
      <div class="card">
        <div class="metric-title">Error Rate</div>
        <div class="metric-value" style="color: ${(summary.errorRatePercent || 0) > 1 ? 'var(--danger)' : 'var(--success)'};">${summary.errorRatePercent || 0}%</div>
      </div>
    </div>

    <h3>Thresholds Gate Evaluation</h3>
    <table>
      <thead>
        <tr><th>Metric</th><th>Condition</th><th>Actual Value</th><th>Result</th></tr>
      </thead>
      <tbody>
        ${(summary.thresholdResults || []).map((t: any) => `
          <tr>
            <td><b>${t.rule.metric}</b></td>
            <td>${t.rule.operator} ${t.rule.value}</td>
            <td>${t.actual}</td>
            <td style="color: ${t.passed ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">
              ${t.passed ? 'PASSED' : 'FAILED'}
            </td>
          </tr>
        `).join('')}
        ${(!summary.thresholdResults || summary.thresholdResults.length === 0) ? `<tr><td colspan="4" style="text-align: center; color: var(--muted);">No custom threshold gates specified.</td></tr>` : ''}
      </tbody>
    </table>
    ` : `
    <div class="grid">
      <div class="card">
        <div class="metric-title">Total Steps</div>
        <div class="metric-value">${runData.totalSteps || 0}</div>
      </div>
      <div class="card">
        <div class="metric-title">Passed / Failed</div>
        <div class="metric-value"><span style="color: var(--success);">${runData.passedSteps || 0}</span> / <span style="color: var(--danger);">${runData.failedSteps || 0}</span></div>
      </div>
      <div class="card">
        <div class="metric-title">Assertions Passed</div>
        <div class="metric-value">${runData.passedAssertions || 0} / ${runData.totalAssertions || 0}</div>
      </div>
      <div class="card">
        <div class="metric-title">Duration</div>
        <div class="metric-value">${((runData.durationMs || 0) / 1000).toFixed(2)}s</div>
      </div>
    </div>

    <h3>Test Execution Steps</h3>
    <table>
      <thead>
        <tr><th>Method</th><th>Name & URL</th><th>Status Code</th><th>Latency</th><th>Assertions</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${(runData.results || []).map((r: any) => `
          <tr>
            <td><span class="tag">${r.method}</span></td>
            <td><b>${escapeHtml(r.name)}</b><br><small style="color: var(--muted);">${escapeHtml(r.url)}</small></td>
            <td><code>${r.statusCode || 'N/A'}</code></td>
            <td>${r.responseTimeMs || 0}ms</td>
            <td>${r.assertions?.filter((a: any) => a.passed).length || 0}/${r.assertions?.length || 0}</td>
            <td style="color: ${r.passed ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${r.passed ? 'PASS' : 'FAIL'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    `}
  </div>
</body>
</html>`;
}

function escapeXml(str: string): string {
  return String(str).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
