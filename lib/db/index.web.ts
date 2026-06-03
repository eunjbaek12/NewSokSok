// Web platform mock — expo-sqlite is not available on web.
// This file prevents Metro from trying to resolve the wa-sqlite.wasm module.

const mockDb = {
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    runAsync: async () => { },
    execAsync: async () => { },
    withTransactionAsync: async (cb: any) => await cb(),
    closeAsync: async () => { }
} as any;

export async function getDb() {
    return mockDb;
}

export async function closeDb() {
    // no-op on web
}

// Mirrors lib/db/index.ts. On web the mock DB has no real transactions, so the
// task runs directly — no BEGIN/COMMIT, nothing to serialize.
export async function runInTransaction(task: () => Promise<void>): Promise<void> {
    await task();
}
