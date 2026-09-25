import axios, { AxiosRequestConfig, Method } from 'axios';
import { WebSocket } from 'ws';
import { executeSandboxScript } from './sandbox';
import { evaluateAssertions, AssertionRule, AssertionResult } from './assertions';

export interface RequestItem {
  id: string;
  name: string;
  protocol?: 'http' | 'graphql' | 'websocket';
  method: string;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'apikey' | 'jwt';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
    addTo?: 'header' | 'query';
  };
  body?: {
    type: 'none' | 'json' | 'form-data' | 'raw' | 'graphql';
    content?: any;
    graphql?: {
      query: string;
      variables?: Record<string, any>;
    };
  };
  preRequestScript?: string;
  postResponseScript?: string;
  assertions?: AssertionRule[];
  timeoutMs?: number;
}

export interface CollectionData {
  id: string;
  name: string;
  items: RequestItem[];
}

export interface StepResult {
  itemId: string;
  name: string;
  method: string;
  url: string;
  statusCode?: number;
  responseTimeMs: number;
  passed: boolean;
  assertions: AssertionResult[];
  logs: string[];
  responseHeaders?: Record<string, string>;
  responseBodyPreview?: string;
  error?: string;
  iteration: number;
}

export interface RunOptions {
  environment?: Record<string, any>;
  iterationData?: Record<string, any>[]; // Data-driven CSV / JSON rows
  parallel?: boolean;
  stopOnError?: boolean;
  timeoutMs?: number;
}

export interface FunctionalRunReport {
  runId: string;
  collectionName: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  success: boolean;
  results: StepResult[];
  environment: Record<string, any>;
}

// Variable interpolator for {{varName}}
export function interpolateVariables(template: any, env: Record<string, any>): any {
  if (template === null || template === undefined) return template;
  if (typeof template === 'string') {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
      return env[key] !== undefined ? String(env[key]) : `{{${key}}}`;
    });
  }
  if (Array.isArray(template)) {
    return template.map(item => interpolateVariables(item, env));
  }
  if (typeof template === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(template)) {
      res[k] = interpolateVariables(v, env);
    }
    return res;
  }
  return template;
}

