/**
 * PII Redaction Utilities for the Noveum Trace SDK
 *
 * Provides functions for detecting and redacting personally identifiable information (PII)
 * from trace data to enhance privacy protection.
 *
 * Features:
 * - Configurable redaction character
 * - Multiple PII type detection (emails, phones, credit cards, SSN, IPs, etc.)
 * - Efficient regex patterns with minimal false positives
 * - Validation algorithms for specific PII types (Luhn check for credit cards)
 * - Batch processing support
 * - Comprehensive logging and detection reporting
 */

/**
 * Configuration options for PII redaction
 */
export interface PIIRedactionOptions {
  /** Character used for redaction (default: "*") */
  redactionChar?: string;
  /** Whether to preserve format structure (e.g., keep dashes in SSN) */
  preserveFormat?: boolean;
  /** Whether to use partial redaction (show last few characters) */
  partialRedaction?: boolean;
  /** Number of characters to show when using partial redaction */
  partialShowCount?: number;
  /** Custom regex patterns for organization-specific PII */
  customPatterns?: Record<string, RegExp>;
  /** PII types to include in redaction (all by default) */
  enabledTypes?: PIIType[];
  /** Whether to validate detected patterns (reduces false positives) */
  enableValidation?: boolean;
}

/**
 * Types of PII that can be detected and redacted
 */
export enum PIIType {
  EMAIL = 'email',
  PHONE = 'phone',
  CREDIT_CARD = 'credit_card',
  SSN = 'ssn',
  IP_ADDRESS = 'ip_address',
  URL = 'url',
  CUSTOM = 'custom',
}

/**
 * Result of PII detection operation
 */
export interface PIIDetectionResult {
  /** Original text */
  originalText: string;
  /** Text with PII redacted */
  redactedText: string;
  /** Types of PII detected */
  detectedTypes: PIIType[];
  /** Detailed detection information */
  detections: PIIDetection[];
  /** Number of items redacted by type */
  redactionCount: Record<PIIType, number>;
}

/**
 * Individual PII detection details
 */
export interface PIIDetection {
  /** Type of PII detected */
  type: PIIType;
  /** Original value that was detected */
  originalValue: string;
  /** Redacted value */
  redactedValue: string;
  /** Start position in text */
  startIndex: number;
  /** End position in text */
  endIndex: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Whether the detection passed validation */
  validated: boolean;
}

/**
 * Default redaction options
 */
const DEFAULT_OPTIONS: Required<PIIRedactionOptions> = {
  redactionChar: '*',
  preserveFormat: true,
  partialRedaction: false,
  partialShowCount: 4,
  customPatterns: {},
  enabledTypes: Object.values(PIIType),
  enableValidation: true,
};

/**
 * Regex patterns for different PII types
 * Optimized for accuracy and minimal false positives
 */
