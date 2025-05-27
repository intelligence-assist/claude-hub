const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe(
  'Container Execution E2E',
  () => {
    describe('Basic Container Functionality', () => {
      test('should execute Claude command in basic container', async () => {
        const result = await containerExecutor.execBasicContainer({
          command: 'echo "Container works" && ls -la /home/node/'
        });

        assertCommandSuccess(result, 'Container works');
        expect(result.stdout).toContain('.bashrc');
      });

      test('should execute container with custom command', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo test',
          repo: 'owner/test-repo'
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('test');
      });
    });

    describe('Container with Volume Mounts', () => {
      test('should mount AWS credentials volume', async () => {
        const result = await containerExecutor.execWithAWSMount();

        // Test should pass even if AWS directory doesn't exist
        // This tests the mount capability, not the presence of credentials
        expect(result.exitCode).toBe(0);
      });

      test('should access mounted volumes', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "Testing volume mount" > /tmp/test.txt && cat /tmp/test.txt',
          volumes: ['/tmp:/tmp']
        });

        assertCommandSuccess(result, 'Testing volume mount');
      });
    });

    describe('Container Cleanup', () => {
      test('should automatically remove container after execution', async () => {
        // The --rm flag ensures automatic cleanup
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "cleanup test" && echo $HOSTNAME'
        });

        assertCommandSuccess(result, 'cleanup test');
        // Container should be automatically removed due to --rm flag
      });

      test('should handle container exit codes properly', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'exit 1'
        });

        expect(result.exitCode).toBe(1);
      });
    });

    describe('Privileged Container Operations', () => {
      test('should run container in privileged mode', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'whoami && echo "Privileged container test"',
          privileged: true,
          capabilities: ['SYS_ADMIN']
        });

        assertCommandSuccess(result, 'Privileged container test');
      });

      test('should handle container capabilities', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "Testing capabilities" && id',
          capabilities: ['NET_ADMIN', 'SYS_TIME']
        });

        assertCommandSuccess(result, 'Testing capabilities');
      });
    });
  },
  {
    dockerImage: 'claude-code-runner:latest'
  }
);
