/**
 * LLM PII Sanitization Utilities - Python SDK Compatible
 *
 * Provides comprehensive PII detection and sanitization using regex and NLP-based
 * patterns to remove sensitive information from LLM content, matching the Python SDK exactly.
 */

import type { PIISanitizationOptions, PIISanitizationResult } from './types.js';

/**
 * Default PII sanitization options
 */
const DEFAULT_PII_OPTIONS: Required<PIISanitizationOptions> = {
  remove_emails: true,
  remove_phone_numbers: true,
  remove_addresses: true,
  remove_names: true,
  remove_credit_cards: true,
  remove_ssns: true,
  custom_patterns: [],
  replacement_text: '[REDACTED]',
};

/**
 * Comprehensive regex patterns for PII detection
 */
const PII_PATTERNS = {
  // Email addresses - comprehensive pattern
  email: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g,
  ],

  // Phone numbers - various formats
  phone: [
    // US/International formats
    /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
    /(\+?1\s?)?(\(?[0-9]{3}\)?[\s.-]?)?[0-9]{3}[\s.-]?[0-9]{4}/g,
    // International formats
    /\+[1-9]\d{1,14}/g,
    // Formatted numbers
    /\(\d{3}\)\s?\d{3}-\d{4}/g,
    /\d{3}-\d{3}-\d{4}/g,
    /\d{3}\.\d{3}\.\d{4}/g,
    /\d{3}\s\d{3}\s\d{4}/g,
  ],

  // Credit card numbers
  credit_card: [
    // Visa (4), Mastercard (5), Amex (3), Discover (6)
    /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
    /\b5[1-5][0-9]{14}\b/g,
    /\b3[47][0-9]{13}\b/g,
    /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
    // Generic 16-digit patterns
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ],

  // Social Security Numbers (specific formats only to avoid false positives)
  ssn: [/\b\d{3}-\d{2}-\d{4}\b/g, /\b\d{3}\s\d{2}\s\d{4}\b/g],

  // Addresses (simplified - can be complex)
  address: [
    // Street addresses
    /\b\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl)\b/gi,
    // Zip codes
    /\b\d{5}(?:-\d{4})?\b/g,
    // State abbreviations in context
    /\b[A-Z]{2}\s+\d{5}\b/g,
  ],

  // Government IDs
  government_id: [
    /\b[A-Z]\d{8}\b/g, // Passport-like
    /\b\d{2}-\d{7}\b/g, // Driver's license-like
  ],

  // Financial info
  financial: [
    /\b\d{9,12}\b/g, // Account numbers
    /\b[A-Z]{4}[0-9]{7}\b/g, // SWIFT codes
  ],

  // Medical info
  medical: [
    /\b\d{3}-\d{2}-\d{4}\b/g, // Medical record numbers
    /\bMRN[\s:]?\d+\b/gi,
  ],

  // IP addresses
  ip_address: [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, // IPv6
  ],

  // Sensitive URLs and tokens
  sensitive_urls: [/https?:\/\/[^\s]+/g],

  // API keys and tokens
  api_keys: [
    /\bsk-[a-zA-Z0-9]{32,}/g, // OpenAI API keys
    /\bxoxb-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}/g, // Slack tokens
    /\b[A-Z0-9]{20,}\b/g, // Generic long alphanumeric tokens
  ],
};

// Common first and last names for name detection
const COMMON_NAMES = {
  first: new Set([
    'james',
    'robert',
    'john',
    'michael',
    'david',
    'william',
    'richard',
    'charles',
    'joseph',
    'thomas',
    'mary',
    'patricia',
    'jennifer',
    'linda',
    'elizabeth',
    'barbara',
    'susan',
    'jessica',
    'sarah',
    'karen',
    'christopher',
    'daniel',
    'paul',
    'mark',
    'donald',
    'george',
    'kenneth',
    'steven',
    'edward',
    'brian',
    'lisa',
    'nancy',
    'betty',
    'helen',
    'sandra',
    'donna',
    'carol',
    'ruth',
    'sharon',
    'michelle',
  ]),
  last: new Set([
    'smith',
    'johnson',
    'williams',
    'brown',
    'jones',
    'garcia',
    'miller',
    'davis',
    'rodriguez',
    'martinez',
    'hernandez',
    'lopez',
    'gonzalez',
    'wilson',
    'anderson',
    'thomas',
    'taylor',
    'moore',
    'jackson',
    'martin',
    'lee',
    'perez',
    'thompson',
    'white',
    'harris',
    'sanchez',
    'clark',
    'ramirez',
    'lewis',
    'robinson',
  ]),
};

