/**
 * Test setup and utilities for command-queue tests
 */
export declare const createMockLogger: () => {
    child: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    info: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    error: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    warn: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    debug: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    trace: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    fatal: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
};
export declare const createMockCommand: (overrides?: {}) => {
    id: string;
    type: string;
    content: string;
    createdAt: number;
    status: string;
    queuedAt: number;
    attemptCount: number;
    maxAttempts: number;
};
export declare const createMockJob: (command?: {
    id: string;
    type: string;
    content: string;
    createdAt: number;
    status: string;
    queuedAt: number;
    attemptCount: number;
    maxAttempts: number;
}, overrides?: {}) => {
    id: string;
    name: string;
    data: {
        command: {
            id: string;
            type: string;
            content: string;
            createdAt: number;
            status: string;
            queuedAt: number;
            attemptCount: number;
            maxAttempts: number;
        };
        userId: string;
        agentId: string;
        priority: number;
        executionConstraints: undefined;
    };
    opts: {
        priority: number;
        removeOnComplete: number;
        removeOnFail: number;
        attempts: number;
    };
    timestamp: number;
    processedOn: null;
    finishedOn: null;
    returnvalue: null;
    failedReason: null;
    stacktrace: null;
    attemptsMade: number;
    isActive: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    isWaiting: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    isCompleted: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    isFailed: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    isDelayed: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    remove: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    retry: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    updateData: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    updateProgress: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    waitUntilFinished: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
};
export declare const createMockQueue: () => {
    getWaiting: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getActive: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getCompleted: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getFailed: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getDelayed: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getWaitingCount: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getActiveCount: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getCompletedCount: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getFailedCount: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getDelayedCount: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    add: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getJob: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    getJobs: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    pause: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    resume: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    drain: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    clean: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    obliterate: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    waitUntilReady: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    close: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    on: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    emit: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    removeAllListeners: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
};
export declare const createMockQueueEvents: () => {
    on: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    emit: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    close: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    removeAllListeners: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
};
export declare const createMockWorker: () => {
    on: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    pause: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    resume: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
    close: import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
};
//# sourceMappingURL=setup.d.ts.map