#!/usr/bin/env node

/**
 * Debug script for analyzing automated PR review configuration
 * Usage: node test/debug-automated-review.js [PR_NUMBER]
 */

const { execSync } = require('child_process');
const { readFileSync } = require('fs');

function executeCommand(command, description) {
  try {
    console.log(`\n=== ${description} ===`);
    console.log(`Command: ${command}`);
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    console.log(output);
    return output.trim();
  } catch (error) {
    console.error(`Error executing ${description}:`, error.message);
    if (error.stdout) console.log('stdout:', error.stdout);
    if (error.stderr) console.log('stderr:', error.stderr);
    return null;
  }
}

function analyzeEnvironmentVariables() {
  console.log('\n=== Environment Variable Analysis ===');
  
  const envVars = {
    PR_REVIEW_WAIT_FOR_ALL_CHECKS: process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS,
    PR_REVIEW_TRIGGER_WORKFLOW: process.env.PR_REVIEW_TRIGGER_WORKFLOW,
    PR_REVIEW_DEBOUNCE_MS: process.env.PR_REVIEW_DEBOUNCE_MS,
    PR_REVIEW_FORCE_ON_SUCCESS: process.env.PR_REVIEW_FORCE_ON_SUCCESS
  };

  console.log('Current environment variables:');
  Object.entries(envVars).forEach(([key, value]) => {
    console.log(`  ${key}: ${value || '(not set)'}`);
  });

  // Analyze the boolean logic
  const waitForAllChecks = process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS !== 'false';
  const forceReviewOnSuccess = process.env.PR_REVIEW_FORCE_ON_SUCCESS === 'true';
  
  console.log('\nBoolean evaluation:');
  console.log(`  waitForAllChecks: ${waitForAllChecks}`);
  console.log(`  forceReviewOnSuccess: ${forceReviewOnSuccess}`);

  if (forceReviewOnSuccess) {
    console.log('\n⚠️  FORCE REVIEW MODE is enabled - all successful check suites will trigger reviews');
  } else if (waitForAllChecks) {
    console.log('\n✓ Waiting for all check suites to complete before triggering reviews');
  } else if (process.env.PR_REVIEW_TRIGGER_WORKFLOW) {
    console.log(`\n✓ Using specific workflow trigger: "${process.env.PR_REVIEW_TRIGGER_WORKFLOW}"`);
  } else {
    console.log('\n❌ Invalid configuration: WAIT_FOR_ALL_CHECKS=false but no trigger workflow specified');
  }
}

function analyzePRStatus(prNumber) {
  if (!prNumber) {
    console.log('\n⚠️  No PR number provided - skipping PR-specific analysis');
    console.log('Usage: node test/debug-automated-review.js [PR_NUMBER]');
    return;
  }

  console.log(`\n=== PR #${prNumber} Analysis ===`);

  // Get PR information
  const prInfo = executeCommand(`gh pr view ${prNumber} --json number,title,headRefOid,headRefName,state`, 'PR Information');
  if (prInfo) {
    const pr = JSON.parse(prInfo);
    console.log(`PR Title: ${pr.title}`);
    console.log(`Head SHA: ${pr.headRefOid}`);
    console.log(`Head Branch: ${pr.headRefName}`);
    console.log(`State: ${pr.state}`);
  }

  // Get check status
  executeCommand(`gh pr checks ${prNumber}`, 'PR Check Status');

  // Get check suites for the PR's head commit
  if (prInfo) {
    const pr = JSON.parse(prInfo);
    const repoInfo = executeCommand('gh repo view --json owner,name', 'Repository Information');
    
    if (repoInfo) {
      const repo = JSON.parse(repoInfo);
      const checkSuitesCommand = `gh api "/repos/${repo.owner.login}/${repo.name}/commits/${pr.headRefOid}/check-suites" --jq '.check_suites[] | {id: .id, app: .app.name, status: .status, conclusion: .conclusion, head_branch: .head_branch}'`;
      executeCommand(checkSuitesCommand, 'Check Suites for Head Commit');
    }
  }

  // Check for existing reviews
  executeCommand(`gh pr view ${prNumber} --json reviews --jq '.reviews[] | {author: .author.login, state: .state, submittedAt: .submittedAt}'`, 'Existing Reviews');
}

