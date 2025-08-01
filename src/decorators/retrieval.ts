/**
 * Retrieval-specific trace decorator for vector search and retrieval operations
 */

import type { Attributes } from '../core/types.js';
import { trace, TraceOptions } from './base.js';

/**
 * Retrieval operation types
 */
export type RetrievalType =
  | 'semantic_search'
  | 'keyword_search'
  | 'hybrid_search'
  | 'similarity_search'
  | 'document_lookup'
  | 'vector_search'
  | 'embedding_search'
  | 'fuzzy_search'
  | 'filtered_search'
  | 'ranked_search'
  | 'clustering'
  | 'classification';

/**
 * Vector database types
 */
export type VectorDatabaseType =
  | 'pinecone'
  | 'weaviate'
  | 'qdrant'
  | 'milvus'
  | 'chroma'
  | 'faiss'
  | 'redis'
  | 'elasticsearch'
  | 'pgvector'
  | 'supabase'
  | 'custom';

/**
 * Retrieval operation metadata
 */
export interface RetrievalMetadata {
  /** Type of retrieval operation */
  retrievalType?: RetrievalType;
  /** Vector database or search system used */
  databaseType?: VectorDatabaseType;
  /** Collection or index name */
  collection?: string;
  /** Index name (if different from collection) */
  index?: string;
  /** Query text or description */
  query?: string;
  /** Query vector dimensions */
  vectorDimensions?: number;
  /** Number of results requested */
  topK?: number;
  /** Number of results actually returned */
  resultsCount?: number;
  /** Similarity threshold used */
  similarityThreshold?: number;
  /** Distance metric used */
  distanceMetric?: string;
  /** Search filters applied */
  filters?: Record<string, any>;
  /** Embedding model used */
  embeddingModel?: string;
  /** Embedding provider */
  embeddingProvider?: string;
  /** Search scores/similarities */
  scores?: number[];
  /** Highest similarity score */
  maxScore?: number;
  /** Lowest similarity score */
  minScore?: number;
  /** Average similarity score */
  avgScore?: number;
  /** Document IDs retrieved */
  documentIds?: string[];
  /** Metadata of retrieved documents */
  documentMetadata?: Record<string, any>[];
  /** Search latency in milliseconds */
  searchLatency?: number;
  /** Embedding generation time */
  embeddingTime?: number;
  /** Total operation time */
  totalTime?: number;
  /** Cache hit indicator */
  cacheHit?: boolean;
  /** Number of documents in collection/index */
  totalDocuments?: number;
  /** Search parameters used */
  searchParams?: Record<string, any>;
}

/**
 * Options for the Retrieval trace decorator
 */
export interface TraceRetrievalOptions extends Omit<TraceOptions, 'attributes'> {
  /** Retrieval-specific metadata */
  retrievalMetadata?: Partial<RetrievalMetadata>;
  /** Additional attributes */
  attributes?: Attributes;
  /** Whether to capture query text */
  captureQuery?: boolean;
  /** Whether to capture result documents */
  captureResults?: boolean;
  /** Whether to capture similarity scores */
  captureScores?: boolean;
  /** Maximum length for captured text */
  maxCaptureLength?: number;
  /** Maximum number of documents to capture */
  maxDocuments?: number;
}

/**
 * Performance tracker for retrieval operations
 */
class RetrievalPerformanceTracker {
  private startTime: number;
  private embeddingStartTime?: number;
  private searchStartTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  markEmbeddingStart(): void {
    this.embeddingStartTime = Date.now();
  }

  markEmbeddingEnd(): number {
    if (this.embeddingStartTime) {
      return Date.now() - this.embeddingStartTime;
    }
    return 0;
  }

  markSearchStart(): void {
    this.searchStartTime = Date.now();
  }

  markSearchEnd(): number {
    if (this.searchStartTime) {
      return Date.now() - this.searchStartTime;
    }
    return 0;
  }

