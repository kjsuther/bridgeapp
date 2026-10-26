import { Dds, loadDds } from 'bridge-dds';
import { analyzePosition } from './ddsPosition';
import type { AnalysisPosition, PositionAnalysis } from './ddsPosition';

export interface AnalysisRequest { id: number; position: AnalysisPosition }
export type AnalysisResponse = { id: number; result: PositionAnalysis } | { id: number; error: string };

let engine: Promise<Dds> | undefined;
self.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const { id, position } = event.data;
  try {
    engine ??= loadDds().then(module => new Dds(module)).catch(error => {
      engine = undefined;
      throw error;
    });
    const result = analyzePosition(position, await engine);
    self.postMessage({ id, result } satisfies AnalysisResponse);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Analysis failed.' } satisfies AnalysisResponse);
  }
};
