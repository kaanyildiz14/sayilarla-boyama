// Web Worker: şablon üretimi birkaç saniye sürebilir; arayüz donmasın diye
// bu iş ayrı bir iş parçacığında yapılır.

import { buildTemplate, DETAIL, type Detail, type Template } from './islem/sablon';

export interface WorkerRequest {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  detail: Detail;
}

export type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'done'; template: Template }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { rgba, width, height, detail } = e.data;
  const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const template = buildTemplate(rgba, width, height, DETAIL[detail], (message) => post({ type: 'progress', message }));
    post({ type: 'done', template }, [template.regionMap.buffer]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
