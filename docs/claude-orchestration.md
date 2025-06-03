# Claude Orchestration Provider

The Claude orchestration provider enables parallel execution of multiple Claude Code containers to solve complex tasks. This is designed for the MCP (Model Context Protocol) hackathon to demonstrate super-charged Claude capabilities.

## Overview

The orchestration system provides REST endpoints that can be wrapped as MCP Server tools, allowing Claude Desktop (or other MCP clients) to:
- Create and manage individual Claude Code sessions
- Start sessions with specific requirements and dependencies
- Monitor session status and retrieve outputs
- Orchestrate complex multi-session workflows intelligently

## Architecture

```
POST /api/webhooks/claude
├── ClaudeWebhookProvider (webhook handling)
├── OrchestrationHandler (orchestration logic)
├── SessionManager (container lifecycle)
└── TaskDecomposer (task analysis)
```

## API Endpoints

### Session Management Endpoints

All endpoints use the base URL: `POST /api/webhooks/claude`

**Headers (for all requests):**
```
Authorization: Bearer <CLAUDE_WEBHOOK_SECRET>
Content-Type: application/json
```

#### 1. Create Session

Create a new Claude Code session without starting it.

**Request Body:**
```json
{
  "data": {
    "type": "session.create",
    "session": {
      "type": "implementation",
      "project": {
        "repository": "owner/repo",
        "branch": "feature-branch",
        "requirements": "Implement user authentication with JWT",
        "context": "Use existing Express framework"
      },
      "dependencies": []
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session created successfully",
  "data": {
    "session": {
      "id": "uuid-123",
      "type": "implementation",
      "status": "initializing",
      "containerId": "claude-implementation-abc123",
      "project": { ... },
      "dependencies": []
    }
  }
}
```

#### 2. Start Session

Start a previously created session or queue it if dependencies aren't met.

**Request Body:**
```json
{
  "data": {
    "type": "session.start",
    "sessionId": "uuid-123"
  }
}
```

#### 3. Get Session Status

Retrieve current status and details of a session.

**Request Body:**
```json
{
  "data": {
    "type": "session.get",
    "sessionId": "uuid-123"
  }
}
```

#### 4. Get Session Output

Retrieve the output and artifacts from a completed session.

**Request Body:**
```json
{
  "data": {
    "type": "session.output",
    "sessionId": "uuid-123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-123",
    "status": "completed",
    "output": {
      "logs": ["Created file: src/auth.js", "Implemented JWT validation"],
      "artifacts": [
        { "type": "file", "path": "src/auth.js" },
        { "type": "commit", "sha": "abc123def" }
      ],
      "summary": "Implemented JWT authentication middleware",
      "nextSteps": ["Add refresh token support", "Implement rate limiting"]
    }
  }
}
```

#### 5. List Sessions

List all sessions or filter by orchestration ID.

**Request Body:**
```json
{
  "data": {
    "type": "session.list",
    "orchestrationId": "orch-uuid-456"  // optional
  }
}
```

### Orchestration Endpoint (Simplified)

Create a single orchestration session that can coordinate other sessions via MCP tools.

**Request Body:**
```json
{
  "data": {
    "type": "orchestrate",
    "sessionType": "coordination",
    "autoStart": false,
    "project": {
      "repository": "owner/repo",
      "requirements": "Orchestrate building a full-stack application with authentication"
    }
  }
}
```

**Response:**
```json
{
  "message": "Webhook processed",
  "event": "orchestrate",
  "handlerCount": 1,
  "results": [{
    "success": true,
    "message": "Orchestration initiated successfully",
    "data": {
      "orchestrationId": "uuid",
      "status": "initiated",
      "sessions": [
        {
          "id": "uuid-analysis",
          "type": "analysis",
          "status": "running",
          "containerId": "claude-analysis-xxxxx",
          "dependencies": []
        },
        {
          "id": "uuid-impl-0",
          "type": "implementation",
          "status": "pending",
          "containerId": "claude-implementation-xxxxx",
          "dependencies": ["uuid-analysis"]
        }
      ],
      "summary": "Started 4 Claude sessions for owner/repo"
    }
  }]
}
```

## Configuration

### Environment Variables

- `CLAUDE_WEBHOOK_SECRET`: Bearer token for webhook authentication
- `CLAUDE_CONTAINER_IMAGE`: Docker image for Claude Code (default: `claudecode:latest`)
- `GITHUB_TOKEN`: GitHub access token for repository operations
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude access

