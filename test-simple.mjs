#!/usr/bin/env node

// Test the simple endpoint
const BASE_URL = "http://localhost:3000";

async function testSimple() {
  try {
    console.log("Testing simple endpoint...");

    // Test GET
    const getResponse = await fetch(`${BASE_URL}/api/test-simple`);
    console.log(`GET status: ${getResponse.status}`);
    const getData = await getResponse.json();
    console.log("GET response:", getData);

    // Test POST
    const postResponse = await fetch(`${BASE_URL}/api/test-simple`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: "data" }),
    });
    console.log(`POST status: ${postResponse.status}`);
    const postData = await postResponse.json();
    console.log("POST response:", postData);
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testSimple();