function analyzeDockerConfiguration() {
  console.log('\n=== Docker Configuration Analysis ===');
  
  // Check if docker-compose.yml has the right environment variables
  try {
    const dockerCompose = readFileSync('docker-compose.yml', 'utf8');
    
    const envVarsInCompose = [
      'PR_REVIEW_WAIT_FOR_ALL_CHECKS',
      'PR_REVIEW_TRIGGER_WORKFLOW', 
      'PR_REVIEW_DEBOUNCE_MS',
      'PR_REVIEW_FORCE_ON_SUCCESS'
    ];

    console.log('Environment variables in docker-compose.yml:');
    envVarsInCompose.forEach(envVar => {
      if (dockerCompose.includes(envVar)) {
        console.log(`  ✓ ${envVar} is configured`);
      } else {
        console.log(`  ❌ ${envVar} is missing`);
      }
    });
  } catch (error) {
    console.log('Could not read docker-compose.yml:', error.message);
  }
}

function provideTroubleshootingGuidance() {
  console.log('\n=== Troubleshooting Guidance ===');
  
  const waitForAllChecks = process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS !== 'false';
  const triggerWorkflow = process.env.PR_REVIEW_TRIGGER_WORKFLOW;
  const forceReview = process.env.PR_REVIEW_FORCE_ON_SUCCESS === 'true';

  if (forceReview) {
    console.log('🔧 Force review mode is enabled - this should trigger reviews for all successful check suites');
    console.log('   To disable: unset PR_REVIEW_FORCE_ON_SUCCESS or set it to "false"');
  } else if (!waitForAllChecks && !triggerWorkflow) {
    console.log('❌ Configuration issue detected:');
    console.log('   - PR_REVIEW_WAIT_FOR_ALL_CHECKS is set to "false"');
    console.log('   - But PR_REVIEW_TRIGGER_WORKFLOW is not specified');
    console.log('   Fix: Either set PR_REVIEW_WAIT_FOR_ALL_CHECKS=true or specify PR_REVIEW_TRIGGER_WORKFLOW');
  } else if (!waitForAllChecks && triggerWorkflow) {
    console.log(`✓ Using workflow-specific trigger: "${triggerWorkflow}"`);
    console.log('   Reviews will only trigger when this specific workflow completes successfully');
  } else {
    console.log('✓ Waiting for all check suites to complete');
    console.log('   Reviews will trigger when ALL check suites are successful');
  }

  console.log('\nCommon fixes:');
  console.log('1. Enable force review for testing:');
  console.log('   export PR_REVIEW_FORCE_ON_SUCCESS=true && docker compose restart webhook');
  
  console.log('\n2. Use specific workflow trigger:');
  console.log('   export PR_REVIEW_WAIT_FOR_ALL_CHECKS=false');
  console.log('   export PR_REVIEW_TRIGGER_WORKFLOW="Pull Request CI"');
  console.log('   docker compose restart webhook');

  console.log('\n3. Wait for all checks (default):');
  console.log('   export PR_REVIEW_WAIT_FOR_ALL_CHECKS=true');
  console.log('   docker compose restart webhook');
  
  console.log('\n4. Check webhook logs:');
  console.log('   docker compose logs -f webhook');
}

function main() {
  const prNumber = process.argv[2];
  
  console.log('🔍 Automated PR Review Debug Analysis');
  console.log('=====================================');
  
  analyzeEnvironmentVariables();
  analyzeDockerConfiguration();
  analyzePRStatus(prNumber);
  provideTroubleshootingGuidance();
  
  console.log('\n✅ Analysis complete!');
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeEnvironmentVariables,
  analyzePRStatus,
  analyzeDockerConfiguration,
  provideTroubleshootingGuidance
};