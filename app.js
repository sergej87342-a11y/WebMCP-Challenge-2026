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
let realExecutionCount = 0;
let availabilityExecutionCount = 0;
let unavailableExecutionCount = 0;

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
    verifyButton.disabled = false;
    verifyAvailabilityButton.disabled = false;
    verifyUnavailableButton.disabled = false;
    setStatus("WebMCP доступен: search_services и check_availability зарегистрированы и готовы к проверке.", "ready");
  } catch (error) {
    setStatus(`WebMCP недоступен для регистрации: ${error.message}`, "error");
    resultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    availabilityResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
    unavailableResultElement.textContent = "Инструменты не зарегистрированы; проверка не выполнялась.";
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

renderCatalog();
verifyButton.addEventListener("click", verifyTool);
verifyAvailabilityButton.addEventListener("click", verifyAvailabilityTool);
verifyUnavailableButton.addEventListener("click", verifyUnavailableServiceTool);
registerTools();
