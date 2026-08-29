"use strict";

const JERUSALEM_TIMEZONE = "Asia/Jerusalem";
const SYNTHETIC_SERVICES = Object.freeze([
  Object.freeze({
    service_id: "demo-haircut-30",
    name: "Демо-стрижка",
    duration_minutes: 30,
    price: 80,
    currency: "ILS",
    available: true,
  }),
  Object.freeze({
    service_id: "demo-color-90",
    name: "Демо-окрашивание",
    duration_minutes: 90,
    price: 240,
    currency: "ILS",
    available: true,
  }),
  Object.freeze({
    service_id: "demo-consultation-15",
    name: "Демо-консультация",
    duration_minutes: 15,
    price: 0,
    currency: "ILS",
    available: false,
  }),
]);

const SYNTHETIC_AVAILABILITY = Object.freeze({
  "2099-05-01": Object.freeze({
    "demo-haircut-30": Object.freeze([
      Object.freeze({
        slot_start: "2099-05-01T09:00:00+03:00",
        local_time: "09:00",
        timezone: JERUSALEM_TIMEZONE,
      }),
      Object.freeze({
        slot_start: "2099-05-01T10:00:00+03:00",
        local_time: "10:00",
        timezone: JERUSALEM_TIMEZONE,
      }),
    ]),
    "demo-color-90": Object.freeze([
      Object.freeze({
        slot_start: "2099-05-01T13:00:00+03:00",
        local_time: "13:00",
        timezone: JERUSALEM_TIMEZONE,
      }),
    ]),
  }),
});

const statusElement = document.querySelector("#webmcp-status");
const verifyButton = document.querySelector("#verify-tool");
const resultElement = document.querySelector("#tool-result");
const executionCountElement = document.querySelector("#real-execution-count");
const verifyAvailabilityButton = document.querySelector("#verify-availability");
const availabilityResultElement = document.querySelector("#availability-result");
const availabilityExecutionCountElement = document.querySelector("#availability-execution-count");
const verifyUnavailableButton = document.querySelector("#verify-unavailable-service");
const unavailableResultElement = document.querySelector("#unavailable-result");
const unavailableExecutionCountElement = document.querySelector("#unavailable-execution-count");
const createBookingButton = document.querySelector("#create-booking");
const bookingResultElement = document.querySelector("#booking-result");
const confirmedBookingCountElement = document.querySelector("#confirmed-booking-count");
const journeyStatusElement = document.querySelector("#journey-status");
const startJourneyButton = document.querySelector("#start-journey");
const journeyServicesElement = document.querySelector("#journey-services");
const journeySlotsElement = document.querySelector("#journey-slots");
const journeySummaryElement = document.querySelector("#journey-summary");
const journeyConfirmButton = document.querySelector("#journey-confirm");
const journeySuccessCountElement = document.querySelector("#journey-success-count");
const journeyResultElement = document.querySelector("#journey-result");
let realExecutionCount = 0;
let availabilityExecutionCount = 0;
let unavailableExecutionCount = 0;
let confirmedBookingCount = 0;

// These Maps are deliberately module-level state for this single page only.
// Reloading the page creates new Maps; no cross-tab/process guarantee is made.
const bookingsBySlot = new Map();
const idempotencyByRequestId = new Map();
const confirmationsById = new Map();
const testHooks = globalThis.__webmcpTestHooks ?? {};
const journeyState = {
  services: [],
  selectedService: null,
  slots: [],
  selectedSlot: null,
  successCount: 0,
};

function setStatus(message, status) {
  statusElement.textContent = message;
  statusElement.dataset.status = status;
}

function renderCatalog() {
  const catalogElement = document.querySelector("#catalog");
  catalogElement.replaceChildren(...SYNTHETIC_SERVICES.map((service) => {
    const card = document.createElement("article");
    card.className = "service";
    card.innerHTML = `
      <h3>${service.name}</h3>
      <p><code>${service.service_id}</code></p>
      <p>${service.duration_minutes} минут · ${service.price} ${service.currency}</p>
      <p class="${service.available ? "available" : ""}">${service.available ? "Доступна" : "Недоступна"}</p>`;
    return card;
  }));
}

