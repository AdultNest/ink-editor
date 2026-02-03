/**
 * Conversation Engine Unit Tests
 *
 * Demonstrates how to test the conversation engine with mock implementations.
 * Uses the injected interfaces to isolate the engine from external dependencies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConversationEngine,
  SessionManager,
  InMemorySessionStorage,
  MockLLMProvider,
  MockFileService,
  MockNotificationService,
  type ConversationSession,
  type LLMMessage,
  type ToolDefinition,
  type IToolProvider,
  type ToolExecutionContext,
  type ToolResult,
} from './index';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Simple mock tool provider for testing
 */
class MockToolProvider implements IToolProvider {
  private executedTools: Array<{ name: string; args: Record<string, unknown> }> = [];

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Test input' },
            },
            required: ['input'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'mark_goal_complete',
          description: 'Mark goal complete',
          parameters: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Summary' },
            },
            required: ['summary'],
          },
        },
      },
    ];
  }

  async executeTool(
    _context: ToolExecutionContext,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    this.executedTools.push({ name: toolName, args });

    if (toolName === 'mark_goal_complete') {
      return {
        success: true,
        result: `Goal completed: ${args.summary}`,
        metadata: { goalComplete: true, summary: args.summary as string },
      };
    }

    return {
      success: true,
      result: `Executed ${toolName} with input: ${args.input}`,
    };
  }

  getIterationCountingTools(): string[] {
    return ['test_tool'];
  }

  getExecutedTools() {
    return this.executedTools;
  }

  reset() {
    this.executedTools = [];
  }
}

/**
 * Create a test conversation engine with mocks
 */
