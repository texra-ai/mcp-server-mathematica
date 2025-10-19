#!/usr/bin/env node

/**
 * MCP server for executing local Mathematica (Wolfram Script) code and returning the output.
 * This server helps check mathematical derivations and can generate LaTeX output from LLMs.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Promisify exec for async/await usage
const execAsync = promisify(exec);

/**
 * Create an MCP server with capabilities for tools to execute Mathematica code.
 */
const server = new Server(
  {
    name: "mathematica-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Comprehensive logging
const log = (type: string, message: string, data?: any) => {
  console.error(`[${type}] ${message}`, data ? data : '');
};

log('Setup', 'Initializing Mathematica MCP server...');

/**
 * Handler that lists available tools.
 * Exposes tools for executing Mathematica code and converting to LaTeX.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('Tools', 'Listing available tools');
  return {
    tools: [
      {
        name: "execute_mathematica",
        description: "Execute Mathematica code and return the result",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Mathematica code to execute"
            },
            format: {
              type: "string",
              description: "Output format (text, latex, or mathematica)",
              enum: ["text", "latex", "mathematica"],
              default: "text"
            }
          },
          required: ["code"]
        }
      },
      {
        name: "verify_derivation",
        description: "Verify a mathematical derivation step by step",
        inputSchema: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              description: "Array of mathematical expressions representing steps in a derivation",
              items: {
                type: "string"
              }
            },
            format: {
              type: "string",
              description: "Output format (text, latex, or mathematica)",
              enum: ["text", "latex", "mathematica"],
              default: "text"
            }
          },
          required: ["steps"]
        }
      }
    ]
  };
});

/**
 * Check if Mathematica (wolframscript) is installed and accessible
 */
async function checkMathematicaInstallation(): Promise<boolean> {
  try {
    log('Setup', 'Checking Mathematica installation...');
    await execAsync('wolframscript -help');
    log('Setup', 'Mathematica installation verified');
    return true;
  } catch (error: any) {
    log('Error', 'Mathematica not found or not accessible', error);
    return false;
  }
}

/**
 * Execute Mathematica code and return the result
 * Uses temporary file approach to avoid shell escaping issues
 */
async function executeMathematicaCode(code: string, format: string = "text"): Promise<string> {
  let formatOption = "";

  // Set the appropriate format option for wolframscript
  switch (format.toLowerCase()) {
    case "latex":
      formatOption = "-format latex";
      break;
    case "mathematica":
      formatOption = "-format mathematica";
      break;
    case "text":
    default:
      formatOption = "-format text";
      break;
  }

  // Generate a unique temporary file path
  const tempFileName = `mcp_mathematica_${Date.now()}_${Math.random().toString(36).substring(7)}.wl`;
  const tempFilePath = join(tmpdir(), tempFileName);

  try {
    log('API', 'Executing Mathematica code', { code: code.substring(0, 100) + (code.length > 100 ? '...' : '') });

    // Write code to temporary file
    await writeFile(tempFilePath, code, 'utf8');

    // Execute using the -file flag instead of -code to avoid shell escaping issues
    const { stdout, stderr } = await execAsync(`wolframscript ${formatOption} -file "${tempFilePath}"`);

    if (stderr) {
      log('Warning', 'Mathematica execution produced stderr output', stderr);
    }

    log('API', 'Mathematica execution completed successfully');
    return stdout.trim();
  } catch (error: any) {
    log('Error', 'Failed to execute Mathematica code', error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to execute Mathematica code: ${error.message}`
    );
  } finally {
    // Clean up temporary file
    try {
      await unlink(tempFilePath);
    } catch (unlinkError) {
      log('Warning', 'Failed to delete temporary file', { path: tempFilePath, error: unlinkError });
    }
  }
}

/**
 * Verify a mathematical derivation by checking each step
 */
async function verifyDerivation(steps: string[], format: string = "text"): Promise<string> {
  if (steps.length < 2) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "At least two steps are required for a derivation"
    );
  }

  try {
    log('API', 'Verifying mathematical derivation', { steps: steps.length });

    // Create Mathematica code to verify each step
    const verificationCode = `
      steps = ${JSON.stringify(steps)};
      results = {};
      
      (* Check if each step follows from the previous *)
      For[i = 2, i <= Length[steps], i++,
        prev = ToExpression[steps[[i-1]]];
        current = ToExpression[steps[[i]]];
        
        (* Check if they're mathematically equivalent *)
        equivalent = Simplify[prev == current];
        
        (* Store the result *)
        AppendTo[results, {
          "step" -> i,
          "expression" -> steps[[i]],
          "equivalent" -> equivalent,
          "simplification" -> Simplify[current]
        }];
      ];
      
      (* Format the results *)
      FormattedResults = "Derivation Verification Results:\\n\\n";
      
      For[i = 1, i <= Length[results], i++,
        result = results[[i]];
        stepNum = result["step"];
        expr = result["expression"];
        isEquiv = result["equivalent"];
        
        FormattedResults = FormattedResults <> 
          "Step " <> ToString[stepNum] <> ": " <> expr <> "\\n" <>
          "  Valid: " <> ToString[isEquiv] <> "\\n\\n";
      ];
      
      FormattedResults
    `;

    return await executeMathematicaCode(verificationCode, format);
  } catch (error: any) {
    log('Error', 'Failed to verify derivation', error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to verify derivation: ${error.message}`
    );
  }
}

/**
 * Handler for tool execution.
 * Handles execute_mathematica and verify_derivation tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // First check if Mathematica is installed
  const mathematicaAvailable = await checkMathematicaInstallation();
  if (!mathematicaAvailable) {
    return {
      content: [{
        type: "text",
        text: "Error: Mathematica (wolframscript) is not installed or not accessible. Please make sure Mathematica is installed and wolframscript is in your PATH."
      }],
      isError: true
    };
  }

  switch (request.params.name) {
    case "execute_mathematica": {
      log('Tool', 'Executing execute_mathematica tool');
      const code = String(request.params.arguments?.code);
      const format = String(request.params.arguments?.format || "text");

      if (!code) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Mathematica code is required"
        );
      }

      try {
        const result = await executeMathematicaCode(code, format);

        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      } catch (error: any) {
        log('Error', 'Tool execution failed', error);
        return {
          content: [{
            type: "text",
            text: `Error executing Mathematica code: ${error.message}`
          }],
          isError: true
        };
      }
    }

    case "verify_derivation": {
      log('Tool', 'Executing verify_derivation tool');
      const steps = request.params.arguments?.steps as string[];
      const format = String(request.params.arguments?.format || "text");

      if (!steps || !Array.isArray(steps) || steps.length < 2) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "At least two derivation steps are required"
        );
      }

      try {
        const result = await verifyDerivation(steps, format);

        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      } catch (error: any) {
        log('Error', 'Tool execution failed', error);
        return {
          content: [{
            type: "text",
            text: `Error verifying derivation: ${error.message}`
          }],
          isError: true
        };
      }
    }

    default:
      log('Error', `Unknown tool: ${request.params.name}`);
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  try {
    log('Setup', 'Starting Mathematica MCP server...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('Setup', 'Mathematica MCP server running on stdio');

    // Set up error handling
    process.on('uncaughtException', (error: Error) => {
      log('Error', 'Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      log('Error', 'Unhandled rejection', reason);
    });

    process.on('SIGINT', async () => {
      log('Setup', 'Shutting down Mathematica MCP server...');
      await server.close();
      process.exit(0);
    });
  } catch (error: any) {
    log('Error', 'Failed to start server', error);
    process.exit(1);
  }
}

main().catch((error: any) => {
  log('Error', 'Server error', error);
  process.exit(1);
});