function errorResponse(code, message) {
  return { ok: false, error: { code, message } };
}

function isValidCalendarDate(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const daysInMonth = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function jerusalemToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JERUSALEM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseAvailabilityInput(input) {
  if (input === null || Array.isArray(input) || typeof input !== "object") {
    return { error: errorResponse("INVALID_INPUT", "Вход должен быть JSON-объектом") };
  }

  const expectedKeys = ["service_id", "date", "timezone"];
  const keys = Object.keys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    return { error: errorResponse("INVALID_INPUT", "Допускаются только service_id, date и timezone") };
  }

  if (typeof input.service_id !== "string" || input.service_id.trim() === "") {
    return { error: errorResponse("INVALID_INPUT", "service_id должен быть непустой строкой") };
  }
  if (!isValidCalendarDate(input.date)) {
    return { error: errorResponse("INVALID_INPUT", "date должен быть существующей датой в формате YYYY-MM-DD") };
  }
  if (input.timezone !== JERUSALEM_TIMEZONE) {
    return { error: errorResponse("INVALID_INPUT", "timezone должен быть строго равен Asia/Jerusalem") };
  }

  return { input };
}

async function searchServices() {
  return JSON.stringify({
    services: SYNTHETIC_SERVICES
      .filter((service) => service.available)
      .map((service) => ({ ...service })),
  });
}

