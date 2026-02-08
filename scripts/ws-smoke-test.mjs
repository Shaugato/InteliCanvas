#!/usr/bin/env node
import WebSocket from "ws";

const BASE_URL = process.env.WS_URL || "ws://localhost:5000";

function testWsEndpoint(path, pingType, pongType, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    console.log(`[TEST] Connecting to ${url}...`);
    
    const ws = new WebSocket(url);
    let receivedPong = false;
    let closeCode = null;
    
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout after ${timeout}ms`));
    }, timeout);

    ws.on("open", () => {
      console.log(`[TEST] ${path}: connected`);
      ws.send(JSON.stringify({ type: pingType }));
      console.log(`[TEST] ${path}: sent ${pingType}`);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[TEST] ${path}: received`, msg.type);
        if (msg.type === pongType) {
          receivedPong = true;
          setTimeout(() => {
            ws.close(1000, "test complete");
          }, 2000);
        }
      } catch (e) {
        console.log(`[TEST] ${path}: received non-JSON`, data.toString().slice(0, 100));
      }
    });

    ws.on("close", (code, reason) => {
      closeCode = code;
      clearTimeout(timer);
      console.log(`[TEST] ${path}: closed code=${code} reason="${reason?.toString() || ""}"`);
      if (receivedPong && code === 1000) {
        resolve({ success: true, path, closeCode });
      } else if (!receivedPong) {
        reject(new Error(`Did not receive ${pongType}`));
      } else {
        resolve({ success: true, path, closeCode, note: "unexpected close code" });
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[TEST] ${path}: error`, err.message);
      reject(err);
    });
  });
}

async function main() {
  console.log("=== WebSocket Smoke Tests ===\n");
  
  const results = [];
  
  try {
    const r1 = await testWsEndpoint("/ws", "ping", "pong");
    results.push({ ...r1, test: "/ws ping/pong" });
    console.log(`[PASS] /ws ping/pong\n`);
  } catch (e) {
    results.push({ success: false, test: "/ws ping/pong", error: e.message });
    console.error(`[FAIL] /ws ping/pong: ${e.message}\n`);
  }

  try {
    const r2 = await testWsEndpoint("/ws-live", "ping_live", "pong_live");
    results.push({ ...r2, test: "/ws-live ping_live/pong_live" });
    console.log(`[PASS] /ws-live ping_live/pong_live\n`);
  } catch (e) {
    results.push({ success: false, test: "/ws-live ping_live/pong_live", error: e.message });
    console.error(`[FAIL] /ws-live ping_live/pong_live: ${e.message}\n`);
  }

  console.log("\n=== Summary ===");
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Test runner error:", e);
  process.exit(1);
});
