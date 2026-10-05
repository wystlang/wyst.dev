#!/usr/bin/env node
const responses = [
  {
    jsonrpc: "2.0",
    id: 1,
    result: {
      capabilities: {
        semanticTokensProvider: {
          legend: {
            tokenTypes: ["namespace", "type", "function", "variable", "parameter", "property", "enumMember", "keyword", "number", "string", "operator", "macro", "typeParameter"],
            tokenModifiers: ["declaration", "readonly", "defaultLibrary"]
          }
        }
      }
    }
  },
  { jsonrpc: "2.0", id: 2, result: { data: [1, 0, 2, 7, 4, 0, 3, 4, 2, 1] } },
  { jsonrpc: "2.0", id: 3, result: null }
];
for (const response of responses) {
  const body = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
