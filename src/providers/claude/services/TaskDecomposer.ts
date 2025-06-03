import { createLogger } from '../../../utils/logger';
import type { ProjectInfo } from '../../../types/claude-orchestration';

const logger = createLogger('TaskDecomposer');

export interface TaskComponent {
  name: string;
  requirements: string;
  context?: string;
  dependencies?: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface TaskDecomposition {
  components: TaskComponent[];
  strategy: 'sequential' | 'parallel' | 'wait_for_core';
  estimatedSessions: number;
}

// Named constant for extra sessions
const EXTRA_SESSIONS_COUNT = 3; // For analysis, testing, and review

/**
 * Decomposes complex tasks into manageable components
 * This is a simplified version - Claude will handle the actual intelligent decomposition
 */
export class TaskDecomposer {
  /**
   * Decompose a project into individual components
   */
  decompose(project: ProjectInfo): TaskDecomposition {
    logger.info('Decomposing project', { repository: project.repository });

    // Analyze requirements to identify components
    const components = this.analyzeRequirements(project.requirements);

    // Determine strategy based on components
    const strategy = this.determineStrategy(components);

    const decomposition = {
      components,
      strategy,
      estimatedSessions: components.length + EXTRA_SESSIONS_COUNT
    };

    return decomposition;
  }

  /**
   * Analyze requirements and extract components
   * This is a simplified version for testing - Claude will do the real analysis
   */
  private analyzeRequirements(requirements: string): TaskComponent[] {
    const components: TaskComponent[] = [];

    // Keywords that indicate different components
    const componentKeywords = {
      api: ['api', 'endpoint', 'rest', 'graphql', 'service'],
      frontend: ['ui', 'frontend', 'react', 'vue', 'angular', 'interface'],
      backend: ['backend', 'server', 'database', 'model', 'schema'],
      auth: ['auth', 'authentication', 'authorization', 'security', 'jwt', 'oauth'],
      testing: ['test', 'testing', 'unit test', 'integration test'],
      deployment: ['deploy', 'deployment', 'docker', 'kubernetes', 'ci/cd']
    };

    const lowerRequirements = requirements.toLowerCase();

    // First pass: identify which components exist
    const existingComponents = new Set<string>();
    for (const [componentType, keywords] of Object.entries(componentKeywords)) {
      const hasComponent = keywords.some(keyword => lowerRequirements.includes(keyword));
      if (hasComponent) {
        existingComponents.add(componentType);
      }
    }

    // Second pass: create components with proper dependencies
    for (const [componentType, keywords] of Object.entries(componentKeywords)) {
      const hasComponent = keywords.some(keyword => lowerRequirements.includes(keyword));

      if (hasComponent) {
        let priority: 'high' | 'medium' | 'low' = 'medium';
        let dependencies: string[] = [];

        // Set priorities and dependencies based on component type
        switch (componentType) {
          case 'auth':
            priority = 'high';
            break;
          case 'backend':
            priority = 'high';
            break;
          case 'api':
            priority = 'high';
            // Only add backend dependency if backend component exists
            if (existingComponents.has('backend')) {
              dependencies = ['backend'];
            }
            break;
          case 'frontend':
            priority = 'medium';
            // Only add api dependency if api component exists
            if (existingComponents.has('api')) {
              dependencies = ['api'];
            }
            break;
          case 'testing':
            priority = 'low';
            // Add dependencies for all existing components
            dependencies = ['backend', 'api', 'frontend'].filter(dep =>
              existingComponents.has(dep)
            );
            break;
          case 'deployment':
            priority = 'low';
            // Add dependencies for all existing components
            dependencies = ['backend', 'api', 'frontend', 'testing'].filter(dep =>
              existingComponents.has(dep)
            );
            break;
        }

        components.push({
          name: componentType,
          requirements: this.extractComponentRequirements(requirements, componentType, keywords),
          priority,
          dependencies
        });
      }
    }

    // If no specific components found, create a single implementation component
    if (components.length === 0) {
      components.push({
        name: 'implementation',
        requirements: requirements,
        priority: 'high',
        dependencies: []
      });
    }

    return components;
  }

  /**
   * Extract specific requirements for a component
   */
  private extractComponentRequirements(
    requirements: string,
    componentType: string,
    keywords: string[]
  ): string {
    // Find sentences or phrases that contain the keywords
    const sentences = requirements.split(/[.!?]+/);
    const relevantSentences = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      return keywords.some(keyword => lowerSentence.includes(keyword));
    });

    if (relevantSentences.length > 0) {
      return relevantSentences.join('. ').trim();
    }

    // Fallback to generic description
    return `Implement ${componentType} functionality as described in the overall requirements`;
  }

  /**
   * Determine the best strategy based on components
   */
  private determineStrategy(
    components: TaskComponent[]
  ): 'sequential' | 'parallel' | 'wait_for_core' {
    // If we have dependencies, use wait_for_core strategy
    const hasDependencies = components.some(c => c.dependencies && c.dependencies.length > 0);

    if (hasDependencies) {
      return 'wait_for_core';
    }

    // If we have many independent components, use parallel
    if (components.length > 3) {
      return 'parallel';
    }

    // Default to sequential for small projects
    return 'sequential';
  }
}
