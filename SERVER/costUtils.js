// costUtils.js
export const PRICES = {
  'gpt-4o-mini': { in: 0.0005, out: 0.0015 },
  'gpt-4o': { in: 0.01, out: 0.03 },
  // Fallback – assume symmetrical cheap price
  'default': { in: 0.001, out: 0.002 }
};

export function calcCost(model, usage) {
  if (!usage) return 0;
  const price = PRICES[model] || PRICES.default;
  const inCost = (usage.prompt_tokens || 0) / 1000 * price.in;
  const outCost = (usage.completion_tokens || 0) / 1000 * price.out;
  return +(inCost + outCost).toFixed(6);
} 