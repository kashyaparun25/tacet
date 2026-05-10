import { loadSettings, saveSettings, markOnboarded, clearSettings } from "/settings.js";
import { el, openModal } from "/ui-helpers.js";

const DEEPGRAM_SIGNUP_URL = "https://console.deepgram.com/signup";

const WIZARD_STEPS = [
  {
    id: "welcome",
    render() {
      return {
        kicker: "Step 1 of 5",
        title: "Welcome to Tacet",
        body: el("div", { class: "wizard-body" }, [
          el("p", {}, [
            "Tacet turns any audio on your machine into a live transcript. Use it for meetings, lectures, interviews, or anything you want captioned in real time."
          ]),
          el("ul", { class: "wizard-bullets" }, [
            el("li", {}, ["Capture your microphone, system audio, or both"]),
            el("li", {}, ["See interim text update as people speak"]),
            el("li", {}, ["Stack final transcripts and copy them out"])
          ])
        ])
      };
    }
  },
  {
    id: "how-it-works",
    render() {
      return {
        kicker: "Step 2 of 5",
        title: "How it works",
        body: el("div", { class: "wizard-body" }, [
          el("ol", { class: "wizard-steps" }, [
            el("li", {}, [el("strong", {}, ["Pick your sources."]), " Toggle Microphone, System, or both in the left rail."]),
            el("li", {}, [el("strong", {}, ["Choose an engine."]), " Online (Deepgram) or Offline (on-device Nemotron)."]),
            el("li", {}, [el("strong", {}, ["Hit Start."]), " Captions appear in the right panel."]),
            el("li", {}, [el("strong", {}, ["Stop and copy."]), " Export the full transcript when done."])
          ])
        ])
      };
    }
  },
  {
    id: "engines",
    render() {
      const onlineCard = el("div", { class: "engine-card" }, [
        el("p", { class: "engine-card-tag" }, ["Online"]),
        el("strong", {}, ["Deepgram cloud"]),
        el("ul", {}, [
          el("li", {}, ["Lowest latency, very accurate"]),
          el("li", {}, ["Needs an API key (free tier available)"]),
          el("li", {}, ["Audio leaves your machine"])
        ])
      ]);
      const offlineCard = el("div", { class: "engine-card" }, [
        el("p", { class: "engine-card-tag" }, ["Offline"]),
        el("strong", {}, ["Nemotron on-device"]),
        el("ul", {}, [
          el("li", {}, ["No API key, fully private"]),
          el("li", {}, [el("strong", {}, ["~660 MB"]), " download on first use"]),
          el("li", {}, ["Make sure you have the disk space"])
        ])
      ]);

      return {
        kicker: "Step 3 of 5",
        title: "Two engines, one toggle",
        body: el("div", { class: "wizard-body" }, [
          el("p", {}, ["You can switch anytime with the toggle in the app's left rail. Pick whichever fits the moment."]),
          el("div", { class: "engine-grid" }, [onlineCard, offlineCard])
        ])
      };
    }
  },
  {
    id: "deepgram-key",
    render(ctx) {
      const settings = loadSettings();
      const input = el("input", {
        type: "password",
        class: "wizard-input",
        placeholder: "Paste your Deepgram API key",
        autocomplete: "off",
        spellcheck: "false",
        value: settings.deepgramApiKey || ""
      });

      const showHideButton = el(
        "button",
        {
          type: "button",
          class: "wizard-input-toggle",
          onclick: () => {
            input.type = input.type === "password" ? "text" : "password";
            showHideButton.textContent = input.type === "password" ? "Show" : "Hide";
          }
        },
        ["Show"]
      );

      ctx.beforeNext = () => {
        const value = input.value.trim();
        if (value) {
          saveSettings({ deepgramApiKey: value });
        }
      };

      return {
        kicker: "Step 4 of 5",
        title: "Connect Deepgram (for Online mode)",
        body: el("div", { class: "wizard-body" }, [
          el("p", {}, [
            "Online mode uses Deepgram. New accounts get free credits. You can skip this if you only plan to use Offline mode."
          ]),
          el("ol", { class: "wizard-steps" }, [
            el("li", {}, [
              "Sign up at ",
              el("a", { href: DEEPGRAM_SIGNUP_URL, target: "_blank", rel: "noopener" }, [
                "console.deepgram.com/signup"
              ])
            ]),
            el("li", {}, ["Open ", el("strong", {}, ["API Keys"]), " in the dashboard"]),
            el("li", {}, ["Create a key with ", el("strong", {}, ["Member"]), " role"]),
            el("li", {}, ["Paste it below"])
          ]),
          el("label", { class: "wizard-input-row" }, [
            el("span", { class: "wizard-input-label" }, ["Deepgram API key"]),
            el("div", { class: "wizard-input-wrap" }, [input, showHideButton])
          ]),
          el("p", { class: "wizard-hint" }, [
            "Your key stays on this device, in browser local storage. We send it to the local server only when starting Online captures."
          ])
        ])
      };
    }
  },
  {
    id: "tour",
    render(ctx) {
      ctx.finalStep = true;
      return {
        kicker: "Step 5 of 5",
        title: "You're set",
        body: el("div", { class: "wizard-body" }, [
          el("p", {}, [
            "Want a quick tour of the controls? It takes about 30 seconds and we'll point at each button."
          ]),
          el("p", { class: "wizard-hint" }, [
            "You can always replay it later from the help icon in the header."
          ])
        ])
      };
    }
  }
];

