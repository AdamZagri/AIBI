// costUtils.js
export const PRICES = {
  'gpt-4o-mini': { in: 0.0005, out: 0.0015 },
  'gpt-4o': { in: 0.01, out: 0.03 },
  // Fallback – assume symmetrical cheap price
  'default': { in: 0.001, out: 0.002 }
};

export function calcCost(model, usage) {
  if (!usage) return 0;
  
  const input = usage.input_tokens || usage.prompt_tokens || 0;
  const output = usage.output_tokens || usage.completion_tokens || 0;
  
  // OpenAI pricing (per 1K tokens)
  const openaiPricing = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
  };
  
  // Claude pricing (per 1K tokens) 
  const claudePricing = {
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
  };
  
  // Check Claude models first
  if (claudePricing[model]) {
    const pricing = claudePricing[model];
    return (input / 1000) * pricing.input + (output / 1000) * pricing.output;
  }
  
  // Check OpenAI models
  if (openaiPricing[model]) {
    const pricing = openaiPricing[model];
    return (input / 1000) * pricing.input + (output / 1000) * pricing.output;
  }
  
  // Default fallback (gpt-4o-mini pricing)
  return (input / 1000) * 0.00015 + (output / 1000) * 0.0006;
} 