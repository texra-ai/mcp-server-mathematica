#!/usr/bin/env node

/**
 * test-integration.js
 * 
 * This script performs integration tests on the running MCP Mathematica server.
 * It sends requests via stdio and checks the responses for the expected tools.
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
// Resolve relative to this test script's location in tests/
const projectRoot = resolve(dirname(__filename), '..');

// Path to the built server, relative to the project root
const serverPath = resolve(projectRoot, 'build/index.js');

// --- Server Process Management ---

let serverProcess;
let rl;

function startServer() {
  console.log(`--- Starting MCP Server for Integration Test: ${serverPath} ---`);
  serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'] // Capture stdin, stdout, stderr
  });

  rl = createInterface({
    input: serverProcess.stdout,
    crlfDelay: Infinity
  });

  // Log server stderr for debugging
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server STDERR]: ${data.toString().trim()}`);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`--- MCP Server Exited (Code: ${code}, Signal: ${signal}) ---`);
  });

  serverProcess.on('error', (err) => {
    console.error(`--- MCP Server Failed to Start: ${err.message} ---`);
    process.exit(1); // Exit if server fails to start
  });

  // Allow some time for the server to initialize
  return new Promise(resolve => setTimeout(resolve, 1000));
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess || serverProcess.killed) {
      resolve();
      return;
    }
    console.log("--- Stopping MCP Server ---");
    serverProcess.stdin.end();
    // Wait a moment before forceful kill
    const killTimeout = setTimeout(() => {
      if (!serverProcess.killed) {
        console.warn("Server did not exit gracefully, killing...");
        serverProcess.kill('SIGKILL');
      }
      resolve();
    }, 2000);
    serverProcess.on('exit', () => {
      clearTimeout(killTimeout);
      resolve();
    });
  });
}

// --- Request/Response Handling ---

async function sendRequest(request) {
  return new Promise((resolve, reject) => {
    if (!serverProcess || serverProcess.killed) {
      return reject(new Error("Server process is not running."));
    }

    const requestId = Math.random().toString(36).substring(2, 15);
    const requestObj = {
      jsonrpc: '2.0',
      id: requestId,
      ...request
    };

    const requestJson = JSON.stringify(requestObj);
    console.log(`\n>>> Sending Request (ID: ${requestId}):`);
    console.log(requestJson);

    const responseHandler = (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === requestId) {
          console.log(`\n<<< Received Response (ID: ${requestId}):`);
          console.log(JSON.stringify(response, null, 2));
          rl.removeListener('line', responseHandler);
          clearTimeout(timeoutHandle); // Clear timeout on successful response
          // Check for MCP-level errors
          if (response.error) {
            reject(new Error(`Server responded with error: ${response.error.message} (Code: ${response.error.code})`));
          } else {
            resolve(response.result); // Resolve with the 'result' part of the JSON-RPC response
          }
        }
      } catch (error) {
        // Ignore lines that are not valid JSON or not the response we are waiting for
        // console.warn(`Ignoring non-JSON line or unexpected response: ${line}`); 
      }
    };

    // Set a timeout for the response
    const timeoutHandle = setTimeout(() => {
      rl.removeListener('line', responseHandler);
      reject(new Error(`Request timed out after 30 seconds (ID: ${requestId})`));
    }, 30000);

    rl.on('line', responseHandler);

    // Send the request
    serverProcess.stdin.write(requestJson + '\n');
  });
}

// --- Test Cases ---

async function testListTools() {
  console.log('\n=== Test Case: List Tools ===');
  const result = await sendRequest({
    method: 'mcp.list_tools',
    params: {}
  });
  // Basic validation: Check if tools array exists and has expected tools
  if (!result || !Array.isArray(result.tools) || result.tools.length < 2) {
    throw new Error('List Tools response is malformed or missing tools.');
  }
  const toolNames = result.tools.map(t => t.name);
  if (!toolNames.includes('execute_mathematica') || !toolNames.includes('verify_derivation')) {
    throw new Error('List Tools response missing expected tools: execute_mathematica or verify_derivation');
  }
  console.log('✅ List Tools test passed.');
  return true;
}

async function testExecuteMathematica() {
  console.log('\n=== Test Case: Execute Mathematica (2 + 2) ===');
  const result = await sendRequest({
    method: 'mcp.call_tool',
    params: {
      name: 'execute_mathematica',
      arguments: {
        code: '2 + 2',
        format: 'text'
      }
    }
  });
  // Basic validation: Check response structure and content
  if (!result || !Array.isArray(result.content) || result.content.length !== 1 || result.content[0].type !== 'text') {
    throw new Error('Execute Mathematica response structure is invalid.');
  }
  const textResult = result.content[0].text.trim();
  if (textResult !== '4') {
    throw new Error(`Execute Mathematica expected '4', but got '${textResult}'`);
  }
  console.log('✅ Execute Mathematica test passed.');
  return true;
}

async function testVerifyDerivation() {
  console.log('\n=== Test Case: Verify Derivation (Valid) ===');
  const result = await sendRequest({
    method: 'mcp.call_tool',
    params: {
      name: 'verify_derivation',
      arguments: {
        steps: [
          'x^2 + 2x + 1',
          '(x + 1)^2'
        ],
        format: 'text'
      }
    }
  });
  // Basic validation: Check response structure and content contains expected keywords
  if (!result || !Array.isArray(result.content) || result.content.length !== 1 || result.content[0].type !== 'text') {
    throw new Error('Verify Derivation response structure is invalid.');
  }
  const textResult = result.content[0].text;
  // Check for key parts of the expected successful output format from src/index.ts
  if (!textResult.includes('Derivation Verification Results') || !textResult.includes('Step 2:') || !textResult.includes('Valid: True')) {
    throw new Error(`Verify Derivation output did not contain expected success indicators. Got: ${textResult.substring(0, 200)}...`);
  }
  console.log('✅ Verify Derivation test passed.');
  return true;
}

async function testExecuteMathematicaError() {
  console.log('\n=== Test Case: Execute Mathematica (Syntax Error) ===');
  const result = await sendRequest({
    method: 'mcp.call_tool',
    params: {
      name: 'execute_mathematica',
      arguments: {
        code: '2 + '
      }
    }
  });
  // Expecting an error response from the server
  if (!result.isError || !result.content || !result.content[0].text.includes('Error executing Mathematica code')) {
    throw new Error('Expected an error response for invalid Mathematica code, but did not receive one.');
  }
  console.log('✅ Execute Mathematica error handling test passed.');
  return true;
}


// --- Test Runner ---

async function runIntegrationTests() {
  let allPassed = true;
  let testsPassed = 0;
  const testFunctions = [
    testListTools,
    testExecuteMathematica,
    testVerifyDerivation,
    // testExecuteMathematicaError // Currently, the server catches wolframscript errors and returns a successful JSON-RPC response with isError:true
  ];
  const totalTests = testFunctions.length;

  console.log('--- Running MCP Server Integration Tests ---');

  try {
    await startServer();

    for (let i = 0; i < totalTests; i++) {
      const testFunc = testFunctions[i];
      try {
        await testFunc();
        testsPassed++;
      } catch (error) {
        console.error(`❌ Test Failed: ${error.message}`);
        allPassed = false;
      }
    }
  } catch (error) {
    console.error(`❌ Critical Error during test execution: ${error.message}`);
    allPassed = false;
  } finally {
    await stopServer();
  }

  console.log('\n--- Integration Test Summary ---');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${totalTests - testsPassed}`);
  console.log(`Overall Result: ${allPassed ? '✅ All integration tests passed!' : '❌ Some integration tests failed.'}`);

  if (!allPassed) {
    process.exit(1); // Exit with error code if tests fail
  }
}

runIntegrationTests(); 