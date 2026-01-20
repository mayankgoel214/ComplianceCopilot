#!/usr/bin/env node

// Test the step-by-step analyze endpoint
const BASE_URL = "http://localhost:3000";

async function testAnalyzeStep() {
  try {
    console.log("Testing step-by-step analyze endpoint...");

    const response = await fetch(`${BASE_URL}/api/agents/analyze-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "test-project",
        projectDescription: "A simple test project",
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

testAnalyzeStep();
