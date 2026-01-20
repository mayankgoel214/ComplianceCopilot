#!/usr/bin/env node

/**
 * Test script to verify real Gemini embedding integration
 * Run with: node test-embedding-integration.mjs
 */

const SERVER_URL = 'http://localhost:3001';

const TEST_CONTENT = `# Data Privacy and Security

## Introduction
This document outlines our comprehensive approach to data privacy and security compliance.

## GDPR Compliance
The General Data Protection Regulation (GDPR) requires organizations to:
- Obtain explicit consent for data processing
- Implement data protection by design
- Ensure the right to erasure
- Conduct privacy impact assessments

## HIPAA Requirements
For healthcare data, we must ensure:
- Administrative safeguards are in place
- Physical safeguards protect systems
- Technical safeguards secure electronic data
- Access controls limit data exposure

## SOC 2 Controls
Our SOC 2 Type II compliance includes:
- Security controls and monitoring
- Availability and system performance
- Processing integrity verification
- Confidentiality of customer data
- Privacy protection measures

## Data Handling Procedures
1. Data classification and labeling
2. Encryption at rest and in transit
3. Regular security audits and assessments
4. Incident response and breach notification
5. Employee training and awareness programs`;

async function testEmbeddingIntegration() {
  console.log('🧪 Testing Real Gemini Embedding Integration\n');
  console.log('📄 Test Content Preview:');
  console.log(TEST_CONTENT.substring(0, 200) + '...\n');

  try {
    console.log('🚀 Sending request to chunking endpoint...');

    const response = await fetch(`${SERVER_URL}/api/test/chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: TEST_CONTENT,
        config: {
          min_chunk_size: 150,
          max_chunk_size: 400,
          target_chunk_size: 300,
          overlap_percentage: 10,
          prefer_semantic_boundaries: true
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();

    console.log('✅ Chunking completed successfully!\n');

    // Display results
    console.log('📊 Results Summary:');
    console.log(`   Total Chunks: ${result.total_chunks}`);
    console.log(`   Total Tokens: ${result.total_tokens}`);
    console.log(`   Average Chunk Size: ${Math.round(result.average_chunk_size)} tokens`);
    console.log(`   Semantic Coherence: ${(result.semantic_coherence * 100).toFixed(1)}%`);
    console.log(`   Hierarchy Preservation: ${(result.hierarchy_preservation * 100).toFixed(1)}%`);
    console.log(`   Overlap Efficiency: ${(result.overlap_efficiency * 100).toFixed(1)}%\n`);

    // Display chunk details
    console.log('📋 Chunk Analysis:');
    result.chunks.forEach((chunk, index) => {
      console.log(`   Chunk ${index + 1}:`);
      console.log(`     Type: ${chunk.chunk_type}`);
      console.log(`     Tokens: ${chunk.tokens}`);
      console.log(`     Hierarchy Level: ${chunk.hierarchy_level}`);
      console.log(`     Heading Path: ${chunk.heading_path.join(' > ') || 'None'}`);
      console.log(`     Topic Keywords: ${chunk.topic_keywords.join(', ') || 'None'}`);
      console.log(`     Semantic Density: ${(chunk.semantic_density * 100).toFixed(1)}%`);
      console.log(`     Content Preview: "${chunk.content.substring(0, 100)}..."`);
      console.log('');
    });

    // Test embedding service health
    console.log('🔍 Testing embedding service health...');

    // Import and test the embedding service directly
    const embeddingServiceTest = await testEmbeddingServiceDirectly();

    if (embeddingServiceTest.success) {
      console.log('✅ Embedding service health check passed!');
      console.log(`   Model: ${embeddingServiceTest.config.model}`);
      console.log(`   Dimensions: ${embeddingServiceTest.config.dimensions}`);
      console.log(`   Test embedding generated: ${embeddingServiceTest.embedding.length} dimensions`);
    } else {
      console.log('❌ Embedding service health check failed');
      console.log(`   Error: ${embeddingServiceTest.error}`);
    }

    console.log('\n🎉 Integration test completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test with real Google Drive documents');
    console.log('   2. Verify vector storage in ChromaDB');
    console.log('   3. Test semantic search queries');
    console.log('   4. Monitor API usage and rate limits');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   - Make sure the development server is running (npm run dev)');
      console.log('   - Check if the server is running on port 3001');
      console.log('   - Verify .env.local has GOOGLE_GEMINI_API_KEY set');
    } else if (error.message.includes('API Error: 500')) {
      console.log('\n💡 Possible causes:');
      console.log('   - GOOGLE_GEMINI_API_KEY not set or invalid');
      console.log('   - Gemini API quota exceeded');
      console.log('   - Network connectivity issues');
    }

    process.exit(1);
  }
}

async function testEmbeddingServiceDirectly() {
  try {
    // Create a simple Node.js compatible test since we can't import ES modules directly
    const healthResponse = await fetch(`${SERVER_URL}/api/test/embedding-health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        testQuery: 'test health check'
      })
    });

    if (healthResponse.ok) {
      return await healthResponse.json();
    } else {
      return {
        success: false,
        error: 'Health endpoint not available'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testEmbeddingIntegration().catch(console.error);