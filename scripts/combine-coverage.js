#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Combine coverage reports from main project and CLI
 */

// Ensure coverage directories exist
const mainCoverageDir = path.join(__dirname, '..', 'coverage');
const cliCoverageDir = path.join(__dirname, '..', 'cli', 'coverage');
const combinedCoverageDir = path.join(__dirname, '..', 'coverage-combined');

// Create combined coverage directory
if (!fs.existsSync(combinedCoverageDir)) {
  fs.mkdirSync(combinedCoverageDir, { recursive: true });
}

console.log('Generating main project coverage...');
try {
  execSync('npm run test:ci', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (error) {
  console.error('Failed to generate main project coverage');
  process.exit(1);
}

console.log('\nGenerating CLI coverage...');
try {
  execSync('npm run test:coverage', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'cli') });
} catch (error) {
  console.error('Failed to generate CLI coverage');
  process.exit(1);
}

// Check if both coverage files exist
const mainLcov = path.join(mainCoverageDir, 'lcov.info');
const cliLcov = path.join(cliCoverageDir, 'lcov.info');

if (!fs.existsSync(mainLcov)) {
  console.error('Main project lcov.info not found');
  process.exit(1);
}

if (!fs.existsSync(cliLcov)) {
  console.error('CLI lcov.info not found');
  process.exit(1);
}

// Read both lcov files
const mainLcovContent = fs.readFileSync(mainLcov, 'utf8');
const cliLcovContent = fs.readFileSync(cliLcov, 'utf8');

// Adjust CLI paths to be relative to project root
const adjustedCliLcov = cliLcovContent.replace(/SF:src\//g, 'SF:cli/src/');

// Combine lcov files
const combinedLcov = mainLcovContent + '\n' + adjustedCliLcov;

// Write combined lcov file
const combinedLcovPath = path.join(combinedCoverageDir, 'lcov.info');
fs.writeFileSync(combinedLcovPath, combinedLcov);

console.log('\nCombined coverage report written to:', combinedLcovPath);

// Copy coverage-final.json files as well for better reporting
if (fs.existsSync(path.join(mainCoverageDir, 'coverage-final.json'))) {
  const mainJson = JSON.parse(fs.readFileSync(path.join(mainCoverageDir, 'coverage-final.json'), 'utf8'));
  const cliJson = JSON.parse(fs.readFileSync(path.join(cliCoverageDir, 'coverage-final.json'), 'utf8'));
  
  // Adjust CLI paths in JSON
  const adjustedCliJson = {};
  for (const [key, value] of Object.entries(cliJson)) {
    const adjustedKey = key.replace(/^src\//, 'cli/src/');
    adjustedCliJson[adjustedKey] = value;
  }
  
  // Combine JSON coverage
  const combinedJson = { ...mainJson, ...adjustedCliJson };
  fs.writeFileSync(
    path.join(combinedCoverageDir, 'coverage-final.json'),
    JSON.stringify(combinedJson, null, 2)
  );
}

console.log('\nCoverage combination complete!');
console.log('Upload coverage-combined/lcov.info to Codecov for full project coverage.');