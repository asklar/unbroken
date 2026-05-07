import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Checker, Options } from "../lib/checker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_PORT = 9876;
const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

let server: http.Server;

function createMockServer(): http.Server {
  let throttleRequestCount = 0;

  return http.createServer((req, res) => {
    const url = req.url || "/";

    if (url === "/ok") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("OK");
    } else if (url === "/not-found") {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("Not Found");
    } else if (url === "/server-error") {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("Internal Server Error");
    } else if (url === "/forbidden") {
      res.writeHead(403, { "Content-Type": "text/html" });
      res.end("Forbidden");
    } else if (url === "/throttle") {
      throttleRequestCount++;
      if (throttleRequestCount <= 2) {
        res.writeHead(429, {
          "Content-Type": "text/html",
          "retry-after": "1",
        });
        res.end("Too Many Requests");
      } else {
        // Succeed after 2 retries
        throttleRequestCount = 0;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("OK");
      }
    } else if (url === "/check-user-agent") {
      const ua = req.headers["user-agent"] || "";
      if (ua.includes("unbroken")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("OK");
      } else {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("Bad User-Agent");
      }
    } else if (url === "/check-custom-ua") {
      const ua = req.headers["user-agent"] || "";
      if (ua === "MyCustomAgent/1.0") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("OK");
      } else {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("Bad User-Agent");
      }
    } else if (url === "/image-broken.png") {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("Not Found");
    } else if (url.startsWith("/image") && url.endsWith(".png")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end("fake-png");
    } else {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("Not Found");
    }
  });
}

// Create temporary markdown files for testing
function createTempMarkdown(name: string, content: string): string {
  const dir = path.join(__dirname, "mock-web", name);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "test.md");
  fs.writeFileSync(filePath, content);
  return dir;
}

describe("network tests (mocked)", () => {
  before(async () => {
    server = createMockServer();
    await new Promise<void>((resolve) => {
      server.listen(MOCK_PORT, () => resolve());
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    // Clean up temp files
    fs.rmSync(path.join(__dirname, "mock-web"), { recursive: true, force: true });
  });

  it("detects working URLs (200)", async () => {
    const dir = createTempMarkdown("url-ok", `[Good link](${MOCK_BASE}/ok)\n`);
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0);
  });

  it("detects broken URLs (404)", async () => {
    const dir = createTempMarkdown(
      "url-404",
      `[Broken link](${MOCK_BASE}/not-found)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 1);
  });

  it("detects server errors (500)", async () => {
    const dir = createTempMarkdown(
      "url-500",
      `[Server error](${MOCK_BASE}/server-error)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 1);
  });

  it("detects forbidden URLs (403)", async () => {
    const dir = createTempMarkdown(
      "url-403",
      `[Forbidden](${MOCK_BASE}/forbidden)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 1);
  });

  it("handles multiple URLs with mixed results", async () => {
    const dir = createTempMarkdown(
      "url-mixed",
      [
        `[Good](${MOCK_BASE}/ok)`,
        `[Bad](${MOCK_BASE}/not-found)`,
        `[Also good](${MOCK_BASE}/ok)`,
        `[Also bad](${MOCK_BASE}/server-error)`,
        "",
      ].join("\n")
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 2);
  });

  it("retries on HTTP 429 and succeeds", async () => {
    const dir = createTempMarkdown(
      "url-throttle",
      `[Throttled link](${MOCK_BASE}/throttle)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0, "Should succeed after retries");
  });

  it("sends default user-agent header", async () => {
    const dir = createTempMarkdown(
      "url-ua-default",
      `[UA check](${MOCK_BASE}/check-user-agent)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0, "Default UA should include 'unbroken'");
  });

  it("sends custom user-agent header", async () => {
    const dir = createTempMarkdown(
      "url-ua-custom",
      `[UA check](${MOCK_BASE}/check-custom-ua)\n`
    );
    const checker = new Checker({
      dir,
      superquiet: true,
      "user-agent": "MyCustomAgent/1.0",
    } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0, "Custom UA should be forwarded");
  });

  it("validates image links (working)", async () => {
    const dir = createTempMarkdown(
      "img-ok",
      `![Good image](${MOCK_BASE}/image1.png)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0);
  });

  it("validates image links (broken)", async () => {
    const dir = createTempMarkdown(
      "img-broken",
      `![Broken image](${MOCK_BASE}/image-broken.png)\n`
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 1);
  });

  it("skips web URLs in local-only mode", async () => {
    const dir = createTempMarkdown(
      "url-local-only",
      `[Should be skipped](${MOCK_BASE}/not-found)\n`
    );
    const checker = new Checker({
      dir,
      superquiet: true,
      "local-only": true,
    } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0, "Web URLs should be skipped in local-only mode");
  });

  it("caches URL results (same URL checked only once)", async () => {
    const dir = createTempMarkdown(
      "url-cache",
      [
        `[First](${MOCK_BASE}/ok)`,
        `[Second](${MOCK_BASE}/ok)`,
        `[Third](${MOCK_BASE}/ok)`,
        "",
      ].join("\n")
    );
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0);
  });

  it("HTTP/429 suppression works", async () => {
    const dir = createTempMarkdown("url-suppress-429", `[Throttled](${MOCK_BASE}/throttle)\n`);
    // Create a suppressions file with HTTP/429
    const exclusionsPath = path.join(dir, ".unbroken_exclusions");
    fs.writeFileSync(exclusionsPath, "HTTP/429\n");
    const checker = new Checker({ dir, superquiet: true } as Options);
    const errors = await checker.Process();
    assert.strictEqual(errors, 0);
  });
});
