import express, { type Request, Response, NextFunction } from "express";
import { setupVite } from "./vite";
import { createServer } from "http";
import path from "path";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [express] ${message}`);
}

function serveStatic(app: express.Express) {
  const distPath = path.resolve(__dirname, "public");
  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = createServer(app);

  // Dynamically import routes to avoid issues if routes.ts imports other things
  const { registerRoutes } = await import("./routes");
  await registerRoutes(server, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    // Fixed: setupVite takes (server, app)
    await setupVite(server, app);
  } else {
    serveStatic(app);
  }

  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