async function checkAvailability(input, today = jerusalemToday()) {
  const parsed = parseAvailabilityInput(input);
  if (parsed.error) {
    return JSON.stringify(parsed.error);
  }

  const { service_id: serviceId, date, timezone } = parsed.input;
  const service = SYNTHETIC_SERVICES.find(({ service_id }) => service_id === serviceId);
  if (!service) {
    return JSON.stringify(errorResponse("SERVICE_NOT_FOUND", "Синтетическая услуга не найдена"));
  }
  if (!service.available) {
    return JSON.stringify(errorResponse("SERVICE_UNAVAILABLE", "Синтетическая услуга недоступна для записи"));
  }
  if (date < today) {
    return JSON.stringify(errorResponse("DATE_IN_PAST", "Нельзя проверять интервалы за прошедшую дату"));
  }

  const slots = SYNTHETIC_AVAILABILITY[date]?.[serviceId];
  if (!slots || slots.length === 0) {
    return JSON.stringify(errorResponse("NO_SLOTS", "На указанную дату свободных интервалов нет"));
  }

  return JSON.stringify({
    ok: true,
    data: {
      service: {
        service_id: service.service_id,
        name: service.name,
        duration_minutes: service.duration_minutes,
      },
      date,
      timezone,
      slots: slots.map((slot) => ({ ...slot })),
    },
  });
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLOT_START_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?[+-](?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
const CREATE_BOOKING_KEYS = ["service_id", "slot_start", "timezone", "customer_label", "confirmation_id", "request_id"];

function currentInstant() {
  return testHooks.now ? testHooks.now() : new Date();
}

function nextUuidV4() {
  if (testHooks.uuid) {
    return testHooks.uuid();
  }
  return crypto.randomUUID();
}

function parseCreateBookingInput(input) {
  if (input === null || Array.isArray(input) || typeof input !== "object") {
    return { error: errorResponse("INVALID_INPUT", "Вход должен быть JSON-объектом") };
  }
  const keys = Object.keys(input);
  if (keys.length !== CREATE_BOOKING_KEYS.length || keys.some((key) => !CREATE_BOOKING_KEYS.includes(key))) {
    return { error: errorResponse("INVALID_INPUT", "Допускаются только шесть полей create_booking") };
  }
  if (typeof input.service_id !== "string" || input.service_id.trim() === "") {
    return { error: errorResponse("INVALID_INPUT", "service_id должен быть непустой строкой") };
  }
  if (typeof input.slot_start !== "string" || !SLOT_START_PATTERN.test(input.slot_start)
    || !isValidCalendarDate(input.slot_start.slice(0, 10)) || Number.isNaN(Date.parse(input.slot_start))) {
    return { error: errorResponse("INVALID_INPUT", "slot_start должен быть ISO 8601 со смещением") };
  }
  if (input.timezone !== JERUSALEM_TIMEZONE) {
    return { error: errorResponse("INVALID_INPUT", "timezone должен быть строго равен Asia/Jerusalem") };
  }
  if (input.customer_label !== "demo-customer-1") {
    return { error: errorResponse("INVALID_INPUT", "customer_label должен быть demo-customer-1") };
  }
  if (typeof input.confirmation_id !== "string" || !UUID_V4_PATTERN.test(input.confirmation_id)) {
    return { error: errorResponse("INVALID_INPUT", "confirmation_id должен быть каноническим UUID v4") };
  }
  if (typeof input.request_id !== "string" || !UUID_V4_PATTERN.test(input.request_id)) {
    return { error: errorResponse("INVALID_INPUT", "request_id должен быть каноническим UUID v4") };
  }
  return { input };
}

function normalizedBookingPayload(input) {
  return JSON.stringify({
    service_id: input.service_id,
    slot_start: input.slot_start,
    timezone: input.timezone,
    customer_label: input.customer_label,
  });
}

function issueConfirmation(input) {
  const confirmationId = input.confirmation_id ?? nextUuidV4();
  const parsed = parseCreateBookingInput({ ...input, confirmation_id: confirmationId });
  if (parsed.error) {
    throw new Error("UI может выдать confirmation_id только для валидного synthetic payload");
  }
  const normalizedPayload = normalizedBookingPayload(parsed.input);
  confirmationsById.set(confirmationId, { normalizedPayload, consumed: false });
  return confirmationId;
}

function createBooking(input) {
  const parsed = parseCreateBookingInput(input);
  if (parsed.error) {
    return JSON.stringify(parsed.error);
  }

  const normalizedPayload = normalizedBookingPayload(parsed.input);
  const prior = idempotencyByRequestId.get(parsed.input.request_id);
  if (prior) {
    if (prior.normalizedPayload === normalizedPayload) {
      return prior.successJson;
    }
    return JSON.stringify(errorResponse("DUPLICATE_REQUEST", "request_id уже связан с другим нормализованным payload"));
  }

  const confirmation = confirmationsById.get(parsed.input.confirmation_id);
  if (!confirmation || confirmation.consumed || confirmation.normalizedPayload !== normalizedPayload) {
    return JSON.stringify(errorResponse("CONFIRMATION_REQUIRED", "Требуется действительное одноразовое подтверждение человека"));
  }

  const service = SYNTHETIC_SERVICES.find(({ service_id }) => service_id === parsed.input.service_id);
  if (!service) {
    return JSON.stringify(errorResponse("SERVICE_NOT_FOUND", "Синтетическая услуга не найдена"));
  }
  if (!service.available) {
    return JSON.stringify(errorResponse("SERVICE_UNAVAILABLE", "Синтетическая услуга недоступна для записи"));
  }
  if (Date.parse(parsed.input.slot_start) < currentInstant().getTime()) {
    return JSON.stringify(errorResponse("SLOT_IN_PAST", "Нельзя создать запись на прошедший интервал"));
  }
  const slot = SYNTHETIC_AVAILABILITY[parsed.input.slot_start.slice(0, 10)]?.[service.service_id]
    ?.find(({ slot_start }) => slot_start === parsed.input.slot_start);
  if (!slot || bookingsBySlot.has(parsed.input.slot_start)) {
    return JSON.stringify(errorResponse("SLOT_UNAVAILABLE", "Выбранный интервал больше не доступен"));
  }

  // Synchronous critical section: check, booking, idempotency and consumption stay contiguous.
  const successJson = JSON.stringify({
    ok: true,
    data: {
      booking_id: nextUuidV4(),
      status: "confirmed",
      service: { service_id: service.service_id, name: service.name, duration_minutes: service.duration_minutes },
      slot_start: slot.slot_start,
      local_time: slot.local_time,
      timezone: slot.timezone,
    },
  });
  bookingsBySlot.set(parsed.input.slot_start, successJson);
  idempotencyByRequestId.set(parsed.input.request_id, { normalizedPayload, successJson });
  confirmation.consumed = true;
  return successJson;
}

const createBookingToolDefinition = {
  name: "create_booking",
  description: "Создаёт только синтетическую запись после одноразового UI-подтверждения человека.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: CREATE_BOOKING_KEYS,
    properties: {
      service_id: { type: "string", minLength: 1 },
      slot_start: { type: "string", format: "date-time", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?[+-](?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$" },
      timezone: { const: JERUSALEM_TIMEZONE },
      customer_label: { const: "demo-customer-1" },
      confirmation_id: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
      request_id: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
    },
  },
  annotations: { readOnlyHint: false, untrustedContentHint: false },
  execute: createBooking,
};

const searchServicesToolDefinition = {
  name: "search_services",
  description: "Возвращает доступные услуги из синтетического тестового каталога: стабильный идентификатор, название, длительность, цену, валюту и доступность.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: searchServices,
};

const checkAvailabilityToolDefinition = {
  name: "check_availability",
  description: "Возвращает свободные интервалы для доступной синтетической услуги на дату в Asia/Jerusalem; не резервирует слот.",
  inputSchema: {
    type: "object",
    properties: {
      service_id: { type: "string", minLength: 1 },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      timezone: { type: "string", const: JERUSALEM_TIMEZONE },
    },
    required: ["service_id", "date", "timezone"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: checkAvailability,
};

function hasWebMCP() {
  return "modelContext" in document
    && typeof document.modelContext.registerTool === "function"
    && typeof document.modelContext.getTools === "function"
    && typeof document.modelContext.executeTool === "function";
}

async function registerTools() {
  if (!hasWebMCP()) {
    setStatus("WebMCP недоступен: document.modelContext отсутствует. Откройте страницу в Chrome 151 и включите chrome://flags/#enable-webmcp-testing.", "error");
    resultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    availabilityResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    unavailableResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    return;
  }

  try {
    await document.modelContext.registerTool(searchServicesToolDefinition);
    await document.modelContext.registerTool(checkAvailabilityToolDefinition);
    await document.modelContext.registerTool(createBookingToolDefinition);
    verifyButton.disabled = false;
    verifyAvailabilityButton.disabled = false;
    verifyUnavailableButton.disabled = false;
    createBookingButton.disabled = false;
    startJourneyButton.disabled = false;
    setStatus("WebMCP доступен: три synthetic-инструмента зарегистрированы и готовы к проверке.", "ready");
  } catch (error) {
    setStatus(`WebMCP недоступен для регистрации: ${error.message}`, "error");
    resultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    availabilityResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    unavailableResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
  }
}

async function startBookingJourney() {
  startJourneyButton.disabled = true;
  journeyStatusElement.textContent = "Finding available synthetic services through WebMCP…";
  try {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "search_services");
    if (!tool) {
      throw new Error("search_services is not registered");
    }
    const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify({})));
    if (!Array.isArray(result.services) || result.services.length === 0) {
      throw new Error("No available synthetic services were returned");
    }
    journeyState.services = result.services;
    journeyState.selectedService = null;
    journeyState.slots = [];
    journeyState.selectedSlot = null;
    journeyServicesElement.replaceChildren(...result.services.map((service) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.textContent = `${service.name} · ${service.duration_minutes} min`;
      button.addEventListener("click", () => selectJourneyService(service));
      return button;
    }));
    journeySlotsElement.replaceChildren();
    journeySummaryElement.textContent = "Choose one of the returned services to find its available times.";
    journeyConfirmButton.disabled = true;
    journeyStatusElement.textContent = "Choose a returned service / Выберите услугу из результата.";
  } catch (error) {
    journeyStatusElement.textContent = `Could not find services through WebMCP: ${error.message}`;
  } finally {
    startJourneyButton.disabled = false;
  }
}

async function selectJourneyService(service) {
  journeyState.selectedService = service;
  journeyState.selectedSlot = null;
  journeyConfirmButton.disabled = true;
  journeySlotsElement.replaceChildren();
  journeyStatusElement.textContent = `Finding times for ${service.name} through WebMCP…`;
  try {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "check_availability");
    if (!tool) {
      throw new Error("check_availability is not registered");
    }
    const input = {
      service_id: service.service_id,
      date: "2099-05-01",
      timezone: JERUSALEM_TIMEZONE,
    };
    const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify(input)));
    if (!result.ok || !Array.isArray(result.data?.slots)) {
      throw new Error(result.error?.message ?? "No slots were returned");
    }
    journeyState.slots = result.data.slots;
    journeySlotsElement.replaceChildren(...result.data.slots.map((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.textContent = `${slot.local_time} · ${slot.timezone}`;
      button.addEventListener("click", () => selectJourneySlot(slot));
      return button;
    }));
    journeySummaryElement.textContent = `${service.name} selected. Choose one of the returned times.`;
    journeyStatusElement.textContent = "Choose a returned time / Выберите время из результата.";
  } catch (error) {
    journeyStatusElement.textContent = `Could not find times through WebMCP: ${error.message}`;
  }
}

