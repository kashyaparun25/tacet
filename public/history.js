import { el, openModal, downloadBlob } from "/ui-helpers.js";

export const sessionsApi = {
  async list(query = "") {
    const url = query
      ? `/api/sessions?q=${encodeURIComponent(query)}`
      : "/api/sessions";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load sessions.");
    const data = await res.json();
    return data.sessions || [];
  },

  async get(id) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Failed to load session.");
    return res.json();
  },

  async create(input) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error("Failed to create session.");
    return res.json();
  },

  async update(id, patch) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error("Failed to update session.");
    return res.json();
  },

  async delete(id) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!res.ok && res.status !== 204) throw new Error("Failed to delete session.");
  }
};

export function deriveTitleFromBlocks(blocks) {
  if (!blocks?.length) return "Untitled session";
  const text = String(blocks[0].text || "").trim();
  if (!text) return "Untitled session";
  if (text.length <= 60) return text;
  const truncated = text.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated).trim() + "...";
}

export function formatSessionExportText(session) {
  const blocks = session.blocks || [];
  const lines = [
    "Tacet Transcript",
    "================",
    "",
    `Title: ${session.title || "Untitled session"}`,
    `Mode: ${session.mode === "offline" ? "Offline (Nemotron)" : "Online (Deepgram)"}`,
    `Created: ${new Date(session.createdAt).toLocaleString()}`,
    `Blocks: ${blocks.length}`
  ];

  if (Number.isFinite(session.durationSeconds) && session.durationSeconds > 0) {
    lines.push(`Duration: ${formatDuration(session.durationSeconds)}`);
  }

  lines.push("", "Transcript", "----------");

  blocks.forEach((block, index) => {
    const time = new Date(block.createdAt).toLocaleTimeString();
    const meta = block.meta || "";
    lines.push(
      "",
      `[${String(index + 1).padStart(2, "0")}] ${time}${meta ? ` / ${meta}` : ""}`,
      block.text
    );
  });

  return lines.join("\n");
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatRelativeDate(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function highlight(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return [
    text.slice(0, idx),
    el("mark", {}, [text.slice(idx, idx + query.length)]),
    text.slice(idx + query.length)
  ];
}

function snippetFor(session, query) {
  if (!query) return null;
  const needle = query.toLowerCase();
  const blocks = session.blocks || [];
  for (const block of blocks) {
    const text = block.text || "";
    const lower = text.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + query.length + 40);
      const prefix = start > 0 ? "..." : "";
      const suffix = end < text.length ? "..." : "";
      return prefix + text.slice(start, end) + suffix;
    }
  }
  return null;
}

