export interface GitHubWebhookPayload {
    action?: string;
    issue?: {
        number: number;
        title: string;
        body: string;
        user: {
            login: string;
        };
    };
    comment?: {
        id: number;
        body: string;
        user: {
            login: string;
        };
    };
    repository?: {
        full_name: string;
        name: string;
        owner: {
            login: string;
        };
    };
    pull_request?: {
        number: number;
        title: string;
        body: string;
        user: {
            login: string;
        };
    };
}
export interface ClaudeApiResponse {
    success: boolean;
    response?: string;
    error?: string;
}
export interface ContainerExecutionOptions {
    command: string;
    repository: string;
    timeout?: number;
    environment?: Record<string, string>;
}
//# sourceMappingURL=types.d.ts.map