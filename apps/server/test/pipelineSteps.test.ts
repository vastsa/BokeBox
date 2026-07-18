import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PIPELINE_FROM_STEPS,
  isPipelineFromStep,
  stepIndex,
} from '../src/services/pipeline.js';

describe('pipeline steps', () => {
  it('exposes stable ordered steps', () => {
    assert.deepEqual(PIPELINE_FROM_STEPS, [
      'extract',
      'transcribe',
      'script',
      'cover',
      'flashcards',
      'synthesize',
    ]);
  });

  it('validates step names', () => {
    assert.equal(isPipelineFromStep('script'), true);
    assert.equal(isPipelineFromStep('nope'), false);
    assert.equal(isPipelineFromStep(1), false);
  });

  it('returns monotonic indexes', () => {
    const indexes = PIPELINE_FROM_STEPS.map(stepIndex);
    assert.deepEqual(indexes, [0, 1, 2, 3, 4, 5]);
  });
});
