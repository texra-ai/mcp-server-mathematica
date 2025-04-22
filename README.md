 # Mathematica MCP Server

This repository contains a Model Context Protocol (MCP) server that allows MCP clients (like Cursor) to execute Mathematica code via `wolframscript` and verify mathematical derivations.

## Overview

This server acts as a bridge, enabling applications that support MCP to leverage the power of a local Mathematica installation for tasks such as:

*   Performing complex mathematical calculations.
*   Verifying mathematical derivation steps provided by humans or AI models.
*   Generating LaTeX or Mathematica string representations of expressions.

## Prerequisites

*   [Mathematica](https://www.wolfram.com/mathematica/) must be installed on your system.
*   The `wolframscript` command-line utility must be available in your system's PATH. You can test this by running `wolframscript -help` in your terminal.
*   [Node.js](https://nodejs.org/) (Recommended: v16 or later, as inferred from `tsconfig.json` target `ES2022`).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the server:**
    ```bash
    npm run build
    ```
    This command compiles the TypeScript source code from `src/` into JavaScript in the `build/` directory and makes the main script executable.

## Running the Server

To start the MCP server, run the following command in your terminal:

```bash
node build/index.js
```

The server will start and listen for connections from MCP clients via standard input/output (stdio). Keep this terminal window open while you intend to use the server.

For more robust deployments, consider using a process manager like `pm2` to run the server in the background and manage restarts.

## Integration with MCP Clients (e.g., Cursor, Cline, Claude Desktop)

MCP clients generally discover and communicate with running MCP servers. The exact configuration steps can vary depending on the client application.

**General Steps:**

1.  **Start the Mathematica MCP Server:** Ensure the server is running in a terminal:
    ```bash
    node build/index.js
    ```
2.  **Configure Your MCP Client:** Add the server to your client's configuration. This often involves editing a JSON settings file. See client-specific instructions below.
3.  **Restart Your MCP Client:** After starting the server or changing configuration, restart your client application to ensure it detects the Mathematica server.

**Client-Specific Configuration:**

*   **Cline:**
    According to the [Cline MCP Server Development Protocol](https://docs.cline.bot/mcp-servers/mcp-server-from-scratch), you typically configure servers in a settings file (often `settings.json` within the Cline configuration directory). You would add an entry like this:

    ```json
    {
      "mcpServers": {
        "mathematica-server": {
          "command": "node",
          "args": ["/full/path/to/mcp-server-mathematica/build/index.js"], // Replace with the actual absolute path
          "disabled": false,
          "autoApprove": [] // Optional: Add tool names to auto-approve
        }
        // ... other servers ...
      }
    }
    ```
    *Replace `/full/path/to/mcp-server-mathematica/build/index.js` with the absolute path to the built `index.js` file on your system.*

*   **Cursor:**
    Cursor might require editing a specific settings file, potentially like `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` (though this path might change). The structure would be similar to the Cline example above.

*   **Other Clients (e.g., Claude Desktop):**
    Consult the documentation for your specific MCP client. Look for sections on "MCP Servers," "Tool Configuration," or "External Tools." The configuration generally involves specifying the command (`node`), the path to the server script (`build/index.js`), and potentially environment variables if needed.

## Available Tools

The server exposes the following tools to MCP clients:

### 1. `execute_mathematica`

Executes arbitrary Mathematica code and returns the result.

**Input Schema:**

```typescript
{
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
```

**Example Usage (Client Request):**

*   **Natural Language:** "Calculate the integral of x^2 from 0 to 1 using Mathematica and format as LaTeX"
*   **Direct Tool Call:**
    ```json
    {
      "tool_name": "execute_mathematica",
      "arguments": {
        "code": "Integrate[x^2, {x, 0, 1}]",
        "format": "latex"
      }
    }
    ```

### 2. `verify_derivation`

Verifies a sequence of mathematical expressions to check if each step logically follows from the previous one using `Simplify[prev == current]`.

**Input Schema:**

```typescript
{
  type: "object",
  properties: {
    steps: {
      type: "array",
      description: "Array of mathematical expressions (as strings) representing steps in a derivation. Requires at least two steps.",
      items: {
        type: "string"
      }
    },
    format: {
      type: "string",
      description: "Output format for the verification report (text, latex, or mathematica)",
      enum: ["text", "latex", "mathematica"],
      default: "text"
    }
  },
  required: ["steps"]
}
```

**Example Usage (Client Request):**

*   **Natural Language:** "Verify this derivation: ['x^2 - y^2', '(x-y)(x+y)']"
*   **Direct Tool Call:**
    ```json
    {
      "tool_name": "verify_derivation",
      "arguments": {
        "steps": [
          "x^2 - y^2",
          "(x-y)*(x+y)"
        ],
        "format": "text"
      }
    }
    ```

## Troubleshooting

*   **Server Not Found/Not Responding:**
    *   Ensure the server is running in a terminal (`node build/index.js`).
    *   Check if `wolframscript` is installed and accessible in your PATH (`wolframscript -help`).
    *   Restart your MCP client application.
    *   Check the client's MCP configuration.
*   **Tool Errors:**
    *   Check the server's terminal output (stderr) for logs and error messages from `wolframscript`.
    *   Verify the syntax of the Mathematica `code` or `steps` provided.
    *   Ensure the `steps` array for `verify_derivation` has at least two elements.
*   **Mathematica Issues:** Ensure your Mathematica installation is licensed and working correctly.

## Project Structure

*   `src/`: TypeScript source code for the server.
*   `build/`: Compiled JavaScript output (generated by `npm run build`).
*   `package.json`: Project metadata and dependencies.
*   `tsconfig.json`: TypeScript compiler configuration.
