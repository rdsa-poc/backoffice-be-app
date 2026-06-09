import http from "node:http";
import { writeFileSync } from "node:fs";

const outputPath = process.env.RADIOSA_HEALTH_OUTPUT_FILE;

// Sandbox-friendly startup probe: keep the checked-in CLI entrypoint intact,
// but avoid binding a real socket while still exercising the in-process /health route.
http.Server.prototype.listen = function patchedListen(...args) {
  const callback = typeof args.at(-1) === "function" ? args.at(-1) : undefined;

  queueMicrotask(() => {
    this.emit("listening");
    callback?.();

    void captureHealthResponse(this).then(
      (result) => {
        if (outputPath !== undefined) {
          writeFileSync(outputPath, JSON.stringify(result), "utf8");
        }
      },
      (error) => {
        if (outputPath !== undefined) {
          writeFileSync(
            outputPath,
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
            "utf8",
          );
        }

        process.exitCode = 1;
      },
    );
  });

  return this;
};

async function captureHealthResponse(server) {
  const response = await invokeRequest(server, "GET", "/health");
  return {
    body: parseJson(response.body),
    statusCode: response.statusCode,
  };
}

function invokeRequest(server, method, url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let statusCode = 200;
    let body = "";

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`Timed out waiting for ${method} ${url} response.`));
    }, 1_000);

    const request = {
      method,
      url,
      [Symbol.asyncIterator]: async function* emptyBody() {},
    };

    const response = {
      end(chunk = "") {
        if (settled) {
          return this;
        }

        settled = true;
        clearTimeout(timeout);
        body += String(chunk);
        resolve({ body, statusCode });
        return this;
      },
      write(chunk) {
        body += String(chunk);
        return true;
      },
      writeHead(nextStatusCode) {
        statusCode = nextStatusCode;
        return this;
      },
    };

    try {
      server.emit("request", request, response);
    } catch (error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function parseJson(value) {
  return JSON.parse(value);
}