function selectJourneySlot(slot) {
  journeyState.selectedSlot = slot;
  journeyConfirmButton.disabled = false;
  journeySummaryElement.textContent = `Ready to book: ${journeyState.selectedService.name} at ${slot.local_time} (${slot.timezone}). A person must confirm the final booking.`;
  journeyStatusElement.textContent = "Review the appointment, then confirm it yourself / Проверьте и подтвердите запись.";
}

async function confirmJourneyBooking() {
  if (!journeyState.selectedService || !journeyState.selectedSlot) {
    return;
  }
  const approved = window.confirm(`Create a synthetic booking for ${journeyState.selectedService.name} at ${journeyState.selectedSlot.local_time}?`);
  if (!approved) {
    journeyStatusElement.textContent = "Booking cancelled by the person. No confirmation was created and WebMCP did not create a booking.";
    return;
  }

  journeyConfirmButton.disabled = true;
  journeyStatusElement.textContent = "Creating the confirmed synthetic booking through WebMCP…";
  try {
    const request = {
      service_id: journeyState.selectedService.service_id,
      slot_start: journeyState.selectedSlot.slot_start,
      timezone: journeyState.selectedSlot.timezone,
      customer_label: "demo-customer-1",
      request_id: nextUuidV4(),
    };
    request.confirmation_id = issueConfirmation(request);
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "create_booking");
    if (!tool) {
      throw new Error("create_booking is not registered");
    }
    const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify(request)));
    if (result.ok) {
      journeyState.successCount += 1;
      journeySuccessCountElement.textContent = String(journeyState.successCount);
      journeyResultElement.textContent = `Confirmed: ${result.data.service.name} at ${result.data.local_time}. Booking ID: ${result.data.booking_id}.`;
      journeyStatusElement.textContent = "Booking confirmed. The person approved the final write action.";
      return;
    }
    if (result.error?.code === "SLOT_UNAVAILABLE") {
      journeyStatusElement.textContent = "This time was just taken. Choose another available slot.";
      journeyResultElement.textContent = "The booking was not created. No success counter was added.";
      return;
    }
    journeyStatusElement.textContent = `Booking was not created: ${result.error?.message ?? "Unknown contract error"}`;
  } catch (error) {
    journeyStatusElement.textContent = `Could not create booking through WebMCP: ${error.message}`;
  } finally {
    journeyConfirmButton.disabled = !journeyState.selectedSlot;
  }
}

