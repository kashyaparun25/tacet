import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import http from "node:http";

import { OFFLINE_MODEL } from "./registry.js";

const SIZE_TOLERANCE = 0.10;

function withinTolerance(actual, expected) {
  if (!expected) {
    return actual > 0;
  }
  const ratio = Math.abs(actual - expected) / expected;
  return ratio <= SIZE_TOLERANCE;
}

export class ModelManager {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.modelDir = path.join(rootDir, OFFLINE_MODEL.id);
    this.activeDownload = null;
  }

  filePaths() {
    return Object.fromEntries(
      OFFLINE_MODEL.files.map((file) => [file.name, path.join(this.modelDir, file.name)])
    );
  }

  async status() {
    const files = [];
    let totalDownloaded = 0;
    let totalExpected = 0;
    let allReady = true;

    for (const file of OFFLINE_MODEL.files) {
      const fullPath = path.join(this.modelDir, file.name);
      let actualSize = 0;

      try {
        const stat = await fsp.stat(fullPath);
        actualSize = stat.size;
      } catch {
        actualSize = 0;
      }

      const ready = withinTolerance(actualSize, file.size);
      if (!ready) {
        allReady = false;
      }

      totalDownloaded += actualSize;
      totalExpected += file.size;
      files.push({ name: file.name, expectedSize: file.size, actualSize, ready });
    }

    return {
      modelId: OFFLINE_MODEL.id,
      label: OFFLINE_MODEL.label,
      modelDir: this.modelDir,
      ready: allReady,
      downloading: Boolean(this.activeDownload),
      downloadedBytes: totalDownloaded,
      totalBytes: totalExpected,
      files
    };
  }

  async ensureDir() {
    await fsp.mkdir(this.modelDir, { recursive: true });
  }

  cancelDownload() {
    if (!this.activeDownload) {
      return;
    }
    this.activeDownload.cancelled = true;
    this.activeDownload.requests.forEach((req) => req.destroy());
  }

  async download({ onProgress } = {}) {
    if (this.activeDownload) {
      throw new Error("A download is already in progress.");
    }

    await this.ensureDir();

    const ctx = { cancelled: false, requests: [] };
    this.activeDownload = ctx;

    const totalBytes = OFFLINE_MODEL.files.reduce((sum, file) => sum + file.size, 0);
    let priorFilesBytes = 0;

    try {
      for (const file of OFFLINE_MODEL.files) {
        if (ctx.cancelled) {
          throw new Error("Download cancelled.");
        }

        const targetPath = path.join(this.modelDir, file.name);
        const partPath = `${targetPath}.part`;

        try {
          const stat = await fsp.stat(targetPath);
          if (withinTolerance(stat.size, file.size)) {
            priorFilesBytes += stat.size;
            onProgress?.({
              file: file.name,
              fileBytes: stat.size,
              fileTotal: file.size,
              downloadedBytes: priorFilesBytes,
              totalBytes
            });
            continue;
          }
        } catch {}

        let resumeBaseline = 0;
        try {
          const partStat = await fsp.stat(partPath);
          resumeBaseline = partStat.size;
        } catch {}

        const url = `${OFFLINE_MODEL.baseUrl}/${file.name}`;
        let fileBytes = resumeBaseline;

        await this.downloadFile({
          url,
          destination: partPath,
          startByte: resumeBaseline,
          ctx,
          onChunk: (chunk) => {
            fileBytes += chunk;
            onProgress?.({
              file: file.name,
              fileBytes,
              fileTotal: file.size,
              downloadedBytes: priorFilesBytes + fileBytes,
              totalBytes
            });
          },
          onRestart: () => {
            fileBytes = 0;
          }
        });

        if (ctx.cancelled) {
          throw new Error("Download cancelled.");
        }

        await fsp.rename(partPath, targetPath);
        priorFilesBytes += fileBytes;
      }
    } finally {
      this.activeDownload = null;
    }

    return this.status();
  }

  downloadFile({ url, destination, startByte, ctx, onChunk, onRestart }) {
    return new Promise((resolve, reject) => {
      const tryRequest = (currentUrl, currentStart, redirects) => {
        if (ctx.cancelled) {
          reject(new Error("Download cancelled."));
          return;
        }

        const parsed = new URL(currentUrl);
        const transport = parsed.protocol === "http:" ? http : https;

        const headers = {
          "User-Agent": "tacet-offline-asr-bootstrap/0.1",
          Accept: "application/octet-stream"
        };

        if (currentStart > 0) {
          headers.Range = `bytes=${currentStart}-`;
        }

        const req = transport.request(
          {
            method: "GET",
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
            path: parsed.pathname + parsed.search,
            headers
          },
          (res) => {
            const status = res.statusCode || 0;

            if (status >= 300 && status < 400 && res.headers.location) {
              res.resume();
              if (redirects >= 5) {
                reject(new Error("Too many redirects fetching model."));
                return;
              }
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              tryRequest(nextUrl, currentStart, redirects + 1);
              return;
            }

            if (status === 416 || (currentStart > 0 && status === 200)) {
              res.resume();
              try {
                fs.unlinkSync(destination);
              } catch {}
              onRestart?.();
              tryRequest(currentUrl, 0, redirects);
              return;
            }

            if (status !== 200 && status !== 206) {
              res.resume();
              reject(new Error(`Download failed with HTTP ${status}.`));
              return;
            }

            const flags = currentStart > 0 && status === 206 ? "a" : "w";
            const file = fs.createWriteStream(destination, { flags });

            res.on("data", (chunk) => {
              if (ctx.cancelled) {
                req.destroy();
                file.destroy();
                return;
              }
              onChunk?.(chunk.length);
            });

            res.on("error", (error) => {
              file.destroy();
              reject(error);
            });

            file.on("error", (error) => {
              req.destroy();
              reject(error);
            });

            res.pipe(file);
            file.on("close", () => {
              if (ctx.cancelled) {
                reject(new Error("Download cancelled."));
                return;
              }
              resolve();
            });
          }
        );

        req.on("error", (error) => {
          if (ctx.cancelled) {
            reject(new Error("Download cancelled."));
          } else {
            reject(error);
          }
        });

        ctx.requests.push(req);
        req.end();
      };

      tryRequest(url, startByte, 0);
    });
  }
}