export async function executeSingleStep(
  item: RequestItem,
  env: Record<string, any>,
  iteration: number = 1
): Promise<{ stepResult: StepResult; updatedEnv: Record<string, any> }> {
  let activeEnv = { ...env };
  const logs: string[] = [];
  const startTimestamp = Date.now();

  // 1. Run Pre-request Script
  if (item.preRequestScript) {
    const preRes = executeSandboxScript(item.preRequestScript, {
      environment: activeEnv,
      variables: {},
      request: {
        url: item.url,
        method: item.method,
        headers: item.headers || {},
        body: item.body?.content,
      },
    });
    activeEnv = { ...activeEnv, ...preRes.environmentUpdates };
    logs.push(...preRes.logs);
  }

  // 2. Interpolate URL, Headers, Params, Body with activeEnv
  const interpolatedUrl = interpolateVariables(item.url, activeEnv);
  const interpolatedHeaders: Record<string, string> = interpolateVariables(item.headers || {}, activeEnv);
  const interpolatedParams: Record<string, string> = interpolateVariables(item.params || {}, activeEnv);

  // Apply Auth
  if (item.auth) {
    if (item.auth.type === 'bearer' && item.auth.token) {
      const token = interpolateVariables(item.auth.token, activeEnv);
      interpolatedHeaders['Authorization'] = `Bearer ${token}`;
    } else if (item.auth.type === 'basic' && item.auth.username) {
      const u = interpolateVariables(item.auth.username, activeEnv);
      const p = interpolateVariables(item.auth.password || '', activeEnv);
      const b64 = Buffer.from(`${u}:${p}`).toString('base64');
      interpolatedHeaders['Authorization'] = `Basic ${b64}`;
    } else if (item.auth.type === 'apikey' && item.auth.key && item.auth.value) {
      const k = interpolateVariables(item.auth.key, activeEnv);
      const v = interpolateVariables(item.auth.value, activeEnv);
      if (item.auth.addTo === 'query') {
        interpolatedParams[k] = v;
      } else {
        interpolatedHeaders[k] = v;
      }
    }
  }

  // Check Protocol: WebSocket vs HTTP/GraphQL
  if (item.protocol === 'websocket' || interpolatedUrl.startsWith('ws://') || interpolatedUrl.startsWith('wss://')) {
    return runWebSocketStep(item, interpolatedUrl, activeEnv, logs, iteration, startTimestamp);
  }

  // Format Body
  let requestData: any = undefined;
  if (item.protocol === 'graphql' && item.body?.graphql) {
    interpolatedHeaders['Content-Type'] = 'application/json';
    requestData = {
      query: interpolateVariables(item.body.graphql.query, activeEnv),
      variables: interpolateVariables(item.body.graphql.variables || {}, activeEnv),
    };
  } else if (item.body && item.body.type !== 'none') {
    if (item.body.type === 'json') {
      interpolatedHeaders['Content-Type'] = interpolatedHeaders['Content-Type'] || 'application/json';
      requestData = interpolateVariables(item.body.content, activeEnv);
    } else {
      requestData = interpolateVariables(item.body.content, activeEnv);
    }
  }

  let statusCode = 0;
  let responseTimeMs = 0;
  let responseData: any = null;
  let rawBody = '';
  let responseHeaders: Record<string, string> = {};
  let reqError: string | undefined = undefined;

  try {
    const config: AxiosRequestConfig = {
      method: (item.method || 'GET') as Method,
      url: interpolatedUrl,
      headers: interpolatedHeaders,
      params: interpolatedParams,
      data: requestData,
      timeout: item.timeoutMs || 10000,
      validateStatus: () => true, // capture all status codes for assertions
      transformResponse: [(d) => d], // preserve raw string for regex assertions
    };

    const res = await axios(config);
    responseTimeMs = Date.now() - startTimestamp;
    statusCode = res.status;
    rawBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    responseHeaders = Object.fromEntries(
      Object.entries(res.headers).map(([k, v]) => [k, String(v)])
    );

    try {
      responseData = JSON.parse(rawBody);
    } catch {
      responseData = rawBody;
    }
  } catch (err: any) {
    responseTimeMs = Date.now() - startTimestamp;
    reqError = err.message || 'Request network failure';
  }

  // 3. Evaluate Rule-based Assertions
  const assertionResults: AssertionResult[] = [];
  if (item.assertions && item.assertions.length > 0) {
    const evalResults = evaluateAssertions(item.assertions, {
      statusCode,
      responseTimeMs,
      headers: responseHeaders,
      body: responseData,
      rawBody,
    });
    assertionResults.push(...evalResults);
  }

  // 4. Run Post-response Script
  if (item.postResponseScript) {
    const postRes = executeSandboxScript(item.postResponseScript, {
      environment: activeEnv,
      variables: {},
      request: {
        url: interpolatedUrl,
        method: item.method,
        headers: interpolatedHeaders,
        body: requestData,
      },
      response: {
        code: statusCode,
        status: statusCode,
        responseTime: responseTimeMs,
        headers: responseHeaders,
        body: responseData,
      },
    });

    activeEnv = { ...activeEnv, ...postRes.environmentUpdates };
    logs.push(...postRes.logs);
    if (postRes.assertions.length > 0) {
      assertionResults.push(...postRes.assertions);
    }
  }

  const allPassed = !reqError && assertionResults.every(a => a.passed);

  const stepResult: StepResult = {
    itemId: item.id,
    name: item.name,
    method: item.method,
    url: interpolatedUrl,
    statusCode,
    responseTimeMs,
    passed: allPassed,
    assertions: assertionResults,
    logs,
    responseHeaders,
    responseBodyPreview: rawBody.length > 500 ? rawBody.substring(0, 500) + '... (truncated)' : rawBody,
    error: reqError,
    iteration,
  };

  return { stepResult, updatedEnv: activeEnv };
}

