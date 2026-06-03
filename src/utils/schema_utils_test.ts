import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  schemaArr,
  schemaBool,
  schemaDescribe,
  schemaInt,
  schemaLiteral,
  schemaNum,
  schemaObj,
  schemaOptional,
  schemaResult,
  resultSchema,
  schemaStr,
  schemaUnion,
} from "./schema_utils.js";

describe("schema_utils — builders emit the canonical JSON", () => {
  it("builds primitives", () => {
    assert.deepEqual(schemaStr(), { type: "string" });
    assert.deepEqual(schemaNum(), { type: "number" });
    assert.deepEqual(schemaInt(), { type: "integer" });
    assert.deepEqual(schemaBool(), { type: "boolean" });
    assert.deepEqual(schemaLiteral(true), { type: "literal", value: true });
  });

  it("nests compound builders", () => {
    assert.deepEqual(schemaArr(schemaStr()), {
      type: "array",
      items: { type: "string" },
    });
    assert.deepEqual(schemaOptional(schemaInt()), {
      type: "optional",
      inner: { type: "integer" },
    });
    assert.deepEqual(schemaObj({ name: schemaStr(), age: schemaOptional(schemaInt()) }), {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "optional", inner: { type: "integer" } },
      },
    });
    assert.deepEqual(schemaUnion(schemaStr(), schemaNum()), {
      type: "union",
      anyOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("schemaDescribe attaches docs without mutating the input", () => {
    const base = schemaStr();
    const documented = schemaDescribe(base, "a name");
    assert.deepEqual(documented, { type: "string", description: "a name" });
    assert.deepEqual(base, { type: "string" }, "original untouched");
  });
});

describe("schema_utils — result helper", () => {
  it("emits a discriminated Result union", () => {
    assert.deepEqual(schemaResult(schemaStr()), {
      type: "union",
      anyOf: [
        {
          type: "object",
          properties: {
            ok: { type: "literal", value: true },
            value: { type: "string" },
          },
        },
        {
          type: "object",
          properties: {
            ok: { type: "literal", value: false },
            error: { type: "string" },
          },
        },
      ],
    });
  });

  it("validates both Result arms and rejects mismatched payloads", () => {
    const schema = resultSchema<string>(schemaStr());
    assert.deepEqual(schema.parse({ ok: true, value: "yes" }), {
      ok: true,
      value: "yes",
    });
    assert.deepEqual(schema.parse({ ok: false, error: "boom" }), {
      ok: false,
      error: "boom",
    });
    assert.equal(schema.isValid({ ok: true }), false);
    assert.equal(schema.isValid({ ok: false, value: "x" }), false);
  });

  it("threads a non-trivial value schema", () => {
    const schema = resultSchema<number[]>(schemaArr(schemaInt()));
    assert.equal(schema.isValid({ ok: true, value: [1, 2, 3] }), true);
    assert.equal(schema.isValid({ ok: true, value: ["x"] }), false);
  });
});
