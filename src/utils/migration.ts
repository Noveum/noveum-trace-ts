/**
 * Migration utilities for transitioning from legacy trace formats
 * to the new Python SDK-compatible StandaloneTrace format
 */

import type { SerializedTrace, SerializedSpan, Attributes } from '../core/types.js';
import { SpanStatus } from '../core/types.js';
import { formatPythonCompatibleTimestamp, getSdkVersion } from './index.js';

/**
 * Legacy trace format (pre-Python SDK compatibility)
 */
interface LegacyTrace {
  traceId?: string;
  trace_id?: string;
  name: string;
  startTime?: string | Date;
  start_time?: string;
  endTime?: string | Date;
  end_time?: string;
  status?: string;
  attributes?: Attributes;
  spans?: any[];
  [key: string]: any;
}

/**
 * Legacy span format (pre-Python SDK compatibility)
 */
interface LegacySpan {
  spanId?: string;
  span_id?: string;
  traceId?: string;
  trace_id?: string;
  parentSpanId?: string;
  parent_span_id?: string;
  name: string;
  startTime?: string | Date;
  start_time?: string;
  endTime?: string | Date;
  end_time?: string;
  status?: string;
  attributes?: Attributes;
  [key: string]: any;
}

/**
 * Migration options for customizing the migration process
 */
export interface MigrationOptions {
  /** Default project name if not found in legacy data */
  defaultProject?: string;
  /** Default environment if not found in legacy data */
  defaultEnvironment?: string;
  /** Whether to preserve unknown fields as custom attributes */
  preserveUnknownFields?: boolean;
  /** Custom field mappings for trace fields */
  traceFieldMappings?: Record<string, string>;
  /** Custom field mappings for span fields */
  spanFieldMappings?: Record<string, string>;
}

/**
 * Default migration options
 */
const DEFAULT_MIGRATION_OPTIONS: Required<MigrationOptions> = {
  defaultProject: 'migrated-project',
  defaultEnvironment: 'development',
  preserveUnknownFields: true,
  traceFieldMappings: {},
  spanFieldMappings: {},
};

/**
 * Migrate a legacy trace to the new Python SDK-compatible format
 */
export function migrateTrace(
  legacyTrace: LegacyTrace,
  options: MigrationOptions = {}
): SerializedTrace {
  const opts = { ...DEFAULT_MIGRATION_OPTIONS, ...options };

  // Extract trace ID (try both formats)
  const traceId = legacyTrace.trace_id || legacyTrace.traceId;
  if (!traceId) {
    throw new Error('Legacy trace missing trace ID');
  }

  // Convert timestamps
  const startTime = convertTimestamp(legacyTrace.start_time || legacyTrace.startTime || new Date());
  const endTime =
    legacyTrace.end_time || legacyTrace.endTime
      ? convertTimestamp(legacyTrace.end_time || legacyTrace.endTime!)
      : null;

  // Calculate duration
  const startMs = new Date(startTime).getTime();
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();
  const duration = endMs - startMs;

  // Migrate spans
  const spans = (legacyTrace.spans || []).map(span => migrateSpan(span, traceId, opts));

  // Calculate error count
  const errorCount = spans.filter(span => span.status === 'error').length;

  // Handle custom field mappings
  const customAttributes: Record<string, any> = {};
  if (opts.preserveUnknownFields) {
    for (const [key, value] of Object.entries(legacyTrace)) {
      if (!isKnownTraceField(key) && value !== undefined) {
        customAttributes[key] = value;
      }
    }
  }

  return {
    trace_id: traceId,
    name: legacyTrace.name,
    start_time: startTime,
    end_time: endTime,
    duration_ms: duration,
    status: normalizeStatus(legacyTrace.status),
    status_message: null,
    span_count: spans.length,
    error_count: errorCount,
    attributes: {
      ...legacyTrace.attributes,
      ...(Object.keys(customAttributes).length > 0
        ? { 'migration.legacy_fields': JSON.stringify(customAttributes) }
        : {}),
    },
    metadata: {
      user_id: null,
      session_id: null,
      request_id: null,
      tags: {},
      custom_attributes: customAttributes,
    },
    spans,
    sdk: {
      name: '@noveum/trace',
      version: getSdkVersion(),
    },
    project: opts.defaultProject,
    environment: opts.defaultEnvironment,
  };
}

/**
 * Migrate a legacy span to the new Python SDK-compatible format
 */
export function migrateSpan(
  legacySpan: LegacySpan,
  traceId: string,
  options: MigrationOptions = {}
): SerializedSpan {
  const opts = { ...DEFAULT_MIGRATION_OPTIONS, ...options };

  // Extract span ID
  const spanId = legacySpan.span_id || legacySpan.spanId;
  if (!spanId) {
    throw new Error('Legacy span missing span ID');
  }

  // Convert timestamps
  const startTime = convertTimestamp(legacySpan.start_time || legacySpan.startTime || new Date());
  const endTime =
    legacySpan.end_time || legacySpan.endTime
      ? convertTimestamp(legacySpan.end_time || legacySpan.endTime!)
      : null;

  // Calculate duration
  const startMs = new Date(startTime).getTime();
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();
  const duration = endMs - startMs;

  // Handle custom field mappings
  const customAttributes: Record<string, any> = {};
  if (opts.preserveUnknownFields) {
    for (const [key, value] of Object.entries(legacySpan)) {
      if (!isKnownSpanField(key) && value !== undefined) {
        customAttributes[key] = value;
      }
    }
  }

  return {
    span_id: spanId,
    trace_id: traceId,
    parent_span_id: legacySpan.parent_span_id || legacySpan.parentSpanId || null,
    name: legacySpan.name,
    start_time: startTime,
    end_time: endTime,
    duration_ms: duration,
    status: normalizeStatus(legacySpan.status),
    status_message: null,
    attributes: {
      ...legacySpan.attributes,
      ...(Object.keys(customAttributes).length > 0
        ? { 'migration.legacy_fields': JSON.stringify(customAttributes) }
        : {}),
    },
    events: [],
    links: [],
  };
}

