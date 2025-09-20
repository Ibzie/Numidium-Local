/**
 * Response Filter Utilities
 * 
 * Filters AI responses to remove internal reasoning and ensure clean output
 */

/**
 * Remove internal reasoning tags from AI responses
 */
export function filterInternalReasoning(response: string): string {
  if (!response) return response;

  let filtered = response;

  // Remove <think> tags and their content
  filtered = filtered.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Remove <reasoning> tags and their content
  filtered = filtered.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  
  // Remove <planning> tags and their content
  filtered = filtered.replace(/<planning>[\s\S]*?<\/planning>/gi, '');
  
  // Remove <internal> tags and their content
  filtered = filtered.replace(/<internal>[\s\S]*?<\/internal>/gi, '');
  
  // Remove any other common internal processing tags
  const internalTags = [
    'thought', 'analysis', 'consideration', 'reflection',
    'process', 'debug', 'trace', 'step'
  ];
  
  for (const tag of internalTags) {
    const regex = new RegExp(`<${tag}>[\s\S]*?<\/${tag}>`, 'gi');
    filtered = filtered.replace(regex, '');
  }

  // Clean up extra whitespace that might be left behind
  filtered = filtered.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple newlines to double newlines
  filtered = filtered.trim();

  return filtered;
}

/**
 * Clean and format AI response for display
 */
export function cleanResponse(response: string): string {
  if (!response) return response;

  // First filter internal reasoning
  let cleaned = filterInternalReasoning(response);

  // Remove any markdown artifacts that shouldn't be visible
  cleaned = cleaned.replace(/^---\n/gm, ''); // Remove horizontal rules at start of lines
  
  // Clean up code block formatting issues
  cleaned = cleaned.replace(/```\s*\n\s*```/g, ''); // Remove empty code blocks
  
  // Ensure consistent line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');
  
  // Remove excessive whitespace but preserve intentional formatting
  cleaned = cleaned.replace(/[ \t]+$/gm, ''); // Remove trailing whitespace on lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Limit consecutive newlines to 2
  
  return cleaned.trim();
}

/**
 * Validate that response doesn't contain internal reasoning
 */
export function hasInternalReasoning(response: string): boolean {
  if (!response) return false;

  const internalPatterns = [
    /<think>/i,
    /<reasoning>/i,
    /<planning>/i,
    /<internal>/i,
    /<thought>/i,
    /<analysis>/i,
    /\(thinking:/i,
    /\[internal:/i
  ];

  return internalPatterns.some(pattern => pattern.test(response));
}

/**
 * Log warning if internal reasoning is detected
 */
export function warnInternalReasoning(response: string): void {
  if (hasInternalReasoning(response)) {
    console.warn('Warning: Internal reasoning detected in AI response - filtering out');
    console.warn('Response preview:', response.substring(0, 200) + '...');
  }
}

/**
 * Complete response processing pipeline
 */
export function processAIResponse(response: string): string {
  // Warn if internal reasoning detected
  warnInternalReasoning(response);
  
  // Clean the response
  return cleanResponse(response);
}