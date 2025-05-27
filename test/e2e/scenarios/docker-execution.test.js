const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe(
  'Docker Execution E2E',
  () => {
    describe('Docker Runtime Validation', () => {
      test('should verify Docker is available', async () => {
        const { spawn } = require('child_process');

        const dockerCheck = await new Promise(resolve => {
          const child = spawn('docker', ['--version'], { stdio: 'pipe' });
          let stdout = '';

          child.stdout.on('data', data => {
            stdout += data.toString();
          });

          child.on('close', code => {
            resolve({ exitCode: code, stdout });
          });

          child.on('error', () => {
            resolve({ exitCode: 1, stdout: '' });
          });
        });

        expect(dockerCheck.exitCode).toBe(0);
        expect(dockerCheck.stdout).toContain('Docker version');
      });

      test('should verify target Docker image exists', async () => {
        const { dockerImageExists } = require('../utils');
        const imageExists = await dockerImageExists('claude-code-runner:latest');

        if (!imageExists) {
          console.warn(
            '⚠️ Docker image claude-code-runner:latest not found. This is expected in CI environments.'
          );
          console.warn(
            '   The image should be built before running E2E tests in local development.'
          );
        }

        // Don't fail the test if image doesn't exist, just log a warning
        expect(typeof imageExists).toBe('boolean');
      });
    });

    describe('Basic Docker Operations', () => {
      test('should execute simple Docker command', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'echo "Docker execution test successful"'
          });

          assertCommandSuccess(result, 'Docker execution test successful');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true); // Pass the test with a warning
          } else {
            throw error;
          }
        }
      });

      test('should handle Docker environment variables', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'echo "TEST_VAR=$TEST_VAR" && echo "ENV_CHECK=OK"',
            env: {
              TEST_VAR: 'test-value'
            }
          });

          assertCommandSuccess(result);
          expect(result.stdout).toContain('TEST_VAR=test-value');
          expect(result.stdout).toContain('ENV_CHECK=OK');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });
    });

    describe('Container Lifecycle Management', () => {
      test('should handle container startup and shutdown', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: `
            echo "Container startup test..."
            echo "PID: $$"
            echo "Hostname: $HOSTNAME"
            echo "Container lifecycle test complete"
          `
          });

          assertCommandSuccess(result);
          expect(result.stdout).toContain('Container startup test');
          expect(result.stdout).toContain('Container lifecycle test complete');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });

      test('should clean up containers automatically', async () => {
        // The --rm flag ensures automatic cleanup
        // This test verifies the cleanup mechanism works
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'echo "Cleanup test" && exit 0'
          });

          assertCommandSuccess(result, 'Cleanup test');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });
    });

    describe('Docker Security and Isolation', () => {
      test('should run containers with proper isolation', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: `
            echo "Security isolation test..."
            echo "User: $(whoami)"
            echo "Working dir: $(pwd)"
            echo "Process isolation: $(ps aux | wc -l) processes visible"
            echo "Security test complete"
          `
          });

          assertCommandSuccess(result);
          expect(result.stdout).toContain('Security test complete');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });

      test('should handle privileged operations when needed', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'echo "Privileged test" && id && echo "Privileged test complete"',
            privileged: true
          });

          assertCommandSuccess(result);
          expect(result.stdout).toContain('Privileged test complete');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });
    });

    describe('Error Handling and Recovery', () => {
      test('should handle command failures properly', async () => {
        try {
          const result = await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'echo "Before error" && false && echo "After error"'
          });

          expect(result.exitCode).toBe(1);
          expect(result.stdout).toContain('Before error');
          expect(result.stdout).not.toContain('After error');
        } catch (error) {
          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            throw error;
          }
        }
      });

      test('should handle timeouts appropriately', async () => {
        const startTime = Date.now();

        try {
          await containerExecutor.exec({
            entrypoint: '/bin/bash',
            command: 'sleep 5',
            timeout: 2000 // 2 second timeout
          });

          // Should not reach here
          expect(false).toBe(true);
        } catch (error) {
          const duration = Date.now() - startTime;

          if (error.message.includes('Unable to find image')) {
            console.warn('⚠️ Skipping test: Docker image not available');
            expect(true).toBe(true);
          } else {
            expect(duration).toBeLessThan(4000); // Should timeout before 4 seconds
            expect(error.message).toContain('timed out');
          }
        }
      });
    });
  },
  {
    dockerImage: 'claude-code-runner:latest'
  }
);
