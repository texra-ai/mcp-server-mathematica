#!/usr/bin/env node

/**
 * tests/test-wolframscript.js
 * 
 * This script directly tests the local WolframScript installation and basic functionality.
 * It ensures that 'wolframscript' is available in the PATH and can execute various commands.
 * This serves as a prerequisite check before testing the MCP server itself.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- Test Cases ---

const tests = [
  {
    description: 'Simple calculation (2 + 2)',
    command: 'wolframscript -format text -code "2 + 2"',
    expectedPattern: /^4$/
  },
  {
    description: 'Complex calculation (Integrate[x^2, x])',
    command: 'wolframscript -format text -code "Integrate[x^2, x]"',
    expectedPattern: /^x\^3\/3$/
  },
  {
    description: 'LaTeX output (Integrate[Sin[x], x])',
    command: 'wolframscript -format latex -code "Integrate[Sin[x], x]"',
    expectedPattern: /^-Cos\[x]$/
  },
  {
    description: 'Expression simplification/verification (Simplify[x^2 + 2x + 1 == (x + 1)^2])',
    command: 'wolframscript -format text -code "Simplify[x^2 + 2x + 1 == (x + 1)^2]"',
    expectedPattern: /^True$/
  },
  {
    description: 'Help command (wolframscript -help)',
    command: 'wolframscript -help',
    expectedPattern: /OPTIONS:/
  }
];

// --- Test Runner ---

async function runWolframScriptTests() {
  console.log('--- Running WolframScript Prerequisite Tests ---');
  let allPassed = true;
  let testsPassed = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testNum = i + 1;
    console.log(`\n[Test ${testNum}/${tests.length}] ${test.description}`);
    console.log(`  Command: ${test.command}`);

    try {
      const { stdout, stderr } = await execAsync(test.command);
      const output = stdout.trim();

      if (stderr) {
        console.warn(`  Stderr: ${stderr.trim()}`);
      }

      console.log(`  Stdout: ${output}`);

      if (test.expectedPattern) {
        if (test.expectedPattern.test(output)) {
          console.log(`  Result: ✅ Passed (Output matches expected pattern: ${test.expectedPattern})`);
          testsPassed++;
        } else {
          console.error(`  Result: ❌ Failed (Output does not match expected pattern: ${test.expectedPattern})`);
          allPassed = false;
        }
      } else {
        // If no pattern, just check for command execution success (no error thrown)
        console.log('  Result: ✅ Passed (Command executed without error)');
        testsPassed++;
      }

    } catch (error) {
      console.error(`  Result: ❌ Failed (Command execution error)`);
      console.error(`  Error: ${error.message}`);
      if (error.stderr) {
        console.error(`  Stderr: ${error.stderr.trim()}`);
      }
      if (error.stdout) {
        console.error(`  Stdout: ${error.stdout.trim()}`);
      }
      // If wolframscript command is not found, provide a specific hint
      if (error.message.includes('command not found') || error.message.includes('ENOENT')) {
        console.error("  Hint: Ensure 'wolframscript' is installed and in your system's PATH.");
      }
      allPassed = false;
    }
  }

  console.log('\n--- Test Summary ---');
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${tests.length - testsPassed}`);
  console.log(`Overall Result: ${allPassed ? '✅ All tests passed!' : '❌ Some tests failed.'}`);

  if (!allPassed) {
    console.error("\nPlease ensure Mathematica is installed correctly and 'wolframscript' is accessible via your system's PATH.");
    process.exit(1); // Exit with error code if tests fail
  }
}

runWolframScriptTests(); 