"use strict";

const fs = require("fs");

const [, , appPath, decision] = process.argv;
const elements = new Map();
const registeredTools = new Map();
let confirmCalls = 0;
let getToolsCalls = 0;
let executeToolCalls = 0;
let uuidIndex = 0;
const uuids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

function element() {
  return {
    textContent: "",
    dataset: {},
    disabled: false,
    listeners: new Map(),
    replaceChildren() {},
    addEventListener(name, listener) { this.listeners.set(name, listener); },
  };
}

global.__webmcpTestHooks = {
  now: () => new Date("2099-04-30T00:00:00+03:00"),
  uuid: () => uuids[uuidIndex++],
};
global.window = {
  confirm() { confirmCalls += 1; return decision === "accept"; },
};
global.document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  },
  createElement: element,
  modelContext: {
    async registerTool(tool) { registeredTools.set(tool.name, tool); },
    async getTools() { getToolsCalls += 1; return [...registeredTools.values()]; },
    async executeTool(tool, inputJson) { executeToolCalls += 1; return tool.execute(JSON.parse(inputJson)); },
  },
};

async function main() {
  const source = fs.readFileSync(appPath, "utf8");
  eval(`${source}\nglobal.__uiBookingApi = { confirmationsById };`);
  await new Promise((resolve) => setImmediate(resolve));
  elements.get("#confirmed-booking-count").textContent = "0";
  const button = elements.get("#create-booking");
  await button.listeners.get("click")();
  const functionMatch = /async function createSyntheticBookingFromUi\(\)\s*\{([\s\S]*?)\n\}/.exec(source);
  const rawResult = elements.get("#booking-result").textContent;
  process.stdout.write(JSON.stringify({
    confirmCalls,
    getToolsCalls,
    executeToolCalls,
    count: elements.get("#confirmed-booking-count").textContent,
    response: rawResult.startsWith("{") ? JSON.parse(rawResult) : { message: rawResult },
    confirmations: global.__uiBookingApi.confirmationsById.size,
    uiFunctionBody: functionMatch ? functionMatch[1] : "",
  }));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