  getTotalTime(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Utility function to calculate score statistics
 */
function calculateScoreStats(scores: number[]): { max: number; min: number; avg: number } {
  if (scores.length === 0) {
    return { max: 0, min: 0, avg: 0 };
  }

  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return {
    max: Math.round(max * 10000) / 10000,
    min: Math.round(min * 10000) / 10000,
    avg: Math.round(avg * 10000) / 10000,
  };
}

/**
 * Utility function to safely extract document metadata
 */
function extractDocumentMetadata(
  results: any[],
  maxDocuments: number
): {
  ids: string[];
  metadata: Record<string, any>[];
  count: number;
} {
  const ids: string[] = [];
  const metadata: Record<string, any>[] = [];

  const limitedResults = results.slice(0, maxDocuments);

  for (const result of limitedResults) {
    // Extract ID
    const id =
      result.id ||
      result._id ||
      result.doc_id ||
      result.document_id ||
      String(result.index || ids.length);
    ids.push(id);

    // Extract metadata
    const meta = result.metadata || result.meta || result.document || {};
    metadata.push(meta);
  }

  return {
    ids,
    metadata,
    count: results.length,
  };
}

/**
 * Retrieval trace decorator for tracing vector search and retrieval operations
 *
 * @param options - Configuration options for the retrieval decorator
 * @returns Decorator function
 *
 * @example
 * class VectorSearchService {
 *   @traceRetrieval({
 *     name: 'semantic-search',
 *     retrievalMetadata: {
 *       retrievalType: 'semantic_search',
 *       databaseType: 'pinecone',
 *       collection: 'documents'
 *     }
 *   })
 *   async semanticSearch(query: string, topK: number = 10) {
 *     // Vector search implementation
 *     const embedding = await this.getEmbedding(query);
 *     const results = await this.vectorDB.search(embedding, topK);
 *     return results;
 *   }
 *
 *   @traceRetrieval({
 *     retrievalMetadata: { retrievalType: 'hybrid_search' },
 *     captureScores: true
 *   })
 *   async hybridSearch(query: string, filters: any) {
 *     // Hybrid search implementation
 *     return await this.performHybridSearch(query, filters);
 *   }
 * }
 */
export function traceRetrieval(options: TraceRetrievalOptions = {}): any {
  const {
    retrievalMetadata = {},
    captureQuery = true,
    captureResults = true,
    captureScores = true,
    maxCaptureLength = 1000,
    maxDocuments = 10,
    attributes = {},
    ...traceOptions
  } = options;

  // Build attributes from retrieval metadata
  const retrievalAttributes: Attributes = {
    ...attributes,
    'retrieval.operation_type': 'search',
    'decorator.type': 'traceRetrieval',
  };

  // Add known retrieval metadata to attributes
  if (retrievalMetadata.retrievalType)
    retrievalAttributes['retrieval.type'] = retrievalMetadata.retrievalType;
  if (retrievalMetadata.databaseType)
    retrievalAttributes['retrieval.database_type'] = retrievalMetadata.databaseType;
  if (retrievalMetadata.collection)
    retrievalAttributes['retrieval.collection'] = retrievalMetadata.collection;
  if (retrievalMetadata.index) retrievalAttributes['retrieval.index'] = retrievalMetadata.index;
  if (retrievalMetadata.embeddingModel)
    retrievalAttributes['retrieval.embedding_model'] = retrievalMetadata.embeddingModel;
  if (retrievalMetadata.embeddingProvider)
    retrievalAttributes['retrieval.embedding_provider'] = retrievalMetadata.embeddingProvider;
  if (retrievalMetadata.distanceMetric)
    retrievalAttributes['retrieval.distance_metric'] = retrievalMetadata.distanceMetric;
  if (retrievalMetadata.topK !== undefined)
    retrievalAttributes['retrieval.top_k'] = retrievalMetadata.topK;
  if (retrievalMetadata.similarityThreshold !== undefined)
    retrievalAttributes['retrieval.similarity_threshold'] = retrievalMetadata.similarityThreshold;

  // Create enhanced trace decorator
  return trace({
    ...traceOptions,
    attributes: retrievalAttributes,
  })(function decorator(
    target: any,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    // Get the original method/function
    const original = descriptor?.value || target;

    // Create wrapper that captures retrieval data
    const wrapper = async function (this: any, ...args: any[]) {
      const tracker = new RetrievalPerformanceTracker();

      try {
        // Capture input query if enabled
        if (captureQuery && args.length > 0) {
          const currentSpan = require('../context/context-manager.js').getCurrentSpan();
          if (currentSpan) {
            const query = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
            const truncatedQuery =
              query.length > maxCaptureLength
                ? `${query.substring(0, maxCaptureLength - 3)}...`
                : query;
            currentSpan.setAttribute('retrieval.query', truncatedQuery);
            currentSpan.setAttribute('retrieval.query_length', query.length);

            // Extract additional parameters
            if (args.length > 1) {
              const secondArg = args[1];
              if (typeof secondArg === 'number') {
                currentSpan.setAttribute('retrieval.requested_count', secondArg);
              } else if (typeof secondArg === 'object') {
                // Could be filters or options
                currentSpan.setAttribute('retrieval.has_filters', true);
                currentSpan.setAttribute('retrieval.filter_count', Object.keys(secondArg).length);
              }
            }
          }
        }

        // Call original function
        const result = await Promise.resolve(original.apply(this, args));

        // Capture results and metadata
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          const totalTime = tracker.getTotalTime();
          currentSpan.setAttribute('retrieval.total_time_ms', totalTime);

          // Process results if they exist
          if (result) {
            let results: any[] = [];
            let scores: number[] = [];

            // Handle different result formats
            if (Array.isArray(result)) {
              results = result;
            } else if (result.results && Array.isArray(result.results)) {
              results = result.results;
            } else if (result.documents && Array.isArray(result.documents)) {
              results = result.documents;
            } else if (result.matches && Array.isArray(result.matches)) {
              results = result.matches;
            }

            // Extract scores
            if (captureScores) {
              scores = results.map(r => r.score || r.similarity || r.distance || 0);

              if (scores.length > 0) {
                const stats = calculateScoreStats(scores);
                currentSpan.setAttribute('retrieval.max_score', stats.max);
                currentSpan.setAttribute('retrieval.min_score', stats.min);
                currentSpan.setAttribute('retrieval.avg_score', stats.avg);
              }
            }

            // Capture result metadata
            currentSpan.setAttribute('retrieval.results_count', results.length);

            if (captureResults && results.length > 0) {
              const { ids, metadata } = extractDocumentMetadata(results, maxDocuments);

              if (ids.length > 0) {
                currentSpan.setAttribute('retrieval.document_ids', ids.slice(0, 5).join(','));
                currentSpan.setAttribute(
                  'retrieval.captured_documents',
                  Math.min(ids.length, maxDocuments)
                );
              }

              // Add top result metadata if available
              if (metadata.length > 0 && metadata[0]) {
                const topMetadata = metadata[0];
                Object.entries(topMetadata).forEach(([key, value]) => {
                  if (typeof value === 'string' || typeof value === 'number') {
                    currentSpan.setAttribute(`retrieval.top_result.${key}`, value);
                  }
                });
              }
            }

            // Add performance metrics
            if (result.timing) {
              if (result.timing.embedding) {
                currentSpan.setAttribute('retrieval.embedding_time_ms', result.timing.embedding);
              }
              if (result.timing.search) {
                currentSpan.setAttribute('retrieval.search_time_ms', result.timing.search);
              }
            }

            // Add cache information if available
            if (result.cached !== undefined) {
              currentSpan.setAttribute('retrieval.cache_hit', result.cached);
            }

            // Add collection/index statistics if available
            if (result.totalDocuments !== undefined) {
              currentSpan.setAttribute('retrieval.total_documents', result.totalDocuments);
            }

            // Calculate search efficiency metrics
            if (results.length > 0 && retrievalMetadata.topK) {
              const efficiency = results.length / retrievalMetadata.topK;
              currentSpan.setAttribute(
                'retrieval.search_efficiency',
                Math.round(efficiency * 100) / 100
              );
            }
          }

          // Mark as successful retrieval
          currentSpan.setAttribute('retrieval.success', true);
        }

        return result;
      } catch (error) {
        // Add error-specific retrieval attributes
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          currentSpan.setAttribute('retrieval.success', false);
          currentSpan.setAttribute('retrieval.error', true);
          if (error instanceof Error) {
            currentSpan.setAttribute('retrieval.error_type', error.constructor.name);
            const errorMessage =
              error.message.length > maxCaptureLength
                ? `${error.message.substring(0, maxCaptureLength - 3)}...`
                : error.message;
            currentSpan.setAttribute('retrieval.error_message', errorMessage);
          }

          // Add timing even on error
          const totalTime = tracker.getTotalTime();
          currentSpan.setAttribute('retrieval.total_time_ms', totalTime);
        }
        throw error;
      }
    };

    // Apply the wrapper based on decoration type
    if (descriptor) {
      descriptor.value = wrapper;
      return descriptor;
    } else {
      return wrapper;
    }
  });
}

