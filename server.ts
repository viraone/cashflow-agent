import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT ?? 8000);
const rootDir = process.cwd();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(url: URL, response: http.ServerResponse): void {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const filePath = path.resolve(rootDir, `.${decodedPath}`);
  const relativePath = path.relative(rootDir, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
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
    serveStatic(url, response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Unexpected server error");
  }
});

server.listen(port, () => {
  console.log(`Gravy dashboard running at http://localhost:${port}`);
});
