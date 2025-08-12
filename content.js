(() => {
    "use strict";

    // ===== Config =====
    const DEBUG = false;           // set to true if you want outlines/logs while testing
    const SCAN_INTERVAL_MS = 500;

    // Feature flags (loaded from storage)
    let enabled = true;
    let allowIntro = true;
    let allowRecap = true;
    let allowCredits = true;

    let lastUrl = location.href;

    const TERMS = {
        intro: ["intro", "opening"],
        recap: ["recap"],
        credits: ["credits", "ending", "outro"], // treat all as "credits" toggle
    };

    // ===== Utils =====
    const isVisible = (el) => {
        if (!el || !el.isConnected) return false;
        const r = el.getBoundingClientRect?.();
        const s = window.getComputedStyle?.(el);
        if (!r || !s) return false;
        if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
        return r.width > 0 && r.height > 0;
    };

    const labelish = (el) => {
        return [
            el?.textContent || "",
            el?.getAttribute?.("aria-label") || "",
            el?.getAttribute?.("title") || "",
            el?.dataset?.testid || "",
            el?.getAttribute?.("data-testid") || ""
        ].join(" ").toLowerCase();
    };

    const mark = (el) => {
        if (!DEBUG || !el || !el.style) return;
        el.style.outline = "2px solid #00e676";
        el.style.outlineOffset = "2px";
    };

    const whichKind = (textLower) => {
        // Returns "intro" | "recap" | "credits" | null based on the text
        if (TERMS.intro.some(k => textLower.includes(k))) return "intro";
        if (TERMS.recap.some(k => textLower.includes(k))) return "recap";
        if (TERMS.credits.some(k => textLower.includes(k))) return "credits";
        return null;
    };

    const allowedByToggle = (kind) => {
        if (kind === "intro") return allowIntro;
        if (kind === "recap") return allowRecap;
        if (kind === "credits") return allowCredits;
        // If we couldn't determine the kind, be conservative: require any enabled
        return allowIntro || allowRecap || allowCredits;
    };

    const clickBtn = (el) => {
        if (!enabled || !el) return false;
        const btn = el.closest?.("button,[role='button'],a,[tabindex]") || el;
        if (!isVisible(btn) || btn.disabled) return false;

        // Only click if the label matches an enabled kind
        const t = labelish(btn);
        if (!t.includes("skip")) return false;
        const kind = whichKind(t);
        if (!allowedByToggle(kind)) return false;

        try {
            if (DEBUG) console.debug("[CR Auto Skip] Clicking:", kind, "=>", t);
            mark(btn);
            btn.click();
            return true;
        } catch (e) {
            if (DEBUG) console.warn("[CR Auto Skip] Click failed:", e);
            return false;
        }
    };

    // Walk document + open shadow roots
    const roots = () => {
        const list = [document];
        document.querySelectorAll("*").forEach(n => { if (n.shadowRoot) list.push(n.shadowRoot); });
        return list;
    };

    // Core scan
    const scanOnce = () => {
        if (!enabled) return;

        // 1) aria-label based buttons (case-insensitive attribute match)
        for (const root of roots()) {
            const labeled = root.querySelectorAll?.('[role="button"][aria-label*="skip" i]') || [];
            for (const el of labeled) {
                if (clickBtn(el)) return;
            }
        }

        // 2) inner label node (data-testid="skipIntroText" seen on Crunchyroll)
        for (const root of roots()) {
            const labels = root.querySelectorAll?.('[data-testid="skipIntroText"]') || [];
            for (const lbl of labels) {
                const t = (lbl.textContent || "").toLowerCase();
                if (t.includes("skip")) {
                    const btn = lbl.closest('[role="button"],button,[tabindex]');
                    if (btn && clickBtn(btn)) return;
                }
            }
        }

        // 3) Fallback heuristic over any button-ish element
        for (const root of roots()) {
            const candidates = root.querySelectorAll?.("button, [role='button'], a, [tabindex]") || [];
            for (const el of candidates) {
                const t = labelish(el);
                if (t.includes("skip") && clickBtn(el)) return;
            }
        }
    };

    // Observe dynamic UI changes
    const observer = new MutationObserver(() => scanOnce());
    const startObserver = () => {
        if (!document.body) return;
        observer.observe(document.body, { childList: true, subtree: true });
    };

    // Handle SPA URL changes
    const watchUrl = () => {
        const tick = () => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                setTimeout(scanOnce, 300);
            }
            setTimeout(tick, 1000);
        };
        tick();
    };

    // Load settings (with backward-compat for old single-flag users)
    const loadSettings = () => new Promise((resolve) => {
        const defaults = {
            crAutoSkipEnabled: true,
            crSkipIntro: true,
            crSkipRecap: true,
            crSkipCredits: true,
        };
        try {
            chrome.storage.sync.get(defaults, (cfg) => {
                enabled = !!cfg.crAutoSkipEnabled;
                allowIntro = !!cfg.crSkipIntro;
                allowRecap = !!cfg.crSkipRecap;
                allowCredits = !!cfg.crSkipCredits;
                resolve();
            });
        } catch {
            enabled = allowIntro = allowRecap = allowCredits = true;
            resolve();
        }
    });

    // Live updates from popup
    const wireStorageChanges = () => {
        chrome.storage?.onChanged?.addListener((changes, area) => {
            if (area !== "sync") return;
            if (changes.crAutoSkipEnabled) enabled = !!changes.crAutoSkipEnabled.newValue;
            if (changes.crSkipIntro) allowIntro = !!changes.crSkipIntro.newValue;
            if (changes.crSkipRecap) allowRecap = !!changes.crSkipRecap.newValue;
            if (changes.crSkipCredits) allowCredits = !!changes.crSkipCredits.newValue;
            // If something turned on, scan immediately
            if (enabled && (changes.crAutoSkipEnabled || changes.crSkipIntro || changes.crSkipRecap || changes.crSkipCredits)) {
                scanOnce();
            }
        });
    };

    // Expose manual scan in debug builds
    if (DEBUG) {
        window.__crAutoSkip = {
            scan: () => { console.debug("[CR Auto Skip] manual scan"); scanOnce(); },
            state: () => ({ enabled, allowIntro, allowRecap, allowCredits })
        };
    }

    const init = async () => {
        await loadSettings();
        startObserver();
        setInterval(scanOnce, SCAN_INTERVAL_MS);
        watchUrl();
        scanOnce();
        wireStorageChanges();
        if (DEBUG) console.debug("[CR Auto Skip] Loaded in", location.href);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
