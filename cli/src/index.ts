import { Command } from 'commander';
import { runCommand } from './commands/run';
import { convertCommand } from './commands/convert';

const program = new Command();

program
  .name('alt')
  .description('⚡ API Load Tester (ALT) - Postman + k6 + Grafana in one unified tool')
  .version('1.0.0');

program
  .command('run')
  .description('Run a functional test collection or high-scale load test')
  .argument('<fileOrUrl>', 'Path to collection.json, load-config.json, or target URL')
  .option('-u, --vus <number>', 'Number of virtual users (e.g., 1000)')
  .option('-d, --duration <time>', 'Duration of the test (e.g., 30s, 5m, 1h)')
  .option('-r, --rps <number>', 'RPS (Requests Per Second) throttle limit')
  .option('-e, --env <pathOrJson>', 'Path to environment JSON or inline JSON string')
  .option('-t, --thresholds <rules>', 'Threshold rules (e.g., "p95<500,error_rate<0.01")')
  .option('--reporters <types>', 'Reporters: junit,json,html (comma-separated)')
  .option('-o, --output <dir>', 'Directory to save output reports', './reports')
  .option('--api <url>', 'Connect to a remote API Load Tester backend cluster', 'http://localhost:4000')
  .action(async (fileOrUrl, options) => {
    await runCommand(fileOrUrl, options);
  });

program
  .command('convert')
  .description('Convert Postman or OpenAPI/Swagger specs to ALT collection format')
  .argument('<inputFile>', 'Path to Postman JSON or OpenAPI YAML/JSON')
  .argument('[outputFile]', 'Optional output path')
  .action((inputFile, outputFile) => {
    convertCommand(inputFile, outputFile);
  });

program.parse(process.argv);
