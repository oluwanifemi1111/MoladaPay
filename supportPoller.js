const WebSocket = require("ws");
const { addPending } = require("./services/supportService");

const wss = new WebSocket.Server({ port: 4001 });

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn("Support WebSocket port 4001 already in use, skipping.");
  } else {
    console.error("Support WebSocket error:", err.message);
  }
});

wss.on("connection", (ws) => {
  console.log("User connected to support socket");

  ws.on("message", (msg) => {
    try {
      const { ticketId, userEmail } = JSON.parse(msg);
      if (ticketId && userEmail) {
        addPending(ticketId, userEmail, ws);
        console.log(`User ${userEmail} subscribed to ticket ${ticketId}`);
      }
    } catch (err) {
      console.error("WS message error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("User disconnected from support socket");
  });
});

console.log("Support WebSocket running on port 4001");
