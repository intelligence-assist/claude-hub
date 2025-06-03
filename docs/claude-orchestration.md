# Claude Orchestration Provider

The Claude orchestration provider enables parallel execution of multiple Claude Code containers to solve complex tasks. This is designed for the MCP (Model Context Protocol) hackathon to demonstrate super-charged Claude capabilities.

## Overview

The orchestration system allows you to:
- Break down complex projects into parallel workstreams
- Run multiple Claude sessions concurrently
- Manage dependencies between sessions
- Aggregate results from all sessions

## Architecture

```
POST /api/webhooks/claude
├── ClaudeWebhookProvider (webhook handling)
├── OrchestrationHandler (orchestration logic)
├── SessionManager (container lifecycle)
└── TaskDecomposer (task analysis)
```

## API Endpoints

### Orchestrate Claude Sessions

**Endpoint:** `POST /api/webhooks/claude`

**Headers:**
```
Authorization: Bearer <CLAUDE_WEBHOOK_SECRET>
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "orchestrate",
  "project": {
    "repository": "owner/repo",
    "branch": "feature-branch",
    "requirements": "Build a REST API with authentication, database integration, and comprehensive testing",
    "context": "Additional context or constraints"
  },
  "strategy": {
    "parallelSessions": 4,
    "phases": ["analysis", "implementation", "testing", "review"],
    "dependencyMode": "wait_for_core",
    "timeout": 1800000
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

## Example Use Cases

### 1. Full-Stack Application

```json
{
  "type": "orchestrate",
  "project": {
    "repository": "myorg/myapp",
    "requirements": "Build a task management app with React frontend, Express backend, PostgreSQL database, JWT auth, and full test coverage"
  }
}
```

This will create sessions for:
- Analysis (planning and architecture)
- Backend implementation
- Frontend implementation
- Authentication implementation
- Testing (after implementations complete)
- Review (final code review)

### 2. API Development

```json
{
  "type": "orchestrate",
  "project": {
    "repository": "myorg/api",
    "requirements": "Create a RESTful API for user management with CRUD operations, validation, error handling, and OpenAPI documentation"
  },
  "strategy": {
    "phases": ["analysis", "implementation", "testing"],
    "dependencyMode": "sequential"
  }
}
```

### 3. Bug Fix with Testing

```json
{
  "type": "orchestrate",
  "project": {
    "repository": "myorg/app",
    "requirements": "Fix the authentication timeout issue and add comprehensive tests to prevent regression"
  },
  "strategy": {
    "parallelSessions": 2,
    "phases": ["implementation", "testing"]
  }
}
```

## Integration with MCP Tools

The Claude orchestration provider is designed to be called from MCP (Model Context Protocol) tools, enabling:

- **Parallel Execution**: Multiple Claude instances working on different aspects
- **Smart Coordination**: Sessions can wait for dependencies
- **Result Aggregation**: Combine outputs from all sessions
- **Progress Tracking**: Monitor session status in real-time

## Security Considerations

- Bearer token authentication required
- Each session runs in isolated container
- No direct access to host system
- Environment variables sanitized
- Automatic container cleanup

## Limitations

- Maximum parallel sessions determined by system resources
- Container startup time adds latency
- Network isolation between containers
- No direct inter-session communication (coordination through orchestrator)

## Future Enhancements

- WebSocket support for real-time updates
- Inter-session message passing
- Custom session types
- Resource pooling for faster startup
- Session result caching