### Strategy Options

#### Dependency Modes

- **`parallel`**: Start all independent sessions simultaneously
- **`sequential`**: Start sessions one by one in order
- **`wait_for_core`**: Start analysis first, then implementation in parallel, then testing/review

#### Session Types

- **`analysis`**: Analyze project and create implementation plan
- **`implementation`**: Write code based on requirements
- **`testing`**: Create comprehensive tests
- **`review`**: Review code and provide feedback
- **`coordination`**: Meta-session for orchestrating others

## Task Decomposition

The system automatically analyzes requirements to identify components:

- **API/Backend**: REST endpoints, GraphQL, services
- **Frontend**: UI, React, Vue, Angular components
- **Authentication**: JWT, OAuth, security features
- **Database**: Models, schemas, migrations
- **Testing**: Unit tests, integration tests
- **Deployment**: Docker, Kubernetes, CI/CD

Dependencies are automatically determined based on component relationships.

## Session Management

Each session runs in an isolated Docker container with:
- Dedicated Claude Code instance
- Access to repository via GitHub token
- Environment variables for configuration
- Automatic cleanup on completion

## Example Use Cases with MCP

### 1. Full-Stack Application Development

Claude Desktop orchestrating a complete application build:

```typescript
// Claude Desktop's orchestration logic (pseudocode)
async function buildFullStackApp(repo: string) {
  // 1. Create analysis session
  const analysisSession = await createClaudeSession({
    type: "analysis",
    repository: repo,
    requirements: "Analyze requirements and create architecture plan for task management app"
  });
  
  await startClaudeSession(analysisSession.id);
  const analysisResult = await waitForCompletion(analysisSession.id);
  
  // 2. Create parallel implementation sessions based on analysis
  const sessions = await Promise.all([
    createClaudeSession({
      type: "implementation",
      repository: repo,
      requirements: "Implement Express backend with PostgreSQL",
      dependencies: [analysisSession.id]
    }),
    createClaudeSession({
      type: "implementation",
      repository: repo,
      requirements: "Implement React frontend",
      dependencies: [analysisSession.id]
    }),
    createClaudeSession({
      type: "implementation",
      repository: repo,
      requirements: "Implement JWT authentication",
      dependencies: [analysisSession.id]
    })
  ]);
  
  // 3. Start all implementation sessions
  await Promise.all(sessions.map(s => startClaudeSession(s.id)));
  
  // 4. Create testing session after implementations complete
  const testSession = await createClaudeSession({
    type: "testing",
    repository: repo,
    requirements: "Write comprehensive tests for all components",
    dependencies: sessions.map(s => s.id)
  });
  
  // 5. Monitor and aggregate results
  const results = await gatherAllResults([...sessions, testSession]);
  return synthesizeResults(results);
}
```

### 2. Intelligent Bug Fix Workflow

```typescript
// Claude Desktop adaptively handling a bug fix
async function fixBugWithTests(repo: string, issueDescription: string) {
  // 1. Analyze the bug
  const analysisSession = await createClaudeSession({
    type: "analysis",
    repository: repo,
    requirements: `Analyze bug: ${issueDescription}`
  });
  
  const analysis = await runAndGetOutput(analysisSession.id);
  
  // 2. Decide strategy based on analysis
  if (analysis.complexity === "high") {
    // Complex bug: separate diagnosis and fix sessions
    await runDiagnosisFirst(repo, analysis);
  } else {
    // Simple bug: fix and test in parallel
    await runFixAndTestParallel(repo, analysis);
  }
}
```

### 3. Progressive Enhancement Pattern

```typescript
// Claude Desktop implementing features progressively
async function enhanceAPI(repo: string, features: string[]) {
  let previousSessionId = null;
  
  for (const feature of features) {
    const session = await createClaudeSession({
      type: "implementation",
      repository: repo,
      requirements: `Add ${feature} to the API`,
      dependencies: previousSessionId ? [previousSessionId] : []
    });
    
    await startClaudeSession(session.id);
    await waitForCompletion(session.id);
    
    // Run tests after each feature
    const testSession = await createClaudeSession({
      type: "testing",
      repository: repo,
      requirements: `Test ${feature} implementation`,
      dependencies: [session.id]
    });
    
    await runAndVerify(testSession.id);
    previousSessionId = session.id;
  }
}
```