const PII_PATTERNS = {
  // Email: Comprehensive pattern supporting most valid email formats
  email:
    /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\b/gi,

  // Phone: US and international formats with optional country codes
  phone:
    /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(?:\s?(?:ext|x|extension)[\s.]?(\d+))?|\+(?:[0-9]{1,3}[-.\s]?)?(?:\([0-9]{1,4}\)[-.\s]?)?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/gi,

  // Credit Card: More specific patterns for major card types
  // Visa (4xxx), MasterCard (5xxx), Amex (34xx/37xx), Discover (6xxx)
  creditCard:
    /\b(?:4\d{3}(?:[\s-]?\d{4}){3}|5[1-5]\d{2}(?:[\s-]?\d{4}){3}|3[47]\d{1}(?:[\s-]?\d{4}){2}(?:[\s-]?\d{3})|6(?:011|5\d{2})(?:[\s-]?\d{4}){3})\b/g,

  // SSN: More restrictive pattern requiring proper formatting and excluding common non-SSN patterns
  ssn: /\b(?:(?!000|666|9\d{2})[0-8]\d{2}[-.\s](?!00)\d{2}[-.\s](?!0000)\d{4})\b/g,

  // IPv4 addresses
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // IPv6 addresses (simplified pattern)
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b::1\b|\b::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\b/gi,

  // URLs and domains
  url: /https?:\/\/(?:[-\w.])+(?:[:\d]+)?(?:\/(?:[\w._~!$&'()*+,;=:@]|%[0-9a-fA-F]{2})*)*(?:\?(?:[\w._~!$&'()*+,;=:@/?]|%[0-9a-fA-F]{2})*)?(?:#(?:[\w._~!$&'()*+,;=:@/?]|%[0-9a-fA-F]{2})*)?/gi,
} as const;

/**
 * Validate credit card number using Luhn algorithm
 */
function validateCreditCard(cardNumber: string): boolean {
  // Remove all non-digit characters
  const digits = cardNumber.replace(/\D/g, '');

  // Must be 13-19 digits
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  // Luhn algorithm
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    const char = digits[i];
    if (!char) continue;
    let digit = parseInt(char, 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate SSN format and check for invalid patterns
 */
function validateSSN(ssn: string): boolean {
  const digits = ssn.replace(/\D/g, '');

  // Must be exactly 9 digits
  if (digits.length !== 9) {
    return false;
  }

  // Check for invalid patterns
  const area = digits.substring(0, 3);
  const group = digits.substring(3, 5);
  const serial = digits.substring(5, 9);

  // Invalid area numbers
  if (area === '000' || area === '666' || area.startsWith('9')) {
    return false;
  }

  // Invalid group or serial
  if (group === '00' || serial === '0000') {
    return false;
  }

  return true;
}

/**
 * Validate phone number format
 */
function validatePhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');

  // US phone numbers (10 digits) or international (7-15 digits)
  if (digits.length === 10) {
    // US format: first digit of area code can't be 0 or 1
    return digits[0] !== '0' && digits[0] !== '1';
  }

  // International numbers
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Validate IPv4 address
 */
function validateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && part === String(num);
  });
}

/**
 * Normalize a regex pattern to ensure it has the global flag for use with matchAll
 */
function normalizeRegexForMatchAll(pattern: RegExp): RegExp {
  if (pattern.flags.includes('g')) {
    return pattern;
  }
  return new RegExp(pattern.source, `${pattern.flags}g`);
}

/**
 * Create redacted version of text while preserving format
 */
function createRedactedText(original: string, options: Required<PIIRedactionOptions>): string {
  if (options.partialRedaction && original.length > options.partialShowCount) {
    const showCount = Math.min(options.partialShowCount, original.length - 1);
    const redactCount = original.length - showCount;
    return options.redactionChar.repeat(redactCount) + original.slice(-showCount);
  }

  if (options.preserveFormat) {
    return original.replace(/[a-zA-Z0-9]/g, options.redactionChar);
  }

  return options.redactionChar.repeat(Math.max(original.length, 8));
}

/**
 * Redact email addresses from text
 */
