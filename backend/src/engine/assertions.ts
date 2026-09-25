import Ajv from 'ajv';
import { JSONPath } from 'jsonpath-plus';

const ajv = new Ajv({ allErrors: true, strict: false });

export interface AssertionRule {
  type: 'status_code' | 'response_time' | 'json_schema' | 'jsonpath' | 'header' | 'body_regex' | 'body_contains';
  target?: string; // Header name, or JSONPath expression
  operator?: 'equals' | 'not_equals' | 'less_than' | 'greater_than' | 'contains' | 'not_contains' | 'matches' | 'exists';
  value?: any;
  customMessage?: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export interface EvaluationResponse {
  statusCode: number;
  responseTimeMs: number;
  headers: Record<string, string>;
  body: any;
  rawBody: string;
}

export function evaluateAssertions(
  rules: AssertionRule[],
  response: EvaluationResponse
): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const rule of rules) {
    const label = rule.customMessage || `${rule.type} ${rule.operator || ''} ${rule.value !== undefined ? JSON.stringify(rule.value) : ''}`;
    try {
      switch (rule.type) {
        case 'status_code': {
          const expected = Number(rule.value);
          const passed = rule.operator === 'less_than'
            ? response.statusCode < expected
            : rule.operator === 'not_equals'
            ? response.statusCode !== expected
            : response.statusCode === expected;
          results.push({
            name: label,
            passed,
            actual: response.statusCode,
            expected,
            error: passed ? undefined : `Status code was ${response.statusCode}, expected ${expected}`,
          });
          break;
        }

        case 'response_time': {
          const maxMs = Number(rule.value);
          const passed = response.responseTimeMs <= maxMs;
          results.push({
            name: label,
            passed,
            actual: response.responseTimeMs,
            expected: `<=${maxMs}ms`,
            error: passed ? undefined : `Response time ${response.responseTimeMs}ms exceeded threshold of ${maxMs}ms`,
          });
          break;
        }

        case 'header': {
          const headerKey = (rule.target || '').toLowerCase();
          // Find case-insensitive header
          const foundKey = Object.keys(response.headers).find(k => k.toLowerCase() === headerKey);
          const actualVal = foundKey ? response.headers[foundKey] : undefined;

          if (rule.operator === 'exists') {
            const passed = actualVal !== undefined;
            results.push({
              name: label,
              passed,
              actual: actualVal,
              expected: 'header exists',
              error: passed ? undefined : `Header '${rule.target}' was missing`,
            });
          } else if (rule.operator === 'contains') {
            const passed = Boolean(actualVal && actualVal.toLowerCase().includes(String(rule.value).toLowerCase()));
            results.push({
              name: label,
              passed,
              actual: actualVal,
              expected: `contains ${rule.value}`,
              error: passed ? undefined : `Header '${rule.target}' (${actualVal}) did not contain '${rule.value}'`,
            });
          } else {
            const passed = actualVal === String(rule.value);
            results.push({
              name: label,
              passed,
              actual: actualVal,
              expected: String(rule.value),
              error: passed ? undefined : `Header '${rule.target}' was '${actualVal}', expected '${rule.value}'`,
            });
          }
          break;
        }

        case 'json_schema': {
          let schemaObj = rule.value;
          if (typeof schemaObj === 'string') {
            try {
              schemaObj = JSON.parse(schemaObj);
            } catch (err: any) {
              results.push({
                name: label,
                passed: false,
                error: `Invalid JSON Schema provided: ${err.message}`,
              });
              break;
            }
          }
          const validate = ajv.compile(schemaObj);
          const valid = validate(response.body);
          results.push({
            name: label,
            passed: Boolean(valid),
            error: valid ? undefined : ajv.errorsText(validate.errors),
          });
          break;
        }

        case 'jsonpath': {
          const pathExpr = rule.target || '$';
          let extracted: any[] = [];
          try {
            extracted = JSONPath({ path: pathExpr, json: response.body });
          } catch (e: any) {
            results.push({
              name: label,
              passed: false,
              error: `Invalid JSONPath expression "${pathExpr}": ${e.message}`,
            });
            break;
          }

          if (rule.operator === 'exists') {
            const passed = extracted.length > 0;
            results.push({
              name: label,
              passed,
              actual: extracted.length,
              expected: 'exists',
              error: passed ? undefined : `Path ${pathExpr} not found in response`,
            });
          } else {
            const val = extracted[0];
            let passed = false;
            if (rule.operator === 'equals') passed = val == rule.value;
            else if (rule.operator === 'not_equals') passed = val != rule.value;
            else if (rule.operator === 'greater_than') passed = Number(val) > Number(rule.value);
            else if (rule.operator === 'less_than') passed = Number(val) < Number(rule.value);
            else if (rule.operator === 'contains') passed = String(val).includes(String(rule.value));

            results.push({
              name: label,
              passed,
              actual: val,
              expected: rule.value,
              error: passed ? undefined : `JSONPath ${pathExpr} evaluated to ${JSON.stringify(val)}, expected ${rule.operator} ${JSON.stringify(rule.value)}`,
            });
          }
          break;
        }

        case 'body_regex': {
          const regex = new RegExp(String(rule.value));
          const passed = regex.test(response.rawBody);
          results.push({
            name: label,
            passed,
            actual: response.rawBody.substring(0, 100),
            expected: `matches ${rule.value}`,
            error: passed ? undefined : `Body did not match regex ${rule.value}`,
          });
          break;
        }

        case 'body_contains': {
          const passed = response.rawBody.includes(String(rule.value));
          results.push({
            name: label,
            passed,
            expected: `contains ${rule.value}`,
            error: passed ? undefined : `Body did not contain text '${rule.value}'`,
          });
          break;
        }

        default:
          results.push({
            name: label,
            passed: true,
          });
      }
    } catch (err: any) {
      results.push({
        name: label,
        passed: false,
        error: `Assertion evaluation error: ${err.message}`,
      });
    }
  }

  return results;
}