// WebSocket Step Handler
async function runWebSocketStep(
  item: RequestItem,
  wsUrl: string,
  env: Record<string, any>,
  logs: string[],
  iteration: number,
  startTimestamp: number
): Promise<{ stepResult: StepResult; updatedEnv: Record<string, any> }> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (ws) ws.close();
      const res: StepResult = {
        itemId: item.id,
        name: item.name,
        method: 'WS',
        url: wsUrl,
        responseTimeMs: Date.now() - startTimestamp,
        passed: false,
        assertions: [{ name: 'WebSocket connection', passed: false, error: 'Connection timeout' }],
        logs: [...logs, 'WebSocket timed out'],
        iteration,
        error: 'Timeout connecting to WebSocket',
      };
      resolve({ stepResult: res, updatedEnv: env });
    }, item.timeoutMs || 5000);

    try {
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        if (item.body?.content) {
          const payload = typeof item.body.content === 'object' ? JSON.stringify(item.body.content) : item.body.content;
          ws?.send(payload);
          logs.push(`Sent WS payload: ${payload}`);
        }
      });

      ws.on('message', (data) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTimestamp;
        logs.push(`Received WS message: ${data.toString()}`);
        ws?.close();
        const res: StepResult = {
          itemId: item.id,
          name: item.name,
          method: 'WS',
          url: wsUrl,
          statusCode: 101,
          responseTimeMs: duration,
          passed: true,
          assertions: [{ name: 'WebSocket handshake', passed: true }],
          logs,
          responseBodyPreview: data.toString().substring(0, 500),
          iteration,
        };
        resolve({ stepResult: res, updatedEnv: env });
      });

      ws.on('error', (err) => {
        if (timedOut) return;
        clearTimeout(timeout);
        resolve({
          stepResult: {
            itemId: item.id,
            name: item.name,
            method: 'WS',
            url: wsUrl,
            responseTimeMs: Date.now() - startTimestamp,
            passed: false,
            assertions: [{ name: 'WebSocket connected', passed: false, error: err.message }],
            logs: [...logs, `WS error: ${err.message}`],
            error: err.message,
            iteration,
          },
          updatedEnv: env,
        });
      });
    } catch (e: any) {
      clearTimeout(timeout);
      resolve({
        stepResult: {
          itemId: item.id,
          name: item.name,
          method: 'WS',
          url: wsUrl,
          responseTimeMs: Date.now() - startTimestamp,
          passed: false,
          assertions: [{ name: 'WS Init', passed: false, error: e.message }],
          logs: [...logs, `WS Exception: ${e.message}`],
          error: e.message,
          iteration,
        },
        updatedEnv: env,
      });
    }
  });
}

// Complete Collection Runner
export async function runFunctionalCollection(
  collection: CollectionData,
  runId: string,
  options: RunOptions = {}
): Promise<FunctionalRunReport> {
  const startTime = Date.now();
  let currentEnv = { ...(options.environment || {}) };
  const allResults: StepResult[] = [];
  const iterations = options.iterationData && options.iterationData.length > 0 ? options.iterationData : [{}];

  for (let i = 0; i < iterations.length; i++) {
    const iterationRow = iterations[i];
    // Merge iteration row variables
    let iterEnv = { ...currentEnv, ...iterationRow };

    if (options.parallel) {
      // Parallel execution
      const promises = collection.items.map(item => executeSingleStep(item, iterEnv, i + 1));
      const stepOutputs = await Promise.all(promises);
      for (const output of stepOutputs) {
        allResults.push(output.stepResult);
      }
    } else {
      // Sequential execution with variable chaining
      for (const item of collection.items) {
        const { stepResult, updatedEnv } = await executeSingleStep(item, iterEnv, i + 1);
        allResults.push(stepResult);
        iterEnv = updatedEnv;
        currentEnv = { ...currentEnv, ...updatedEnv };

        if (options.stopOnError && !stepResult.passed) {
          break;
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const passedSteps = allResults.filter(r => r.passed).length;
  const failedSteps = allResults.length - passedSteps;

  let totalAssertions = 0;
  let passedAssertions = 0;
  for (const r of allResults) {
    totalAssertions += r.assertions.length;
    passedAssertions += r.assertions.filter(a => a.passed).length;
  }
  const failedAssertions = totalAssertions - passedAssertions;

  return {
    runId,
    collectionName: collection.name,
    totalSteps: allResults.length,
    passedSteps,
    failedSteps,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    durationMs,
    success: failedSteps === 0,
    results: allResults,
    environment: currentEnv,
  };
}