## MCP Integration Guide

### Overview

The Claude orchestration system is designed to be wrapped as MCP Server tools, allowing Claude Desktop to orchestrate multiple Claude Code sessions intelligently.

### MCP Server Tool Examples

```typescript
// Example MCP Server tool definitions
const tools = [
  {
    name: "create_claude_session",
    description: "Create a new Claude Code session for a specific task",
    inputSchema: {
      type: "object",
      properties: {
        sessionType: { 
          type: "string", 
          enum: ["analysis", "implementation", "testing", "review", "coordination"] 
        },
        repository: { type: "string" },
        requirements: { type: "string" },
        dependencies: { type: "array", items: { type: "string" } }
      },
      required: ["sessionType", "repository", "requirements"]
    }
  },
  {
    name: "start_claude_session",
    description: "Start a Claude Code session",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }
      },
      required: ["sessionId"]
    }
  },
  {
    name: "get_session_output",
    description: "Get the output from a Claude Code session",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }
      },
      required: ["sessionId"]
    }
  }
];
```

### Orchestration Workflow Example

Claude Desktop can use these tools to orchestrate complex tasks:

```markdown
# Claude Desktop Orchestration Example

1. User: "Build a REST API with authentication"

2. Claude Desktop thinks:
   - Need to analyze requirements first
   - Then implement API and auth in parallel
   - Finally run tests

3. Claude Desktop executes:
   a. create_claude_session(type="analysis", repo="user/api", requirements="Analyze and plan REST API with JWT auth")
   b. start_claude_session(sessionId="analysis-123")
   c. Wait for completion...
   d. get_session_output(sessionId="analysis-123")
   
   e. Based on analysis output:
      - create_claude_session(type="implementation", requirements="Implement REST endpoints")
      - create_claude_session(type="implementation", requirements="Implement JWT authentication")
   
   f. Start both implementation sessions in parallel
   g. Monitor progress and aggregate results
   h. Create and run testing session with dependencies
```

### Benefits of MCP Integration

- **Intelligent Orchestration**: Claude Desktop can dynamically decide how to break down tasks
- **Adaptive Workflow**: Can adjust strategy based on intermediate results
- **Parallel Execution**: Run multiple specialized Claude instances simultaneously
- **Context Preservation**: Each session maintains its own context and state
- **Result Aggregation**: Claude Desktop can synthesize outputs from all sessions

## Security Considerations

- Bearer token authentication required for all endpoints
- Each session runs in isolated Docker container
- No direct access to host system
- Environment variables sanitized before container creation
- Automatic container cleanup on completion
- Volume mounts isolated per session

## Implementation Details

### Session Lifecycle

1. **Creation**: Container created but not started
2. **Initialization**: Container started, Claude Code preparing
3. **Running**: Claude actively working on the task
4. **Completed/Failed**: Task finished, output available
5. **Cleanup**: Container removed, volumes optionally preserved

### Dependency Management

Sessions can declare dependencies on other sessions:
- Dependent sessions wait in queue until dependencies complete
- Automatic start when all dependencies are satisfied
- Failure of dependency marks dependent sessions as blocked

### Resource Management

- Docker volumes for persistent storage across session lifecycle
- Separate volumes for project files and Claude configuration
- Automatic cleanup of orphaned containers
- Resource limits can be configured per session type

## Best Practices for MCP Integration

1. **Session Granularity**: Create focused sessions with clear, specific requirements
2. **Dependency Design**: Use dependencies to ensure proper execution order
3. **Error Handling**: Check session status before retrieving output
4. **Resource Awareness**: Limit parallel sessions based on available resources
5. **Progress Monitoring**: Poll session status at reasonable intervals

## Troubleshooting

### Common Issues

1. **Session Stuck in Initializing**
   - Check Docker daemon is running
   - Verify Claude container image exists
   - Check container logs for startup errors

2. **Dependencies Not Met**
   - Verify dependency session IDs are correct
   - Check if dependency sessions completed successfully
   - Use session.list to see all session statuses

3. **No Output Available**
   - Ensure session completed successfully
   - Check if Claude produced any output
   - Review session logs for errors

## Future Enhancements

- WebSocket support for real-time session updates
- Session templates for common workflows
- Resource pooling for faster container startup
- Inter-session communication channels
- Session result caching and replay
- Advanced scheduling algorithms
- Cost optimization strategies