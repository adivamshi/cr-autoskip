const $ = (id) => document.getElementById(id);

const els = {
    master: $("toggleMaster"),
    intro: $("toggleIntro"),
    recap: $("toggleRecap"),
    credits: $("toggleCredits"),
    group: $("featureGroup"),
    status: $("status"),
};

const DEFAULTS = {
    crAutoSkipEnabled: true,
    crSkipIntro: true,
    crSkipRecap: true,
    crSkipCredits: true,
};

// Load settings into UI
chrome.storage.sync.get(DEFAULTS, (cfg) => {
    els.master.checked = !!cfg.crAutoSkipEnabled;
    els.intro.checked = !!cfg.crSkipIntro;
    els.recap.checked = !!cfg.crSkipRecap;
    els.credits.checked = !!cfg.crSkipCredits;
    applyDisabled();
    updateStatus();
});

// Save handlers
els.master.addEventListener("change", () => {
    const on = els.master.checked;
    chrome.storage.sync.set({ crAutoSkipEnabled: on }, () => {
        applyDisabled();
        updateStatus();
    });
});

[els.intro, els.recap, els.credits].forEach((box, i) => {
    box.addEventListener("change", () => {
        const key = i === 0 ? "crSkipIntro" : i === 1 ? "crSkipRecap" : "crSkipCredits";
        chrome.storage.sync.set({ [key]: box.checked }, updateStatus);
    });
});

function applyDisabled() {
    const disabled = !els.master.checked;
    els.group.classList.toggle("disabled", disabled);
    [els.intro, els.recap, els.credits].forEach(el => { el.disabled = disabled; });
}

function updateStatus() {
    const on = els.master.checked;
    const parts = [];
    if (on) {
        if (els.intro.checked) parts.push("Intro");
        if (els.recap.checked) parts.push("Recap");
        if (els.credits.checked) parts.push("Credits");
        els.status.textContent = parts.length
            ? `Auto-skip enabled for: ${parts.join(", ")}`
            : "Auto-skip is on, but all features are disabled.";
    } else {
        els.status.textContent = "Auto-skip is disabled.";
    }
}
