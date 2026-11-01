/** One lifetime for an OTA wait: settle once and dispose every owned resource. */
export function otaOperation<T>(
    connection: { isConnected: boolean; subscribeConnectionLoss(listener: () => void): () => void },
    signal: AbortSignal | undefined,
    timeoutMs: number,
    onTimeout: () => T,
    start: (resolve: (value: T) => void, reject: (error: unknown) => void,
        onCleanup: (dispose: () => void) => void) => void,
    disconnectedMessage = 'Disconnected during firmware transfer',
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let done = false;
        const disposers: Array<() => void> = [];
        const onCleanup = (dispose: () => void) => {
            if (done) dispose(); else disposers.push(dispose);
        };
        const settle = (complete: () => void) => {
            if (done) return;
            done = true;
            for (const dispose of disposers.splice(0)) dispose();
            complete();
        };
        const succeed = (value: T) => settle(() => resolve(value));
        const fail = (error: unknown) => settle(() => reject(error));
        const abort = () => fail(new Error('Transfer cancelled'));
        if (signal?.aborted) { abort(); return; }
        if (!connection.isConnected) { fail(new Error('Not connected')); return; }
        signal?.addEventListener('abort', abort, { once: true });
        onCleanup(() => signal?.removeEventListener('abort', abort));
        onCleanup(connection.subscribeConnectionLoss(() => fail(new Error(disconnectedMessage))));
        if (done) return;
        const timer = setTimeout(() => {
            try { succeed(onTimeout()); } catch (error) { fail(error); }
        }, timeoutMs);
        onCleanup(() => clearTimeout(timer));
        try { start(succeed, fail, onCleanup); } catch (error) { fail(error); }
    });
}
