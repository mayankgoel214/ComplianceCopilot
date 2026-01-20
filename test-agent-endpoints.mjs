#!/usr/bin/env node

/**
 * Test script to verify agent endpoint fixes
 * Tests various input formats and edge cases
 */

const BASE_URL = "http://localhost:3000";

// Test cases for the analyze endpoint
const analyzeTestCases = [
  {
    name: "Valid full analysis request",
    data: {
      projectId: "test-project-1",
      projectDescription:
        "A healthcare research project involving patient data collection and analysis",
      documentContent:
        "This project will collect patient health information for research purposes.",
      analysisType: "full",
      context: {
        userId: "test-user-1",
        sessionId: "test-session-1",
      },
    },
    expectedStatus: 200,
  },
  {
    name: "Valid classification-only request",
    data: {
      projectId: "test-project-2",
      projectDescription: "Educational platform for student data management",
      analysisType: "classification",
    },
    expectedStatus: 200,
  },
  {
    name: "Request with empty strings (should be sanitized)",
    data: {
      projectId: "  test-project-3  ",
      projectDescription: "   Research project with extra spaces   ",
      documentContent: "",
      analysisType: "ideation",
    },
    expectedStatus: 200,
  },
  {
    name: "Request with missing projectId (should fail)",
    data: {
      projectDescription: "A test project",
      analysisType: "classification",
    },
    expectedStatus: 400,
  },
  {
    name: "Request with missing projectDescription (should fail)",
    data: {
      projectId: "test-project-4",
      analysisType: "classification",
    },
    expectedStatus: 400,
  },
  {
    name: "Request with invalid analysisType (should fail)",
    data: {
      projectId: "test-project-5",
      projectDescription: "A test project",
      analysisType: "invalid-type",
    },
    expectedStatus: 400,
  },
  {
    name: "Request with non-string projectId (should fail)",
    data: {
      projectId: 123,
      projectDescription: "A test project",
      analysisType: "classification",
    },
    expectedStatus: 400,
  },
];

// Test cases for the chat endpoint
const chatTestCases = [
  {
    name: "Valid chat request",
    data: {
      projectId: "test-project-1",
      userQuery: "What are the key compliance requirements for this project?",
      conversationHistory: [
        {
          role: "user",
          content: "Hello",
          timestamp: new Date().toISOString(),
        },
      ],
      context: {
        projectDescription: "Healthcare research project",
        detectedFrameworks: ["HIPAA", "IRB"],
      },
    },
    expectedStatus: 200,
  },
  {
    name: "Chat request with empty userQuery (should fail)",
    data: {
      projectId: "test-project-2",
      userQuery: "",
      context: {},
    },
    expectedStatus: 400,
  },
  {
    name: "Chat request with missing userQuery (should fail)",
    data: {
      projectId: "test-project-3",
      context: {},
    },
    expectedStatus: 400,
  },
  {
    name: "Chat request with non-array conversationHistory (should fail)",
    data: {
      projectId: "test-project-4",
      userQuery: "Test query",
      conversationHistory: "not-an-array",
    },
    expectedStatus: 400,
  },
];

async function testEndpoint(endpoint, testCases) {
  console.log(`\n🧪 Testing ${endpoint} endpoint...`);
  console.log("=".repeat(50));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      console.log(`\n📋 Test: ${testCase.name}`);

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testCase.data),
      });

      const responseData = await response.json();

      if (response.status === testCase.expectedStatus) {
        console.log(`✅ PASS - Status: ${response.status}`);
        passed++;
      } else {
        console.log(
          `❌ FAIL - Expected: ${testCase.expectedStatus}, Got: ${response.status}`
        );
        console.log(`   Response:`, JSON.stringify(responseData, null, 2));
        failed++;
      }

      // Log response details for successful requests
      if (response.status === 200) {
        console.log(
          `   Response keys: ${Object.keys(responseData).join(", ")}`
        );
        if (responseData.results) {
          console.log(
            `   Analysis results: ${Object.keys(responseData.results).join(
              ", "
            )}`
          );
        }
        if (responseData.response) {
          console.log(
            `   Chat response length: ${responseData.response.length} chars`
          );
        }
      }
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 ${endpoint} Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function testHealthEndpoints() {
  console.log(`\n🏥 Testing health endpoints...`);
  console.log("=".repeat(50));

  try {
    // Test analyze GET endpoint
    const analyzeResponse = await fetch(
      `${BASE_URL}/api/agents/analyze?projectId=test-project-1`
    );
    console.log(`📋 Analyze GET - Status: ${analyzeResponse.status}`);

    // Test chat GET endpoint
    const chatResponse = await fetch(
      `${BASE_URL}/api/agents/chat?projectId=test-project-1`
    );
    console.log(`📋 Chat GET - Status: ${chatResponse.status}`);
  } catch (error) {
    console.log(`❌ Health endpoint error: ${error.message}`);
  }
}

async function runTests() {
  console.log("🚀 Starting Agent Endpoint Tests");
  console.log("=".repeat(50));

  try {
    // Test analyze endpoint
    const analyzeResults = await testEndpoint(
      "/api/agents/analyze",
      analyzeTestCases
    );

    // Test chat endpoint
    const chatResults = await testEndpoint("/api/agents/chat", chatTestCases);

    // Test health endpoints
    await testHealthEndpoints();

    // Summary
    const totalPassed = analyzeResults.passed + chatResults.passed;
    const totalFailed = analyzeResults.failed + chatResults.failed;

    console.log("\n🎯 FINAL RESULTS");
    console.log("=".repeat(50));
    console.log(`Total Tests: ${totalPassed + totalFailed}`);
    console.log(`✅ Passed: ${totalPassed}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(
      `Success Rate: ${(
        (totalPassed / (totalPassed + totalFailed)) *
        100
      ).toFixed(1)}%`
    );

    if (totalFailed === 0) {
      console.log(
        "\n🎉 All tests passed! Agent endpoints are working correctly."
      );
    } else {
      console.log("\n⚠️  Some tests failed. Check the logs above for details.");
    }
  } catch (error) {
    console.error("❌ Test suite failed:", error);
  }
}

// Run the tests
runTests().catch(console.error);
