import {
  runArchiveTask,
  runStructuredTask,
  type ConvertWorkerRequest,
  type WorkerArchiveRequest,
  type WorkerArchiveResponse,
  type WorkerStructuredRequest,
  type WorkerStructuredResponse,
} from './convertWorker';

let nextTaskId = 1;

async function runInWorker<T>(
  payload: ConvertWorkerRequest,
  signal?: AbortSignal
): Promise<T> {
  if (typeof Worker === 'undefined') {
    if (payload.kind === 'archive') {
      return (await runArchiveTask(payload)) as unknown as T;
    }
    return runStructuredTask(payload) as unknown as T;
  }

  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./convertWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // Fallback to in-thread if CSP/test environment disallows module workers
      if (payload.kind === 'archive') {
        runArchiveTask(payload).then((r) => resolve(r as unknown as T), reject);
      } else {
        try {
          resolve(runStructuredTask(payload) as unknown as T);
        } catch (err) {
          reject(err);
        }
      }
      return;
    }

    const id = nextTaskId++;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('Conversion cancelled by user.'));
    };

    if (signal?.aborted) {
      cleanup();
      reject(new Error('Conversion cancelled by user.'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: T; error?: string }>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.ok && event.data.result !== undefined) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error || 'Worker conversion error.'));
      }
    };

    worker.onerror = () => {
      cleanup();
      // Graceful fallback to main thread if worker fails to instantiate in sandboxed preview
      if (payload.kind === 'archive') {
        runArchiveTask(payload).then((r) => resolve(r as unknown as T), reject);
      } else {
        try {
          resolve(runStructuredTask(payload) as unknown as T);
        } catch (err) {
          reject(err);
        }
      }
    };

    worker.postMessage({ id, payload });
  });
}

export async function runArchiveOffloaded(
  req: Omit<WorkerArchiveRequest, 'kind'>,
  signal?: AbortSignal
): Promise<WorkerArchiveResponse> {
  return runInWorker<WorkerArchiveResponse>({ kind: 'archive', ...req }, signal);
}

export async function runStructuredOffloaded(
  req: Omit<WorkerStructuredRequest, 'kind'>,
  signal?: AbortSignal
): Promise<WorkerStructuredResponse> {
  return runInWorker<WorkerStructuredResponse>({ kind: 'structured', ...req }, signal);
}
