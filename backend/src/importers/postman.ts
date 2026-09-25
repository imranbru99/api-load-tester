import { RequestItem, CollectionData } from '../engine/functionalRunner';
import { v4 as uuidv4 } from 'uuid';

export function importPostmanCollection(postmanJson: any): CollectionData {
  const collectionName = postmanJson.info?.name || 'Imported Postman Collection';
  const items: RequestItem[] = [];

  function parseItems(rawItems: any[]) {
    if (!Array.isArray(rawItems)) return;

    for (const raw of rawItems) {
      if (raw.item && Array.isArray(raw.item)) {
        // Nested folder
        parseItems(raw.item);
        continue;
      }

      if (!raw.request) continue;

      const req = raw.request;
      let urlStr = '';
      if (typeof req.url === 'string') {
        urlStr = req.url;
      } else if (req.url && req.url.raw) {
        urlStr = req.url.raw;
      }

      // Headers
      const headers: Record<string, string> = {};
      if (Array.isArray(req.header)) {
        for (const h of req.header) {
          if (!h.disabled && h.key) {
            headers[h.key] = h.value || '';
          }
        }
      }

      // Query params
      const params: Record<string, string> = {};
      if (req.url && Array.isArray(req.url.query)) {
        for (const q of req.url.query) {
          if (!q.disabled && q.key) {
            params[q.key] = q.value || '';
          }
        }
      }

      // Auth
      let authConfig: RequestItem['auth'] = undefined;
      if (req.auth) {
        if (req.auth.type === 'bearer' && req.auth.bearer) {
          const tokenObj = req.auth.bearer.find((b: any) => b.key === 'token');
          authConfig = { type: 'bearer', token: tokenObj ? tokenObj.value : '' };
        } else if (req.auth.type === 'basic' && req.auth.basic) {
          const userObj = req.auth.basic.find((b: any) => b.key === 'username');
          const passObj = req.auth.basic.find((b: any) => b.key === 'password');
          authConfig = {
            type: 'basic',
            username: userObj ? userObj.value : '',
            password: passObj ? passObj.value : '',
          };
        }
      }

      // Body
      let bodyConfig: RequestItem['body'] = undefined;
      if (req.body) {
        if (req.body.mode === 'raw') {
          try {
            const parsed = JSON.parse(req.body.raw);
            bodyConfig = { type: 'json', content: parsed };
          } catch {
            bodyConfig = { type: 'raw', content: req.body.raw };
          }
        } else if (req.body.mode === 'graphql') {
          bodyConfig = {
            type: 'graphql',
            graphql: {
              query: req.body.graphql?.query || '',
              variables: req.body.graphql?.variables ? JSON.parse(req.body.graphql.variables) : {},
            },
          };
        }
      }

      // Scripts & Events
      let preRequestScript = '';
      let postResponseScript = '';

      if (Array.isArray(raw.event)) {
        for (const evt of raw.event) {
          if (evt.listen === 'prerequest' && evt.script?.exec) {
            preRequestScript = Array.isArray(evt.script.exec) ? evt.script.exec.join('\n') : evt.script.exec;
          } else if (evt.listen === 'test' && evt.script?.exec) {
            postResponseScript = Array.isArray(evt.script.exec) ? evt.script.exec.join('\n') : evt.script.exec;
          }
        }
      }

      items.push({
        id: uuidv4(),
        name: raw.name || 'Unnamed Request',
        method: req.method || 'GET',
        url: urlStr,
        headers,
        params,
        auth: authConfig,
        body: bodyConfig,
        preRequestScript,
        postResponseScript,
        assertions: [
          { type: 'status_code', operator: 'less_than', value: 400, customMessage: 'Status code is successful (<400)' },
          { type: 'response_time', value: 2000, customMessage: 'Response time under 2000ms' }
        ],
      });
    }
  }

  parseItems(postmanJson.item || []);

  return {
    id: uuidv4(),
    name: collectionName,
    items,
  };
}
