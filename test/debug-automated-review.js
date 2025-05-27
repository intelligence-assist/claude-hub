#!/usr/bin/env node

/**
 * Debug script for automated PR review issues
 * Usage: node test/debug-automated-review.js [pr-number]
 */

const { debugPRCheckSuites } = require('../src/controllers/githubController');
const { createLogger } = require('../src/utils/logger');

const logger = createLogger('debugAutomatedReview');

async function debugAutomatedReview(prNumber) {
  try {
    const repoOwner = 'intelligence-assist';
    const repoName = 'claude-hub';
    const repo = { full_name: `${repoOwner}/${repoName}` };

    logger.info(
      {
        repo: repo.full_name,
        prNumber,
        environment: {
          PR_REVIEW_WAIT_FOR_ALL_CHECKS: process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS,
          PR_REVIEW_TRIGGER_WORKFLOW: process.env.PR_REVIEW_TRIGGER_WORKFLOW,
          PR_REVIEW_DEBOUNCE_MS: process.env.PR_REVIEW_DEBOUNCE_MS,
          PR_REVIEW_FORCE_ON_SUCCESS: process.env.PR_REVIEW_FORCE_ON_SUCCESS
        }
      },
      'Starting automated review debug analysis'
    );

    // Mock PR data (in real webhook, this comes from the check_suite payload)
    const mockPullRequests = [
      {
        number: prNumber,
        head: {
          sha: 'mock-sha-for-debugging' // This would normally come from the webhook
        }
      }
    ];

    // If we have a real PR number, try to get the actual SHA
    if (prNumber) {
      try {
        // This would need GitHub CLI or API to get real PR data
        logger.info(`Getting real data for PR #${prNumber}...`);
        // For now, just use mock data but log what we'd need
        logger.warn(
          'Using mock PR data - in a real scenario, this would come from the check_suite webhook payload'
        );
      } catch (error) {
        logger.error({ err: error }, 'Failed to get real PR data, using mock data');
      }
    }

    // Use the debug function to analyze check suites
    await debugPRCheckSuites(repo, mockPullRequests);

    logger.info('Debug analysis complete');
  } catch (error) {
    logger.error(
      {
        err: error,
        prNumber
      },
      'Error during automated review debug analysis'
    );
    throw error;
  }
}

// Get PR number from command line arguments
const prNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!prNumber) {
  console.log('Usage: node test/debug-automated-review.js [pr-number]');
  console.log('Example: node test/debug-automated-review.js 93');
  throw new Error('PR number is required');
}

// Set default environment variables for testing
process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS || 'true';
process.env.PR_REVIEW_TRIGGER_WORKFLOW = process.env.PR_REVIEW_TRIGGER_WORKFLOW || '';
process.env.PR_REVIEW_DEBOUNCE_MS = process.env.PR_REVIEW_DEBOUNCE_MS || '5000';
process.env.PR_REVIEW_FORCE_ON_SUCCESS = process.env.PR_REVIEW_FORCE_ON_SUCCESS || 'false';

debugAutomatedReview(prNumber);