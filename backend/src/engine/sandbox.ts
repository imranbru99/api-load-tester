import vm from 'vm';

export interface ScriptExecutionResult {
  success: boolean;
  environmentUpdates: Record<string, any>;
  variableUpdates: Record<string, any>;
  assertions: Array<{ name: string; passed: boolean; error?: string }>;
  logs: string[];
  error?: string;
}

export interface ScriptContext {
  environment: Record<string, any>;
  variables: Record<string, any>;
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  };
  response?: {
    code: number;
    status: number;
    statusText?: string;
    headers: Record<string, string>;
    body: any;
    responseTime: number;
  };
}

export function executeSandboxScript(
  scriptCode: string,
  context: ScriptContext,
  timeoutMs: number = 2000
): ScriptExecutionResult {
  const envCopy = { ...context.environment };
  const varsCopy = { ...context.variables };
  const assertions: Array<{ name: string; passed: boolean; error?: string }> = [];
  const logs: string[] = [];

  if (!scriptCode || !scriptCode.trim()) {
    return {
      success: true,
      environmentUpdates: envCopy,
      variableUpdates: varsCopy,
      assertions,
      logs,
    };
  }

  // Build Assertion helper: pm.expect(actual)
  const createExpect = (actual: any, isNot: boolean = false): any => {
    const check = (condition: boolean, msg: string) => {
      const finalCondition = isNot ? !condition : condition;
      if (!finalCondition) {
        throw new Error(msg);
      }
    };

    const handler: any = {
      to: {},
      get not() {
        return createExpect(actual, !isNot);
      },
      equal(expected: any) {
        check(actual === expected, `Expected ${JSON.stringify(actual)} ${isNot ? 'not to equal' : 'to equal'} ${JSON.stringify(expected)}`);
      },
      eql(expected: any) {
        check(
          JSON.stringify(actual) === JSON.stringify(expected),
          `Expected ${JSON.stringify(actual)} ${isNot ? 'not to deeply equal' : 'to deeply equal'} ${JSON.stringify(expected)}`
        );
      },
      be: {
        below(val: number) {
          check(Number(actual) < val, `Expected ${actual} ${isNot ? 'not to be below' : 'to be below'} ${val}`);
        },
        above(val: number) {
          check(Number(actual) > val, `Expected ${actual} ${isNot ? 'not to be above' : 'to be above'} ${val}`);
        },
        oneOf(arr: any[]) {
          check(arr.includes(actual), `Expected ${actual} ${isNot ? 'not to be in' : 'to be one of'} [${arr.join(', ')}]`);
        },
        a(type: string) {
          check(typeof actual === type, `Expected ${actual} ${isNot ? 'not to be a' : 'to be a'} ${type}`);
        },
        an(type: string) {
          check(typeof actual === type, `Expected ${actual} ${isNot ? 'not to be an' : 'to be an'} ${type}`);
        },
        ok() {
          check(Boolean(actual), `Expected ${actual} ${isNot ? 'not to be truthy' : 'to be truthy'}`);
        },
        true() {
          check(actual === true, `Expected ${actual} to be true`);
        },
        false() {
          check(actual === false, `Expected ${actual} to be false`);
        },
        null() {
          check(actual === null, `Expected ${actual} to be null`);
        }
      },
      have: {
        property(prop: string, val?: any) {
          const hasProp = actual && typeof actual === 'object' && prop in actual;
          if (val !== undefined) {
            check(hasProp && actual[prop] === val, `Expected property "${prop}" ${isNot ? 'not to equal' : 'to equal'} ${val}`);
          } else {
            check(hasProp, `Expected object ${isNot ? 'not to have property' : 'to have property'} "${prop}"`);
          }
        },
        length(len: number) {
          check(actual && actual.length === len, `Expected length ${actual?.length} to equal ${len}`);
        }
      },
      include(item: any) {
        if (typeof actual === 'string' || Array.isArray(actual)) {
          check(actual.includes(item), `Expected ${JSON.stringify(actual)} ${isNot ? 'not to include' : 'to include'} ${JSON.stringify(item)}`);
        } else if (actual && typeof actual === 'object') {
          check(item in actual, `Expected object ${isNot ? 'not to include key' : 'to include key'} ${item}`);
        }
      },
      match(regex: RegExp) {
        check(regex.test(String(actual)), `Expected "${actual}" ${isNot ? 'not to match' : 'to match'} ${regex}`);
      }
    };

    handler.to = handler;
    return handler;
  };

  // Build pm object
  const pm = {
    environment: {
      get: (k: string) => envCopy[k],
      set: (k: string, v: any) => { envCopy[k] = v; },
      has: (k: string) => k in envCopy,
      unset: (k: string) => { delete envCopy[k]; },
      toObject: () => ({ ...envCopy }),
    },
    variables: {
      get: (k: string) => varsCopy[k] !== undefined ? varsCopy[k] : envCopy[k],
      set: (k: string, v: any) => { varsCopy[k] = v; },
      has: (k: string) => k in varsCopy || k in envCopy,
    },
    test: (name: string, fn: () => void) => {
      try {
        fn();
        assertions.push({ name, passed: true });
      } catch (err: any) {
        assertions.push({ name, passed: false, error: err.message || String(err) });
      }
    },
    expect: createExpect,
    request: context.request || {},
    response: {
      code: context.response?.code ?? 200,
      status: context.response?.code ?? 200,
      responseTime: context.response?.responseTime ?? 0,
      headers: context.response?.headers ?? {},
      json: () => {
        if (!context.response?.body) return {};
        if (typeof context.response.body === 'object') return context.response.body;
        return JSON.parse(context.response.body);
      },
      text: () => {
        if (typeof context.response?.body === 'string') return context.response.body;
        return JSON.stringify(context.response?.body ?? '');
      },
    },
  };

  // Sandbox global objects
  const sandbox = {
    pm,
    console: {
      log: (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    },
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
    atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
  };

  const vmContext = vm.createContext(sandbox);

  try {
    const script = new vm.Script(scriptCode, {
      filename: 'test-script.js',
    });
    script.runInContext(vmContext, { timeout: timeoutMs });
    return {
      success: true,
      environmentUpdates: envCopy,
      variableUpdates: varsCopy,
      assertions,
      logs,
    };
  } catch (err: any) {
    logs.push(`[Script Runtime Error] ${err.message}`);
    return {
      success: false,
      environmentUpdates: envCopy,
      variableUpdates: varsCopy,
      assertions,
      logs,
      error: err.message,
    };
  }
}
