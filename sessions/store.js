import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const FILENAME_PATTERN = /^session-[A-Za-z0-9-]+\.json$/;

function makeId(now = new Date()) {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const tail = crypto.randomBytes(4).toString("hex");
  return `session-${ts}-${tail}`;
}

function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((block) => block && typeof block.text === "string" && block.text.trim())
    .map((block) => ({
      text: String(block.text),
      meta: typeof block.meta === "string" ? block.meta : "",
      createdAt: Number.isFinite(block.createdAt) ? block.createdAt : Date.now()
    }));
}

function buildSummary(session) {
  return {
    id: session.id,
    title: session.title || "Untitled session",
    mode: session.mode === "offline" ? "offline" : "online",
    pinned: Boolean(session.pinned),
    pinnedAt: session.pinnedAt || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    startedAt: session.startedAt || session.createdAt,
    endedAt: session.endedAt || null,
    durationSeconds: Number(session.durationSeconds || 0),
    blockCount: Array.isArray(session.blocks) ? session.blocks.length : 0
  };
}

export class SessionsStore {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.cache = new Map();
    this.cacheLoaded = false;
  }

  async ensureDir() {
    await fsp.mkdir(this.rootDir, { recursive: true });
  }

  filePathFor(id) {
    if (!FILENAME_PATTERN.test(`${id}.json`)) {
      throw new Error("Invalid session id.");
    }
    return path.join(this.rootDir, `${id}.json`);
  }

  async loadAll() {
    if (this.cacheLoaded) return;
    await this.ensureDir();

    const entries = await fsp.readdir(this.rootDir);
    for (const entry of entries) {
      if (!FILENAME_PATTERN.test(entry)) continue;
      try {
        const raw = await fsp.readFile(path.join(this.rootDir, entry), "utf8");
        const session = JSON.parse(raw);
        if (session.id) {
          this.cache.set(session.id, session);
        }
      } catch {
        // skip corrupted entries
      }
    }
    this.cacheLoaded = true;
  }

  async list({ q } = {}) {
    await this.loadAll();
    const sessions = Array.from(this.cache.values());

    let filtered = sessions;
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      filtered = sessions.filter((session) => {
        if ((session.title || "").toLowerCase().includes(needle)) return true;
        if (!Array.isArray(session.blocks)) return false;
        return session.blocks.some((block) =>
          (block.text || "").toLowerCase().includes(needle)
        );
      });
    }

    const summaries = filtered.map(buildSummary);
    summaries.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) {
        return (b.pinnedAt || 0) - (a.pinnedAt || 0);
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return summaries;
  }

  async get(id) {
    await this.loadAll();
    return this.cache.get(id) || null;
  }

  async create(input = {}) {
    await this.ensureDir();
    const now = Date.now();
    const id = makeId();
    const session = {
      id,
      title: input.title?.trim() || "Untitled session",
      mode: input.mode === "offline" ? "offline" : "online",
      pinned: false,
      pinnedAt: null,
      createdAt: now,
      updatedAt: now,
      startedAt: input.startedAt || now,
      endedAt: input.endedAt || null,
      durationSeconds: Number(input.durationSeconds || 0),
      blocks: sanitizeBlocks(input.blocks)
    };
    await this.persist(session);
    return session;
  }

  async update(id, patch = {}) {
    const current = await this.get(id);
    if (!current) {
      const error = new Error("Session not found.");
      error.code = "NOT_FOUND";
      throw error;
    }

    const next = { ...current };

    if (typeof patch.title === "string") {
      next.title = patch.title.trim() || "Untitled session";
    }
    if (typeof patch.mode === "string") {
      next.mode = patch.mode === "offline" ? "offline" : "online";
    }
    if (Array.isArray(patch.blocks)) {
      next.blocks = sanitizeBlocks(patch.blocks);
    }
    if (typeof patch.pinned === "boolean") {
      next.pinned = patch.pinned;
      next.pinnedAt = patch.pinned ? Date.now() : null;
    }
    if (Number.isFinite(patch.durationSeconds)) {
      next.durationSeconds = Number(patch.durationSeconds);
    }
    if (Number.isFinite(patch.endedAt)) {
      next.endedAt = Number(patch.endedAt);
    }
    if (Number.isFinite(patch.startedAt)) {
      next.startedAt = Number(patch.startedAt);
    }

    next.updatedAt = Date.now();
    await this.persist(next);
    return next;
  }

  async delete(id) {
    await this.loadAll();
    const target = this.filePathFor(id);
    this.cache.delete(id);
    try {
      await fsp.unlink(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async persist(session) {
    const target = this.filePathFor(session.id);
    const tmp = `${target}.writing`;
    await fsp.writeFile(tmp, JSON.stringify(session, null, 2), "utf8");
    await fsp.rename(tmp, target);
    this.cache.set(session.id, session);
  }
}

export function makeStoreSync({ rootDir }) {
  fs.mkdirSync(rootDir, { recursive: true });
  return new SessionsStore({ rootDir });
}
