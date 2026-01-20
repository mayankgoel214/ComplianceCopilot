#!/usr/bin/env node

// Minimal test for agent endpoints
const BASE_URL = "http://localhost:3000";

async function testAgentMinimal() {
  try {
    console.log("Testing agent endpoints with minimal data...");

    // Test analyze endpoint with minimal data
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
      console.log(
        "Error response (first 500 chars):",
        errorText.substring(0, 500)
      );
    }

    // Test chat endpoint with minimal data
    const chatResponse = await fetch(`${BASE_URL}/api/agents/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "test-project",
        userQuery: "Hello, can you help me?",
      }),
    });

    console.log(`\nChat endpoint status: ${chatResponse.status}`);

    if (chatResponse.status === 200) {
      const data = await chatResponse.json();
      console.log("Chat response keys:", Object.keys(data));
    } else {
      const errorText = await chatResponse.text();
      console.log(
        "Error response (first 500 chars):",
        errorText.substring(0, 500)
      );
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testAgentMinimal();
