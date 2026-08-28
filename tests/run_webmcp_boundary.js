"use strict";

const fs = require("fs");

const [, , appPath, rawInput] = process.argv;
const elements = new Map();
const registeredTools = new Map();

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
      return tool.execute(JSON.parse(inputJson));
    },
  },
};

async function main() {
  eval(fs.readFileSync(appPath, "utf8"));
  await new Promise((resolve) => setImmediate(resolve));
  const tool = registeredTools.get("check_availability");
  if (!tool) {
    throw new Error("check_availability was not registered");
  }
  process.stdout.write(await document.modelContext.executeTool(tool, rawInput));
}

main();