/**
 * Convert various timestamp formats to Python SDK-compatible format
 */
function convertTimestamp(timestamp: string | Date): string {
  if (timestamp instanceof Date) {
    return formatPythonCompatibleTimestamp(timestamp);
  }

  // Try parsing as ISO string or timestamp
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    // Fallback to current time if parsing fails
    console.warn(`Invalid timestamp format: ${timestamp}, using current time`);
    return formatPythonCompatibleTimestamp(new Date());
  }

  return formatPythonCompatibleTimestamp(date);
}

/**
 * Normalize status strings to Python SDK format
 */
function normalizeStatus(status?: string): SpanStatus {
  if (!status) return SpanStatus.UNSET;

  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'ok':
    case 'success':
    case 'completed':
      return SpanStatus.OK;
    case 'error':
    case 'failed':
    case 'failure':
      return SpanStatus.ERROR;
    case 'timeout':
    case 'timed_out':
      return SpanStatus.TIMEOUT;
    case 'cancelled':
    case 'canceled':
    case 'aborted':
      return SpanStatus.CANCELLED;
    case 'unset':
    case 'unknown':
    default:
      return SpanStatus.UNSET;
  }
}

/**
 * Check if a field is a known trace field
 */
function isKnownTraceField(field: string): boolean {
  const knownFields = [
    'trace_id',
    'traceId',
    'name',
    'start_time',
    'startTime',
    'end_time',
    'endTime',
    'duration_ms',
    'status',
    'status_message',
    'span_count',
    'error_count',
    'attributes',
    'metadata',
    'spans',
    'sdk',
    'project',
    'environment',
  ];
  return knownFields.includes(field);
}

/**
 * Check if a field is a known span field
 */
function isKnownSpanField(field: string): boolean {
  const knownFields = [
    'span_id',
    'spanId',
    'trace_id',
    'traceId',
    'parent_span_id',
    'parentSpanId',
    'name',
    'start_time',
    'startTime',
    'end_time',
    'endTime',
    'duration_ms',
    'status',
    'status_message',
    'attributes',
    'events',
    'links',
  ];
  return knownFields.includes(field);
}

/**
 * Batch migrate multiple legacy traces
 */
export function migrateTraces(
  legacyTraces: LegacyTrace[],
  options: MigrationOptions = {}
): SerializedTrace[] {
  return legacyTraces.map((trace, index) => {
    try {
      return migrateTrace(trace, options);
    } catch (error) {
      console.error(`Failed to migrate trace at index ${index}:`, error);
      throw new Error(`Migration failed for trace ${index}: ${error}`);
    }
  });
}

/**
 * Validate that a migrated trace conforms to the Python SDK format
 */
export function validateMigratedTrace(trace: SerializedTrace): boolean {
  const requiredFields = [
    'trace_id',
    'name',
    'start_time',
    'duration_ms',
    'status',
    'span_count',
    'error_count',
    'attributes',
    'metadata',
    'spans',
    'sdk',
  ];

  for (const field of requiredFields) {
    if (!(field in trace)) {
      console.error(`Missing required field: ${field}`);
      return false;
    }
  }

  // Validate metadata structure
  const metadata = trace.metadata;
  const requiredMetadataFields = [
    'user_id',
    'session_id',
    'request_id',
    'tags',
    'custom_attributes',
  ];
  for (const field of requiredMetadataFields) {
    if (!(field in metadata)) {
      console.error(`Missing required metadata field: ${field}`);
      return false;
    }
  }

  // Validate SDK structure
  if (!trace.sdk.name || !trace.sdk.version) {
    console.error('Invalid SDK structure');
    return false;
  }

  return true;
}

/**
 * Create a migration report showing what was changed
 */
export interface MigrationReport {
  totalTraces: number;
  successfulMigrations: number;
  failedMigrations: number;
  warnings: string[];
  fieldMappings: Record<string, string>;
  customFieldsPreserved: string[];
}

/**
 * Generate a migration report for a batch migration
 */
export function generateMigrationReport(
  legacyTraces: LegacyTrace[],
  migratedTraces: SerializedTrace[],
  options: MigrationOptions = {}
): MigrationReport {
  const warnings: string[] = [];
  const customFieldsPreserved: string[] = [];

  // Analyze field mappings and custom fields
  for (const legacyTrace of legacyTraces) {
    for (const field of Object.keys(legacyTrace)) {
      if (!isKnownTraceField(field)) {
        if (!customFieldsPreserved.includes(field)) {
          customFieldsPreserved.push(field);
        }
      }
    }
  }

  return {
    totalTraces: legacyTraces.length,
    successfulMigrations: migratedTraces.length,
    failedMigrations: legacyTraces.length - migratedTraces.length,
    warnings,
    fieldMappings: { ...options.traceFieldMappings, ...options.spanFieldMappings },
    customFieldsPreserved,
  };
}