/**
 * Python SDK Compatible Function - Simple API matching exactly
 *
 * Sanitize LLM content for safe logging.
 *
 * @param content - Content to sanitize
 * @param max_length - Maximum length of content (default: 1000)
 * @returns Sanitized content string
 */
export function sanitize_llm_content_simple(content: string, max_length: number = 1000): string {
  if (typeof content !== 'string') {
    content = String(content);
  }

  // Truncate if too long
  if (content.length > max_length) {
    content = `${content.substring(0, max_length - 3)}...`;
  }

  // Remove or mask sensitive patterns - exactly matching Python SDK
  const patterns: Array<[RegExp, string]> = [
    [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'],
    [/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]'],
    [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]'],
    [/\b[A-Z0-9]{20,}\b/g, '[TOKEN]'], // API keys, tokens
    [/sk-[a-zA-Z0-9]{32,}/g, '[API_KEY]'], // OpenAI API keys
    [/xoxb-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}/g, '[SLACK_TOKEN]'],
  ];

  for (const [pattern, replacement] of patterns) {
    content = content.replace(pattern, replacement);
  }

  return content;
}

/**
 * Sanitize LLM content by removing PII - comprehensive version with detailed results
 */
export function sanitize_llm_content(
  content: string,
  options: PIISanitizationOptions = {}
): PIISanitizationResult {
  const config = { ...DEFAULT_PII_OPTIONS, ...options };
  let sanitizedContent = content;
  const piiTypesFound = new Set<string>();
  let removalsCount = 0;

  // Track original content for comparison
  // const originalLength = content.length; // Reserved for future use

  // Email sanitization
  if (config.remove_emails) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.email, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('email');
      removalsCount += count;
    }
  }

  // Phone number sanitization
  if (config.remove_phone_numbers) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.phone, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('phone_number');
      removalsCount += count;
    }
  }

  // Credit card sanitization
  if (config.remove_credit_cards) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.credit_card, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('credit_card');
      removalsCount += count;
    }
  }

  // SSN sanitization
  if (config.remove_ssns) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.ssn, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('ssn');
      removalsCount += count;
    }
  }

  // Address sanitization
  if (config.remove_addresses) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.address, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('address');
      removalsCount += count;
    }
  }

  // Name sanitization (more sophisticated)
  if (config.remove_names) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeNames(sanitizedContent, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('name');
      removalsCount += count;
    }
  }

  // Additional PII types
  const additionalTypes = [
    { patterns: PII_PATTERNS.government_id, type: 'government_id' },
    { patterns: PII_PATTERNS.financial, type: 'financial' },
    { patterns: PII_PATTERNS.medical, type: 'medical' },
    { patterns: PII_PATTERNS.ip_address, type: 'ip_address' },
    { patterns: PII_PATTERNS.sensitive_urls, type: 'sensitive_url' },
    { patterns: PII_PATTERNS.api_keys, type: 'api_key' },
  ];

  for (const { patterns, type } of additionalTypes) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, patterns, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add(type);
      removalsCount += count;
    }
  }

  // Custom patterns
  if (config.custom_patterns && config.custom_patterns.length > 0) {
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, config.custom_patterns, config.replacement_text);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('custom');
      removalsCount += count;
    }
  }

  return {
    sanitized_content: sanitizedContent,
    pii_found: piiTypesFound.size > 0,
    pii_types: Array.from(piiTypesFound),
    removals_count: removalsCount,
  };
}

/**
 * Sanitize content using multiple regex patterns
 */
