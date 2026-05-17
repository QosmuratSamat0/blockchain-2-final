const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.FRONTEND_PORT || 5173);
const host = process.env.FRONTEND_HOST || "127.0.0.1";
const root = path.resolve(__dirname, "..", "frontend");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

http
  .createServer((request, response) => {
    let pathname = decodeURIComponent(request.url.split("?")[0]);
    if (pathname === "/") pathname = "/index.html";

    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": types[path.extname(file)] || "application/octet-stream"
      });
      response.end(data);
    });
  })
  .listen(port, host, () => {
    console.log(`Frontend running at http://${host}:${port}/`);
  });
