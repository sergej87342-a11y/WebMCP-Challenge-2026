"use strict";

const fs = require("fs");

const [, , appPath, scenario] = process.argv;
const elements = new Map();
const registeredTools = new Map();
const calls = [];
let confirmCalls = 0;
let uuidIndex = 0;
const uuids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
];

function element() {
  return {
    textContent: "",
    dataset: {},
    disabled: false,
    className: "",
    children: [],
    listeners: new Map(),
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, listener) { this.listeners.set(name, listener); },
  };
}

function get(selector) {
  if (!elements.has(selector)) elements.set(selector, element());
  return elements.get(selector);
}

async function click(target) {
  const listener = target.listeners.get("click");
  if (!listener) throw new Error("missing click listener");
  await listener();
}

global.__webmcpTestHooks = {
  now: () => new Date("2099-04-30T00:00:00+03:00"),
  uuid: () => uuids[uuidIndex++],
};
global.window = {
  confirm() { confirmCalls += 1; return scenario !== "decline"; },
};
global.document = {
  querySelector: get,
  createElement: element,
  modelContext: {
    async registerTool(tool) { registeredTools.set(tool.name, tool); },
    async getTools() { return [...registeredTools.values()]; },
    async executeTool(tool, inputJson) {
      const input = JSON.parse(inputJson);
      const raw = await tool.execute(input);
      calls.push({ name: tool.name, input, result: JSON.parse(raw) });
      return raw;
    },
  },
};

async function chooseServiceAndSlot() {
  await click(get("#start-journey"));
  await click(get("#journey-services").children[0]);
  await click(get("#journey-slots").children[0]);
}

async function main() {
  const source = fs.readFileSync(appPath, "utf8");
  eval(`${source}\nglobal.__stage2Api = { confirmationsById };`);
  await new Promise((resolve) => setImmediate(resolve));
  get("#journey-success-count").textContent = "0";
  await chooseServiceAndSlot();
  await click(get("#journey-confirm"));
  const firstResult = calls.at(-1)?.result;
  if (scenario === "conflict") {
    await click(get("#journey-confirm"));
  }
  const secondResult = scenario === "conflict" ? calls.at(-1)?.result : undefined;
  process.stdout.write(JSON.stringify({
    calls,
    confirmCalls,
    confirmations: global.__stage2Api.confirmationsById.size,
    successCount: get("#journey-success-count").textContent,
    status: get("#journey-status").textContent,
    result: firstResult,
    firstResult,
    secondResult,
  }));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