export function runHistoryModal({ onOpenSession }) {
  return openModal({
    size: "lg",
    dismissable: true,
    render(dialog, close) {
      let query = "";
      let sessionsCache = [];
      let fullSessionCache = new Map();

      const searchInput = el("input", {
        type: "search",
        class: "history-search",
        placeholder: "Search transcripts and titles...",
        autocomplete: "off",
        spellcheck: "false"
      });

      const listEl = el("div", { class: "history-list" });
      const emptyEl = el("div", { class: "history-empty" }, [
        el("strong", {}, ["No sessions yet"]),
        el("span", {}, ["Captures you make will show up here automatically."])
      ]);

      const closeBtn = el(
        "button",
        { class: "wizard-button ghost", type: "button", onclick: () => close({}) },
        ["Close"]
      );

      dialog.appendChild(
        el("div", { class: "wizard-shell history-shell" }, [
          el("div", { class: "wizard-header history-header" }, [
            el("div", {}, [
              el("p", { class: "wizard-kicker" }, ["History"]),
              el("h2", { class: "wizard-title" }, ["Past sessions"])
            ]),
            searchInput
          ]),
          el("div", { class: "history-body" }, [listEl, emptyEl]),
          el("div", { class: "wizard-footer" }, [el("div"), el("div", { class: "wizard-actions" }, [closeBtn])])
        ])
      );

      let searchDebounce = null;
      searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          query = searchInput.value;
          render();
        }, 180);
      });

      async function render() {
        try {
          const summaries = await sessionsApi.list(query);
          if (query) {
            sessionsCache = await Promise.all(
              summaries.map(async (summary) => {
                try {
                  const full = await loadFull(summary.id);
                  return { ...summary, blocks: full.blocks };
                } catch {
                  return summary;
                }
              })
            );
          } else {
            sessionsCache = summaries;
          }
        } catch (error) {
          listEl.replaceChildren(
            el("div", { class: "history-error" }, [error.message])
          );
          return;
        }

        if (!sessionsCache.length) {
          listEl.replaceChildren();
          emptyEl.hidden = false;
          if (query) {
            emptyEl.replaceChildren(
              el("strong", {}, [`No matches for "${query}"`]),
              el("span", {}, ["Try a different search term."])
            );
          } else {
            emptyEl.replaceChildren(
              el("strong", {}, ["No sessions yet"]),
              el("span", {}, ["Captures you make will show up here automatically."])
            );
          }
          return;
        }

        emptyEl.hidden = true;

        const pinnedSessions = sessionsCache.filter((s) => s.pinned);
        const recentSessions = sessionsCache.filter((s) => !s.pinned);

        const groups = [];
        if (pinnedSessions.length) {
          groups.push({ label: "Pinned", sessions: pinnedSessions });
        }
        groups.push({ label: pinnedSessions.length ? "Recent" : "All sessions", sessions: recentSessions });

        listEl.replaceChildren(
          ...groups.flatMap((group) =>
            group.sessions.length
              ? [
                  el("p", { class: "history-group-label" }, [group.label]),
                  ...group.sessions.map((session) => renderRow(session))
                ]
              : []
          )
        );
      }

      function renderRow(summary) {
        const titleNode = el("strong", { class: "history-title" }, [
          ...(query ? [highlight(summary.title, query)] : [summary.title])
        ]);

        const titleInput = el("input", {
          type: "text",
          class: "history-rename-input",
          value: summary.title,
          hidden: true
        });

        const renameBtn = el(
          "button",
          {
            class: "history-action",
            type: "button",
            "aria-label": "Rename session",
            title: "Rename",
            onclick: () => {
              titleInput.hidden = false;
              titleNode.hidden = true;
              titleInput.value = summary.title;
              titleInput.focus();
              titleInput.select();
            }
          },
          [renderIcon("pencil")]
        );

        async function commitRename() {
          const next = titleInput.value.trim() || "Untitled session";
          if (next === summary.title) {
            titleInput.hidden = true;
            titleNode.hidden = false;
            return;
          }
          try {
            await sessionsApi.update(summary.id, { title: next });
            summary.title = next;
            titleNode.replaceChildren(...(query ? [highlight(next, query)] : [next]));
          } catch (error) {
            console.warn(error);
          }
          titleInput.hidden = true;
          titleNode.hidden = false;
        }

        titleInput.addEventListener("blur", commitRename);
        titleInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitRename();
          } else if (event.key === "Escape") {
            titleInput.hidden = true;
            titleNode.hidden = false;
          }
        });

        const pinBtn = el(
          "button",
          {
            class: "history-action " + (summary.pinned ? "active" : ""),
            type: "button",
            "aria-label": summary.pinned ? "Unpin session" : "Pin session",
            title: summary.pinned ? "Unpin" : "Pin",
            onclick: async () => {
              try {
                await sessionsApi.update(summary.id, { pinned: !summary.pinned });
                render();
              } catch (error) {
                console.warn(error);
              }
            }
          },
          [renderIcon("star")]
        );

        const exportBtn = el(
          "button",
          {
            class: "history-action",
            type: "button",
            "aria-label": "Export session",
            title: "Export",
            onclick: async () => {
              try {
                const full = await loadFull(summary.id);
                const txt = formatSessionExportText(full);
                downloadBlob(`${safeFilename(full.title)}.txt`, new Blob([txt], { type: "text/plain" }));
                downloadBlob(
                  `${safeFilename(full.title)}.json`,
                  new Blob([JSON.stringify(full, null, 2)], { type: "application/json" })
                );
              } catch (error) {
                console.warn(error);
              }
            }
          },
          [renderIcon("download")]
        );

        const deleteBtn = el(
          "button",
          {
            class: "history-action danger",
            type: "button",
            "aria-label": "Delete session",
            title: "Delete",
            onclick: async () => {
              if (!confirm(`Delete "${summary.title}"? This can't be undone.`)) return;
              try {
                await sessionsApi.delete(summary.id);
                render();
              } catch (error) {
                console.warn(error);
              }
            }
          },
          [renderIcon("trash")]
        );

        const openBtn = el(
          "button",
          {
            class: "history-open",
            type: "button",
            onclick: async () => {
              try {
                const full = await loadFull(summary.id);
                close({ openSession: full });
                onOpenSession?.(full);
              } catch (error) {
                console.warn(error);
              }
            }
          },
          ["Open"]
        );

        const snippet = snippetFor({ blocks: summary.blocks }, query);
        const snippetEl = snippet
          ? el("p", { class: "history-snippet" }, [...(query ? [highlight(snippet, query)] : [snippet])])
          : null;

        const modeBadge = el(
          "span",
          { class: `history-badge mode-${summary.mode}` },
          [summary.mode === "offline" ? "Offline" : "Online"]
        );

        return el("div", { class: "history-row" + (summary.pinned ? " pinned" : "") }, [
          el("div", { class: "history-row-main" }, [
            el("div", { class: "history-row-title" }, [titleNode, titleInput, modeBadge]),
            el("div", { class: "history-row-meta" }, [
              el("span", {}, [formatRelativeDate(summary.updatedAt)]),
              el("span", { class: "dot" }, ["•"]),
              el("span", {}, [`${summary.blockCount} block${summary.blockCount === 1 ? "" : "s"}`]),
              ...(summary.durationSeconds
                ? [el("span", { class: "dot" }, ["•"]), el("span", {}, [formatDuration(summary.durationSeconds)])]
                : [])
            ]),
            snippetEl
          ]),
          el("div", { class: "history-row-actions" }, [pinBtn, renameBtn, exportBtn, deleteBtn, openBtn])
        ]);
      }

      async function loadFull(id) {
        if (fullSessionCache.has(id)) return fullSessionCache.get(id);
        const session = await sessionsApi.get(id);
        fullSessionCache.set(id, session);
        return session;
      }

      render();
    }
  });
}

function renderIcon(name) {
  const paths = {
    star: "M12 3l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.7-5.2 2.7 1-5.9-4.3-4.2 5.9-.9z",
    pencil: "M4 20h4l10-10-4-4L4 16zM14 6l4 4",
    download: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
  };
  const span = el("span", { class: "button-icon", "aria-hidden": "true" });
  span.innerHTML = `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="${paths[name] || ""}" fill="${name === "star" ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
  return span;
}

function safeFilename(title) {
  const base = (title || "transcript").replace(/[^a-z0-9-_ ]/gi, "_").trim().slice(0, 60);
  return base || "transcript";
}
