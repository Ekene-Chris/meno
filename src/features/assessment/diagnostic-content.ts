import "server-only";
import { createHash } from "node:crypto";
import type { DiagnosticQuestion } from "./diagnostic-schema";

export const DIAGNOSTIC_VERSION = "javascript-foundations-v1";
export const DIAGNOSTIC_RUBRIC_VERSION = "objective-subset-v1";
export const diagnosticScopes = [
  {
    skillId: "js.variables",
    scope: "Read primitive values and distinguish strings from numbers in fixed examples.",
  },
  {
    skillId: "js.functions",
    scope: "Read function arguments and return values in fixed examples.",
  },
  {
    skillId: "js.arrays",
    scope: "Read map/filter results and distinguish a new array from the original.",
  },
  {
    skillId: "js.promises",
    scope: "Read promise callback order and identify basic promise behavior.",
  },
] as const;

type KeyedQuestion = DiagnosticQuestion & { correctChoiceIds: string[]; explanation: string };
const questions: KeyedQuestion[] = [
  {
    id: "values-addition",
    skillId: "js.variables",
    selection: "single",
    prompt: "What value does total hold?",
    code: "const price = 4;\nconst total = price + 3;",
    choices: [
      { id: "seven", label: "7" },
      { id: "forty-three", label: '"43"' },
      { id: "three", label: "3" },
    ],
    correctChoiceIds: ["seven"],
    explanation: "Both operands are numbers, so addition produces 7.",
  },
  {
    id: "values-strings",
    skillId: "js.variables",
    selection: "multiple",
    prompt: "Which variables hold strings? Select all that apply.",
    code: 'const first = "3";\nconst second = 3;\nconst third = String(3);',
    choices: [
      { id: "first", label: "first" },
      { id: "second", label: "second" },
      { id: "third", label: "third" },
    ],
    correctChoiceIds: ["first", "third"],
    explanation: "The quoted literal and String conversion produce strings; second holds a number.",
  },
  {
    id: "functions-return",
    skillId: "js.functions",
    selection: "single",
    prompt: "What value does result hold?",
    code: "function addOne(value) {\n  return value + 1;\n}\nconst result = addOne(4);",
    choices: [
      { id: "five", label: "5" },
      { id: "four", label: "4" },
      { id: "undefined", label: "undefined" },
    ],
    correctChoiceIds: ["five"],
    explanation: "The call passes 4 and returns 4 + 1, so result holds 5.",
  },
  {
    id: "functions-arguments",
    skillId: "js.functions",
    selection: "single",
    prompt: "Which value is passed as the second argument?",
    code: 'function greet(name, greeting) {\n  return greeting + ", " + name;\n}\ngreet("Ada", "Hello");',
    choices: [
      { id: "hello", label: '"Hello"' },
      { id: "ada", label: '"Ada"' },
      { id: "greeting", label: 'The literal string "greeting"' },
    ],
    correctChoiceIds: ["hello"],
    explanation: "Arguments follow the call order: Ada is first and Hello is second.",
  },
  {
    id: "arrays-map",
    skillId: "js.arrays",
    selection: "single",
    prompt: "Which statement describes the values after this code?",
    code: "const original = [1, 2];\nconst doubled = original.map(value => value * 2);",
    choices: [
      { id: "new-array", label: "doubled is [2, 4]; original is still [1, 2]." },
      { id: "mutated", label: "Both arrays are [2, 4]." },
      { id: "sum", label: "doubled is the number 6." },
    ],
    correctChoiceIds: ["new-array"],
    explanation:
      "map creates a new array from the returned values; this callback does not mutate the original.",
  },
  {
    id: "arrays-filter",
    skillId: "js.arrays",
    selection: "single",
    prompt: "What does selected contain?",
    code: "const selected = [1, 2, 3, 4].filter(value => value > 2);",
    choices: [
      { id: "three-four", label: "[3, 4]" },
      { id: "true-false", label: "[false, false, true, true]" },
      { id: "one-two", label: "[1, 2]" },
    ],
    correctChoiceIds: ["three-four"],
    explanation: "filter retains elements for which the callback is truthy: 3 and 4.",
  },
  {
    id: "promises-order",
    skillId: "js.promises",
    selection: "single",
    prompt: "In what order are the two messages logged?",
    code: 'Promise.resolve("done").then(value => console.log(value));\nconsole.log("now");',
    choices: [
      { id: "now-done", label: "now, then done" },
      { id: "done-now", label: "done, then now" },
      { id: "only-now", label: "Only now is logged." },
    ],
    correctChoiceIds: ["now-done"],
    explanation:
      "The synchronous log runs first. The then callback runs afterward, even for an already fulfilled promise.",
  },
  {
    id: "promises-behavior",
    skillId: "js.promises",
    selection: "multiple",
    prompt: "Which statements are true? Select all that apply.",
    code: null,
    choices: [
      { id: "settles", label: "A pending promise can become fulfilled or rejected." },
      { id: "new-promise", label: "Calling then returns a new promise." },
      {
        id: "immediate",
        label: "A then callback always runs immediately, before the next statement.",
      },
      { id: "only-string", label: "Every rejected promise has a string as its reason." },
    ],
    correctChoiceIds: ["settles", "new-promise"],
    explanation:
      "Promises can settle either way, and then returns a new promise. Callbacks are asynchronous; rejection reasons are not limited to strings.",
  },
];

// Definitions stay server-side. D2 must retain this version/hash with each attempt.
export const DIAGNOSTIC_CONTENT_HASH = createHash("sha256")
  .update(
    JSON.stringify({
      version: DIAGNOSTIC_VERSION,
      rubric: DIAGNOSTIC_RUBRIC_VERSION,
      scopes: diagnosticScopes,
      questions,
    }),
  )
  .digest("hex");

export function getDiagnosticDefinition() {
  return structuredClone({
    version: DIAGNOSTIC_VERSION,
    rubricVersion: DIAGNOSTIC_RUBRIC_VERSION,
    contentHash: DIAGNOSTIC_CONTENT_HASH,
    scopes: diagnosticScopes,
    questions,
  });
}
export function getPublicDiagnostic() {
  return {
    version: DIAGNOSTIC_VERSION,
    title: "A small JavaScript check",
    introduction:
      "See what you remember. You can skip any question; a skip says nothing about your ability.",
    limitations:
      "These fixed questions check a narrow set of examples. They do not certify coding ability or assess API integration.",
    questions: questions.map(({ id, skillId, prompt, code, selection, choices }) => ({
      id,
      skillId,
      prompt,
      code,
      selection,
      choices: choices.map((choice) => ({ ...choice })),
    })),
  };
}
