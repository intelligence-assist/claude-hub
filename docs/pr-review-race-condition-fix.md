# PR Review Race Condition Fix

## Problem Description

The GitHub webhook system was experiencing a critical race condition when multiple `check_suite` completed events were triggered simultaneously. This occurred when multiple GitHub Actions workflows completed concurrently, each triggering its own webhook event for the same PR and commit.

### Symptoms

- Multiple duplicate PR review comments (over 30 in some cases)
- Multiple "Working on comprehensive automated review..." messages
- Concurrent webhook requests passing the deduplication check
- Resource waste from redundant Claude API calls

### Root Cause

The existing deduplication logic in `githubService.hasReviewedPRAtCommit()` only checked if a review had already been posted to GitHub. However, when multiple webhook requests processed concurrently:

1. All requests would call `hasReviewedPRAtCommit()` simultaneously
2. All would receive `false` (no review posted yet)
3. All would proceed to process the review
4. Multiple reviews would be posted

This was a classic **check-then-act race condition**.

## Solution Implementation

### 1. Enhanced Deduplication System

Added a multi-layered deduplication system in `src/controllers/githubController.js`:

```javascript
// In-memory deduplication cache with TTL
const reviewCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function tryAcquireReviewLock(repoFullName, prNumber, commitSha, requestId) {
  const cacheKey = createHash('sha256')
    .update(`${repoFullName}:pr:${prNumber}:${commitSha}`)
    .digest('hex');

  const existing = reviewCache.get(cacheKey);

  if (existing) {
    if (existing.status === 'processing') {
      return { acquired: false, cacheKey, existing };
    }
    if (existing.status === 'completed') {
      return { acquired: false, cacheKey, existing };
    }
  }

  // Acquire lock
  reviewCache.set(cacheKey, {
    status: 'processing',
    timestamp: Date.now(),
    requestId,
    repoFullName,
    prNumber,
    commitSha
  });

  return { acquired: true, cacheKey };
}
```

### 2. Request-Level Deduplication

The enhanced workflow now:

1. **Immediate Cache Check**: Before any external API calls, check if a review is already in progress or completed
2. **Lock Acquisition**: Atomically acquire a processing lock to prevent concurrent processing
3. **GitHub API Backup**: Double-check with GitHub as a secondary verification
4. **Cache Management**: Mark reviews as completed or failed appropriately

### 3. Automatic Cache Cleanup

```javascript
// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of reviewCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      reviewCache.delete(key);
    }
  }
}, 60000);
```

## Key Benefits

### 1. **Race Condition Prevention**
- Multiple concurrent requests are now properly serialized
- Only the first request processes the review
- Subsequent requests receive immediate deduplication response

### 2. **Performance Improvement**
- Cache hits return in microseconds vs API round-trips
- Reduced Claude API usage
- Lower GitHub API rate limit consumption

### 3. **Enhanced Logging**
```javascript
logger.info({
  repo: repo.full_name,
  pr: pr.number,
  commitSha: commitSha,
  cacheStatus: lockResult.existing.status,
  originalRequestId: lockResult.existing.requestId,
  currentRequestId: requestId
}, 'PR review request deduplicated - Review already in progress');
```

### 4. **Graceful Error Handling**
- Failed reviews are removed from cache to allow retries
- Successful reviews are cached to prevent duplicates
- TTL ensures cache doesn't grow indefinitely

## Test Coverage

Added comprehensive tests in `test/unit/controllers/race-condition-prevention.test.js`:

### Concurrent Request Test
```javascript
it('should prevent duplicate reviews when processing concurrent check_suite events', async () => {
  const promises = [
    githubController.handleWebhook(mockReq1, mockRes1),
    githubController.handleWebhook(mockReq2, mockRes2),
    githubController.handleWebhook(mockReq3, mockRes3)
  ];

  await Promise.all(promises);

  // Verify that Claude was called exactly ONCE, not three times
  expect(claudeService.processCommand).toHaveBeenCalledTimes(1);
});
```

### Cache Performance Test
```javascript
it('should use in-memory cache before GitHub API check for faster deduplication', async () => {
  await githubController.handleWebhook(mockReq1, mockRes1);
  githubService.hasReviewedPRAtCommit.mockClear();
  
  await githubController.handleWebhook(mockReq2, mockRes2);
  
  // Verify GitHub API was NOT called for the second request (cache hit)
  expect(githubService.hasReviewedPRAtCommit).not.toHaveBeenCalled();
});
```

## Implementation Details

### Cache Key Generation
```javascript
const cacheKey = createHash('sha256')
  .update(`${repoFullName}:pr:${prNumber}:${commitSha}`)
  .digest('hex');
```

Ensures unique keys per PR at specific commits while being deterministic across requests.

### Request Identification
```javascript
const requestId = `${checkSuite.id}-${pr.number}`;
```

Helps track which specific webhook event initiated the review for debugging.

### State Management
- `processing`: Review currently in progress
- `completed`: Review successfully finished  
- Cache cleanup removes expired entries automatically

## Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `CACHE_TTL` | 5 minutes | How long to keep cache entries |
| `cleanup interval` | 1 minute | How often to clean expired entries |

## Monitoring

The implementation provides detailed logging for:
- Cache hits and misses
- Lock acquisition attempts
- Request deduplication events
- Performance metrics

## Future Improvements

While this immediate fix resolves the race condition, the analysis document recommends a dedicated PR review endpoint as the long-term solution:

1. **Dedicated Review Check**: Single GitHub Action that triggers after all workflows complete
2. **Purpose-Built Endpoint**: `/api/review/pr` with built-in deduplication  
3. **Predictable Triggers**: No dependency on multiple concurrent webhook events
4. **Enhanced Performance**: Sub-second responses with Redis caching

This current implementation serves as an effective stopgap while planning the architectural improvements.

## Breaking Changes

None. The implementation is backward compatible and doesn't change the external API.

## Rollback Plan

If issues arise, the new deduplication can be disabled by:

1. Removing the cache check logic
2. Reverting to the original `hasReviewedPRAtCommit()` only approach
3. Clearing the `reviewCache` Map

The `clearReviewCache()` function is exported for testing and emergency cache clearing.