export function redactEmails(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  const matches = Array.from(text.matchAll(PII_PATTERNS.email));

  for (const match of matches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const redactedValue = createRedactedText(originalValue, opts);

    // Basic email validation
    const validated =
      !opts.enableValidation || (originalValue.includes('@') && originalValue.includes('.'));

    detections.push({
      type: PIIType.EMAIL,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.95 : 0.7,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.EMAIL] : [],
    detections,
    redactionCount: { [PIIType.EMAIL]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Redact phone numbers from text
 */
export function redactPhoneNumbers(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  const matches = Array.from(text.matchAll(PII_PATTERNS.phone));

  for (const match of matches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const redactedValue = createRedactedText(originalValue, opts);
    const validated = !opts.enableValidation || validatePhoneNumber(originalValue);

    detections.push({
      type: PIIType.PHONE,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.9 : 0.6,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.PHONE] : [],
    detections,
    redactionCount: { [PIIType.PHONE]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Redact credit card numbers from text
 */
export function redactCreditCards(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  const matches = Array.from(text.matchAll(PII_PATTERNS.creditCard));

  for (const match of matches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const validated = !opts.enableValidation || validateCreditCard(originalValue);

    // For credit cards, use special partial redaction showing last 4 digits
    let redactedValue: string;
    if (opts.partialRedaction && validated) {
      const digits = originalValue.replace(/\D/g, '');
      const lastFour = digits.slice(-4);
      const maskedDigits = opts.redactionChar.repeat(digits.length - 4) + lastFour;
      redactedValue = originalValue.replace(/\d/g, (char, index) => {
        const digitIndex = originalValue.substring(0, index).replace(/\D/g, '').length;
        return maskedDigits[digitIndex] || char;
      });
    } else {
      redactedValue = createRedactedText(originalValue, opts);
    }

    detections.push({
      type: PIIType.CREDIT_CARD,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.95 : 0.5,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.CREDIT_CARD] : [],
    detections,
    redactionCount: { [PIIType.CREDIT_CARD]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Redact Social Security Numbers from text
 */
export function redactSSN(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  const matches = Array.from(text.matchAll(PII_PATTERNS.ssn));

  for (const match of matches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const redactedValue = createRedactedText(originalValue, opts);
    const validated = !opts.enableValidation || validateSSN(originalValue);

    detections.push({
      type: PIIType.SSN,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.95 : 0.3,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.SSN] : [],
    detections,
    redactionCount: { [PIIType.SSN]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Redact IP addresses from text
 */
export function redactIPAddresses(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  // Process IPv4 addresses
  const ipv4Matches = Array.from(text.matchAll(PII_PATTERNS.ipv4));
  const ipv6Matches = Array.from(text.matchAll(PII_PATTERNS.ipv6));

  const allMatches = [...ipv4Matches, ...ipv6Matches].sort(
    (a, b) => (a.index || 0) - (b.index || 0)
  );

  for (const match of allMatches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const redactedValue = createRedactedText(originalValue, opts);
    const isIPv4 = new RegExp(PII_PATTERNS.ipv4.source).test(originalValue);
    const validated = !opts.enableValidation || (isIPv4 ? validateIPv4(originalValue) : true);

    detections.push({
      type: PIIType.IP_ADDRESS,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.9 : 0.7,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.IP_ADDRESS] : [],
    detections,
    redactionCount: { [PIIType.IP_ADDRESS]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Redact URLs from text
 */
export function redactURLs(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detections: PIIDetection[] = [];
  let redactedText = text;
  let offset = 0;

  const matches = Array.from(text.matchAll(PII_PATTERNS.url));

  for (const match of matches) {
    if (match.index === undefined || match.index === null) continue;

    const originalValue = match[0];
    const redactedValue = createRedactedText(originalValue, opts);

    // Basic URL validation - must start with http/https and have a valid structure
    const validated =
      !opts.enableValidation ||
      (originalValue.startsWith('http') &&
        originalValue.includes('://') &&
        originalValue.length > 10);

    detections.push({
      type: PIIType.URL,
      originalValue,
      redactedValue,
      startIndex: match.index,
      endIndex: match.index + originalValue.length,
      confidence: validated ? 0.85 : 0.6,
      validated,
    });

    if (validated) {
      const adjustedIndex = match.index + offset;
      redactedText =
        redactedText.substring(0, adjustedIndex) +
        redactedValue +
        redactedText.substring(adjustedIndex + originalValue.length);
      offset += redactedValue.length - originalValue.length;
    }
  }

  return {
    originalText: text,
    redactedText,
    detectedTypes: detections.length > 0 ? [PIIType.URL] : [],
    detections,
    redactionCount: { [PIIType.URL]: detections.filter(d => d.validated).length } as Record<
      PIIType,
      number
    >,
  };
}

/**
 * Merge multiple PII detection results
 */
function mergeDetectionResults(results: PIIDetectionResult[]): PIIDetectionResult {
  if (results.length === 0) {
    return {
      originalText: '',
      redactedText: '',
      detectedTypes: [],
      detections: [],
      redactionCount: {} as Record<PIIType, number>,
    };
  }

  if (results.length === 1) {
    const firstResult = results[0];
    if (!firstResult) {
      return {
        originalText: '',
        redactedText: '',
        detectedTypes: [],
        detections: [],
        redactionCount: {} as Record<PIIType, number>,
      };
    }
    return firstResult;
  }

  // Start with the original text and apply redactions
  const firstResult = results[0];
  if (!firstResult) {
    return {
      originalText: '',
      redactedText: '',
      detectedTypes: [],
      detections: [],
      redactionCount: {} as Record<PIIType, number>,
    };
  }

  const originalText = firstResult.originalText;
  let redactedText = originalText;
  const allDetections: PIIDetection[] = [];
  const redactionCount: Record<PIIType, number> = {} as Record<PIIType, number>;

  // Sort all detections by position (latest first for correct string replacement)
  const sortedDetections = results
    .flatMap(result => result.detections)
    .filter(detection => detection.validated)
    .sort((a, b) => b.startIndex - a.startIndex);

  // Track applied ranges in original coordinates to avoid overlapping replacements
  const appliedRanges: Array<{ start: number; end: number }> = [];

  // Apply redactions from end to start to maintain indices
  for (const detection of sortedDetections) {
    const overlaps = appliedRanges.some(
      r => !(detection.endIndex <= r.start || detection.startIndex >= r.end)
    );
    if (overlaps) continue;

    redactedText =
      redactedText.substring(0, detection.startIndex) +
      detection.redactedValue +
      redactedText.substring(detection.endIndex);

    allDetections.push(detection);
    redactionCount[detection.type] = (redactionCount[detection.type] || 0) + 1;
    appliedRanges.push({ start: detection.startIndex, end: detection.endIndex });
  }

  const detectedTypes = [...new Set(allDetections.map(d => d.type))];

  return {
    originalText,
    redactedText,
    detectedTypes,
    detections: allDetections,
    redactionCount,
  };
}

/**
 * Main function to detect and redact all PII types from text
 */
export function redactPII(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): PIIDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: PIIDetectionResult[] = [];

  // Apply each redaction type if enabled
  if (opts.enabledTypes.includes(PIIType.EMAIL)) {
    results.push(redactEmails(text, options));
  }

  if (opts.enabledTypes.includes(PIIType.PHONE)) {
    results.push(redactPhoneNumbers(text, options));
  }

  if (opts.enabledTypes.includes(PIIType.CREDIT_CARD)) {
    results.push(redactCreditCards(text, options));
  }

  if (opts.enabledTypes.includes(PIIType.SSN)) {
    results.push(redactSSN(text, options));
  }

  if (opts.enabledTypes.includes(PIIType.IP_ADDRESS)) {
    results.push(redactIPAddresses(text, options));
  }

  if (opts.enabledTypes.includes(PIIType.URL)) {
    results.push(redactURLs(text, options));
  }

  // Process custom patterns if provided
  if (opts.customPatterns && Object.keys(opts.customPatterns).length > 0) {
    for (const [, pattern] of Object.entries(opts.customPatterns)) {
      const globalPattern = normalizeRegexForMatchAll(pattern);
      const matches = Array.from(text.matchAll(globalPattern));
      const detections: PIIDetection[] = [];

      for (const match of matches) {
        if (match.index === undefined || match.index === null) continue;

        const originalValue = match[0];
        const redactedValue = createRedactedText(originalValue, opts);

        detections.push({
          type: PIIType.CUSTOM,
          originalValue,
          redactedValue,
          startIndex: match.index,
          endIndex: match.index + originalValue.length,
          confidence: 0.8,
          validated: true,
        });
      }

      if (detections.length > 0) {
        let customRedactedText = text;
        let offset = 0;

        for (const detection of detections) {
          const adjustedIndex = detection.startIndex + offset;
          customRedactedText =
            customRedactedText.substring(0, adjustedIndex) +
            detection.redactedValue +
            customRedactedText.substring(adjustedIndex + detection.originalValue.length);
          offset += detection.redactedValue.length - detection.originalValue.length;
        }

        results.push({
          originalText: text,
          redactedText: customRedactedText,
          detectedTypes: [PIIType.CUSTOM],
          detections,
          redactionCount: { [PIIType.CUSTOM]: detections.length } as Record<PIIType, number>,
        });
      }
    }
  }

  if (results.length === 0) {
    return {
      originalText: text,
      redactedText: text,
      detectedTypes: [],
      detections: [],
      redactionCount: {} as Record<PIIType, number>,
    };
  }
  return mergeDetectionResults(results);
}

/**
 * Detect types of PII present in text without redacting
 */
export function detectPIITypes(
  text: string,
  options: Partial<PIIRedactionOptions> = {}
): { detectedTypes: PIIType[]; detectionCount: Record<PIIType, number> } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detectionCount: Record<PIIType, number> = {} as Record<PIIType, number>;

  // Check each PII type
  if (opts.enabledTypes.includes(PIIType.EMAIL)) {
    const emailMatches = Array.from(text.matchAll(PII_PATTERNS.email));
    if (emailMatches.length > 0) {
      detectionCount[PIIType.EMAIL] = emailMatches.length;
    }
  }

  if (opts.enabledTypes.includes(PIIType.PHONE)) {
    const phoneMatches = Array.from(text.matchAll(PII_PATTERNS.phone));
    const validPhones = opts.enableValidation
      ? phoneMatches.filter(match => match[0] && validatePhoneNumber(match[0]))
      : phoneMatches;
    if (validPhones.length > 0) {
      detectionCount[PIIType.PHONE] = validPhones.length;
    }
  }

  if (opts.enabledTypes.includes(PIIType.CREDIT_CARD)) {
    const cardMatches = Array.from(text.matchAll(PII_PATTERNS.creditCard));
    const validCards = opts.enableValidation
      ? cardMatches.filter(match => match[0] && validateCreditCard(match[0]))
      : cardMatches;
    if (validCards.length > 0) {
      detectionCount[PIIType.CREDIT_CARD] = validCards.length;
    }
  }

  if (opts.enabledTypes.includes(PIIType.SSN)) {
    const ssnMatches = Array.from(text.matchAll(PII_PATTERNS.ssn));
    const validSSNs = opts.enableValidation
      ? ssnMatches.filter(match => match[0] && validateSSN(match[0]))
      : ssnMatches;
    if (validSSNs.length > 0) {
      detectionCount[PIIType.SSN] = validSSNs.length;
    }
  }

  if (opts.enabledTypes.includes(PIIType.IP_ADDRESS)) {
    const ipv4Matches = Array.from(text.matchAll(PII_PATTERNS.ipv4));
    const ipv6Matches = Array.from(text.matchAll(PII_PATTERNS.ipv6));
    const validIPv4 = opts.enableValidation
      ? ipv4Matches.filter(match => match[0] && validateIPv4(match[0]))
      : ipv4Matches;
    const validIPv6 = ipv6Matches; // Accept IPv6 via regex match
    const validIPs = [...validIPv4, ...validIPv6];
    if (validIPs.length > 0) {
      detectionCount[PIIType.IP_ADDRESS] = validIPs.length;
    }
  }

  if (opts.enabledTypes.includes(PIIType.URL)) {
    const urlMatches = Array.from(text.matchAll(PII_PATTERNS.url));
    const validURLs = opts.enableValidation
      ? urlMatches.filter(
          match =>
            match[0] &&
            match[0].startsWith('http') &&
            match[0].includes('://') &&
            match[0].length > 10
        )
      : urlMatches;
    if (validURLs.length > 0) {
      detectionCount[PIIType.URL] = validURLs.length;
    }
  }

  // Check custom patterns
  if (opts.customPatterns && Object.keys(opts.customPatterns).length > 0) {
    let customCount = 0;
    for (const pattern of Object.values(opts.customPatterns)) {
      const globalPattern = normalizeRegexForMatchAll(pattern);
      const matches = Array.from(text.matchAll(globalPattern));
      customCount += matches.length;
    }
    if (customCount > 0) {
      detectionCount[PIIType.CUSTOM] = customCount;
    }
  }

  return {
    detectedTypes: Object.keys(detectionCount) as PIIType[],
    detectionCount,
  };
}
