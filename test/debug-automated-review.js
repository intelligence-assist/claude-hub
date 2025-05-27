#!/usr/bin/env node

/**
 * Debug script for analyzing automated PR review triggering
 * Usage: node test/debug-automated-review.js <PR_NUMBER>
 * Example: node test/debug-automated-review.js 93
 */

const { Octokit } = require('@octokit/rest');
const { createLogger } = require('../src/utils/logger');
const githubService = require('../src/services/githubService');

const logger = createLogger('debug-automated-review');

async function debugAutomatedReview(prNumber) {
  if (!prNumber) {
    throw new Error('Usage: node test/debug-automated-review.js <PR_NUMBER>');
  }

  try {
    // Initialize GitHub client
    const githubToken = process.env.GITHUB_TOKEN || require('../src/utils/secureCredentials').get('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not found in environment or secure credentials');
    }

    const octokit = new Octokit({ auth: githubToken });

    // Get repository info from current directory
    const repoInfo = await githubService.getRepositoryInfo();
    const [repoOwner, repoName] = repoInfo.full_name.split('/');

    console.log(`🔍 Analyzing PR #${prNumber} in ${repoInfo.full_name}`);
    console.log('');

    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner: repoOwner,
      repo: repoName,
      pull_number: prNumber
    });

    console.log('📋 PR Details:');
    console.log(`   Title: ${pr.title}`);
    console.log(`   State: ${pr.state}`);
    console.log(`   Head SHA: ${pr.head.sha}`);
    console.log(`   Head Ref: ${pr.head.ref}`);
    console.log(`   Base Ref: ${pr.base.ref}`);
    console.log('');

    // Get check suites for the PR
    const { data: checkSuitesResponse } = await octokit.rest.checks.listSuitesForRef({
      owner: repoOwner,
      repo: repoName,
      ref: pr.head.sha
    });

    const checkSuites = checkSuitesResponse.check_suites || [];

    console.log(`🏃 Check Suites (${checkSuites.length} total):`);
    if (checkSuites.length === 0) {
      console.log('   ⚠️  No check suites found - repository may not have CI configured');
    } else {
      checkSuites.forEach((suite, index) => {
        console.log(`   ${index + 1}. ${suite.app?.name || 'Unknown App'}`);
        console.log(`      ID: ${suite.id}`);
        console.log(`      Status: ${suite.status}`);
        console.log(`      Conclusion: ${suite.conclusion || 'null'}`);
        console.log(`      URL: ${suite.html_url || 'N/A'}`);
        console.log('');
      });
    }

    // Check for existing reviews
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner: repoOwner,
      repo: repoName,
      pull_number: prNumber
    });

    console.log(`📝 Existing Reviews (${reviews.length} total):`);
    if (reviews.length === 0) {
      console.log('   No reviews found');
    } else {
      reviews.forEach((review, index) => {
        console.log(`   ${index + 1}. ${review.user.login} - ${review.state}`);
        console.log(`      Submitted: ${review.submitted_at}`);
        console.log(`      Commit SHA: ${review.commit_id}`);
        if (review.body) {
          console.log(`      Body: ${review.body.substring(0, 100)}...`);
        }
        console.log('');
      });
    }

    // Analyze review triggering logic
    console.log('⚙️  Review Triggering Analysis:');
    
    const waitForAllChecks = process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS !== 'false';
    const triggerWorkflowName = process.env.PR_REVIEW_TRIGGER_WORKFLOW;
    const forceReview = process.env.PR_REVIEW_FORCE_ON_SUCCESS === 'true';

    console.log(`   PR_REVIEW_WAIT_FOR_ALL_CHECKS: ${process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS} (effective: ${waitForAllChecks})`);
    console.log(`   PR_REVIEW_TRIGGER_WORKFLOW: ${triggerWorkflowName || 'not set'}`);
    console.log(`   PR_REVIEW_FORCE_ON_SUCCESS: ${process.env.PR_REVIEW_FORCE_ON_SUCCESS || 'not set'} (effective: ${forceReview})`);
    console.log('');

    // Determine if review should be triggered
    let shouldTriggerReview = false;
    let triggerReason = '';

    if (forceReview) {
      shouldTriggerReview = true;
      triggerReason = 'Force review mode enabled';
    } else if (waitForAllChecks || !triggerWorkflowName) {
      // Check if all check suites are complete and successful
      if (checkSuites.length === 0) {
        shouldTriggerReview = true;
        triggerReason = 'No check suites configured - allowing review';
      } else {
        let allPassed = true;
        let reasonDetails = [];

        for (const suite of checkSuites) {
          if (suite.conclusion === 'neutral' || suite.conclusion === 'skipped') {
            continue;
          }

          if (suite.status !== 'completed') {
            allPassed = false;
            reasonDetails.push(`${suite.app?.name}: still in progress (${suite.status})`);
          } else if (suite.conclusion !== 'success') {
            allPassed = false;
            reasonDetails.push(`${suite.app?.name}: ${suite.conclusion}`);
          }
        }

        shouldTriggerReview = allPassed;
        triggerReason = allPassed 
          ? 'All check suites passed'
          : `Waiting for checks: ${reasonDetails.join(', ')}`;
      }
    } else {
      // Use specific workflow trigger
      const matchingSuites = checkSuites.filter(suite => 
        suite.app?.name === triggerWorkflowName || 
        (suite.app?.slug === 'github-actions' && triggerWorkflowName)
      );

      if (matchingSuites.length > 0) {
        const targetSuite = matchingSuites.find(suite => suite.conclusion === 'success');
        shouldTriggerReview = !!targetSuite;
        triggerReason = targetSuite 
          ? `Triggered by workflow: ${triggerWorkflowName}`
          : `Workflow '${triggerWorkflowName}' not successful`;
      } else {
        shouldTriggerReview = false;
        triggerReason = `Workflow '${triggerWorkflowName}' not found`;
      }
    }

    console.log('🎯 Review Decision:');
    console.log(`   Should Trigger: ${shouldTriggerReview ? '✅ YES' : '❌ NO'}`);
    console.log(`   Reason: ${triggerReason}`);
    console.log('');

    // Check if already reviewed at current commit
    const alreadyReviewed = await githubService.hasReviewedPRAtCommit({
      repoOwner,
      repoName,
      prNumber: prNumber,
      commitSha: pr.head.sha
    });

    console.log('🔄 Duplicate Check:');
    console.log(`   Already reviewed at commit ${pr.head.sha}: ${alreadyReviewed ? '✅ YES' : '❌ NO'}`);

    if (alreadyReviewed) {
      console.log('   ⚠️  Review would be skipped due to duplicate prevention');
    }

    console.log('');
    console.log('📊 Summary:');
    if (shouldTriggerReview && !alreadyReviewed) {
      console.log('   ✅ PR review WOULD be triggered');
    } else if (shouldTriggerReview && alreadyReviewed) {
      console.log('   ⚠️  PR review would be triggered but skipped (already reviewed)');
    } else {
      console.log('   ❌ PR review would NOT be triggered');
    }

  } catch (error) {
    logger.error({ err: error }, 'Error analyzing automated review');
    console.error('Error:', error.message);
    throw error;
  }
}

// Run the debug analysis
const prNumber = process.argv[2];
debugAutomatedReview(parseInt(prNumber, 10)).catch(error => {
  console.error('Failed to analyze PR:', error.message);
  process.exit(1); // eslint-disable-line no-process-exit
});