"use strict";

const fs = require("fs");

const [, , appPath] = process.argv;
const elements = new Map();
const registeredTools = new Map();
let executeInput;

function element() {
  return {
    textContent: "",
    dataset: {},
    disabled: false,
    replaceChildren() {},
    addEventListener() {},
  };
}

global.document = {
  querySelector(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, element());
    }
    return elements.get(selector);
  },
  createElement() {
    return element();
  },
  modelContext: {
    async registerTool(tool) {
      registeredTools.set(tool.name, tool);
    },
    async getTools() {
      return [...registeredTools.values()];
    },
    async executeTool(tool, inputJson) {
      executeInput = inputJson;
      return tool.execute(JSON.parse(inputJson));
    },
  },
};

async function main() {
  const source = fs.readFileSync(appPath, "utf8");
  const report = await eval(`(async () => {
    ${source}
    await new Promise((resolve) => setImmediate(resolve));
    await verifyUnavailableServiceTool();
    return {
      executeInput,
      count: document.querySelector("#unavailable-execution-count").textContent,
      result: document.querySelector("#unavailable-result").textContent,
    };
  })()`);
  process.stdout.write(JSON.stringify(report));
}

main();
