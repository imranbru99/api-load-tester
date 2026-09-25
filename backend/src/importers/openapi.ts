import { RequestItem, CollectionData } from '../engine/functionalRunner';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

export function importOpenApiSpec(specContent: string | object): CollectionData {
  let spec: any = specContent;
  if (typeof specContent === 'string') {
    try {
      spec = JSON.parse(specContent);
    } catch {
      spec = yaml.parse(specContent);
    }
  }

  const title = spec.info?.title || 'OpenAPI Test Suite';
  const baseUrl = (spec.servers && spec.servers[0]?.url) || '{{baseUrl}}';
  const items: RequestItem[] = [];

  const paths = spec.paths || {};
  for (const [pathKey, pathMethods] of Object.entries(paths)) {
    if (typeof pathMethods !== 'object' || pathMethods === null) continue;

    for (const [methodKey, op] of Object.entries(pathMethods as Record<string, any>)) {
      const method = methodKey.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(method)) continue;

      const summary = op.summary || `${method} ${pathKey}`;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      const params: Record<string, string> = {};

      // Parse parameters
      if (Array.isArray(op.parameters)) {
        for (const p of op.parameters) {
          if (p.in === 'query') {
            params[p.name] = p.example || p.schema?.default || 'test';
          } else if (p.in === 'header') {
            headers[p.name] = p.example || 'test';
          }
        }
      }

      // Generate sample JSON body if present
      let bodyConfig: RequestItem['body'] = undefined;
      const requestBody = op.requestBody?.content?.['application/json'];
      if (requestBody) {
        headers['Content-Type'] = 'application/json';
        const example = requestBody.example || generateSampleFromSchema(requestBody.schema);
        bodyConfig = { type: 'json', content: example };
      }

      // Convert path placeholders {id} to {{id}}
      const formattedPath = pathKey.replace(/\{([a-zA-Z0-9_]+)\}/g, '{{$1}}');
      const fullUrl = `${baseUrl.replace(/\/$/, '')}${formattedPath.startsWith('/') ? '' : '/'}${formattedPath}`;

      items.push({
        id: uuidv4(),
        name: summary,
        method,
        url: fullUrl,
        headers,
        params,
        body: bodyConfig,
        assertions: [
          { type: 'status_code', operator: 'less_than', value: 400, customMessage: 'Successful response (< 400)' },
          { type: 'response_time', value: 1500, customMessage: 'Response under 1500ms' }
        ],
      });
    }
  }

  return {
    id: uuidv4(),
    name: title,
    items,
  };
}

function generateSampleFromSchema(schema: any): any {
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'object') {
    const obj: Record<string, any> = {};
    if (schema.properties) {
      for (const [k, v] of Object.entries(schema.properties as Record<string, any>)) {
        obj[k] = generateSampleFromSchema(v);
      }
    }
    return obj;
  }
  if (schema.type === 'array') {
    return [generateSampleFromSchema(schema.items)];
  }
  if (schema.type === 'string') return schema.default || 'sample_text';
  if (schema.type === 'integer' || schema.type === 'number') return schema.default || 1;
  if (schema.type === 'boolean') return true;
  return {};
}
