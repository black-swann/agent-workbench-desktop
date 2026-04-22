import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline";

const REQUEST_TIMEOUT_MS = 15000;
const cwd = process.cwd();

function shortJson(value) {
  return JSON.stringify(value, null, 2);
}

const child = spawn("codex", ["app-server"], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
});

const stdout = readline.createInterface({ input: child.stdout });
const stderr = readline.createInterface({ input: child.stderr });
const pending = new Map();
let nextId = 1;
let settled = false;

function cleanup(code = 0) {
  if (settled) {
    return;
  }
  settled = true;
  stdout.close();
  stderr.close();
  if (!child.killed) {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 500).unref();
  process.exitCode = code;
}

function fail(message, detail) {
  console.error(`Smoke test failed: ${message}`);
  if (detail !== undefined) {
    console.error(typeof detail === "string" ? detail : shortJson(detail));
  }
  cleanup(1);
}

function sendMessage(payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function sendNotification(method, params) {
  const payload = params === undefined ? { method } : { method, params };
  sendMessage(payload);
}

function sendRequest(method, params) {
  const id = nextId++;
  const timeout = setTimeout(() => {
    pending.delete(id);
    fail(`request timed out: ${method}`);
  }, REQUEST_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timeout);
        reject(error);
      },
    });

    sendMessage({ id, method, params });
  });
}

stdout.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    fail("stdout contained non-JSON data", line);
    return;
  }

  if (typeof parsed.id === "number" && pending.has(parsed.id)) {
    const callback = pending.get(parsed.id);
    pending.delete(parsed.id);

    if (parsed.error) {
      callback.reject(parsed.error);
    } else {
      callback.resolve(parsed);
    }
    return;
  }

  if (parsed.method) {
    console.log(`[event] ${parsed.method}`);
  } else {
    console.log(`[stdout] ${line}`);
  }
});

stderr.on("line", (line) => {
  if (line.trim()) {
    console.error(`[stderr] ${line}`);
  }
});

child.on("error", (error) => {
  fail("failed to spawn `codex app-server`", error.message);
});

child.on("exit", (code, signal) => {
  if (!settled) {
    fail(
      "codex app-server exited before the smoke test completed",
      { code, signal },
    );
  }
});

async function main() {
  try {
    console.log("Spawning `codex app-server`...");
    const initialize = await sendRequest("initialize", {
      clientInfo: {
        name: "agent-workbench-smoke",
        title: "Agent Workbench Smoke Test",
        version: "0.1.0",
      },
    });
    console.log("Initialize response received.");
    console.log(shortJson(initialize.result ?? initialize));

    sendNotification("initialized");
    console.log("Sent initialized notification.");

    const modelList = await sendRequest("model/list", {});
    const models = modelList?.result?.data ?? modelList?.data ?? [];
    console.log(`Model list response received with ${Array.isArray(models) ? models.length : 0} entries.`);

    if (!Array.isArray(models)) {
      fail("model/list returned an unexpected payload", modelList);
      return;
    }

    console.log("Smoke test passed.");
    cleanup(0);
  } catch (error) {
    fail("request failed", error);
  }
}

main();