async function verifyTool() {
  verifyButton.disabled = true;
  resultElement.textContent = "Получаем инструмент через getTools()…";

  try {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "search_services");
    if (!tool) {
      throw new Error("search_services отсутствует в результате document.modelContext.getTools().");
    }

    const rawResult = await document.modelContext.executeTool(tool, JSON.stringify({}));
    const structuredResult = JSON.parse(rawResult);
    if (!Array.isArray(structuredResult.services)) {
      throw new Error("WebMCP вернул результат без массива services.");
    }

    realExecutionCount += 1;
    executionCountElement.textContent = String(realExecutionCount);
    resultElement.textContent = JSON.stringify(structuredResult, null, 2);
  } catch (error) {
    resultElement.textContent = `Проверка через WebMCP не выполнена: ${error.message}`;
  } finally {
    verifyButton.disabled = false;
  }
}

async function verifyAvailabilityTool() {
  verifyAvailabilityButton.disabled = true;
  availabilityResultElement.textContent = "Получаем check_availability через getTools()…";

  try {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "check_availability");
    if (!tool) {
      throw new Error("check_availability отсутствует в результате document.modelContext.getTools().");
    }

    const rawResult = await document.modelContext.executeTool(tool, JSON.stringify({
      service_id: "demo-haircut-30",
      date: "2099-05-01",
      timezone: JERUSALEM_TIMEZONE,
    }));
    const structuredResult = JSON.parse(rawResult);
    if (!structuredResult.ok || !Array.isArray(structuredResult.data?.slots)) {
      throw new Error("WebMCP вернул ответ check_availability не по контракту успеха.");
    }

    availabilityExecutionCount += 1;
    availabilityExecutionCountElement.textContent = String(availabilityExecutionCount);
    availabilityResultElement.textContent = JSON.stringify(structuredResult, null, 2);
  } catch (error) {
    availabilityResultElement.textContent = `Проверка через WebMCP не выполнена: ${error.message}`;
  } finally {
    verifyAvailabilityButton.disabled = false;
  }
}

