import { analyze } from '../engine/analyze';

self.onmessage = (e: MessageEvent<{ bytes: ArrayBuffer; goal?: string }>) => {
  try {
    const result = analyze(new Uint8Array(e.data.bytes), { goal: e.data.goal });
    (self as unknown as Worker).postMessage({ ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};
