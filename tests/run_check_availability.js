"use strict";

const fs = require("fs");

const [, , appPath, rawPayload, today] = process.argv;
const elements = new Map();

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
};

const source = fs.readFileSync(appPath, "utf8");
const payload = JSON.parse(rawPayload);
eval(`${source}\ncheckAvailability(payload, today).then((result) => process.stdout.write(result));`);
