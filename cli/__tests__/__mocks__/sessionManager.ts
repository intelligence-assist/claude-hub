// Mock implementation of SessionManager for testing
import { SessionConfig, SessionStatus } from '../../src/types/session';

const mockSessions: Record<string, SessionConfig> = {};

export const mockCreateSession = jest.fn().mockImplementation((sessionConfig: SessionConfig) => {
  mockSessions[sessionConfig.id] = sessionConfig;
  return Promise.resolve(sessionConfig);
});

export const mockUpdateSession = jest.fn().mockImplementation((id: string, updates: Partial<SessionConfig>) => {
  if (mockSessions[id]) {
    mockSessions[id] = { ...mockSessions[id], ...updates };
    return Promise.resolve(mockSessions[id]);
  }
  return Promise.resolve(null);
});

export const mockGetSession = jest.fn().mockImplementation((id: string) => {
  return Promise.resolve(mockSessions[id] || null);
});

export const mockGetAllSessions = jest.fn().mockImplementation(() => {
  return Promise.resolve(Object.values(mockSessions));
});

export const mockDeleteSession = jest.fn().mockImplementation((id: string) => {
  if (mockSessions[id]) {
    delete mockSessions[id];
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
});

export const mockRecoverSession = jest.fn().mockImplementation((id: string) => {
  if (mockSessions[id]) {
    mockSessions[id].status = SessionStatus.RUNNING;
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
});

export const mockSyncSessions = jest.fn().mockResolvedValue(true);

const mockSessionManager = jest.fn().mockImplementation(() => {
  return {
    createSession: mockCreateSession,
    updateSession: mockUpdateSession,
    getSession: mockGetSession,
    getAllSessions: mockGetAllSessions,
    deleteSession: mockDeleteSession,
    recoverSession: mockRecoverSession,
    syncSessions: mockSyncSessions,
    reset: () => {
      // Clear all mock sessions
      Object.keys(mockSessions).forEach(key => delete mockSessions[key]);
    }
  };
});

export default mockSessionManager;