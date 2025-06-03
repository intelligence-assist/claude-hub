#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read combined lcov.info
const lcovPath = path.join(__dirname, 'coverage-combined', 'lcov.info');
if (!fs.existsSync(lcovPath)) {
  console.error('No coverage-combined/lcov.info file found. Run npm run test:combined-coverage first.');
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
  }
}

const overallCoverage = (coveredLines / totalLines) * 100;

console.log('\n=== Combined Coverage Analysis ===\n');
console.log(`Total Lines: ${totalLines}`);
console.log(`Covered Lines: ${coveredLines}`);
console.log(`Overall Coverage: ${overallCoverage.toFixed(2)}%`);
console.log(`Target: 80%`);
console.log(`Status: ${overallCoverage >= 80 ? '✅ PASSED' : '❌ FAILED'}\n`);

// Break down by directory
const srcFiles = Object.entries(fileStats).filter(([file]) => file.startsWith('src/'));
const cliFiles = Object.entries(fileStats).filter(([file]) => file.startsWith('cli/'));

const srcStats = srcFiles.reduce((acc, [, stats]) => ({
  lines: acc.lines + stats.lines,
  covered: acc.covered + stats.covered
}), { lines: 0, covered: 0 });

const cliStats = cliFiles.reduce((acc, [, stats]) => ({
  lines: acc.lines + stats.lines,
  covered: acc.covered + stats.covered
}), { lines: 0, covered: 0 });

console.log('=== Coverage by Component ===');
console.log(`Main src/: ${((srcStats.covered / srcStats.lines) * 100).toFixed(2)}% (${srcStats.covered}/${srcStats.lines} lines)`);
console.log(`CLI:       ${((cliStats.covered / cliStats.lines) * 100).toFixed(2)}% (${cliStats.covered}/${cliStats.lines} lines)`);

// Show files with lowest coverage
console.log('\n=== Files with Lowest Coverage ===');
const sorted = Object.entries(fileStats)
  .map(([file, stats]) => ({
    file,
    coverage: (stats.covered / stats.lines) * 100,
    lines: stats.lines,
    covered: stats.covered
  }))
  .sort((a, b) => a.coverage - b.coverage)
  .slice(0, 10);

sorted.forEach(({ file, coverage, covered, lines }) => {
  console.log(`${file.padEnd(60)} ${coverage.toFixed(2).padStart(6)}% (${covered}/${lines})`);
});

process.exit(overallCoverage >= 80 ? 0 : 1);