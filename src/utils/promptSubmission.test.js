import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubmittedPrompt } from './promptSubmission.js';

test('a user edit wins over an album-recalled prompt at submission', () => {
  assert.equal(
    getSubmittedPrompt(
      'A silver car turns onto the coastal road',
      'A red car turns onto the coastal road'
    ),
    'A silver car turns onto the coastal road'
  );
});

test('falls back to the controlled prompt and trims request text', () => {
  assert.equal(getSubmittedPrompt(null, '  Generate a quiet forest scene  '), 'Generate a quiet forest scene');
});
