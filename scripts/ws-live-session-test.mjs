#!/usr/bin/env node
import WebSocket from "ws";

const BASE_URL = process.env.WS_URL || "ws://localhost:5000";
const TIMEOUT = 15000;

function testStartLive() {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/ws-live`;
    console.log(`[TEST] Connecting to ${url}...`);
    
    const ws = new WebSocket(url);
    let receivedConnecting = false;
    let receivedConnected = false;
    let receivedError = null;
    
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout after ${TIMEOUT}ms`));
    }, TIMEOUT);

    ws.on("open", () => {
      console.log(`[TEST] ws-live: connected, sending start_live...`);
      ws.send(JSON.stringify({
        type: "start_live",
        config: {
          sampleRate: 16000,
          language: "en-US"
        }
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[TEST] ws-live: received`, msg.type, msg.status || msg.error || "");
        
        if (msg.type === "live_status") {
          if (msg.status === "connecting") {
            receivedConnecting = true;
          } else if (msg.status === "connected") {
            receivedConnected = true;
            console.log("[TEST] Live session connected! Waiting 3s then stopping...");
            setTimeout(() => {
              ws.send(JSON.stringify({ type: "stop_live" }));
              setTimeout(() => ws.close(1000, "test complete"), 1000);
            }, 3000);
          } else if (msg.status === "error") {
            receivedError = msg.message || "Unknown error";
          }
        } else if (msg.type === "live_error") {
          receivedError = msg.error || "Unknown error";
          console.log(`[TEST] Live error: ${receivedError}`);
          // Give time for any cleanup, then close
          setTimeout(() => ws.close(1000, "test complete after error"), 500);
        }
      } catch (e) {
        console.log(`[TEST] ws-live: non-JSON message`);
      }
    });

    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      console.log(`[TEST] ws-live: closed code=${code} reason="${reason?.toString() || ""}"`);
      
      if (receivedConnected) {
        resolve({ success: true, test: "start_live session", note: "Session connected and stopped cleanly" });
      } else if (receivedConnecting && receivedError) {
        // API key might be invalid or quota exceeded
        resolve({ success: false, test: "start_live session", error: receivedError, note: "Session failed to connect (API issue?)" });
      } else if (receivedConnecting) {
        resolve({ success: false, test: "start_live session", error: "Never received connected status" });
      } else {
        resolve({ success: false, test: "start_live session", error: "Never received connecting status" });
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[TEST] ws-live: error`, err.message);
      reject(err);
    });
  });
}

async function main() {
  console.log("=== Gemini Live Session Test ===\n");
  console.log("Note: This test requires GEMINI_API_KEY to be set on the server.\n");
  
  try {
    const result = await testStartLive();
    if (result.success) {
      console.log(`\n[PASS] ${result.test}: ${result.note}`);
    } else {
      console.log(`\n[FAIL] ${result.test}: ${result.error}`);
      if (result.note) console.log(`       Note: ${result.note}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`\n[FAIL] Test error: ${e.message}`);
    process.exit(1);
  }
}

main();