function createTestEngine() {
  const llmProvider = new MockLLMProvider();
  const fileService = new MockFileService();
  const notificationService = new MockNotificationService();
  const toolProvider = new MockToolProvider();
  const sessionManager = new SessionManager(new InMemorySessionStorage());

  const engine = new ConversationEngine({
    llmProvider,
    toolProvider,
    fileService,
    notificationService,
    systemPromptBuilder: (session: ConversationSession) => `Test prompt for: ${session.goal}`,
    llmOptions: { temperature: 0.5, maxTokens: 100, timeout: 1000 },
  });

  return {
    engine,
    sessionManager,
    llmProvider,
    fileService,
    notificationService,
    toolProvider,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ConversationEngine', () => {
  describe('runConversationTurn', () => {
    it('should return error for non-existent session', async () => {
      const { engine, sessionManager } = createTestEngine();

      const result = await engine.runConversationTurn('non-existent', sessionManager);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Session not found');
    });

    it('should send message to LLM and add response to session', async () => {
      const { engine, sessionManager, llmProvider } = createTestEngine();

      // Create a session
      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 10,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      // Add initial message
      sessionManager.addMessage(session.id, { role: 'user', content: 'Hello' });

      // Queue LLM response - asking a question to stop auto-continue
      llmProvider.queueResponse({
        success: true,
        message: { role: 'assistant', content: 'What do you want?' },
        done: true,
      });

      const result = await engine.runConversationTurn(session.id, sessionManager);

      expect(result.status).toBe('active');
      expect(result.message?.content).toBe('What do you want?');

      // Verify LLM was called with correct messages
      expect(llmProvider.calls.length).toBe(1);
      expect(llmProvider.calls[0].messages[0].role).toBe('system');
      expect(llmProvider.calls[0].messages[1].role).toBe('user');
    });

    it('should execute tool calls from LLM', async () => {
      const { engine, sessionManager, llmProvider, toolProvider } = createTestEngine();

      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 10,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      sessionManager.addMessage(session.id, { role: 'user', content: 'Run test' });

      // First response: tool call
      llmProvider.queueResponse({
        success: true,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'test_tool', arguments: { input: 'test-value' } } },
          ],
        },
        done: true,
      });

      // Second response: asking question to stop loop
      llmProvider.queueResponse({
        success: true,
        message: { role: 'assistant', content: 'Did it work?' },
        done: true,
      });

      const result = await engine.runConversationTurn(session.id, sessionManager);

      // Should have executed the tool
      expect(toolProvider.getExecutedTools().length).toBe(1);
      expect(toolProvider.getExecutedTools()[0].name).toBe('test_tool');
      expect(toolProvider.getExecutedTools()[0].args.input).toBe('test-value');

      // Should have called LLM twice (once for tool, once for continuation)
      expect(llmProvider.calls.length).toBe(2);
    });

    it('should complete session when goal is marked complete', async () => {
      const { engine, sessionManager, llmProvider } = createTestEngine();

      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 10,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      sessionManager.addMessage(session.id, { role: 'user', content: 'Complete the goal' });

      llmProvider.queueResponse({
        success: true,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'mark_goal_complete', arguments: { summary: 'All done!' } } },
          ],
        },
        done: true,
      });

      const result = await engine.runConversationTurn(session.id, sessionManager);

      expect(result.status).toBe('completed');
      expect(result.completionSummary).toBe('All done!');
    });

    it('should increment iteration count for content-creating tools', async () => {
      const { engine, sessionManager, llmProvider } = createTestEngine();

      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 2,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      sessionManager.addMessage(session.id, { role: 'user', content: 'Test' });

      // First turn: tool that counts
      llmProvider.queueResponse({
        success: true,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'test_tool', arguments: { input: 'v1' } } },
          ],
        },
        done: true,
      });
      llmProvider.queueResponse({
        success: true,
        message: { role: 'assistant', content: 'What next?' },
        done: true,
      });

      await engine.runConversationTurn(session.id, sessionManager);

      const updated = sessionManager.getSession(session.id);
      expect(updated?.iterationCount).toBe(1);
    });

    it('should stop at max iterations', async () => {
      const { engine, sessionManager, llmProvider } = createTestEngine();

      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 1,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      sessionManager.addMessage(session.id, { role: 'user', content: 'Test' });

      llmProvider.queueResponse({
        success: true,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'test_tool', arguments: { input: 'v1' } } },
          ],
        },
        done: true,
      });

      const result = await engine.runConversationTurn(session.id, sessionManager);

      expect(result.status).toBe('max_iterations');
    });

    it('should notify on conversation updates', async () => {
      const { engine, sessionManager, llmProvider, notificationService } = createTestEngine();

      const session = sessionManager.createSession({
        goal: 'Test goal',
        maxIterations: 10,
        projectPath: '/test/project',
        inkFilePath: '/test/project/story.ink',
      });

      sessionManager.addMessage(session.id, { role: 'user', content: 'Hello' });

      llmProvider.queueResponse({
        success: true,
        message: { role: 'assistant', content: 'What do you want?' },
        done: true,
      });

      await engine.runConversationTurn(session.id, sessionManager);

      expect(notificationService.conversationUpdates.length).toBeGreaterThan(0);
      expect(notificationService.conversationUpdates[0].sessionId).toBe(session.id);
    });
  });
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(new InMemorySessionStorage());
  });

  it('should create a session with unique ID', () => {
    const session1 = sessionManager.createSession({
      goal: 'Goal 1',
      maxIterations: 10,
      projectPath: '/path1',
      inkFilePath: '/path1/story.ink',
    });

    const session2 = sessionManager.createSession({
      goal: 'Goal 2',
      maxIterations: 5,
      projectPath: '/path2',
      inkFilePath: '/path2/story.ink',
    });

    expect(session1.id).not.toBe(session2.id);
  });

  it('should get session by ID', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
    });

    const retrieved = sessionManager.getSession(session.id);
    expect(retrieved?.goal).toBe('Test');
  });

  it('should add messages to session', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
    });

    sessionManager.addMessage(session.id, { role: 'user', content: 'Hello' });
    sessionManager.addMessage(session.id, { role: 'assistant', content: 'Hi!' });

    const updated = sessionManager.getSession(session.id);
    expect(updated?.messages.length).toBe(2);
  });

  it('should increment iteration count', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
    });

    sessionManager.incrementIteration(session.id);
    sessionManager.incrementIteration(session.id);

    const updated = sessionManager.getSession(session.id);
    expect(updated?.iterationCount).toBe(2);
  });

  it('should set status to max_iterations when limit reached', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 2,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
    });

    sessionManager.incrementIteration(session.id);
    sessionManager.incrementIteration(session.id);

    const updated = sessionManager.getSession(session.id);
    expect(updated?.status).toBe('max_iterations');
  });

  it('should cancel session', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
    });

    sessionManager.cancelSession(session.id);

    const updated = sessionManager.getSession(session.id);
    expect(updated?.status).toBe('cancelled');
  });

  it('should store custom data in session', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
      data: { customField: 'value' },
    });

    expect(session.data.customField).toBe('value');
  });

  it('should add items to session data arrays', () => {
    const session = sessionManager.createSession({
      goal: 'Test',
      maxIterations: 10,
      projectPath: '/path',
      inkFilePath: '/path/story.ink',
      data: { createdKnots: [] },
    });

    sessionManager.addToSessionDataArray(session.id, 'createdKnots', 'knot1');
    sessionManager.addToSessionDataArray(session.id, 'createdKnots', 'knot2');
    sessionManager.addToSessionDataArray(session.id, 'createdKnots', 'knot1'); // duplicate

    const updated = sessionManager.getSession(session.id);
    expect(updated?.data.createdKnots).toEqual(['knot1', 'knot2']);
  });
});

describe('InkToolProvider', () => {
  it('should be separately testable', async () => {
    const { InkToolProvider, MockFileService, MockNotificationService } = await import('./index');

    const toolProvider = new InkToolProvider();
    const fileService = new MockFileService();
    const notificationService = new MockNotificationService();

    // Set up a mock ink file
    fileService.setFile('/test/story.ink', `
=== start ===
Hello!
* [Choice 1] -> end
* [Choice 2] -> end

=== end ===
The end.
-> END
`);

    const context = {
      projectPath: '/test',
      inkFilePath: '/test/story.ink',
      sessionId: 'test-session',
      fileService,
      notificationService,
      data: {},
    };

    // Test list_knots tool
    const result = await toolProvider.executeTool(context, 'list_knots', {});

    expect(result.success).toBe(true);
    expect(result.result).toContain('start');
    expect(result.result).toContain('end');
  });

  it('should allow registering additional tools', async () => {
    const { InkToolProvider, MockFileService, MockNotificationService } = await import('./index');

    const toolProvider = new InkToolProvider();

    // Register a custom tool
    toolProvider.registerTool(
      {
        type: 'function',
        function: {
          name: 'custom_tool',
          description: 'A custom tool',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      async () => ({ success: true, result: 'Custom result' }),
      true // counts towards iteration
    );

    const definitions = toolProvider.getToolDefinitions();
    expect(definitions.some(d => d.function.name === 'custom_tool')).toBe(true);

    const iterationTools = toolProvider.getIterationCountingTools();
    expect(iterationTools).toContain('custom_tool');
  });
});