function sanitizeWithPatterns(
  content: string,
  patterns: RegExp[],
  replacement: string
): { content: string; count: number; found: boolean } {
  let result = content;
  let totalCount = 0;
  let found = false;

  for (const pattern of patterns) {
    const matches = result.match(pattern);
    if (matches) {
      found = true;
      totalCount += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  return { content: result, count: totalCount, found };
}

/**
 * Sophisticated name sanitization using common name lists and patterns
 */
function sanitizeNames(
  content: string,
  replacement: string
): { content: string; count: number; found: boolean } {
  let result = content;
  let count = 0;
  let found = false;

  // Use name detection based on common names (no specific patterns needed)
  // The detection logic below handles name identification

  // Then, use name dictionary for more accurate detection
  const words = result.split(/\s+/);
  const sanitizedWords = words.map(word => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();

    // Check if it's a common first or last name
    if (COMMON_NAMES.first.has(cleanWord) || COMMON_NAMES.last.has(cleanWord)) {
      // Only replace if it appears to be used as a name (capitalized, etc.)
      if (word.length > 2 && /^[A-Z][a-z]+/.test(word)) {
        count++;
        found = true;
        return replacement;
      }
    }

    return word;
  });

  if (found) {
    result = sanitizedWords.join(' ');
  }

  return { content: result, count, found };
}

/**
 * Check if content contains PII without sanitizing - matches Python SDK API exactly
 */
export function contains_pii(
  content: string,
  options: PIISanitizationOptions = {}
): { has_pii: boolean; pii_types: string[]; pii_count: number } {
  const result = sanitize_llm_content(content, options);

  return {
    has_pii: result.pii_found,
    pii_types: result.pii_types,
    pii_count: result.removals_count,
  };
}

/**
 * Sanitize content but preserve format and readability - matches Python SDK API exactly
 */
export function sanitize_llm_content_preserving_format(
  content: string,
  options: PIISanitizationOptions = {}
): PIISanitizationResult {
  const config = { ...DEFAULT_PII_OPTIONS, ...options };

  // Different replacement strategies based on PII type
  const piiTypesFound = new Set<string>();
  let removalsCount = 0;
  let sanitizedContent = content;

  // Email - preserve format
  if (config.remove_emails) {
    const emailReplacement = '[EMAIL]';
    const {
      content: newContent,
      count,
      found,
    } = sanitizeWithPatterns(sanitizedContent, PII_PATTERNS.email, emailReplacement);
    if (found) {
      sanitizedContent = newContent;
      piiTypesFound.add('email');
      removalsCount += count;
    }
  }

  // Phone - preserve length
  if (config.remove_phone_numbers && PII_PATTERNS.phone[0]) {
    sanitizedContent = sanitizedContent.replace(PII_PATTERNS.phone[0], _match => {
      piiTypesFound.add('phone_number');
      removalsCount++;
      return 'XXX-XXX-XXXX';
    });
  }

  // Credit cards - preserve format
  if (config.remove_credit_cards && PII_PATTERNS.credit_card[0]) {
    sanitizedContent = sanitizedContent.replace(PII_PATTERNS.credit_card[0], match => {
      piiTypesFound.add('credit_card');
      removalsCount++;
      return `**** **** **** ${match.slice(-4)}`;
    });
  }

  // Continue with other PII types using standard sanitization
  const remainingOptions = {
    ...config,
    remove_emails: false,
    remove_phone_numbers: false,
    remove_credit_cards: false,
  };

  if (Object.values(remainingOptions).some(v => v === true)) {
    const remainingResult = sanitize_llm_content(sanitizedContent, remainingOptions);
    sanitizedContent = remainingResult.sanitized_content;
    remainingResult.pii_types.forEach(type => piiTypesFound.add(type));
    removalsCount += remainingResult.removals_count;
  }

  return {
    sanitized_content: sanitizedContent,
    pii_found: piiTypesFound.size > 0,
    pii_types: Array.from(piiTypesFound),
    removals_count: removalsCount,
  };
}

/**
 * Get statistics about PII in content - matches Python SDK API exactly
 */
export function analyze_pii_content(
  content: string,
  options: PIISanitizationOptions = {}
): {
  total_characters: number;
  pii_characters: number;
  pii_percentage: number;
  pii_types: Record<string, number>;
  sensitive_score: number;
} {
  const config = { ...DEFAULT_PII_OPTIONS, ...options };
  const piiTypes: Record<string, number> = {};
  let totalPiiChars = 0;

  // Analyze each PII type
  const piiChecks = [
    { patterns: config.remove_emails ? PII_PATTERNS.email : [], type: 'email' },
    { patterns: config.remove_phone_numbers ? PII_PATTERNS.phone : [], type: 'phone_number' },
    { patterns: config.remove_credit_cards ? PII_PATTERNS.credit_card : [], type: 'credit_card' },
    { patterns: config.remove_ssns ? PII_PATTERNS.ssn : [], type: 'ssn' },
    { patterns: config.remove_addresses ? PII_PATTERNS.address : [], type: 'address' },
    { patterns: PII_PATTERNS.government_id, type: 'government_id' },
    { patterns: PII_PATTERNS.financial, type: 'financial' },
    { patterns: PII_PATTERNS.medical, type: 'medical' },
    { patterns: PII_PATTERNS.ip_address, type: 'ip_address' },
    { patterns: PII_PATTERNS.sensitive_urls, type: 'sensitive_url' },
  ];

  for (const { patterns, type } of piiChecks) {
    let typeChars = 0;
    let typeCount = 0;

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          typeChars += match.length;
          typeCount++;
        }
      }
    }

    if (typeCount > 0) {
      piiTypes[type] = typeCount;
      totalPiiChars += typeChars;
    }
  }

  // Names analysis
  if (config.remove_names) {
    const nameResult = sanitizeNames(content, '[NAME]');
    if (nameResult.found) {
      piiTypes['name'] = nameResult.count;
      // Estimate characters (names are typically 5-15 chars)
      totalPiiChars += nameResult.count * 8;
    }
  }

  const totalChars = content.length;
  const piiPercentage = totalChars > 0 ? (totalPiiChars / totalChars) * 100 : 0;

  // Calculate sensitivity score (0-100)
  const sensitiveScore = calculateSensitivityScore(piiTypes);

  return {
    total_characters: totalChars,
    pii_characters: totalPiiChars,
    pii_percentage: Math.round(piiPercentage * 100) / 100,
    pii_types: piiTypes,
    sensitive_score: sensitiveScore,
  };
}

