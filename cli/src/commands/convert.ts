import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';

export function convertCommand(inputFile: string, outputFile?: string): void {
  if (!fs.existsSync(inputFile)) {
    console.error(chalk.red(`Input file not found: ${inputFile}`));
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, 'utf8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = yaml.parse(raw);
  }

  const outPath = outputFile || path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + '.alt.json');

  let resultCollection: any = null;

  // Check if Postman
  if (data.info && data.item) {
    console.log(chalk.cyan(`Detected Postman Collection format.`));
    resultCollection = {
      id: uuidv4(),
      name: data.info.name || 'Converted Collection',
      items: data.item.map((item: any) => ({
        id: uuidv4(),
        name: item.name || 'Request',
        method: item.request?.method || 'GET',
        url: typeof item.request?.url === 'string' ? item.request.url : (item.request?.url?.raw || 'http://localhost:4000'),
        headers: {},
        assertions: [
          { type: 'status_code', operator: 'less_than', value: 400 }
        ]
      }))
    };
  } else if (data.openapi || data.swagger) {
    console.log(chalk.cyan(`Detected OpenAPI/Swagger format.`));
    const items: any[] = [];
    for (const [p, ops] of Object.entries(data.paths || {})) {
      for (const [m, op] of Object.entries(ops as any)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(m.toLowerCase())) {
          items.push({
            id: uuidv4(),
            name: (op as any).summary || `${m.toUpperCase()} ${p}`,
            method: m.toUpperCase(),
            url: `{{baseUrl}}${p}`,
            assertions: [{ type: 'status_code', operator: 'less_than', value: 400 }]
          });
        }
      }
    }
    resultCollection = {
      id: uuidv4(),
      name: data.info?.title || 'OpenAPI Converted',
      items
    };
  } else {
    console.error(chalk.red('Unrecognized format. Must be Postman collection JSON or OpenAPI/Swagger JSON/YAML.'));
    process.exit(1);
  }

  fs.writeFileSync(outPath, JSON.stringify(resultCollection, null, 2));
  console.log(chalk.green(`✓ Successfully converted and saved to: ${chalk.bold(outPath)}`));
}
