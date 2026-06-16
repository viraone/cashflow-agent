import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { getAdjustedCash, saveAdjustedCash } from "./services/excelService.ts";

const port = Number(process.env.PORT ?? 8000);
const rootDir = process.cwd();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

async function handleApi(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== "/api/adjusted-cash") {
    return false;
  }

  if (request.method === "GET") {
    const adjustedCash = await getAdjustedCash();
    sendJson(response, 200, { adjustedCash });
    return true;
  }

  if (request.method === "POST") {
    const body = await readJsonBody(request);
    const adjustedCash = Number((body as { adjustedCash?: unknown }).adjustedCash);

    if (!Number.isFinite(adjustedCash)) {
      sendJson(response, 400, { error: "adjustedCash must be a number" });
      return true;
    }

    await saveAdjustedCash(adjustedCash);
    sendJson(response, 200, { adjustedCash });
    return true;
  }

  sendJson(response, 405, { error: "Method not allowed" });
  return true;
}

function serveStatic(url: URL, response: http.ServerResponse): void {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const filePath = path.resolve(rootDir, `.${decodedPath}`);
  const relativePath = path.relative(rootDir, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    path.basename(filePath) === "Adjusted cash.xlsx"
  ) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const mimeType = mimeTypes[path.extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": mimeType });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const handledByApi = await handleApi(request, response, url);

    if (!handledByApi) {
      serveStatic(url, response);
    }
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

server.listen(port, () => {
  console.log(`Gravy dashboard running at http://localhost:${port}`);
});
