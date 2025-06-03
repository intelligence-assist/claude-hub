#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Coverage data from the test output
const coverageData = {
  'src/index.ts': { statements: 92.64, branches: 78.94, functions: 85.71, lines: 92.64 },
  'src/controllers/githubController.ts': { statements: 69.65, branches: 64.47, functions: 84.61, lines: 69.2 },
  'src/core/webhook/WebhookProcessor.ts': { statements: 100, branches: 92.3, functions: 100, lines: 100 },
  'src/core/webhook/WebhookRegistry.ts': { statements: 97.77, branches: 100, functions: 100, lines: 97.67 },
  'src/core/webhook/constants.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'src/core/webhook/index.ts': { statements: 0, branches: 100, functions: 0, lines: 0 },
  'src/providers/claude/ClaudeWebhookProvider.ts': { statements: 77.41, branches: 46.66, functions: 100, lines: 77.41 },
  'src/providers/claude/index.ts': { statements: 100, branches: 100, functions: 0, lines: 100 },
  'src/providers/claude/handlers/OrchestrationHandler.ts': { statements: 95.65, branches: 75, functions: 100, lines: 95.65 },
  'src/providers/claude/handlers/SessionHandler.ts': { statements: 96.66, branches: 89.28, functions: 100, lines: 96.66 },
  'src/providers/claude/services/SessionManager.ts': { statements: 6.06, branches: 0, functions: 0, lines: 6.06 },
  'src/providers/claude/services/TaskDecomposer.ts': { statements: 96.87, branches: 93.75, functions: 100, lines: 96.66 },
  'src/providers/github/GitHubWebhookProvider.ts': { statements: 95.45, branches: 90.62, functions: 100, lines: 95.45 },
  'src/providers/github/index.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'src/providers/github/handlers/IssueHandler.ts': { statements: 30.43, branches: 0, functions: 0, lines: 30.43 },
  'src/routes/github.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'src/routes/webhooks.ts': { statements: 92.1, branches: 100, functions: 57.14, lines: 91.66 },
  'src/services/claudeService.ts': { statements: 85.62, branches: 66.17, functions: 100, lines: 86.66 },
  'src/services/githubService.ts': { statements: 72.22, branches: 78.57, functions: 75, lines: 71.93 },
  'src/types/claude.ts': { statements: 0, branches: 100, functions: 100, lines: 0 },
  'src/types/environment.ts': { statements: 0, branches: 0, functions: 0, lines: 0 },
  'src/types/index.ts': { statements: 0, branches: 0, functions: 0, lines: 0 },
  'src/utils/awsCredentialProvider.ts': { statements: 65.68, branches: 59.25, functions: 54.54, lines: 65.68 },
  'src/utils/logger.ts': { statements: 51.61, branches: 47.36, functions: 100, lines: 51.72 },
  'src/utils/sanitize.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'src/utils/secureCredentials.ts': { statements: 54.28, branches: 70.58, functions: 33.33, lines: 54.28 },
  'src/utils/startup-metrics.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
};

// Calculate different scenarios
console.log('\n=== Coverage Analysis - Matching Codecov ===\n');

// Scenario 1: Exclude type definition files
const withoutTypes = Object.entries(coverageData)
  .filter(([file]) => !file.includes('/types/'))
  .reduce((acc, [file, data]) => {
    acc[file] = data;
    return acc;
  }, {});

const avgWithoutTypes = calculateAverage(withoutTypes);
console.log(`1. Without type files: ${avgWithoutTypes.toFixed(2)}%`);

// Scenario 2: Exclude files with 0% coverage
const withoutZeroCoverage = Object.entries(coverageData)
  .filter(([file, data]) => data.lines > 0)
  .reduce((acc, [file, data]) => {
    acc[file] = data;
    return acc;
  }, {});

const avgWithoutZero = calculateAverage(withoutZeroCoverage);
console.log(`2. Without 0% coverage files: ${avgWithoutZero.toFixed(2)}%`);

// Scenario 3: Exclude specific low coverage files
const excludeLowCoverage = Object.entries(coverageData)
  .filter(([file]) => {
    return !file.includes('/types/') && 
           !file.includes('SessionManager.ts') &&
           !file.includes('IssueHandler.ts');
  })
  .reduce((acc, [file, data]) => {
    acc[file] = data;
    return acc;
  }, {});

const avgExcludeLow = calculateAverage(excludeLowCoverage);
console.log(`3. Without types, SessionManager, IssueHandler: ${avgExcludeLow.toFixed(2)}%`);

// Scenario 4: Statement coverage only (what codecov might be reporting)
const statementOnly = calculateStatementAverage(coverageData);
console.log(`4. Statement coverage only: ${statementOnly.toFixed(2)}%`);

// Show which files have the biggest impact
console.log('\n=== Files with lowest coverage ===');
const sorted = Object.entries(coverageData)
  .sort((a, b) => a[1].lines - b[1].lines)
  .slice(0, 10);

sorted.forEach(([file, data]) => {
  console.log(`${file.padEnd(60)} ${data.lines.toFixed(2)}%`);
});

function calculateAverage(data) {
  const values = Object.values(data).map(d => d.lines);
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateStatementAverage(data) {
  const values = Object.values(data).map(d => d.statements);
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}