/**
 * Calculate sensitivity score based on PII types found
 */
function calculateSensitivityScore(piiTypes: Record<string, number>): number {
  const typeWeights: Record<string, number> = {
    ssn: 30,
    credit_card: 25,
    financial: 20,
    medical: 15,
    government_id: 15,
    address: 10,
    phone_number: 8,
    email: 5,
    name: 3,
    ip_address: 2,
    sensitive_url: 10,
    custom: 5,
  };

  let score = 0;
  for (const [type, count] of Object.entries(piiTypes)) {
    const weight = typeWeights[type] || 5;
    score += Math.min(weight * count, weight * 3); // Cap contribution per type
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Validate PII sanitization options - matches Python SDK API exactly
 */
export function validate_pii_options(options: PIISanitizationOptions): {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check replacement text
  if (options.replacement_text !== undefined) {
    if (typeof options.replacement_text !== 'string') {
      errors.push('replacement_text must be a string');
    } else if (options.replacement_text.length === 0) {
      warnings.push('Empty replacement_text may make sanitization ineffective');
    } else if (options.replacement_text.length > 50) {
      warnings.push('Very long replacement_text may affect readability');
    }
  }

  // Check custom patterns
  if (options.custom_patterns) {
    if (!Array.isArray(options.custom_patterns)) {
      errors.push('custom_patterns must be an array of RegExp objects');
    } else {
      options.custom_patterns.forEach((pattern, index) => {
        if (!(pattern instanceof RegExp)) {
          errors.push(`custom_patterns[${index}] must be a RegExp object`);
        }
      });
    }
  }

  // Check boolean options
  const booleanOptions = [
    'remove_emails',
    'remove_phone_numbers',
    'remove_addresses',
    'remove_names',
    'remove_credit_cards',
    'remove_ssns',
  ];

  for (const option of booleanOptions) {
    if (options[option as keyof PIISanitizationOptions] !== undefined) {
      if (typeof options[option as keyof PIISanitizationOptions] !== 'boolean') {
        errors.push(`${option} must be a boolean`);
      }
    }
  }

  // Warning if all options are disabled
  const enabledOptions = booleanOptions.filter(
    option => options[option as keyof PIISanitizationOptions] === true
  );

  if (
    enabledOptions.length === 0 &&
    (!options.custom_patterns || options.custom_patterns.length === 0)
  ) {
    warnings.push('No PII detection enabled - sanitization will have no effect');
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get supported PII types - matches Python SDK API exactly
 */
export function get_supported_pii_types(): string[] {
  return [
    'email',
    'phone_number',
    'address',
    'name',
    'credit_card',
    'ssn',
    'government_id',
    'financial',
    'medical',
    'ip_address',
    'sensitive_url',
    'custom',
  ];
}