async function verifyUnavailableServiceTool() {
  verifyUnavailableButton.disabled = true;
  unavailableResultElement.textContent = "Получаем check_availability через getTools()…";

  try {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "check_availability");
    if (!tool) {
      throw new Error("check_availability отсутствует в результате document.modelContext.getTools().");
    }

    const rawResult = await document.modelContext.executeTool(tool, JSON.stringify({
      service_id: "demo-consultation-15",
      date: "2099-05-01",
      timezone: JERUSALEM_TIMEZONE,
    }));
    const structuredResult = JSON.parse(rawResult);
    if (structuredResult.ok !== false || structuredResult.error?.code !== "SERVICE_UNAVAILABLE") {
      throw new Error("WebMCP вернул ответ check_availability не по контракту SERVICE_UNAVAILABLE.");
    }

    unavailableExecutionCount += 1;
    unavailableExecutionCountElement.textContent = String(unavailableExecutionCount);
    unavailableResultElement.textContent = JSON.stringify(structuredResult, null, 2);
  } catch (error) {
    unavailableResultElement.textContent = `Проверка через WebMCP не выполнена: ${error.message}`;
  } finally {
    verifyUnavailableButton.disabled = false;
  }
}

async function createSyntheticBookingFromUi() {
  const approved = window.confirm("Создать одну синтетическую запись на 2099-05-01 09:00? Реальные данные не используются.");
  if (!approved) {
    bookingResultElement.textContent = "Человек отменил действие: confirmation_id не создан, WebMCP не вызван.";
    return;
  }

  createBookingButton.disabled = true;
  bookingResultElement.textContent = "Получаем create_booking через getTools()…";
  try {
    const request = {
      service_id: "demo-haircut-30",
      slot_start: "2099-05-01T09:00:00+03:00",
      timezone: JERUSALEM_TIMEZONE,
      customer_label: "demo-customer-1",
      request_id: nextUuidV4(),
    };
    request.confirmation_id = issueConfirmation(request);
    const tools = await document.modelContext.getTools();
    const tool = tools.find(({ name }) => name === "create_booking");
    if (!tool) {
      throw new Error("create_booking отсутствует в результате document.modelContext.getTools().");
    }
    const rawResult = await document.modelContext.executeTool(tool, JSON.stringify(request));
    const structuredResult = JSON.parse(rawResult);
    if (structuredResult.ok) {
      confirmedBookingCount += 1;
      confirmedBookingCountElement.textContent = String(confirmedBookingCount);
    }
    bookingResultElement.textContent = JSON.stringify(structuredResult, null, 2);
  } catch (error) {
    bookingResultElement.textContent = `Создание через WebMCP не выполнено: ${error.message}`;
  } finally {
    createBookingButton.disabled = false;
  }
}

renderCatalog();
startJourneyButton.addEventListener("click", startBookingJourney);
journeyConfirmButton.addEventListener("click", confirmJourneyBooking);
verifyButton.addEventListener("click", verifyTool);
verifyAvailabilityButton.addEventListener("click", verifyAvailabilityTool);
verifyUnavailableButton.addEventListener("click", verifyUnavailableServiceTool);
createBookingButton.addEventListener("click", createSyntheticBookingFromUi);
registerTools();
