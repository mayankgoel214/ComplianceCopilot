#!/usr/bin/env node

// Minimal test to check if the server is responding
const BASE_URL = "http://localhost:3000";

async function testMinimal() {
  try {
    console.log("Testing minimal endpoint...");

    // Test a simple endpoint first
    const response = await fetch(`${BASE_URL}/api/health`);
    console.log(`Health endpoint status: ${response.status}`);

    if (response.status !== 200) {
      const text = await response.text();
      console.log("Health response:", text.substring(0, 200));
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testMinimal();
