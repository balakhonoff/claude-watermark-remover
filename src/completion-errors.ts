export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** An output limit is an unusable model attempt, not a completed draft. */
export class CompletionTokenLimitError extends Error {
  readonly finishReason = "length";

  constructor(readonly stage: string, readonly usage?: CompletionUsage) {
    super("Model completion reached the output token limit");
    this.name = "CompletionTokenLimitError";
  }
}
