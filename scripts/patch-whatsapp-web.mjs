// Applies upstream whatsapp-web.js fixes that are merged on GitHub `main` but not yet in an npm
// release (latest npm: 1.34.7). Idempotent; runs automatically after `npm install` (postinstall).
//
// 1. Media sends fail with "Data passed to getter must include an id property ... but got undefined"
//    since WhatsApp Web's 2026-09-17 update: MediaData's private __x_id overwrites the message id.
//    Upstream: https://github.com/wwebjs/whatsapp-web.js/pull/201923 (issue #201922)
// 2. WhatsApp Web (2026-07) exposes message keys as `$1` instead of `_serialized`, so sendMessage
//    could return undefined. Upstream main falls back to `$1`.
//
// Remove this script (and the postinstall entry) once a whatsapp-web.js release > 1.34.7 includes both.
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("node_modules/whatsapp-web.js/src/util/Injected/Utils.js");
if (!fs.existsSync(file)) {
  console.log("[patch-whatsapp-web] whatsapp-web.js not installed, skipping");
  process.exit(0);
}

const patches = [
  {
    name: "drop MediaData __x_id before building Msg",
    applied: (s) => s.includes("delete message.__x_id"),
    find: "        // Bot's won't reply if canonicalUrl is set (linking)\n",
    replace:
      "        // MediaData is a model whose private __x_id field collides with Msg's\n" +
      "        // internal id field when its enumerable properties are spread above.\n" +
      "        if (message.__x_id) {\n" +
      "            delete message.__x_id;\n" +
      "        }\n" +
      "        // Bot's won't reply if canonicalUrl is set (linking)\n",
  },
  {
    name: "sendMessage returns Msg for $1-style keys",
    applied: (s) => s.includes(".Msg.get(newMsgKey._serialized || newMsgKey.$1)"),
    find: ".Msg.get(newMsgKey._serialized);",
    replace: ".Msg.get(newMsgKey._serialized || newMsgKey.$1);",
  },
  {
    name: "normalise $1 message ids to _serialized",
    applied: (s) => s.includes("msg.id._serialized == null && msg.id.$1 != null"),
    find: "    window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();\n",
    replace:
      "    window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();\n" +
      "        // WhatsApp Web changed _serialized to $1 in message IDs (2026-07 update).\n" +
      "        if (msg.id && msg.id._serialized == null && msg.id.$1 != null) {\n" +
      "            msg.id = Object.assign({}, msg.id, { _serialized: msg.id.$1 });\n" +
      "        }\n",
  },
];

// Normalise line endings so the patch works regardless of how the package was checked out.
const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let src = original.replace(/\r\n/g, "\n");
let changed = false;

for (const p of patches) {
  if (p.applied(src)) {
    console.log(`[patch-whatsapp-web] already applied: ${p.name}`);
    continue;
  }
  if (!src.includes(p.find)) {
    console.warn(`[patch-whatsapp-web] could not apply "${p.name}" (library changed?); skipping`);
    continue;
  }
  src = src.replace(p.find, p.replace);
  changed = true;
  console.log(`[patch-whatsapp-web] applied: ${p.name}`);
}

if (changed) fs.writeFileSync(file, eol === "\r\n" ? src.replace(/\n/g, "\r\n") : src);