/**
 * Simple retrieval trace decorator without options
 */
export const simpleRetrievalTrace = traceRetrieval();

/**
 * Create a reusable retrieval decorator with preset options
 *
 * @param defaultOptions - Default options for the retrieval decorator
 * @returns Retrieval decorator factory
 *
 * @example
 * const tracePineconeSearch = createRetrievalDecorator({
 *   retrievalMetadata: {
 *     databaseType: 'pinecone',
 *     retrievalType: 'semantic_search'
 *   },
 *   captureScores: true,
 *   maxDocuments: 20
 * });
 *
 * class PineconeService {
 *   @tracePineconeSearch({ retrievalMetadata: { collection: 'documents' } })
 *   async search(query: string, topK: number) {
 *     // implementation
 *   }
 * }
 */
export function createRetrievalDecorator(defaultOptions: TraceRetrievalOptions) {
  return function (options: Partial<TraceRetrievalOptions> = {}) {
    return traceRetrieval({
      ...defaultOptions,
      ...options,
      retrievalMetadata: {
        ...defaultOptions.retrievalMetadata,
        ...options.retrievalMetadata,
      },
      attributes: {
        ...defaultOptions.attributes,
        ...options.attributes,
      },
    });
  };
}

/**
 * Predefined retrieval decorators for common search types
 */
export const traceSemanticSearch = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'semantic_search' },
  name: 'semantic-search',
});

export const traceKeywordSearch = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'keyword_search' },
  name: 'keyword-search',
});

export const traceHybridSearch = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'hybrid_search' },
  name: 'hybrid-search',
});

export const traceVectorSearch = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'vector_search' },
  name: 'vector-search',
});

export const traceSimilaritySearch = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'similarity_search' },
  name: 'similarity-search',
});

export const traceDocumentLookup = createRetrievalDecorator({
  retrievalMetadata: { retrievalType: 'document_lookup' },
  name: 'document-lookup',
});
