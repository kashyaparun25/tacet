export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") {
      node.className = value;
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "hidden") {
      if (value) node.hidden = true;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children).flat()) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  });
  first.focus();
}

export function openModal({ size = "md", dismissable = true, render }) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "modal-overlay", role: "dialog", "aria-modal": "true" });
    const dialog = el("div", { class: `modal-dialog modal-${size}` });
    overlay.appendChild(dialog);

    let resolved = false;
    const close = (value) => {
      if (resolved) return;
      resolved = true;
      overlay.classList.add("modal-leave");
      overlay.addEventListener(
        "animationend",
        () => {
          overlay.remove();
          resolve(value);
        },
        { once: true }
      );
    };

    if (dismissable) {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close({ dismissed: true });
      });
      const escHandler = (event) => {
        if (event.key === "Escape") {
          document.removeEventListener("keydown", escHandler);
          close({ dismissed: true });
        }
      };
      document.addEventListener("keydown", escHandler);
    }

    document.body.appendChild(overlay);
    render(dialog, close);
    requestAnimationFrame(() => trapFocus(dialog));
  });
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
