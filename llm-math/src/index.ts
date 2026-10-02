/**
 * @nodegrove/llm-math: how much memory an open-weight LLM needs on a GPU, and how fast it
 * can generate, with the model and GPU data the answers are computed from.
 *
 * This is the arithmetic behind every figure on nodegrove.io: the model and GPU pages,
 * the calculators, the open dataset and the MCP server all import it, so they cannot
 * disagree. Nothing in it is measured: memory is a stated formula over config.json
 * values, speed is a stated bandwidth ceiling, and GPU figures are the makers' specs.
 */
export * from './vram.ts';
export * from './speed.ts';
export * from './gpu-fit.ts';
export * from './models.ts';
export * from './gpus.ts';
export * from './advice.ts';
export * from './method.ts';
export * from './nodegrove.ts';
