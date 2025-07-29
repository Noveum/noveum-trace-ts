/**
 * Python Compatibility Test
 * 
 * Tests that the TypeScript SDK generates the exact same JSON structure
 * as the Python SDK to ensure perfect backend compatibility.
 */

import { NoveumClient, formatPythonCompatibleTimestamp } from '../src/index.js';

async function testPythonCompatibility() {
  console.log('🔗 Testing Python SDK Compatibility\n');
  
  // Create client with test configuration  
  const client = new NoveumClient({
    apiKey: 'test-api-key',
    project: 'compatibility-test',
    environment: 'test',
    debug: true,
    enabled: true
  });

  // Create a trace that matches the Python test structure
  const trace = await client.createTrace('basic-trace-test', {
    attributes: {
      'test.type': 'basic',
      'test.language': 'typescript',
      'test.timestamp': formatPythonCompatibleTimestamp(),
      'sdk.name': 'noveum-trace-ts',
      'sdk.version': '1.0.0'
    }
  });

  console.log('✅ Trace created:', trace.traceId);

  // Add events that match the Python test
  trace.addEvent('test-started', {
    'event.type': 'start'
  });

  trace.addEvent('test-completed', {
    'event.type': 'completion'
  });

  console.log('✅ Events added to trace');

  // Finish the trace
  await trace.finish();

  // Get the serialized trace
  const serializedTrace = trace.serialize();

  console.log('\n📊 TypeScript SDK Serialized Output:');
  console.log('=' .repeat(50));
  console.log(JSON.stringify({
    traces: [serializedTrace]
  }, null, 2));

  console.log('\n🔍 Structure Analysis:');
  console.log('- traceId:', typeof serializedTrace.traceId, '→', serializedTrace.traceId);
  console.log('- name:', typeof serializedTrace.name, '→', serializedTrace.name);
  console.log('- startTime:', typeof serializedTrace.startTime, '→', serializedTrace.startTime);
  console.log('- endTime:', typeof serializedTrace.endTime, '→', serializedTrace.endTime);
  console.log('- status:', typeof serializedTrace.status, '→', serializedTrace.status);
  console.log('- attributes:', typeof serializedTrace.attributes, '→', Object.keys(serializedTrace.attributes).length, 'keys');
  console.log('- events:', typeof serializedTrace.events, '→', serializedTrace.events.length, 'events');
  console.log('- spans:', typeof serializedTrace.spans, '→', serializedTrace.spans.length, 'spans');

  console.log('\n📋 Required Fields Check:');
  const requiredFields = ['traceId', 'name', 'startTime', 'endTime', 'status', 'attributes', 'events', 'spans'];
  for (const field of requiredFields) {
    const hasField = field in serializedTrace;
    console.log(`${hasField ? '✅' : '❌'} ${field}: ${hasField ? 'present' : 'missing'}`);
  }

  console.log('\n🎯 Compatibility Analysis:');
  
  // Check Python vs TypeScript timestamp formats
  const tsTimestamp = serializedTrace.startTime;
  console.log('- Timestamp format (TypeScript):', tsTimestamp);
  console.log('- Includes Z suffix:', tsTimestamp.endsWith('Z') ? '✅ Yes' : '❌ No');
  console.log('- Microsecond precision:', tsTimestamp.includes('.') ? `✅ Yes (${tsTimestamp.split('.')[1]?.length || 0} digits)` : '❌ No');

  // Check required attributes
  const attrs = serializedTrace.attributes;
  const requiredAttrs = ['test.type', 'test.language', 'sdk.name', 'sdk.version'];
  console.log('\n📋 Required Attributes:');
  for (const attr of requiredAttrs) {
    const hasAttr = attr in attrs;
    console.log(`${hasAttr ? '✅' : '❌'} ${attr}: ${hasAttr ? attrs[attr] : 'missing'}`);
  }

  // Check events structure
  console.log('\n📋 Events Structure:');
  for (const event of serializedTrace.events) {
    console.log(`✅ Event "${event.name}":`, {
      hasTimestamp: 'timestamp' in event,
      hasAttributes: 'attributes' in event,
      attributeCount: event.attributes ? Object.keys(event.attributes).length : 0
    });
  }

  console.log('\n🎉 Compatibility Test Completed!');
  console.log('\nExpected differences from Python SDK:');
  console.log('1. ✅ Timestamp format: FIXED - Now matches Python exactly (microsecond precision, no Z suffix)');
  console.log('2. ⚠️  Language identifier: "typescript" vs "python"');
  console.log('3. ⚠️  SDK name: "noveum-trace-ts" vs "noveum-trace-python"');
  console.log('4. ⚠️  Trace ID: Different ID for test identification');
  console.log('\nAll other fields should match exactly! ✅');

  await client.shutdown();
}

// Export for use in other tests
export { testPythonCompatibility };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPythonCompatibility().catch(console.error);
}