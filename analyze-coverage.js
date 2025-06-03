#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read lcov.info
const lcovPath = path.join(__dirname, 'coverage', 'lcov.info');
if (!fs.existsSync(lcovPath)) {
  console.error('No coverage/lcov.info file found. Run npm test:coverage first.');
  process.exit(1);
}

const lcovContent = fs.readFileSync(lcovPath, 'utf8');
const lines = lcovContent.split('\n');

let currentFile = null;
const fileStats = {};
let totalLines = 0;
let coveredLines = 0;

for (const line of lines) {
  if (line.startsWith('SF:')) {
    currentFile = line.substring(3);
    if (!fileStats[currentFile]) {
      fileStats[currentFile] = { lines: 0, covered: 0, functions: 0, functionsHit: 0 };
    }
  } else if (line.startsWith('DA:')) {
    const [lineNum, hits] = line.substring(3).split(',').map(Number);
    if (currentFile) {
      fileStats[currentFile].lines++;
      totalLines++;
      if (hits > 0) {
        fileStats[currentFile].covered++;
        coveredLines++;
      }
    }
  } else if (line.startsWith('FNF:')) {
    if (currentFile) {
      fileStats[currentFile].functions = parseInt(line.substring(4));
    }
  } else if (line.startsWith('FNH:')) {
    if (currentFile) {
      fileStats[currentFile].functionsHit = parseInt(line.substring(4));
    }
  }
}

console.log('\n=== Coverage Analysis ===\n');
console.log(`Total Lines: ${totalLines}`);
console.log(`Covered Lines: ${coveredLines}`);
console.log(`Overall Coverage: ${((coveredLines / totalLines) * 100).toFixed(2)}%\n`);

console.log('=== File Breakdown ===\n');
const sortedFiles = Object.entries(fileStats).sort((a, b) => {
  const coverageA = (a[1].covered / a[1].lines) * 100;
  const coverageB = (b[1].covered / b[1].lines) * 100;
  return coverageA - coverageB;
});

for (const [file, stats] of sortedFiles) {
  const coverage = ((stats.covered / stats.lines) * 100).toFixed(2);
  console.log(`${file.padEnd(60)} ${coverage.padStart(6)}% (${stats.covered}/${stats.lines} lines)`);
}

// Check if CLI coverage is included
console.log('\n=== Coverage Scope Analysis ===\n');
const cliFiles = sortedFiles.filter(([file]) => file.includes('cli/'));
const srcFiles = sortedFiles.filter(([file]) => file.startsWith('src/'));

console.log(`Main src/ files: ${srcFiles.length}`);
console.log(`CLI files: ${cliFiles.length}`);

if (cliFiles.length > 0) {
  console.log('\nCLI files found in coverage:');
  cliFiles.forEach(([file]) => console.log(`  - ${file}`));
}

// Check for any unexpected files
const otherFiles = sortedFiles.filter(([file]) => !file.startsWith('src/') && !file.includes('cli/'));
if (otherFiles.length > 0) {
  console.log('\nOther files in coverage:');
  otherFiles.forEach(([file]) => console.log(`  - ${file}`));
}