# Claude Webhook API Documentation

## Overview
The Claude Webhook API provides endpoints for creating and managing Claude Code sessions for automated code generation, analysis, and orchestration. This API is designed to enable parallel execution of multiple Claude instances for complex software engineering tasks.

## API Design Philosophy
This API follows a simple, focused design:
- **Single responsibility**: Each session handles one specific task
- **Orchestration via MCP/LLM agents**: Complex workflows are managed by the calling agent, not the API
- **Consistent response format**: All responses follow the same structure for predictable parsing

## Base Configuration

### Base URL
```
POST https://your-domain.com/api/webhooks/claude
```

### Authentication
All requests require Bearer token authentication:
```http
Authorization: Bearer <CLAUDE_WEBHOOK_SECRET>
Content-Type: application/json
```

### Response Format
All API responses follow this consistent structure:
```json
{
  "success": boolean,
  "message": "string",     // Human-readable status message
  "data": object,          // Response data (when success=true)
  "error": "string"        // Error description (when success=false)
}
```

### Rate Limiting
- Currently not implemented (planned for future release)
- Recommended client-side rate limiting: 10 requests per minute

## Endpoints

### 1. Create Session
Creates a new Claude Code session. Sessions can be configured with dependencies, metadata, and execution options.

**Endpoint:** `POST /api/webhooks/claude`  
**Type:** `session.create`

#### Request Body
```json
{
  "type": "session.create",
  "session": {
    "type": "implementation | analysis | testing | review | coordination",
    "project": {
      "repository": "string",      // Required: "owner/repo" format
      "branch": "string",          // Optional: target branch
      "requirements": "string",    // Required: task description
      "context": "string"          // Optional: additional context
    },
    "dependencies": ["string"],    // Optional: array of session IDs to wait for
    "metadata": {                  // Optional: custom metadata
      "batchId": "string",         // Group related sessions
      "tags": ["string"],          // Categorization tags
      "priority": "string"         // Priority level
    }
  },
  "options": {                     // Optional: execution options
    "autoStart": boolean,          // Start when dependencies complete (default: false)
    "timeout": number,             // Custom timeout in seconds (default: 1800)
    "notifyUrl": "string"          // Webhook URL for completion notification
  }
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Must be "session.create" |
| `session` | object | Yes | Session configuration object |
| `session.type` | string | Yes | Type of session: `implementation`, `analysis`, `testing`, `review`, or `coordination` |
| `session.project` | object | Yes | Project information |
| `session.project.repository` | string | Yes | GitHub repository in "owner/repo" format |
| `session.project.branch` | string | No | Target branch name (defaults to main/master) |
| `session.project.requirements` | string | Yes | Clear description of what Claude should do |
| `session.project.context` | string | No | Additional context about the codebase or requirements |
| `session.dependencies` | string[] | No | Array of valid UUID session IDs that must complete before this session starts (filters out "none", empty strings) |
| `session.metadata` | object | No | Custom metadata for organizing sessions |
| `session.metadata.batchId` | string | No | User-provided ID for grouping related sessions |
| `session.metadata.tags` | string[] | No | Tags for categorization |
| `session.metadata.priority` | string | No | Priority level (high, medium, low) |
| `options` | object | No | Execution options |
| `options.autoStart` | boolean | No | Automatically start when dependencies complete (default: false) |
| `options.timeout` | number | No | Custom timeout in seconds (default: 1800 = 30 minutes) |
| `options.notifyUrl` | string | No | Webhook URL to call on completion/failure |

#### Response
```json
{
  "success": true,
  "message": "Session created successfully",
  "data": {
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "implementation",
      "status": "pending",
      "project": {
        "repository": "acme/webapp",
        "branch": "feature/user-auth",
        "requirements": "Implement JWT authentication middleware",
        "context": "Use existing User model"
      },
      "dependencies": [],
      "metadata": {
        "batchId": "auth-feature-batch",
        "tags": ["feature", "auth"],
        "priority": "high"
      },
      "options": {
        "autoStart": false,
        "timeout": 1800,
        "notifyUrl": null
      },
      "containerId": null,
      "claudeSessionId": null,
      "createdAt": "2024-01-06T10:00:00Z",
      "startedAt": null,
      "completedAt": null,
      "output": null,
      "error": null
    }
  }
}
```

#### Example
```bash
curl -X POST https://your-domain.com/api/webhooks/claude \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "session.create",
    "session": {
      "type": "implementation",
      "project": {
        "repository": "acme/webapp",
        "branch": "feature/user-auth",
        "requirements": "Implement JWT authentication middleware for Express.js",
        "context": "Use existing User model and bcrypt for password hashing"
      },
      "dependencies": []
    }
  }'
