#!/usr/bin/env node

/**
 * Script to set up standard labels for auto-tagging in a GitHub repository
 * Usage: node setup-repository-labels.js <owner/repo>
 */

const githubService = require('../../src/services/githubService');
const { createLogger } = require('../../src/utils/logger');

const logger = createLogger('setup-labels');

// Standard label definitions
const STANDARD_LABELS = [
  // Priority Labels
  { name: 'priority:critical', color: 'b60205', description: 'Critical priority - Security issues, prod down, data loss' },
  { name: 'priority:high', color: 'd93f0b', description: 'High priority - Important features, significant bugs' },
  { name: 'priority:medium', color: 'fbca04', description: 'Medium priority - Standard features, minor bugs' },
  { name: 'priority:low', color: '0052cc', description: 'Low priority - Nice-to-have, documentation' },

  // Type Labels
  { name: 'type:bug', color: 'd73a4a', description: '🐛 Something isn\'t working' },
  { name: 'type:feature', color: 'a2eeef', description: '✨ New feature request' },
  { name: 'type:enhancement', color: '7057ff', description: '⚡ Improvement to existing feature' },
  { name: 'type:documentation', color: '0075ca', description: '📚 Documentation changes' },
  { name: 'type:question', color: 'd876e3', description: '❓ Questions and help requests' },
  { name: 'type:security', color: 'ed2020', description: '🔒 Security-related issues' },

  // Complexity Labels
  { name: 'complexity:trivial', color: 'e4e669', description: '1️⃣ Less than 1 hour of work' },
  { name: 'complexity:simple', color: 'bfd4f2', description: '2️⃣ 1-4 hours of work' },
  { name: 'complexity:moderate', color: 'f9d0c4', description: '3️⃣ 1-2 days of work' },
  { name: 'complexity:complex', color: 'ff6b6b', description: '4️⃣ 3+ days of work' },

  // Component Labels
  { name: 'component:api', color: '5319e7', description: 'API-related issues' },
  { name: 'component:frontend', color: '1d76db', description: 'UI/Frontend issues' },
  { name: 'component:backend', color: '0e8a16', description: 'Backend/Server issues' },
  { name: 'component:database', color: '006b75', description: 'Database-related issues' },
  { name: 'component:auth', color: 'c2e0c6', description: 'Authentication issues' },
  { name: 'component:webhook', color: 'f29513', description: 'GitHub webhook system issues' },
  { name: 'component:docker', color: '0366d6', description: 'Container/Docker issues' }
];

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.error('Usage: node setup-repository-labels.js <owner/repo>');
      console.error('Example: node setup-repository-labels.js myorg/myrepo');
      process.exit(1);
    }

    const repoPath = args[0];
    const [repoOwner, repoName] = repoPath.split('/');

    if (!repoOwner || !repoName) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }

    // Check if required environment variables are set
    if (!process.env.GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN environment variable is required');
      process.exit(1);
    }

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      labelCount: STANDARD_LABELS.length
    }, 'Setting up repository labels');

    console.log(`Setting up standard labels for repository: ${repoOwner}/${repoName}`);
    console.log(`Creating ${STANDARD_LABELS.length} labels...`);

    const result = await githubService.createRepositoryLabels({
      repoOwner,
      repoName,
      labels: STANDARD_LABELS
    });

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      createdCount: result.length
    }, 'Repository labels setup completed');

    console.log('\n✅ Labels setup completed!');
    console.log(`Created/verified ${STANDARD_LABELS.length} labels in ${repoOwner}/${repoName}`);
    
    console.log('\nLabel categories created:');
    console.log('- Priority: critical, high, medium, low');
    console.log('- Type: bug, feature, enhancement, documentation, question, security');
    console.log('- Complexity: trivial, simple, moderate, complex');
    console.log('- Component: api, frontend, backend, database, auth, webhook, docker');
    
    console.log('\n🏷️ Auto-tagging is now ready! New issues will be automatically labeled.');

  } catch (error) {
    logger.error({ err: error }, 'Failed to setup repository labels');
    console.error('Error setting up labels:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  STANDARD_LABELS,
  main
};