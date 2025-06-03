import { TaskDecomposer } from '../../../../../src/providers/claude/services/TaskDecomposer';
import type { ProjectInfo } from '../../../../../src/types/claude-orchestration';

describe('TaskDecomposer', () => {
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    decomposer = new TaskDecomposer();
  });

  describe('decompose', () => {
    it('should decompose API project into components', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements: 'Build a REST API with authentication and database integration'
      };

      const result = await decomposer.decompose(project);

      expect(result.components).toBeDefined();
      expect(result.components.length).toBeGreaterThan(0);

      // Should identify API, auth, and backend components
      const componentNames = result.components.map(c => c.name);
      expect(componentNames).toContain('api');
      expect(componentNames).toContain('auth');
      expect(componentNames).toContain('backend');
    });

    it('should decompose frontend project', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements: 'Create a React frontend with user interface for managing tasks'
      };

      const result = await decomposer.decompose(project);

      const componentNames = result.components.map(c => c.name);
      expect(componentNames).toContain('frontend');
    });

    it('should handle full-stack project', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements:
          'Build a full-stack application with React frontend, Express backend, PostgreSQL database, JWT authentication, and comprehensive testing'
      };

      const result = await decomposer.decompose(project);

      const componentNames = result.components.map(c => c.name);
      expect(componentNames).toContain('frontend');
      expect(componentNames).toContain('backend');
      expect(componentNames).toContain('auth');
      expect(componentNames).toContain('testing');
    });

    it('should set proper dependencies', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements: 'Build API server with database backend, frontend UI, and testing'
      };

      const result = await decomposer.decompose(project);

      // Find components
      const api = result.components.find(c => c.name === 'api');
      const backend = result.components.find(c => c.name === 'backend');
      const frontend = result.components.find(c => c.name === 'frontend');
      const testing = result.components.find(c => c.name === 'testing');

      // Check backend exists
      expect(backend).toBeDefined();

      // Check dependencies
      if (api) {
        expect(api.dependencies).toContain('backend');
      }
      if (frontend) {
        expect(frontend.dependencies).toContain('api');
      }
      if (testing) {
        expect(testing.dependencies.length).toBeGreaterThan(0);
        expect(testing.dependencies).toContain('api');
      }
    });

    it('should handle simple requirements', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements: 'Fix a bug in the code'
      };

      const result = await decomposer.decompose(project);

      expect(result.components.length).toBe(1);
      expect(result.components[0].name).toBe('implementation');
      expect(result.components[0].requirements).toBe('Fix a bug in the code');
    });

    it('should determine strategy based on components', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements: 'Build API with frontend, backend, auth, and deployment'
      };

      const result = await decomposer.decompose(project);

      // Should use wait_for_core strategy due to dependencies
      expect(result.strategy).toBe('wait_for_core');
    });

    it('should extract component-specific requirements', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements:
          'Build a REST API with endpoints for user management. Add JWT authentication for secure access. Create a React frontend with Material UI.'
      };

      const result = await decomposer.decompose(project);

      const api = result.components.find(c => c.name === 'api');
      const auth = result.components.find(c => c.name === 'auth');
      const frontend = result.components.find(c => c.name === 'frontend');

      expect(api?.requirements).toContain('REST API');
      expect(api?.requirements).toContain('endpoints');
      expect(auth?.requirements).toContain('JWT authentication');
      expect(frontend?.requirements).toContain('React frontend');
    });

    it('should set appropriate priorities', async () => {
      const project: ProjectInfo = {
        repository: 'owner/repo',
        requirements:
          'Build backend with database, API endpoints, authentication, frontend UI, and deployment scripts'
      };

      const result = await decomposer.decompose(project);

      const backend = result.components.find(c => c.name === 'backend');
      const auth = result.components.find(c => c.name === 'auth');
      const frontend = result.components.find(c => c.name === 'frontend');
      const deployment = result.components.find(c => c.name === 'deployment');

      expect(backend?.priority).toBe('high');
      expect(auth?.priority).toBe('high');
      expect(frontend?.priority).toBe('medium');
      expect(deployment?.priority).toBe('low');
    });
  });
});