```

---

### 2. Start Session
Starts a previously created session or queues it if dependencies aren't met.

**Endpoint:** `POST /api/webhooks/claude`  
**Type:** `session.start`

#### Request Body
```json
{
  "type": "session.start",
  "sessionId": "string"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Must be "session.start" |
| `sessionId` | string | Yes | UUID of the session to start |

#### Response
```json
{
  "success": true,
  "message": "Session started successfully",
  "data": {
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "initializing",  // or "running" if started immediately
      "containerId": "docker-container-id",
      "claudeSessionId": "claude-internal-session-id",
      // ... full session object
    }
  }
}
```

For queued sessions (waiting on dependencies):
```json
{
  "success": true,
  "message": "Session queued",
  "data": {
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "pending",
      // ... full session object
    },
    "queueStatus": {
      "waitingFor": ["dependency-session-id-1", "dependency-session-id-2"],
      "estimatedStartTime": null
    }
  }
}
```

#### Example
```bash
curl -X POST https://your-domain.com/api/webhooks/claude \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "session.start",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

### 3. Get Session Status
Retrieves the current status and details of a session.

**Endpoint:** `POST /api/webhooks/claude`  
**Type:** `session.get`

#### Request Body
```json
{
  "type": "session.get",
  "sessionId": "string"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Must be "session.get" |
| `sessionId` | string | Yes | UUID of the session to query |

#### Response
```json
{
  "success": true,
  "message": "Session found",
  "data": {
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "implementation",
      "status": "running",
      "containerId": "docker-container-id",
      "claudeSessionId": "claude-internal-session-id",
      "project": {
        "repository": "acme/webapp",
        "branch": "feature/user-auth",
        "requirements": "Implement JWT authentication middleware",
        "context": "Use existing User model"
      },
      "dependencies": [],
      "metadata": {},
      "options": {},
      "createdAt": "2024-01-06T10:00:00Z",
      "startedAt": "2024-01-06T10:30:00Z",
      "completedAt": null,
      "output": null,
      "error": null
    }
  }
}
```

#### Session Status Values
- `pending` - Session created but not started
- `initializing` - Container is being created
- `running` - Session is actively executing
- `completed` - Session finished successfully
- `failed` - Session encountered an error
- `cancelled` - Session was manually cancelled

---

### 4. Get Session Output
Retrieves the output and artifacts from a completed session.

**Endpoint:** `POST /api/webhooks/claude`  
**Type:** `session.output`

#### Request Body
```json
{
  "type": "session.output",
  "sessionId": "string"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Must be "session.output" |
| `sessionId` | string | Yes | UUID of the session |

#### Response
```json
{
  "success": true,
  "message": "Session output retrieved",
  "data": {
    "output": {
      "logs": ["Container started", "Running Claude command...", "Task completed"],
      "artifacts": [
        {
          "type": "file",
          "path": "src/middleware/auth.js",
          "content": "// JWT authentication middleware\n...",
          "sha": "abc123...",
          "url": "https://github.com/acme/webapp/blob/feature/user-auth/src/middleware/auth.js",
          "metadata": {
            "linesAdded": 150,
            "linesRemoved": 0
          }
        }
      ],
      "summary": "Implemented JWT authentication middleware with refresh token support",
      "nextSteps": ["Add rate limiting", "Implement password reset flow"],
      "executionTime": 180,  // seconds
      "resourceUsage": {
        "cpuTime": 45.2,
        "memoryPeak": "512MB"
      }
    }
  }
}
```

Note: The current implementation returns a simplified structure. Full artifact details and metadata are planned for future releases.

---

### 5. List Sessions
Lists all sessions, optionally filtered by orchestration ID.

**Endpoint:** `POST /api/webhooks/claude`  
**Type:** `session.list`

#### Request Body
```json
{
  "type": "session.list",
  "orchestrationId": "string"  // Optional
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Must be "session.list" |
| `orchestrationId` | string | No | Filter sessions by orchestration ID |

#### Response
```json
{
  "success": true,
  "message": "Sessions retrieved",
  "data": {
    "sessions": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "implementation",
        "status": "completed",
        "project": {
          "repository": "acme/webapp",
          "branch": "feature/user-auth",
          "requirements": "Implement JWT authentication",
          "context": null
        },
        "dependencies": [],
        "metadata": {
          "batchId": "auth-feature-batch",
          "tags": ["feature", "auth"]
        },
        "createdAt": "2024-01-06T10:00:00Z",
        "startedAt": "2024-01-06T10:30:00Z",
        "completedAt": "2024-01-06T10:45:00Z",
        "error": null
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "type": "testing",
        "status": "running",
        "project": {
          "repository": "acme/webapp",
          "branch": "feature/user-auth",
          "requirements": "Write tests for JWT middleware"
        },
        "dependencies": ["550e8400-e29b-41d4-a716-446655440000"],
        "metadata": {
          "batchId": "auth-feature-batch",
          "tags": ["testing"]
        },
        "createdAt": "2024-01-06T10:46:00Z",
        "startedAt": "2024-01-06T10:47:00Z",
        "completedAt": null,
        "error": null
      }
    ]
  }
}
```


## Session Types

### implementation
For implementing new features or functionality. Claude will:
- Analyze requirements
- Write production-ready code
- Follow existing patterns and conventions
- Create or modify files as needed

### analysis
For analyzing existing code. Claude will:
- Review code structure and patterns
- Identify potential issues
- Suggest improvements
- Document findings

### testing
For creating and running tests. Claude will:
- Write unit and integration tests
- Ensure code coverage
- Validate functionality
- Fix failing tests

### review
For code review tasks. Claude will:
- Review pull requests
- Check for security issues
- Validate best practices
- Provide feedback

### coordination
For orchestrating multiple sessions. Claude will:
- Break down complex tasks
- Create dependent sessions
- Monitor progress
- Coordinate results

## Dependency Management

Sessions can depend on other sessions using the `dependencies` parameter:

```json
{
  "type": "session.create",
  "session": {
    "type": "testing",
    "project": {
      "repository": "acme/webapp",
      "requirements": "Write tests for the JWT authentication middleware"
    },
    "dependencies": ["implementation-session-id"]
  }
}
```

### Dependency Behavior
- Sessions with dependencies won't start until all dependencies are `completed`
- If any dependency fails, the dependent session will be marked as `failed`
- Circular dependencies are detected and rejected
- Maximum dependency depth is 10 levels

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": "Error description"
}
```

### Common Error Codes
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid token)
- `404` - Not Found (session doesn't exist)
- `409` - Conflict (session already started)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Example Error Response
```json
{
  "success": false,
  "error": "Session not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

## Best Practices

### 1. Clear Requirements
Provide detailed, actionable requirements:
```json
{
  "requirements": "Implement JWT authentication middleware with:\n- Access token (15min expiry)\n- Refresh token (7 days expiry)\n- Token blacklisting for logout\n- Rate limiting per user"
}
```

### 2. Use Dependencies Wisely
Chain related tasks:
```
analysis → implementation → testing → review
```

### 3. Provide Context
Include relevant context about your codebase:
```json
{
  "context": "We use Express.js with TypeScript, Prisma ORM, and follow REST API conventions. Authentication should integrate with existing User model."
}
```

### 4. Monitor Session Status
Poll session status every 5-10 seconds:
```bash
while [ "$status" != "completed" ]; do
  status=$(curl -s -X POST ... | jq -r '.data.status')
  sleep 5
done
```

### 5. Handle Failures Gracefully
Check session status and error messages:
```javascript
if (response.data.status === 'failed') {
  console.error('Session failed:', response.data.error);
  // Implement retry logic or alternative approach
}
```

## Integration Examples

### Node.js/TypeScript
```typescript
import axios from 'axios';

const CLAUDE_API_URL = 'https://your-domain.com/api/webhooks/claude';
const AUTH_TOKEN = process.env.CLAUDE_WEBHOOK_SECRET;

async function createAndRunSession() {
  // Create session
  const createResponse = await axios.post(
    CLAUDE_API_URL,
    {
      type: 'session.create',
      session: {
        type: 'implementation',
        project: {
          repository: 'acme/webapp',
          requirements: 'Implement user profile API endpoints',
          context: 'Use existing auth middleware'
        }
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const sessionId = createResponse.data.data.sessionId;

  // Start session
  await axios.post(
    CLAUDE_API_URL,
    {
      type: 'session.start',
      sessionId
    },
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Poll for completion
  let status = 'running';
  while (status === 'running' || status === 'initializing') {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await axios.post(
      CLAUDE_API_URL,
      {
        type: 'session.get',
        sessionId
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    status = statusResponse.data.data.status;
  }

  // Get output
  if (status === 'completed') {
    const outputResponse = await axios.post(
      CLAUDE_API_URL,
      {
        type: 'session.output',
        sessionId
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Session completed:', outputResponse.data.data.summary);
    console.log('Artifacts:', outputResponse.data.data.artifacts);
  }
}
```

### Python
```python
import requests
import time
import os

CLAUDE_API_URL = 'https://your-domain.com/api/webhooks/claude'
AUTH_TOKEN = os.environ['CLAUDE_WEBHOOK_SECRET']

headers = {
    'Authorization': f'Bearer {AUTH_TOKEN}',
    'Content-Type': 'application/json'
}

# Create session
create_response = requests.post(
    CLAUDE_API_URL,
    json={
        'type': 'session.create',
        'session': {
            'type': 'implementation',
            'project': {
                'repository': 'acme/webapp',
                'requirements': 'Implement user profile API endpoints'
            }
        }
    },
    headers=headers
)

session_id = create_response.json()['data']['sessionId']

# Start session
requests.post(
    CLAUDE_API_URL,
    json={
        'type': 'session.start',
        'sessionId': session_id
    },
    headers=headers
)

# Poll for completion
status = 'running'
while status in ['running', 'initializing']:
    time.sleep(5)
    status_response = requests.post(
        CLAUDE_API_URL,
        json={
            'type': 'session.get',
            'sessionId': session_id
        },
        headers=headers
    )
    status = status_response.json()['data']['status']

# Get output
if status == 'completed':
    output_response = requests.post(
        CLAUDE_API_URL,
        json={
            'type': 'session.output',
            'sessionId': session_id
        },
        headers=headers
    )
    output = output_response.json()['data']
    print(f"Summary: {output['summary']}")
    print(f"Artifacts: {output['artifacts']}")
```

## LLM Agent Integration Guide

This section provides specific guidance for LLM agents (via MCP servers or other integrations) consuming this API.

### Response Parsing
All responses follow a consistent structure, making them easy to parse:
```typescript
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;        // Present when success=true
  error?: string;  // Present when success=false
}
```

### Session Orchestration Pattern
Since this API focuses on single-session creation, orchestration should be handled by the LLM agent:

```python
# Example: LLM agent orchestrating a feature implementation
async def implement_feature(repo: str, feature_desc: str):
    # 1. Create analysis session
    analysis = await create_session(
        type="analysis",
        requirements=f"Analyze codebase for implementing: {feature_desc}"
    )
    
    # 2. Wait for analysis to complete
    await wait_for_completion(analysis.id)
    
    # 3. Create implementation session based on analysis
    implementation = await create_session(
        type="implementation",
        requirements=f"Implement {feature_desc} based on analysis",
        dependencies=[analysis.id]
    )
    
    # 4. Create testing session
    testing = await create_session(
        type="testing",
        requirements=f"Write tests for {feature_desc}",
        dependencies=[implementation.id],
        options={"autoStart": true}  # Auto-start when ready
    )
    
    return {
        "analysis": analysis.id,
        "implementation": implementation.id,
        "testing": testing.id
    }
```

### Polling Best Practices
```javascript
async function pollSession(sessionId, maxAttempts = 120) {
  const pollInterval = 5000; // 5 seconds
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const response = await getSession(sessionId);
    const status = response.data.session.status;
    
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      return response.data.session;
    }
    
    // Exponential backoff for long-running sessions
    const delay = status === 'pending' ? pollInterval * 2 : pollInterval;
    await sleep(delay);
    attempts++;
  }
  
  throw new Error('Session polling timeout');
}
```

### Batch Processing Pattern
Use metadata to group related sessions:
```json
{
  "type": "session.create",
  "session": {
    "type": "implementation",
    "project": { ... },
    "metadata": {
      "batchId": "feature-xyz-batch",
      "tags": ["feature", "priority-high"],
      "priority": "high"
    }
  }
}
```

Then query all sessions in a batch:
```json
{
  "type": "session.list",
  "orchestrationId": "feature-xyz-batch"
}
```

### Error Handling
```python
def handle_api_response(response):
    if response.status_code == 429:
        # Rate limited - implement exponential backoff
        retry_after = int(response.headers.get('Retry-After', 60))
        time.sleep(retry_after)
        return retry_request()
    
    data = response.json()
    if not data['success']:
        error = data.get('error', 'Unknown error')
        if 'not found' in error:
            # Handle missing session
            pass
        elif 'already started' in error:
            # Session already running - just poll for status
            pass
        else:
            raise ApiError(error)
    
    return data['data']
```

### Dependency Graph Building
```typescript
class SessionGraph {
  private sessions: Map<string, Session> = new Map();
  
  addSession(session: Session) {
    this.sessions.set(session.id, session);
  }
  
  getExecutionOrder(): string[] {
    // Topological sort to determine execution order
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const session = this.sessions.get(id);
      if (session?.dependencies) {
        session.dependencies.forEach(dep => visit(dep));
      }
      
      order.push(id);
    };
    
    this.sessions.forEach((_, id) => visit(id));
    return order;
  }
}
```

### Optimizing for Claude Code
When creating sessions for Claude Code:

1. **Clear Requirements**: Be specific and actionable
   ```json
   {
     "requirements": "Implement REST API endpoint POST /api/users with:\n- Request validation (email, password)\n- Password hashing with bcrypt\n- Store in PostgreSQL users table\n- Return JWT token\n- Handle duplicate email error",
     "context": "Using Express.js, TypeScript, Prisma ORM. Follow existing auth patterns in src/middleware/auth.ts"
   }
   ```

2. **Provide Context**: Reference existing code patterns
   ```json
   {
     "context": "Follow patterns in src/controllers/. Use existing error handling middleware. See src/types/user.ts for User interface."
   }
   ```

3. **Use Session Types Effectively**:
   - `analysis` - Before implementing, understand the codebase
   - `implementation` - Write the actual code
   - `testing` - Ensure code works and has coverage
   - `review` - Final quality check
   - `coordination` - For complex multi-part tasks

### Performance Tips
1. **Parallel Sessions**: Create independent sessions simultaneously
2. **Reuse Analysis**: Cache analysis results for similar tasks
3. **Smart Dependencies**: Only add dependencies when truly needed
4. **Batch Operations**: Group related sessions with metadata

## Troubleshooting

### Session Stuck in "pending"
- Check if dependencies are completed
- Verify Docker daemon is running
- Check system resources (CPU, memory)
- Use `session.get` to check dependency status

### Authentication Errors
- Verify Bearer token matches CLAUDE_WEBHOOK_SECRET
- Ensure Authorization header is properly formatted
- Check token hasn't been rotated

### Session Failures
- Review session output for error messages
- Check Docker container logs
- Verify repository access permissions
- Ensure Claude API credentials are valid

### Timeout Issues
- Default timeout is 30 minutes per session
- For longer tasks, break into smaller sessions
- Use custom timeout in options: `{"timeout": 3600}`

## Changelog

### v2.0.0 (2024-01-08)
- **BREAKING**: Removed orchestration endpoint (use session.create with type="coordination")
- **BREAKING**: Updated response structures (all data wrapped in `data.session` or `data.sessions`)
- Added enhanced session creation with metadata and options
- Added autoStart option for dependency-based execution
- Added timeout and notification options
- Improved dependency validation (filters invalid UUIDs)

### v1.0.0 (2024-01-06)
- Initial release with session management
- Support for 5 session types
- Dependency management
- Orchestration capabilities