/**
 * Web Worker for executing user-defined checksum functions.
 * Running in a separate thread means an infinite loop can be killed via worker.terminate().
 */

type InMsg =
  | { type: 'init'; code: string }
  | { type: 'run';  id: number; bytes: number[] };

type OutMsg =
  | { type: 'ready' }
  | { type: 'initError'; error: string }
  | { type: 'result'; id: number; result: number }
  | { type: 'runError'; id: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as any;

let calcFn: ((bytes: number[]) => number) | null = null;

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      // Build the user's calculate() function
      const FnCtor = Object.getPrototypeOf(function () {}).constructor as FunctionConstructor;
      const fn = new FnCtor('bytes', msg.code + '\nreturn calculate(bytes);') as (bytes: number[]) => number;
      calcFn = fn;
      ctx.postMessage({ type: 'ready' } satisfies OutMsg);
    } catch (err: unknown) {
      ctx.postMessage({ type: 'initError', error: String((err as Error)?.message ?? err) } satisfies OutMsg);
    }
    return;
  }

  if (msg.type === 'run') {
    if (!calcFn) {
      ctx.postMessage({ type: 'runError', id: msg.id } satisfies OutMsg);
      return;
    }
    try {
      const result = (calcFn([...msg.bytes]) as number) >>> 0;
      ctx.postMessage({ type: 'result', id: msg.id, result } satisfies OutMsg);
    } catch {
      ctx.postMessage({ type: 'runError', id: msg.id } satisfies OutMsg);
    }
  }
};
