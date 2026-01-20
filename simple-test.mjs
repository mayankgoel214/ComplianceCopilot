#!/usr/bin/env node

// Simple test to check if the server is responding
const BASE_URL = "http://localhost:3000";

async function testServer() {
  try {
    console.log("Testing server response...");

    // Test basic endpoint first
    const response = await fetch(`${BASE_URL}/api/health`);
    console.log(`Health endpoint status: ${response.status}`);

    if (response.status === 200) {
      const data = await response.json();
      console.log("Health response:", data);
    }

    // Test analyze endpoint with minimal data
    console.log("\nTesting analyze endpoint...");
    const analyzeResponse = await fetch(`${BASE_URL}/api/agents/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "test-project",
        projectDescription: "A simple test project",
      }),
    });

    console.log(`Analyze endpoint status: ${analyzeResponse.status}`);

    if (analyzeResponse.status === 200) {
      const data = await analyzeResponse.json();
      console.log("Analyze response keys:", Object.keys(data));
    } else {
      const errorText = await analyzeResponse.text();
      console.log("Error response:", errorText.substring(0, 500));
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testServer();
