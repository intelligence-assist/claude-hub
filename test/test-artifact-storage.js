#!/usr/bin/env node

const { processCommand } = require('../src/services/claudeService');
const { createLogger } = require('../src/utils/logger');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const logger = createLogger('test-artifact-storage');

async function testArtifactStorage() {
  try {
    // Test artifact directory
    const artifactDir = path.join(os.homedir(), '.claude-webhook', 'artifacts', 'test-owner', 'test-repo');
    
    logger.info('Testing artifact storage functionality...');
    
    // This will trigger in test mode but should still save artifacts
    const result = await processCommand({
      repoFullName: 'test-owner/test-repo',
      issueNumber: 999,
      command: 'Test artifact storage',
      operationType: 'default'
    });
    
    logger.info({ result }, 'Command processed');
    
    // Check if artifact directory was created
    try {
      const files = await fs.readdir(artifactDir);
      logger.info({ artifactDir, fileCount: files.length }, 'Artifact directory contents');
      
      // Read the latest artifact
      if (files.length > 0) {
        const latestFile = files.sort().pop();
        const content = await fs.readFile(path.join(artifactDir, latestFile), 'utf8');
        const artifact = JSON.parse(content);
        logger.info({ 
          filename: latestFile,
          timestamp: artifact.timestamp,
          outputLength: artifact.metadata.outputLength 
        }, 'Latest artifact details');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Could not read artifact directory');
    }
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Test failed');
    process.exit(1);
  }
}

// Run the test
testArtifactStorage();