export function runWelcomeWizard() {
  return openModal({
    size: "lg",
    dismissable: false,
    render(dialog, close) {
      let stepIndex = 0;
      let stepCtx = {};

      const kickerEl = el("p", { class: "wizard-kicker" }, [""]);
      const titleEl = el("h2", { class: "wizard-title" }, [""]);
      const bodyEl = el("div", { class: "wizard-body-host" });
      const dotsEl = el("div", { class: "wizard-dots" }, [
        ...WIZARD_STEPS.map((_, i) => el("span", { class: "wizard-dot", "data-i": String(i) }))
      ]);

      const backBtn = el(
        "button",
        { class: "wizard-button ghost", type: "button", onclick: () => goTo(stepIndex - 1) },
        ["Back"]
      );
      const skipBtn = el(
        "button",
        { class: "wizard-button ghost", type: "button", onclick: () => finish({ tookTour: false }) },
        ["Skip"]
      );
      const nextBtn = el(
        "button",
        {
          class: "wizard-button primary",
          type: "button",
          onclick: () => {
            try {
              stepCtx.beforeNext?.();
            } catch (error) {
              console.warn(error);
            }
            if (stepCtx.finalStep) {
              finish({ tookTour: true });
              return;
            }
            goTo(stepIndex + 1);
          }
        },
        ["Next"]
      );

      const actions = el("div", { class: "wizard-actions" }, [backBtn, skipBtn, nextBtn]);

      dialog.appendChild(
        el("div", { class: "wizard-shell" }, [
          el("div", { class: "wizard-header" }, [kickerEl, titleEl]),
          bodyEl,
          el("div", { class: "wizard-footer" }, [dotsEl, actions])
        ])
      );

      function finish({ tookTour }) {
        markOnboarded();
        close({ tookTour });
      }

      function goTo(index) {
        if (index < 0) return;
        if (index >= WIZARD_STEPS.length) {
          finish({ tookTour: false });
          return;
        }

        stepIndex = index;
        stepCtx = {};
        const step = WIZARD_STEPS[index];
        const out = step.render(stepCtx);

        kickerEl.textContent = out.kicker;
        titleEl.textContent = out.title;
        bodyEl.replaceChildren(out.body);

        Array.from(dotsEl.children).forEach((dot, i) => {
          dot.classList.toggle("active", i === index);
          dot.classList.toggle("done", i < index);
        });

        backBtn.style.visibility = index === 0 ? "hidden" : "visible";
        nextBtn.textContent = stepCtx.finalStep ? "Take the tour" : "Next";
        skipBtn.textContent = stepCtx.finalStep ? "Skip tour" : "Skip";
      }

      goTo(0);
    }
  });
}

const TOUR_STEPS = [
  {
    selector: "#modeOnlineButton",
    title: "Pick your engine",
    body: "Switch between Online (Deepgram) and Offline (on-device Nemotron) here. The toggle locks while captions are running."
  },
  {
    selector: "#micButton",
    title: "Microphone",
    body: "Click to grant mic access. Your browser will ask once. Click again later to mute or unmute."
  },
  {
    selector: "#systemButton",
    title: "System audio",
    body: "Capture audio from a tab, window, or your whole screen. On macOS you may need to grant Screen Recording permission."
  },
  {
    selector: "#startButton",
    title: "Start captions",
    body: "Pick at least one source above, then hit play. Live transcripts appear on the right."
  },
  {
    selector: "#transcriptFeed",
    title: "Transcript feed",
    body: "Final blocks stack here as people pause. Each block has its own copy button."
  },
  {
    selector: "#copyAllButton",
    title: "Copy everything",
    body: "Export the whole session formatted with timestamps and meta. Great for pasting into notes."
  }
];

function getRect(target) {
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height
  };
}

