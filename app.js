"use strict";

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

const statusElement = document.querySelector("#webmcp-status");
const verifyButton = document.querySelector("#verify-tool");
const resultElement = document.querySelector("#tool-result");
const executionCountElement = document.querySelector("#real-execution-count");
let realExecutionCount = 0;

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

async function searchServices() {
  return JSON.stringify({
    services: SYNTHETIC_SERVICES
      .filter((service) => service.available)
      .map((service) => ({ ...service })),
  });
}

const toolDefinition = {
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

function hasWebMCP() {
  return "modelContext" in document
    && typeof document.modelContext.registerTool === "function"
    && typeof document.modelContext.getTools === "function"
    && typeof document.modelContext.executeTool === "function";
}

async function registerTool() {
  if (!hasWebMCP()) {
    setStatus("WebMCP недоступен: document.modelContext отсутствует. Откройте страницу в Chrome 151 и включите chrome://flags/#enable-webmcp-testing.", "error");
    resultElement.textContent = "Инструмент не зарегистрирован; проверка не выполнялась.";
    return;
  }

  try {
    await document.modelContext.registerTool(toolDefinition);
    verifyButton.disabled = false;
    setStatus("WebMCP доступен: search_services зарегистрирован и готов к проверке.", "ready");
  } catch (error) {
    setStatus(`WebMCP недоступен для регистрации: ${error.message}`, "error");
    resultElement.textContent = "Инструмент не зарегистрирован; проверка не выполнялась.";
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

renderCatalog();
verifyButton.addEventListener("click", verifyTool);
registerTool();
