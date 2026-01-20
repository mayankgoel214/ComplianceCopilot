#!/usr/bin/env node

// Test the simple agent endpoint
const BASE_URL = "http://localhost:3000";

async function testAgentSimple() {
  try {
    console.log("Testing simple agent endpoint...");

    const response = await fetch(`${BASE_URL}/api/agents/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "test-project",
        message: "Hello from test",
      }),
    });

    console.log(`Status: ${response.status}`);

    if (response.status === 200) {
      const data = await response.json();
      console.log("Response:", data);
    } else {
      const errorText = await response.text();
      console.log("Error response:", errorText.substring(0, 500));
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testAgentSimple();
