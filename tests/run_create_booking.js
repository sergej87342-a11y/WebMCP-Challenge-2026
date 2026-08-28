"use strict";

const fs = require("fs");

const [, , appPath, scenario, nowText] = process.argv;
const UUIDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
  "99999999-9999-4999-8999-999999999999",
];
let uuidIndex = 0;
const elements = new Map();
const registeredTools = new Map();

function element() {
  return { textContent: "", dataset: {}, disabled: false, replaceChildren() {}, addEventListener() {} };
}

global.__webmcpTestHooks = {
  now: () => new Date(nowText),
  uuid: () => UUIDS[uuidIndex++],
};
global.document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  },
  createElement: element,
  modelContext: {
    async registerTool(tool) { registeredTools.set(tool.name, tool); },
    async getTools() { return [...registeredTools.values()]; },
    async executeTool(tool, inputJson) { return tool.execute(JSON.parse(inputJson)); },
  },
};

const SLOT = "2099-05-01T09:00:00+03:00";
function payload(overrides = {}) {
  return {
    service_id: "demo-haircut-30",
    slot_start: SLOT,
    timezone: "Asia/Jerusalem",
    customer_label: "demo-customer-1",
    confirmation_id: "11111111-1111-4111-8111-111111111111",
    request_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}
function response(raw) { return JSON.parse(raw); }
function state(api) {
  return {
    bookings: api.bookingsBySlot.size,
    idempotency: api.idempotencyByRequestId.size,
    confirmations: api.confirmationsById.size,
  };
}
function confirmFor(api, input) { api.issueConfirmation(input); }

async function boot() {
  const source = fs.readFileSync(appPath, "utf8");
  eval(`${source}\nglobal.__bookingTestApi = { createBookingToolDefinition, createBooking, issueConfirmation, bookingsBySlot, idempotencyByRequestId, confirmationsById };`);
  await new Promise((resolve) => setImmediate(resolve));
  return global.__bookingTestApi;
}

async function main() {
  const api = await boot();
  if (scenario === "schema") {
    process.stdout.write(JSON.stringify({ inputSchema: api.createBookingToolDefinition.inputSchema, annotations: api.createBookingToolDefinition.annotations }));
    return;
  }
  if (scenario === "invalid") {
    const valid = payload();
    const inputs = [
      {},
      { ...valid, extra: true },
      { ...valid, service_id: "" },
      { ...valid, slot_start: "2099-05-01T09:00:00Z" },
      { ...valid, timezone: "UTC" },
      { ...valid, customer_label: "not-allowed" },
      { ...valid, confirmation_id: "not-a-uuid" },
      { ...valid, request_id: "not-a-uuid" },
    ];
    process.stdout.write(JSON.stringify({ responses: inputs.map((input) => response(api.createBooking(input))), state: state(api) }));
    return;
  }
  if (scenario === "success") {
    const input = payload();
    confirmFor(api, input);
    const result = response(api.createBooking(input));
    const report = { state: { ...state(api), consumed: api.confirmationsById.get(input.confirmation_id).consumed } };
    process.stdout.write(JSON.stringify({ response: result, ...report }));
    return;
  }
  if (scenario === "replay") {
    const input = payload();
    confirmFor(api, input);
    const first = response(api.createBooking(input));
    const second = response(api.createBooking(input));
    process.stdout.write(JSON.stringify({ first, second, state: { ...state(api), consumed: api.confirmationsById.get(input.confirmation_id).consumed } }));
    return;
  }
  if (scenario === "duplicate") {
    const input = payload();
    confirmFor(api, input);
    api.createBooking(input);
    const result = response(api.createBooking({ ...input, slot_start: "2099-05-01T10:00:00+03:00", confirmation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }));
    process.stdout.write(JSON.stringify({ response: result, state: { ...state(api), consumed: api.confirmationsById.get(input.confirmation_id).consumed } }));
    return;
  }
  if (scenario === "confirmations") {
    const input = payload();
    confirmFor(api, input);
    api.createBooking(input);
    const foreign = payload({ confirmation_id: "33333333-3333-4333-8333-333333333333", request_id: "44444444-4444-4444-8444-444444444444" });
    confirmFor(api, { ...foreign, slot_start: "2099-05-01T10:00:00+03:00" });
    const missing = response(api.createBooking(payload({ confirmation_id: "55555555-5555-4555-8555-555555555555", request_id: "66666666-6666-4666-8666-666666666666" })));
    const foreignResult = response(api.createBooking(foreign));
    const consumed = response(api.createBooking(payload({ request_id: "77777777-7777-4777-8777-777777777777" })));
    process.stdout.write(JSON.stringify({ responses: [missing, foreignResult, consumed], state: { ...state(api), consumed: api.confirmationsById.get(input.confirmation_id).consumed } }));
    return;
  }
  if (scenario === "service-slot-errors") {
    const requests = [
      payload({ service_id: "demo-missing", confirmation_id: "11111111-1111-4111-8111-111111111111", request_id: "22222222-2222-4222-8222-222222222222" }),
      payload({ service_id: "demo-consultation-15", confirmation_id: "33333333-3333-4333-8333-333333333333", request_id: "44444444-4444-4444-8444-444444444444" }),
      payload({ slot_start: "2099-04-29T09:00:00+03:00", confirmation_id: "55555555-5555-4555-8555-555555555555", request_id: "66666666-6666-4666-8666-666666666666" }),
      payload({ slot_start: "2099-05-01T11:00:00+03:00", confirmation_id: "77777777-7777-4777-8777-777777777777", request_id: "88888888-8888-4888-8888-888888888888" }),
      payload({ confirmation_id: "99999999-9999-4999-8999-999999999999", request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    ];
    for (const input of requests) confirmFor(api, input);
    const responses = requests.slice(0, 4).map((input) => response(api.createBooking(input)));
    const successful = payload({ confirmation_id: requests[4].confirmation_id, request_id: requests[4].request_id });
    api.createBooking(successful);
    const conflict = payload({ confirmation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", request_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    confirmFor(api, conflict);
    responses.push(response(api.createBooking(conflict)));
    const unconsumed = [...api.confirmationsById.values()].filter((record) => !record.consumed).length;
    process.stdout.write(JSON.stringify({ responses, state: { ...state(api), unconsumed } }));
    return;
  }
  if (scenario === "boundary") {
    const tool = registeredTools.get("create_booking");
    const first = payload();
    confirmFor(api, first);
    const rawSuccess = await document.modelContext.executeTool(tool, JSON.stringify(first));
    const rawReplay = await document.modelContext.executeTool(tool, JSON.stringify(first));
    const rawDuplicate = await document.modelContext.executeTool(tool, JSON.stringify({ ...first, slot_start: "2099-05-01T10:00:00+03:00", confirmation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }));
    const conflict = payload({ confirmation_id: "33333333-3333-4333-8333-333333333333", request_id: "44444444-4444-4444-8444-444444444444" });
    confirmFor(api, conflict);
    const rawConflict = await document.modelContext.executeTool(tool, JSON.stringify(conflict));
    process.stdout.write(JSON.stringify({ success: response(rawSuccess), replay: response(rawReplay), duplicate: response(rawDuplicate), slotConflict: response(rawConflict), handlerReceivedObject: api.createBooking.length >= 1, handlerReturnedString: typeof rawSuccess === "string" }));
    return;
  }
  throw new Error(`unknown scenario: ${scenario}`);
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
