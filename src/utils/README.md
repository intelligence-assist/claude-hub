# Utility Modules

This directory contains utility modules for the Claude GitHub webhook service.

## repoAnalyzer.js

The `repoAnalyzer.js` module provides repository analysis functionality for the hybrid execution approach.

### Features

- **Repository Cloning**: Clones and caches repositories for analysis
- **Structure Analysis**: Analyzes the directory structure of a repository
- **README Parsing**: Extracts information from repository README files
- **Technology Detection**: Identifies technologies used in the repository
- **Repository Statistics**: Collects commit statistics and other metadata
- **Summary Generation**: Creates a markdown summary of the repository

### Usage

```javascript
const RepoAnalyzer = require('./utils/repoAnalyzer');

// Create an analyzer instance
const analyzer = new RepoAnalyzer({
  repoPath: '/path/to/repo/cache',
  repoFullName: 'owner/repo'
});

// Analyze the repository
await analyzer.analyzeRepository('main'); // or specific branch name

// Access analysis results
const analysis = analyzer.analysis;
console.log(analysis.technologies);
console.log(analysis.mainLanguage);
console.log(analysis.commitStats);

// Generate a markdown summary
const summary = analyzer.generateSummary();
console.log(summary);
```

## logger.js

Provides structured logging with redaction capability for sensitive information.

## sanitize.js

Contains utilities for sanitizing input and output, particularly to prevent infinite loops in webhook responses.

## awsCredentialProvider.js

Manages AWS credentials for Claude access through Bedrock.