function placeTooltip(tooltip, rect) {
  const margin = 12;
  tooltip.style.position = "fixed";
  tooltip.style.maxWidth = "320px";

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const tipRect = tooltip.getBoundingClientRect();
  const tipWidth = tipRect.width || 280;
  const tipHeight = tipRect.height || 140;

  let top = rect.top + rect.height + margin - window.scrollY;
  if (top + tipHeight + margin > viewportHeight) {
    top = rect.top - tipHeight - margin - window.scrollY;
  }
  if (top < margin) {
    top = margin;
  }

  let left = rect.left + rect.width / 2 - tipWidth / 2 - window.scrollX;
  if (left + tipWidth + margin > viewportWidth) {
    left = viewportWidth - tipWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

export function runTour() {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "tour-overlay" });
    const spotlight = el("div", { class: "tour-spotlight" });
    const tooltip = el("div", { class: "tour-tooltip", role: "dialog", "aria-modal": "true" });
    const titleEl = el("h3", { class: "tour-tooltip-title" }, [""]);
    const bodyEl = el("p", { class: "tour-tooltip-body" }, [""]);
    const stepLabel = el("span", { class: "tour-step-label" }, [""]);
    const skipBtn = el(
      "button",
      { class: "tour-button ghost", type: "button", onclick: () => end() },
      ["Skip tour"]
    );
    const nextBtn = el(
      "button",
      { class: "tour-button primary", type: "button", onclick: () => goNext() },
      ["Next"]
    );

    tooltip.append(
      stepLabel,
      titleEl,
      bodyEl,
      el("div", { class: "tour-actions" }, [skipBtn, nextBtn])
    );

    document.body.append(overlay, spotlight, tooltip);

    let index = 0;
    let raised = null;

    function clearRaised() {
      if (raised) {
        raised.classList.remove("tour-target-raised");
        raised = null;
      }
    }

    function update() {
      const step = TOUR_STEPS[index];
      const target = document.querySelector(step.selector);
      if (!target) {
        goNext();
        return;
      }

      clearRaised();
      raised = target;
      target.classList.add("tour-target-raised");
      target.scrollIntoView({ block: "center", behavior: "smooth" });

      const rect = getRect(target);
      Object.assign(spotlight.style, {
        position: "fixed",
        top: `${rect.top - window.scrollY - 6}px`,
        left: `${rect.left - window.scrollX - 6}px`,
        width: `${rect.width + 12}px`,
        height: `${rect.height + 12}px`
      });

      stepLabel.textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;
      titleEl.textContent = step.title;
      bodyEl.textContent = step.body;
      nextBtn.textContent = index === TOUR_STEPS.length - 1 ? "Done" : "Next";

      requestAnimationFrame(() => placeTooltip(tooltip, rect));
    }

    function goNext() {
      index += 1;
      if (index >= TOUR_STEPS.length) {
        end();
        return;
      }
      update();
    }

    function end() {
      clearRaised();
      overlay.remove();
      spotlight.remove();
      tooltip.remove();
      window.removeEventListener("resize", update);
      document.removeEventListener("keydown", onKeydown);
      resolve();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        end();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener("resize", update);
    document.addEventListener("keydown", onKeydown);

    update();
  });
}

export function runSettingsModal() {
  return openModal({
    size: "md",
    dismissable: true,
    render(dialog, close) {
      const settings = loadSettings();

      const input = el("input", {
        type: "password",
        class: "wizard-input",
        placeholder: "Deepgram API key",
        autocomplete: "off",
        spellcheck: "false",
        value: settings.deepgramApiKey || ""
      });

      const showHideButton = el(
        "button",
        {
          type: "button",
          class: "wizard-input-toggle",
          onclick: () => {
            input.type = input.type === "password" ? "text" : "password";
            showHideButton.textContent = input.type === "password" ? "Show" : "Hide";
          }
        },
        ["Show"]
      );

      const status = el("p", { class: "wizard-hint" }, [""]);

      const body = el("div", { class: "wizard-body" }, [
        el("p", {}, ["Update your Deepgram API key, replay the welcome tour, or reset everything."]),
        el("label", { class: "wizard-input-row" }, [
          el("span", { class: "wizard-input-label" }, ["Deepgram API key"]),
          el("div", { class: "wizard-input-wrap" }, [input, showHideButton])
        ]),
        el("p", { class: "wizard-hint" }, [
          "Get one at ",
          el("a", { href: DEEPGRAM_SIGNUP_URL, target: "_blank", rel: "noopener" }, ["deepgram.com"])
        ]),
        status
      ]);

      const replayTourBtn = el(
        "button",
        {
          class: "wizard-button ghost",
          type: "button",
          onclick: async () => {
            close({ replayTour: true });
          }
        },
        ["Replay tour"]
      );

      const resetBtn = el(
        "button",
        {
          class: "wizard-button ghost danger",
          type: "button",
          onclick: () => {
            if (!confirm("Reset all settings and replay the welcome screen?")) return;
            clearSettings();
            close({ reset: true });
          }
        },
        ["Reset"]
      );

      const cancelBtn = el(
        "button",
        { class: "wizard-button ghost", type: "button", onclick: () => close({ saved: false }) },
        ["Cancel"]
      );

      const saveBtn = el(
        "button",
        {
          class: "wizard-button primary",
          type: "button",
          onclick: () => {
            saveSettings({ deepgramApiKey: input.value.trim() });
            close({ saved: true });
          }
        },
        ["Save"]
      );

      dialog.appendChild(
        el("div", { class: "wizard-shell" }, [
          el("div", { class: "wizard-header" }, [
            el("p", { class: "wizard-kicker" }, ["Settings"]),
            el("h2", { class: "wizard-title" }, ["Tacet preferences"])
          ]),
          el("div", { class: "wizard-body-host" }, [body]),
          el("div", { class: "wizard-footer" }, [
            el("div", { class: "wizard-actions left" }, [replayTourBtn, resetBtn]),
            el("div", { class: "wizard-actions" }, [cancelBtn, saveBtn])
          ])
        ])
      );
    }
  });
}
