/* ChatSpark - self-contained browser chat frontend for OpenAI-compatible APIs. */
(() => {
"use strict";

/* ==========================================================================
 * Utilities
 * ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);

function uid(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}

function formatTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function joinUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + path;
}

function normalizeBaseUrl(url) {
    let u = String(url || "").trim().replace(/\/+$/, "");
    // Users often paste the full chat completions URL; strip it back to the base.
    u = u.replace(/\/chat\/completions$/, "");
    return u;
}

/* Message content can be a plain string or an OpenAI content-part array. */
function messageText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content.filter(p => p && p.type === "text").map(p => p.text).join("\n");
    }
    return "";
}

function messageImages(content) {
    if (!Array.isArray(content)) return [];
    return content
        .filter(p => p && p.type === "image_url" && p.image_url && p.image_url.url)
        .map(p => p.image_url.url);
}

/* ==========================================================================
 * Toasts, dialogs and popup menus (replacements for alert/prompt/confirm)
 * ========================================================================== */

function toast(message, type = "info", duration = 3500) {
    const container = $("#toast-container");
    const el = document.createElement("div");
    el.className = "toast" + (type !== "info" ? " " + type : "");
    el.textContent = message;
    container.appendChild(el);
    if (type === "error") duration = Math.max(duration, 5000);
    setTimeout(() => el.remove(), duration);
}

function baseDialog(innerHTML) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const content = document.createElement("div");
    content.className = "modal-content dialog-content";
    content.innerHTML = innerHTML;
    overlay.appendChild(content);
    $("#dialog-root").appendChild(overlay);
    return { overlay, content, close: () => overlay.remove() };
}

function confirmDialog(message, { title = "Confirm", confirmLabel = "OK", danger = false } = {}) {
    return new Promise(resolve => {
        const d = baseDialog(`
            <h3>${escapeHTML(title)}</h3>
            <p class="dialog-message">${escapeHTML(message)}</p>
            <div class="dialog-buttons">
                <button class="secondary-btn dialog-cancel">Cancel</button>
                <button class="${danger ? "danger-btn" : "primary-btn"} dialog-ok">${escapeHTML(confirmLabel)}</button>
            </div>`);
        const done = (val) => { d.close(); document.removeEventListener("keydown", onKey); resolve(val); };
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); done(false); }
            if (e.key === "Enter") { e.stopPropagation(); done(true); }
        };
        document.addEventListener("keydown", onKey);
        d.content.querySelector(".dialog-ok").addEventListener("click", () => done(true));
        d.content.querySelector(".dialog-cancel").addEventListener("click", () => done(false));
        d.overlay.addEventListener("click", (e) => { if (e.target === d.overlay) done(false); });
        d.content.querySelector(".dialog-ok").focus();
    });
}

/* Returns the entered string, or null if cancelled. */
function textDialog({ title = "", message = "", value = "", multiline = false, placeholder = "", confirmLabel = "Save" } = {}) {
    return new Promise(resolve => {
        const field = multiline
            ? `<textarea class="dialog-field" placeholder="${escapeHTML(placeholder)}"></textarea>`
            : `<input type="text" class="dialog-field" placeholder="${escapeHTML(placeholder)}">`;
        const d = baseDialog(`
            <h3>${escapeHTML(title)}</h3>
            ${message ? `<p class="dialog-message">${escapeHTML(message)}</p>` : ""}
            ${field}
            <div class="dialog-buttons">
                <button class="secondary-btn dialog-cancel">Cancel</button>
                <button class="primary-btn dialog-ok">${escapeHTML(confirmLabel)}</button>
            </div>`);
        const input = d.content.querySelector(".dialog-field");
        input.value = value;
        const done = (val) => { d.close(); document.removeEventListener("keydown", onKey); resolve(val); };
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); done(null); }
            if (e.key === "Enter" && !multiline) { e.stopPropagation(); e.preventDefault(); done(input.value); }
        };
        document.addEventListener("keydown", onKey);
        d.content.querySelector(".dialog-ok").addEventListener("click", () => done(input.value));
        d.content.querySelector(".dialog-cancel").addEventListener("click", () => done(null));
        d.overlay.addEventListener("click", (e) => { if (e.target === d.overlay) done(null); });
        input.focus();
        if (!multiline) input.select();
    });
}

/* Popup menu anchored to an element. items: [{label, selected, onClick}] */
function showMenu(anchorEl, items) {
    document.querySelectorAll(".popup-menu").forEach(m => m.remove());
    const menu = document.createElement("div");
    menu.className = "popup-menu";
    items.forEach(item => {
        const el = document.createElement("div");
        el.className = "popup-menu-item" + (item.selected ? " selected" : "");
        el.textContent = item.label;
        el.addEventListener("click", () => { menu.remove(); item.onClick(); });
        menu.appendChild(el);
    });
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = rect.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
    let left = rect.left;
    if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    setTimeout(() => {
        document.addEventListener("click", function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener("click", closeMenu);
            }
        });
    }, 0);
}

/* ==========================================================================
 * Storage: IndexedDB for conversations (with localStorage fallback/migration)
 * ========================================================================== */

const Store = (() => {
    const DB_NAME = "chatspark";
    const STORE = "conversations";
    let dbPromise = null;
    let fallbackToLocalStorage = false;

    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                let req;
                try {
                    req = indexedDB.open(DB_NAME, 1);
                } catch (e) {
                    reject(e);
                    return;
                }
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE)) {
                        db.createObjectStore(STORE, { keyPath: "id" });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    }

    function idb(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function init() {
        try {
            await open();
        } catch (e) {
            console.warn("IndexedDB unavailable, falling back to localStorage:", e);
            fallbackToLocalStorage = true;
        }
        return !fallbackToLocalStorage;
    }

    async function getAll() {
        if (fallbackToLocalStorage) {
            const raw = JSON.parse(localStorage.getItem("conversations") || "{}");
            return Object.values(raw);
        }
        const db = await open();
        return idb(db.transaction(STORE).objectStore(STORE).getAll());
    }

    async function put(conv) {
        if (fallbackToLocalStorage) {
            const raw = JSON.parse(localStorage.getItem("conversations") || "{}");
            raw[conv.id] = conv;
            localStorage.setItem("conversations", JSON.stringify(raw));
            return;
        }
        const db = await open();
        // Strip any transient fields before persisting.
        return idb(db.transaction(STORE, "readwrite").objectStore(STORE).put(conv));
    }

    async function remove(id) {
        if (fallbackToLocalStorage) {
            const raw = JSON.parse(localStorage.getItem("conversations") || "{}");
            delete raw[id];
            localStorage.setItem("conversations", JSON.stringify(raw));
            return;
        }
        const db = await open();
        return idb(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
    }

    async function count() {
        if (fallbackToLocalStorage) {
            const raw = JSON.parse(localStorage.getItem("conversations") || "{}");
            return Object.keys(raw).length;
        }
        const db = await open();
        return idb(db.transaction(STORE).objectStore(STORE).count());
    }

    async function clear() {
        if (fallbackToLocalStorage) {
            localStorage.removeItem("conversations");
            return;
        }
        const db = await open();
        return idb(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
    }

    return { init, getAll, put, remove, count, clear, get usingFallback() { return fallbackToLocalStorage; } };
})();

/* ==========================================================================
 * App state
 * ========================================================================== */

const DEFAULT_SETTINGS = {
    chatWidth: "800",
    chatHeight: "80",
    chatFontSize: "16",
    sendOnEnter: true,
    systemPrompt: "",
    temperature: "",
    maxTokens: "",
    activeConnectionId: null,
    activeModel: null,
};

const TITLE_PROMPT = `Generate a single, specific title for this chat from the existing conversation context.

Rules:
- ≤8 words and ≤60 characters
- Title Case (capitalize principal words)
- No emojis, quotes, brackets, hashtags, markdown, or code fences
- No trailing punctuation
- Avoid generic titles like "Chat", "Conversation", "General", "Discussion"

Return ONLY the title text with nothing else.`;

let conversations = {};        // id -> conversation
let currentConversationId = null;
let folders = {};              // id -> {id, name, conversations: []}
let currentFolderId = null;
let connections = [];          // [{id, name, baseUrl, apiKey, models: []}]
let settings = { ...DEFAULT_SETTINGS };
let pendingAttachments = [];   // [{dataUrl, name}]
let streamState = null;        // {controller} while a response is streaming
let searchQuery = "";
let editingDraft = null;       // connection being edited in settings
let streamRenderTimer = null;

/* DOM references */
let chatHistoryEl, chatForm, inputEl, submitBtn, stopBtn, attachBtn, imageInput,
    attachmentStrip, tokenEstimateEl, chatTitleEl, modelPicker, settingsModal,
    conversationListEl, folderListEl, sidebar, sidebarClosed;

/* ==========================================================================
 * Settings & connections (localStorage)
 * ========================================================================== */

function loadSettings() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem("sparkSettings") || "{}"); } catch (e) { /* corrupted -> defaults */ }
    settings = { ...DEFAULT_SETTINGS, ...stored };

    // Migrate pre-refactor appearance keys.
    if (!localStorage.getItem("sparkSettings")) {
        for (const [oldKey, newKey] of [["chatWidth", "chatWidth"], ["chatHeight", "chatHeight"], ["chatFontSize", "chatFontSize"]]) {
            const v = localStorage.getItem(oldKey);
            if (v) settings[newKey] = v;
        }
    }

    try { connections = JSON.parse(localStorage.getItem("connections") || "[]"); } catch (e) { connections = []; }
    if (!Array.isArray(connections)) connections = [];
    migrateLegacyModels();
    validateActiveModel();
}

function saveSettings() {
    localStorage.setItem("sparkSettings", JSON.stringify(settings));
}

function saveConnections() {
    localStorage.setItem("connections", JSON.stringify(connections));
}

/* Pre-refactor "models" were {name, apiUrl, apiKey} where name doubled as the
 * model id. Convert them into connections grouped by endpoint. */
function migrateLegacyModels() {
    if (connections.length) return;
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem("models") || "null"); } catch (e) { return; }
    if (!Array.isArray(legacy) || !legacy.length) return;

    const groups = new Map();
    for (const m of legacy) {
        if (!m || !m.apiUrl) continue;
        const baseUrl = normalizeBaseUrl(m.apiUrl);
        const key = baseUrl + "|" + (m.apiKey || "");
        if (!groups.has(key)) groups.set(key, { baseUrl, apiKey: m.apiKey || "", models: [] });
        if (m.name && !groups.get(key).models.includes(m.name)) groups.get(key).models.push(m.name);
    }

    let i = 1;
    for (const g of groups.values()) {
        let name;
        try { name = new URL(g.baseUrl).host; } catch (e) { name = "Connection " + i; }
        connections.push({ id: uid("conn"), name, baseUrl: g.baseUrl, apiKey: g.apiKey, models: g.models });
        i++;
    }
    saveConnections();

    const oldActive = localStorage.getItem("activeModel");
    if (oldActive) {
        const conn = connections.find(c => c.models.includes(oldActive));
        if (conn) {
            settings.activeConnectionId = conn.id;
            settings.activeModel = oldActive;
        }
    }
    saveSettings();
    localStorage.setItem("models_backup_v1", localStorage.getItem("models"));
    localStorage.removeItem("models");
    localStorage.removeItem("activeModel");
}

/* Ensure the active connection/model still exist; otherwise pick the first available. */
function validateActiveModel() {
    const conn = connections.find(c => c.id === settings.activeConnectionId);
    if (conn && conn.models.includes(settings.activeModel)) return;
    const first = connections.find(c => c.models.length);
    settings.activeConnectionId = first ? first.id : null;
    settings.activeModel = first ? first.models[0] : null;
    saveSettings();
}

function getActive() {
    const conn = connections.find(c => c.id === settings.activeConnectionId) || null;
    const model = conn && conn.models.includes(settings.activeModel) ? settings.activeModel : null;
    return { conn, model };
}

/* ==========================================================================
 * Legacy conversation migration (localStorage -> IndexedDB)
 * ========================================================================== */

async function migrateLegacyConversations() {
    if (Store.usingFallback) return;
    const legacyRaw = localStorage.getItem("conversations");
    if (!legacyRaw) return;
    try {
        const existing = await Store.count();
        if (existing === 0) {
            const legacy = JSON.parse(legacyRaw);
            if (legacy && typeof legacy === "object") {
                for (const conv of Object.values(legacy)) {
                    if (!conv || !conv.id) continue;
                    const m = String(conv.id).match(/conv_(\d+)_/);
                    const createdAt = m ? parseInt(m[1], 10) : Date.now();
                    conv.createdAt = conv.createdAt || createdAt;
                    conv.updatedAt = conv.updatedAt || createdAt;
                    (conv.messages || []).forEach((msg, i) => {
                        if (!msg.ts) msg.ts = createdAt + i;
                    });
                    await Store.put(conv);
                }
            }
        }
        localStorage.setItem("conversations_backup_v1", legacyRaw);
        localStorage.removeItem("conversations");
    } catch (e) {
        console.error("Conversation migration failed:", e);
    }
}

/* ==========================================================================
 * API client
 * ========================================================================== */

function apiHeaders(conn) {
    return {
        "Content-Type": "application/json",
        ...(conn.apiKey ? { "Authorization": "Bearer " + conn.apiKey } : {}),
    };
}

function buildPayloadOptions() {
    const opts = {};
    if (settings.temperature !== "" && settings.temperature !== null && !isNaN(Number(settings.temperature))) {
        opts.temperature = Number(settings.temperature);
    }
    if (settings.maxTokens !== "" && settings.maxTokens !== null && Number(settings.maxTokens) > 0) {
        opts.max_tokens = Math.floor(Number(settings.maxTokens));
    }
    return opts;
}

async function readApiError(response) {
    let detail = "";
    try {
        const body = await response.json();
        detail = (body.error && body.error.message) || body.message || "";
    } catch (e) { /* non-JSON body */ }
    return `HTTP ${response.status} ${response.statusText}${detail ? " — " + detail : ""}`;
}

/* Streaming chat completion. onDelta receives the accumulated text so far. */
async function streamChatCompletion(conn, model, messages, { signal, onDelta } = {}) {
    const payload = { model, messages, stream: true, ...buildPayloadOptions() };
    const response = await fetch(joinUrl(conn.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: apiHeaders(conn),
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) throw new Error(await readApiError(response));

    const ctype = response.headers.get("content-type") || "";
    if (!ctype.includes("event-stream")) {
        // Server ignored stream:true; fall back to a regular JSON response.
        const data = await response.json();
        const text = data.choices && data.choices[0] && data.choices[0].message
            ? (data.choices[0].message.content || "") : "";
        if (onDelta && text) onDelta(text);
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") return full;
            try {
                const json = JSON.parse(data);
                const choice = json.choices && json.choices[0];
                const delta = choice && ((choice.delta && choice.delta.content) ||
                    (choice.message && choice.message.content)) || "";
                if (delta) {
                    full += delta;
                    if (onDelta) onDelta(full);
                }
            } catch (e) { /* ignore malformed keep-alive lines */ }
        }
    }
    return full;
}

/* Non-streaming completion (used for title generation). */
async function chatCompletion(conn, model, messages) {
    const payload = { model, messages, stream: false };
    const response = await fetch(joinUrl(conn.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: apiHeaders(conn),
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const data = await response.json();
    return data.choices && data.choices[0] && data.choices[0].message
        ? (data.choices[0].message.content || "") : "";
}

async function fetchModelList(baseUrl, apiKey) {
    const response = await fetch(joinUrl(normalizeBaseUrl(baseUrl), "/models"), {
        headers: apiKey ? { "Authorization": "Bearer " + apiKey } : {},
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const data = await response.json();
    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
    return list.map(m => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean).sort();
}

/* ==========================================================================
 * Markdown rendering
 * ========================================================================== */

if (window.marked) {
    marked.use({ breaks: true, gfm: true });
}

function renderMarkdown(text) {
    const src = text == null ? "" : String(text);
    if (window.marked && window.DOMPurify) {
        return DOMPurify.sanitize(marked.parse(src));
    }
    // Fallback: escape and handle code fences only. Code blocks are extracted
    // first so their newlines survive the <br> pass on the remaining text.
    const codeBlocks = [];
    const withPlaceholders = src.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
        codeBlocks.push(`<pre${lang ? ` data-lang="${lang}"` : ""}><code>${escapeHTML(code)}</code></pre>`);
        return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
    });
    return escapeHTML(withPlaceholders)
        .replace(/\n/g, "<br>")
        .replace(/@@CODEBLOCK(\d+)@@/g, (m, i) => codeBlocks[Number(i)]);
}

function enhanceRenderedContent(container) {
    container.querySelectorAll("a").forEach(a => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    });
    container.querySelectorAll("pre").forEach(pre => {
        const code = pre.querySelector("code");
        if (code) {
            const m = code.className.match(/language-([\w+-]+)/);
            if (m) pre.dataset.lang = m[1];
            if (window.hljs && m && hljs.getLanguage(m[1])) {
                try { hljs.highlightElement(code); } catch (e) { /* keep plain */ }
            }
        }
        const btn = document.createElement("button");
        btn.className = "copy-code-btn";
        btn.textContent = "Copy";
        btn.addEventListener("click", () => {
            navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
            btn.textContent = "Copied!";
            setTimeout(() => (btn.textContent = "Copy"), 2000);
        });
        pre.appendChild(btn);
    });
}

/* ==========================================================================
 * Chat rendering
 * ========================================================================== */

function currentConv() {
    return currentConversationId ? conversations[currentConversationId] : null;
}

function renderChatHistory() {
    const conv = currentConv();
    chatHistoryEl.innerHTML = "";
    if (!conv) return;
    conv.messages.forEach((msg, index) => {
        chatHistoryEl.appendChild(createMessageElement(msg, index));
    });
    updateTokenEstimate();
}

function createMessageElement(msg, index) {
    const role = String(msg.role || "assistant").toLowerCase();
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", role);

    const content = document.createElement("div");
    content.classList.add("message-content");

    const images = messageImages(msg.content);
    if (images.length) {
        const imagesEl = document.createElement("div");
        imagesEl.className = "message-images";
        images.forEach(url => {
            const img = document.createElement("img");
            img.src = url;
            img.alt = "attached image";
            img.addEventListener("click", () => img.classList.toggle("expanded"));
            imagesEl.appendChild(img);
        });
        content.appendChild(imagesEl);
    }

    const textEl = document.createElement("div");
    textEl.className = "message-text";
    const text = messageText(msg.content);
    if (role === "assistant") {
        textEl.innerHTML = renderMarkdown(text);
        enhanceRenderedContent(textEl);
    } else {
        textEl.textContent = text;
    }
    content.appendChild(textEl);

    const meta = document.createElement("div");
    meta.className = "message-meta";
    if (role === "assistant" && msg.model) {
        const tag = document.createElement("span");
        tag.className = "model-tag";
        tag.textContent = msg.model;
        meta.appendChild(tag);
    }
    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = formatTime(msg.ts);
    meta.appendChild(time);
    content.appendChild(meta);

    messageElement.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    if (role === "user") {
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.title = "Edit and resend";
        editBtn.addEventListener("click", () => startEditMessage(index));
        actions.appendChild(editBtn);
    }
    if (role === "assistant") {
        const copyBtn = document.createElement("button");
        copyBtn.textContent = "Copy";
        copyBtn.title = "Copy message text";
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(messageText(msg.content));
            toast("Copied to clipboard");
        });
        actions.appendChild(copyBtn);

        const regenBtn = document.createElement("button");
        regenBtn.textContent = "Regenerate";
        regenBtn.title = "Regenerate this response with the active model";
        regenBtn.addEventListener("click", () => regenerateMessage(index));
        actions.appendChild(regenBtn);
    }
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.title = "Delete message";
    deleteBtn.addEventListener("click", () => deleteMessage(index));
    actions.appendChild(deleteBtn);

    messageElement.appendChild(actions);
    return messageElement;
}

function isNearBottom() {
    return chatHistoryEl.scrollHeight - chatHistoryEl.scrollTop - chatHistoryEl.clientHeight < 140;
}

function scrollToBottom(force = false) {
    if (force || isNearBottom()) {
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }
}

/* Throttled re-render of a streaming message's text. */
function scheduleStreamRender(el, msg) {
    if (streamRenderTimer) return;
    streamRenderTimer = setTimeout(() => {
        streamRenderTimer = null;
        const textEl = el.querySelector(".message-text");
        if (textEl) textEl.innerHTML = renderMarkdown(messageText(msg.content));
        scrollToBottom();
    }, 80);
}

/* ==========================================================================
 * Sending / streaming / regenerating
 * ========================================================================== */

function buildApiMessages(conv, uptoIndex = null) {
    const out = [];
    const sys = conv.systemPrompt !== undefined && conv.systemPrompt !== null
        ? conv.systemPrompt : settings.systemPrompt;
    if (sys && sys.trim()) out.push({ role: "system", content: sys });
    const msgs = uptoIndex === null ? conv.messages : conv.messages.slice(0, uptoIndex);
    for (const m of msgs) {
        out.push({ role: String(m.role).toLowerCase(), content: m.content });
    }
    return out;
}

function setStreamingUI(active) {
    submitBtn.disabled = active;
    stopBtn.classList.toggle("hidden", !active);
}

async function handleSend() {
    if (streamState) return;
    const text = inputEl.value.trim();
    if (!text && !pendingAttachments.length) return;
    const conv = currentConv();
    if (!conv) return;
    const { conn, model } = getActive();
    if (!conn || !model) {
        toast("Add a connection and pick a model first.", "error");
        openSettingsModal("connections");
        return;
    }

    let content;
    if (pendingAttachments.length) {
        content = [];
        if (text) content.push({ type: "text", text });
        for (const a of pendingAttachments) {
            content.push({ type: "image_url", image_url: { url: a.dataUrl } });
        }
    } else {
        content = text;
    }

    conv.messages.push({ role: "user", content, ts: Date.now() });
    conv.updatedAt = Date.now();
    pendingAttachments = [];
    renderAttachmentStrip();
    inputEl.value = "";
    autoResizeInput();
    renderChatHistory();
    scrollToBottom(true);
    await Store.put(conv).catch(e => console.error("Save failed:", e));

    await generateAssistantResponse(conv);
}

/* Generates (or, with replaceIndex, regenerates in place) an assistant response. */
async function generateAssistantResponse(conv, replaceIndex = null) {
    if (streamState) return;
    const { conn, model } = getActive();
    if (!conn || !model) {
        toast("Add a connection and pick a model first.", "error");
        openSettingsModal("connections");
        return;
    }

    const apiMessages = buildApiMessages(conv, replaceIndex);
    const msg = { role: "assistant", content: "", ts: Date.now(), model };
    const previous = replaceIndex !== null ? conv.messages[replaceIndex] : null;
    let index;
    if (replaceIndex === null) {
        conv.messages.push(msg);
        index = conv.messages.length - 1;
    } else {
        index = replaceIndex;
        conv.messages[index] = msg;
    }

    renderChatHistory();
    const el = chatHistoryEl.children[index];
    if (el) el.classList.add("streaming");
    scrollToBottom();

    const controller = new AbortController();
    streamState = { controller };
    setStreamingUI(true);

    let failed = false;
    try {
        const finalText = await streamChatCompletion(conn, model, apiMessages, {
            signal: controller.signal,
            onDelta: (full) => {
                msg.content = full;
                if (el) scheduleStreamRender(el, msg);
            },
        });
        msg.content = finalText;
    } catch (err) {
        if (err.name === "AbortError") {
            // Keep whatever partial content arrived.
        } else {
            failed = true;
            console.error("Chat request failed:", err);
            toast("Request failed: " + err.message, "error");
        }
    } finally {
        if (streamRenderTimer) { clearTimeout(streamRenderTimer); streamRenderTimer = null; }
        streamState = null;
        setStreamingUI(false);
    }

    if (!messageText(msg.content).trim()) {
        // Nothing arrived (error, abort before first token, or empty reply):
        // restore the previous response on a regenerate, otherwise drop the placeholder.
        if (previous) {
            conv.messages[index] = previous;
        } else {
            conv.messages.splice(index, 1);
        }
        if (!failed) toast("No response received.", "error");
    }

    conv.updatedAt = Date.now();
    renderChatHistory();
    scrollToBottom();
    await Store.put(conv).catch(e => console.error("Save failed:", e));
    renderConversationList();
    inputEl.focus();

    if (!failed && !conv.titleGenerated && conv.messages.length >= 2 && conv.title === "New Conversation") {
        generateTitle(conv);
    }
}

async function regenerateMessage(index) {
    if (streamState) return;
    const conv = currentConv();
    if (!conv || !conv.messages[index]) return;
    if (String(conv.messages[index].role).toLowerCase() !== "assistant") return;
    await generateAssistantResponse(conv, index);
}

function deleteMessage(index) {
    if (streamState) return;
    const conv = currentConv();
    if (!conv || !conv.messages[index]) return;
    conv.messages.splice(index, 1);
    conv.updatedAt = Date.now();
    renderChatHistory();
    Store.put(conv).catch(e => console.error("Save failed:", e));
}

function startEditMessage(index) {
    if (streamState) return;
    const conv = currentConv();
    const msg = conv && conv.messages[index];
    if (!msg) return;
    const el = chatHistoryEl.children[index];
    if (!el) return;

    const contentEl = el.querySelector(".message-content");
    const original = messageText(msg.content);
    contentEl.innerHTML = "";
    const editArea = document.createElement("div");
    editArea.className = "message-edit-area";
    const textarea = document.createElement("textarea");
    textarea.value = original;
    editArea.appendChild(textarea);
    const buttons = document.createElement("div");
    buttons.className = "message-edit-buttons";
    const saveBtn = document.createElement("button");
    saveBtn.className = "primary-btn";
    saveBtn.textContent = "Save & Resend";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Cancel";
    buttons.appendChild(saveBtn);
    buttons.appendChild(cancelBtn);
    editArea.appendChild(buttons);
    contentEl.appendChild(editArea);
    textarea.focus();

    cancelBtn.addEventListener("click", () => renderChatHistory());
    saveBtn.addEventListener("click", async () => {
        const newText = textarea.value.trim();
        if (!newText) return;
        if (Array.isArray(msg.content)) {
            const textPart = msg.content.find(p => p.type === "text");
            if (textPart) textPart.text = newText;
            else msg.content.unshift({ type: "text", text: newText });
        } else {
            msg.content = newText;
        }
        // Truncate everything after the edited message and resend.
        conv.messages = conv.messages.slice(0, index + 1);
        conv.updatedAt = Date.now();
        renderChatHistory();
        await Store.put(conv).catch(e => console.error("Save failed:", e));
        await generateAssistantResponse(conv);
    });
}

function stopStreaming() {
    if (streamState) streamState.controller.abort();
}

/* ==========================================================================
 * Title generation
 * ========================================================================== */

function cleanTitle(raw) {
    let t = String(raw || "").split("\n")[0].trim();
    t = t.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    return t.slice(0, 80);
}

async function generateTitle(conv) {
    const { conn, model } = getActive();
    if (!conn || !model || !conv.messages.length) return;
    conv.titleGenerated = true; // set up front so failures don't retrigger on every message
    try {
        const transcript = conv.messages.map(m => ({
            role: String(m.role).toLowerCase(),
            content: messageText(m.content), // strip images: cheap text-only call
        }));
        const raw = await chatCompletion(conn, model, [...transcript, { role: "user", content: TITLE_PROMPT }]);
        const title = cleanTitle(raw);
        if (title) {
            conv.title = title;
            updateChatTitle();
            renderConversationList();
        }
    } catch (err) {
        console.error("Title generation failed:", err);
        toast("Title generation failed: " + err.message, "error");
    }
    await Store.put(conv).catch(e => console.error("Save failed:", e));
}

/* ==========================================================================
 * Conversations & folders
 * ========================================================================== */

function createNewConversation() {
    const id = uid("conv");
    conversations[id] = {
        id,
        title: "New Conversation",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        titleGenerated: false,
    };
    currentConversationId = id;
    localStorage.setItem("currentConversationId", id);
    if (currentFolderId && folders[currentFolderId]) {
        folders[currentFolderId].conversations.push(id);
        saveFolders();
    }
    Store.put(conversations[id]).catch(e => console.error("Save failed:", e));
    updateChatTitle();
    renderChatHistory();
    renderConversationList();
    inputEl.focus();
}

function switchConversation(id) {
    if (!conversations[id] || id === currentConversationId) return;
    currentConversationId = id;
    localStorage.setItem("currentConversationId", id);
    updateChatTitle();
    renderChatHistory();
    renderConversationList();
    scrollToBottom(true);
}

function updateChatTitle() {
    const conv = currentConv();
    chatTitleEl.textContent = conv ? conv.title : "ChatSpark";
}

async function deleteConversation(id) {
    const conv = conversations[id];
    if (!conv) return;
    if (id === currentConversationId) stopStreaming();
    const ok = await confirmDialog(`Delete "${conv.title}"? This cannot be undone.`,
        { title: "Delete Conversation", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    Object.values(folders).forEach(folder => {
        const i = folder.conversations.indexOf(id);
        if (i !== -1) folder.conversations.splice(i, 1);
    });
    delete conversations[id];
    await Store.remove(id).catch(e => console.error("Delete failed:", e));
    saveFolders();
    if (id === currentConversationId) {
        const remaining = Object.values(conversations)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (remaining.length) {
            currentConversationId = null;
            switchConversation(remaining[0].id);
        } else {
            createNewConversation();
        }
    }
    renderConversationList();
    renderFolderList();
}

function convSortKey(conv) {
    if (conv.updatedAt) return conv.updatedAt;
    if (conv.createdAt) return conv.createdAt;
    const m = String(conv.id).match(/conv_(\d+)_/);
    return m ? parseInt(m[1], 10) : 0;
}

function renderConversationList() {
    conversationListEl.innerHTML = "";
    let ids = currentFolderId && folders[currentFolderId]
        ? folders[currentFolderId].conversations.filter(id => conversations[id])
        : Object.keys(conversations);

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        ids = ids.filter(id => (conversations[id].title || "").toLowerCase().includes(q));
    }

    ids.sort((a, b) => convSortKey(conversations[b]) - convSortKey(conversations[a]));

    for (const id of ids) {
        const convo = conversations[id];
        const li = document.createElement("li");
        li.classList.add("conversation-item");
        if (id === currentConversationId) li.classList.add("active");

        const span = document.createElement("span");
        span.textContent = convo.title;
        span.title = convo.title;
        li.appendChild(span);

        const actions = document.createElement("div");
        actions.className = "conversation-actions";
        actions.innerHTML = `
            <button class="folder-assign-btn" title="Move to Folder">📂</button>
            <button class="rename-btn" title="Rename Conversation">✏️</button>
            <button class="delete-btn" title="Delete Conversation">🗑️</button>`;
        li.appendChild(actions);

        span.addEventListener("click", () => switchConversation(id));
        li.addEventListener("click", (e) => {
            if (e.target === li) switchConversation(id);
        });
        actions.querySelector(".folder-assign-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            showFolderAssignmentMenu(id, e.target);
        });
        actions.querySelector(".rename-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            const newTitle = await textDialog({ title: "Rename Conversation", value: convo.title, confirmLabel: "Rename" });
            if (newTitle && newTitle.trim()) {
                convo.title = newTitle.trim();
                convo.titleGenerated = true;
                Store.put(convo).catch(err => console.error("Save failed:", err));
                if (id === currentConversationId) updateChatTitle();
                renderConversationList();
            }
        });
        actions.querySelector(".delete-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteConversation(id);
        });

        conversationListEl.appendChild(li);
    }
}

function saveFolders() {
    localStorage.setItem("folders", JSON.stringify(folders));
    localStorage.setItem("currentFolderId", currentFolderId === null ? "" : currentFolderId);
}

function loadFolders() {
    try {
        const saved = JSON.parse(localStorage.getItem("folders") || "null");
        if (saved && typeof saved === "object") folders = saved;
    } catch (e) { folders = {}; }
    currentFolderId = localStorage.getItem("currentFolderId") || null;
    if (currentFolderId === "null" || currentFolderId === "") currentFolderId = null;
    if (currentFolderId && !folders[currentFolderId]) currentFolderId = null;
}

async function createNewFolder() {
    const name = await textDialog({ title: "New Folder", placeholder: "Folder name", confirmLabel: "Create" });
    if (!name || !name.trim()) return;
    const id = uid("folder");
    folders[id] = { id, name: name.trim(), conversations: [] };
    currentFolderId = id;
    saveFolders();
    renderFolderList();
    renderConversationList();
}

function renderFolderList() {
    folderListEl.innerHTML = "";
    const entries = Object.values(folders);
    if (!entries.length) {
        folderListEl.classList.add("hidden");
        return;
    }
    folderListEl.classList.remove("hidden");

    const allLi = document.createElement("li");
    allLi.classList.add("folder-item");
    if (currentFolderId === null) allLi.classList.add("active");
    allLi.innerHTML = "<span>All Conversations</span>";
    allLi.addEventListener("click", () => {
        currentFolderId = null;
        saveFolders();
        renderFolderList();
        renderConversationList();
    });
    folderListEl.appendChild(allLi);

    for (const folder of entries) {
        const li = document.createElement("li");
        li.classList.add("folder-item");
        if (folder.id === currentFolderId) li.classList.add("active");

        const span = document.createElement("span");
        span.textContent = `📁 ${folder.name}`;
        li.appendChild(span);

        const actions = document.createElement("div");
        actions.className = "folder-actions";
        actions.innerHTML = `
            <button class="rename-folder-btn" title="Rename Folder">✏️</button>
            <button class="delete-folder-btn" title="Delete Folder">🗑️</button>`;
        li.appendChild(actions);

        span.addEventListener("click", () => {
            currentFolderId = folder.id;
            saveFolders();
            renderFolderList();
            renderConversationList();
        });
        actions.querySelector(".rename-folder-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            const newName = await textDialog({ title: "Rename Folder", value: folder.name, confirmLabel: "Rename" });
            if (newName && newName.trim()) {
                folder.name = newName.trim();
                saveFolders();
                renderFolderList();
            }
        });
        actions.querySelector(".delete-folder-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            const ok = await confirmDialog(`Delete the folder "${folder.name}"? Conversations inside are kept.`,
                { title: "Delete Folder", confirmLabel: "Delete", danger: true });
            if (!ok) return;
            delete folders[folder.id];
            if (folder.id === currentFolderId) currentFolderId = null;
            saveFolders();
            renderFolderList();
            renderConversationList();
        });

        folderListEl.appendChild(li);
    }
}

function showFolderAssignmentMenu(conversationId, anchorEl) {
    const removeFromAll = () => {
        Object.values(folders).forEach(folder => {
            const i = folder.conversations.indexOf(conversationId);
            if (i !== -1) folder.conversations.splice(i, 1);
        });
    };
    const items = [{
        label: "No Folder",
        selected: !Object.values(folders).some(f => f.conversations.includes(conversationId)),
        onClick: () => {
            removeFromAll();
            saveFolders();
            renderConversationList();
        },
    }];
    for (const folder of Object.values(folders)) {
        items.push({
            label: `📁 ${folder.name}`,
            selected: folder.conversations.includes(conversationId),
            onClick: () => {
                removeFromAll();
                folder.conversations.push(conversationId);
                saveFolders();
                renderConversationList();
            },
        });
    }
    showMenu(anchorEl, items);
}

/* ==========================================================================
 * Model picker
 * ========================================================================== */

function renderModelPicker() {
    modelPicker.innerHTML = "";
    let hasAny = false;
    for (const conn of connections) {
        if (!conn.models.length) continue;
        const group = document.createElement("optgroup");
        group.label = conn.name;
        for (const model of conn.models) {
            const option = document.createElement("option");
            option.value = conn.id + "||" + model;
            option.textContent = model;
            group.appendChild(option);
            hasAny = true;
        }
        modelPicker.appendChild(group);
    }
    if (!hasAny) {
        const option = document.createElement("option");
        option.value = "__configure__";
        option.textContent = "Set up a connection…";
        modelPicker.appendChild(option);
        return;
    }
    const { conn, model } = getActive();
    if (conn && model) modelPicker.value = conn.id + "||" + model;
}

function onModelPickerChange() {
    if (modelPicker.value === "__configure__") {
        openSettingsModal("connections");
        return;
    }
    const [connId, ...rest] = modelPicker.value.split("||");
    settings.activeConnectionId = connId;
    settings.activeModel = rest.join("||");
    saveSettings();
}

/* ==========================================================================
 * Attachments (images)
 * ========================================================================== */

const MAX_IMAGE_DIM = 1568;

function downscaleImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            const largest = Math.max(width, height);
            if (largest > MAX_IMAGE_DIM) {
                const scale = MAX_IMAGE_DIM / largest;
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);
            // PNG keeps sharp text (screenshots); everything else goes to JPEG.
            const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
            resolve(canvas.toDataURL(mime, 0.85));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read image"));
        };
        img.src = url;
    });
}

async function addAttachmentFiles(files) {
    for (const file of files) {
        if (!file.type.startsWith("image/")) {
            toast(`"${file.name}" is not an image.`, "error");
            continue;
        }
        try {
            const dataUrl = await downscaleImage(file);
            pendingAttachments.push({ dataUrl, name: file.name });
        } catch (err) {
            toast(`Could not attach "${file.name}".`, "error");
        }
    }
    renderAttachmentStrip();
}

function renderAttachmentStrip() {
    attachmentStrip.innerHTML = "";
    attachmentStrip.classList.toggle("hidden", pendingAttachments.length === 0);
    pendingAttachments.forEach((att, i) => {
        const thumb = document.createElement("div");
        thumb.className = "attachment-thumb";
        const img = document.createElement("img");
        img.src = att.dataUrl;
        img.alt = att.name;
        img.title = att.name;
        thumb.appendChild(img);
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.title = "Remove attachment";
        removeBtn.addEventListener("click", () => {
            pendingAttachments.splice(i, 1);
            renderAttachmentStrip();
        });
        thumb.appendChild(removeBtn);
        attachmentStrip.appendChild(thumb);
    });
    updateTokenEstimate();
}

/* ==========================================================================
 * Token estimate (rough: ~4 chars per token, ~1000 per image)
 * ========================================================================== */

function updateTokenEstimate() {
    const conv = currentConv();
    if (!conv) { tokenEstimateEl.textContent = ""; return; }
    let chars = 0;
    let imageCount = pendingAttachments.length;
    for (const m of buildApiMessages(conv)) {
        chars += messageText(m.content).length;
        imageCount += messageImages(m.content).length;
    }
    chars += inputEl.value.length;
    const tokens = Math.round(chars / 4) + imageCount * 1000;
    if (tokens < 50) { tokenEstimateEl.textContent = ""; return; }
    const label = tokens >= 1000 ? (tokens / 1000).toFixed(1) + "k" : String(tokens);
    tokenEstimateEl.textContent = `~${label} tokens will be sent`;
}

/* ==========================================================================
 * Settings modal
 * ========================================================================== */

function openSettingsModal(tab = "connections") {
    settingsModal.classList.remove("hidden");
    selectSettingsTab(tab);
    renderConnectionList();
    hideConnectionEditor();
    $("#default-system-prompt").value = settings.systemPrompt || "";
    $("#setting-temperature").value = settings.temperature;
    $("#setting-max-tokens").value = settings.maxTokens;
    $("#setting-send-on-enter").checked = !!settings.sendOnEnter;
    $("#chat-width").value = settings.chatWidth;
    $("#chat-height").value = settings.chatHeight;
    $("#chat-font-size").value = settings.chatFontSize;
}

function closeSettingsModal() {
    settingsModal.classList.add("hidden");
    renderModelPicker();
}

function selectSettingsTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.toggle("hidden", panel.id !== "tab-" + tab);
    });
}

function applyChatSettings() {
    document.documentElement.style.setProperty("--chat-max-width", `${settings.chatWidth}px`);
    document.documentElement.style.setProperty("--chat-height", `${settings.chatHeight}vh`);
    document.documentElement.style.setProperty("--chat-font-size", `${settings.chatFontSize}px`);
}

/* --- Connection editor --- */

function renderConnectionList() {
    const list = $("#connection-list");
    list.innerHTML = "";
    if (!connections.length) {
        list.innerHTML = `<p class="dialog-message">No connections yet. Add one to start chatting — any OpenAI-compatible endpoint works (OpenAI, llama.cpp, Ollama, LM Studio, vLLM…).</p>`;
        return;
    }
    for (const conn of connections) {
        const row = document.createElement("div");
        row.className = "connection-row";
        const info = document.createElement("div");
        info.className = "conn-info";
        info.innerHTML = `
            <div class="conn-name">${escapeHTML(conn.name)}</div>
            <div class="conn-detail">${escapeHTML(conn.baseUrl)} · ${conn.models.length} model${conn.models.length === 1 ? "" : "s"}${conn.apiKey ? " · 🔑" : ""}</div>`;
        row.appendChild(info);
        const actions = document.createElement("div");
        actions.className = "conn-row-actions";
        const editBtn = document.createElement("button");
        editBtn.className = "secondary-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => showConnectionEditor(conn));
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "secondary-btn";
        deleteBtn.textContent = "🗑️";
        deleteBtn.title = "Delete connection";
        deleteBtn.addEventListener("click", async () => {
            const ok = await confirmDialog(`Delete connection "${conn.name}"?`,
                { title: "Delete Connection", confirmLabel: "Delete", danger: true });
            if (!ok) return;
            connections = connections.filter(c => c.id !== conn.id);
            saveConnections();
            validateActiveModel();
            renderConnectionList();
            renderModelPicker();
        });
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        row.appendChild(actions);
        list.appendChild(row);
    }
}

function showConnectionEditor(conn = null) {
    editingDraft = conn
        ? { id: conn.id, name: conn.name, baseUrl: conn.baseUrl, apiKey: conn.apiKey, models: [...conn.models] }
        : { id: null, name: "", baseUrl: "", apiKey: "", models: [] };
    $("#conn-name").value = editingDraft.name;
    $("#conn-url").value = editingDraft.baseUrl;
    $("#conn-key").value = editingDraft.apiKey;
    setConnStatus("");
    renderModelChips();
    $("#connection-editor").classList.remove("hidden");
    $("#conn-name").focus();
}

function hideConnectionEditor() {
    editingDraft = null;
    $("#connection-editor").classList.add("hidden");
}

function setConnStatus(message, cls = "") {
    const el = $("#conn-status");
    el.textContent = message;
    el.className = "conn-status" + (cls ? " " + cls : "");
}

function renderModelChips() {
    const chips = $("#conn-model-chips");
    chips.innerHTML = "";
    if (!editingDraft) return;
    editingDraft.models.forEach((model, i) => {
        const chip = document.createElement("span");
        chip.className = "model-chip";
        const label = document.createElement("span");
        label.textContent = model;
        chip.appendChild(label);
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.title = "Remove model";
        removeBtn.addEventListener("click", () => {
            editingDraft.models.splice(i, 1);
            renderModelChips();
        });
        chip.appendChild(removeBtn);
        chips.appendChild(chip);
    });
}

function readEditorInputs() {
    if (!editingDraft) return;
    editingDraft.name = $("#conn-name").value.trim();
    editingDraft.baseUrl = normalizeBaseUrl($("#conn-url").value);
    editingDraft.apiKey = $("#conn-key").value.trim();
}

async function testConnection() {
    readEditorInputs();
    if (!editingDraft.baseUrl) { setConnStatus("Enter a base URL first.", "error"); return; }
    setConnStatus("Testing…");
    try {
        const models = await fetchModelList(editingDraft.baseUrl, editingDraft.apiKey);
        setConnStatus(`✓ Connected — ${models.length} model${models.length === 1 ? "" : "s"} available.`, "ok");
    } catch (err) {
        setConnStatus("✗ " + describeFetchError(err), "error");
    }
}

async function fetchModelsIntoDraft() {
    readEditorInputs();
    if (!editingDraft.baseUrl) { setConnStatus("Enter a base URL first.", "error"); return; }
    setConnStatus("Fetching models…");
    try {
        const models = await fetchModelList(editingDraft.baseUrl, editingDraft.apiKey);
        if (!models.length) {
            setConnStatus("Connected, but the server returned no models. Add one manually below.", "error");
            return;
        }
        const merged = new Set([...editingDraft.models, ...models]);
        editingDraft.models = [...merged].sort();
        renderModelChips();
        setConnStatus(`✓ Loaded ${models.length} model${models.length === 1 ? "" : "s"}.`, "ok");
    } catch (err) {
        setConnStatus("✗ " + describeFetchError(err), "error");
    }
}

function describeFetchError(err) {
    if (err instanceof TypeError) {
        return "Network error — check the URL, that the server is running, and that it allows CORS.";
    }
    return err.message;
}

function saveConnectionDraft() {
    readEditorInputs();
    if (!editingDraft.name) { setConnStatus("Name is required.", "error"); return; }
    if (!editingDraft.baseUrl) { setConnStatus("Base URL is required.", "error"); return; }
    if (!editingDraft.models.length) {
        setConnStatus("Add at least one model (Fetch Models, or add one manually).", "error");
        return;
    }
    if (editingDraft.id) {
        const i = connections.findIndex(c => c.id === editingDraft.id);
        if (i !== -1) connections[i] = { ...editingDraft };
    } else {
        editingDraft.id = uid("conn");
        connections.push({ ...editingDraft });
    }
    saveConnections();
    validateActiveModel();
    hideConnectionEditor();
    renderConnectionList();
    renderModelPicker();
    toast("Connection saved.", "success");
}

/* --- Data tab --- */

function exportAllData() {
    const payload = {
        app: "ChatSpark",
        version: 2,
        exportedAt: new Date().toISOString(),
        settings,
        connections,
        folders,
        conversations: Object.values(conversations),
    };
    downloadFile(`chatspark-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(payload, null, 2));
}

async function importData(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (e) {
        toast("Not a valid JSON file.", "error");
        return;
    }
    let convs = [];
    if (Array.isArray(data.conversations)) {
        convs = data.conversations; // v2 backup
        if (Array.isArray(data.connections) && data.connections.length) {
            const existingIds = new Set(connections.map(c => c.id));
            for (const conn of data.connections) {
                if (!existingIds.has(conn.id)) connections.push(conn);
            }
            saveConnections();
            validateActiveModel();
        }
        if (data.folders && typeof data.folders === "object") {
            folders = { ...data.folders, ...folders };
            saveFolders();
        }
    } else if (data.id && Array.isArray(data.messages)) {
        convs = [data]; // single exported conversation
    } else if (typeof data === "object" && Object.values(data).every(v => v && v.id && Array.isArray(v.messages))) {
        convs = Object.values(data); // legacy localStorage map
    } else {
        toast("Unrecognized file format.", "error");
        return;
    }
    let imported = 0;
    for (const conv of convs) {
        if (!conv.id) conv.id = uid("conv");
        conv.createdAt = conv.createdAt || Date.now();
        conv.updatedAt = conv.updatedAt || conv.createdAt;
        (conv.messages || []).forEach((m, i) => { if (!m.ts) m.ts = conv.createdAt + i; });
        conversations[conv.id] = conv;
        await Store.put(conv).catch(e => console.error("Save failed:", e));
        imported++;
    }
    renderConversationList();
    renderFolderList();
    renderModelPicker();
    toast(`Imported ${imported} conversation${imported === 1 ? "" : "s"}.`, "success");
}

async function clearAllData() {
    const ok = await confirmDialog(
        "Delete ALL conversations, folders, connections and settings? This cannot be undone.",
        { title: "Delete All Data", confirmLabel: "Delete Everything", danger: true });
    if (!ok) return;
    await Store.clear().catch(e => console.error("Clear failed:", e));
    ["sparkSettings", "connections", "folders", "currentFolderId", "currentConversationId",
        "conversations", "conversations_backup_v1", "models", "models_backup_v1",
        "activeModel", "chatWidth", "chatHeight", "chatFontSize", "chatTitle"]
        .forEach(k => localStorage.removeItem(k));
    location.reload();
}

/* ==========================================================================
 * Export current chat
 * ========================================================================== */

function sanitizeFilename(filename) {
    return String(filename).replace(/[^a-z0-9_\-\.]/gi, "_");
}

function sanitizeMarkdown(text) {
    return String(text).replace(/([_*~`])/g, "\\$1");
}

function downloadFile(filename, content, type = "text/plain") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportToMarkdown() {
    const conv = currentConv();
    if (!conv) return;
    let md = `# ${sanitizeMarkdown(conv.title)}\n\n`;
    for (const msg of conv.messages) {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        let content = messageText(msg.content);
        const imgs = messageImages(msg.content);
        if (imgs.length) content += `\n\n*[${imgs.length} image${imgs.length === 1 ? "" : "s"} attached]*`;
        md += `**${role}** (${new Date(msg.ts || Date.now()).toLocaleString()})${msg.model ? ` · \`${msg.model}\`` : ""}:\n\n${content}\n\n---\n\n`;
    }
    downloadFile(`${sanitizeFilename(conv.title)}.md`, md, "text/markdown");
}

function exportToJSON() {
    const conv = currentConv();
    if (!conv) return;
    downloadFile(`${sanitizeFilename(conv.title)}.json`, JSON.stringify(conv, null, 2), "application/json");
}

/* ==========================================================================
 * Composer helpers
 * ========================================================================== */

function autoResizeInput() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, window.innerHeight * 0.4) + "px";
}

/* ==========================================================================
 * Event wiring
 * ========================================================================== */

function attachEventListeners() {
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSend();
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (e.ctrlKey || e.metaKey || (settings.sendOnEnter && !e.shiftKey)) {
            e.preventDefault();
            handleSend();
        }
    });
    inputEl.addEventListener("input", () => {
        autoResizeInput();
        updateTokenEstimate();
    });
    inputEl.addEventListener("paste", (e) => {
        const files = [...(e.clipboardData?.items || [])]
            .filter(item => item.kind === "file" && item.type.startsWith("image/"))
            .map(item => item.getAsFile())
            .filter(Boolean);
        if (files.length) {
            e.preventDefault();
            addAttachmentFiles(files);
        }
    });

    stopBtn.addEventListener("click", stopStreaming);
    attachBtn.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => {
        if (imageInput.files.length) addAttachmentFiles([...imageInput.files]);
        imageInput.value = "";
    });

    // Drag & drop images onto the chat panel.
    const chatSection = $("#chat-section");
    chatSection.addEventListener("dragover", (e) => {
        if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
            e.preventDefault();
            chatSection.classList.add("drag-over");
        }
    });
    chatSection.addEventListener("dragleave", (e) => {
        if (!chatSection.contains(e.relatedTarget)) chatSection.classList.remove("drag-over");
    });
    chatSection.addEventListener("drop", (e) => {
        chatSection.classList.remove("drag-over");
        if (e.dataTransfer && e.dataTransfer.files.length) {
            e.preventDefault();
            addAttachmentFiles([...e.dataTransfer.files]);
        }
    });

    // Header
    modelPicker.addEventListener("change", onModelPickerChange);
    $("#dark-mode-toggle").addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", document.body.classList.contains("dark-mode") ? "enabled" : "disabled");
    });
    $("#settings-btn").addEventListener("click", () => openSettingsModal());
    $("#regenerate-title-btn").addEventListener("click", () => {
        const conv = currentConv();
        if (!conv || !conv.messages.length) {
            toast("Nothing to summarize yet.");
            return;
        }
        generateTitle(conv);
    });
    $("#system-prompt-btn").addEventListener("click", async () => {
        const conv = currentConv();
        if (!conv) return;
        const effective = conv.systemPrompt !== undefined && conv.systemPrompt !== null
            ? conv.systemPrompt : (settings.systemPrompt || "");
        const value = await textDialog({
            title: "System Prompt (this chat)",
            message: "Sent as the system message with every request in this conversation. Leave empty for none.",
            value: effective,
            multiline: true,
            placeholder: "You are a helpful assistant.",
        });
        if (value === null) return;
        conv.systemPrompt = value;
        Store.put(conv).catch(e => console.error("Save failed:", e));
        updateTokenEstimate();
        toast("System prompt updated for this chat.", "success");
    });

    chatTitleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            chatTitleEl.blur();
        }
    });
    chatTitleEl.addEventListener("blur", () => {
        const conv = currentConv();
        if (!conv) return;
        const edited = chatTitleEl.textContent.trim();
        if (edited && edited !== conv.title) {
            conv.title = edited;
            conv.titleGenerated = true;
            Store.put(conv).catch(e => console.error("Save failed:", e));
            renderConversationList();
        } else {
            chatTitleEl.textContent = conv.title;
        }
    });

    // Sidebar
    $("#close-sidebar-btn").addEventListener("click", toggleSidebar);
    $("#open-sidebar-btn").addEventListener("click", toggleSidebar);
    $("#new-chat-btn").addEventListener("click", createNewConversation);
    $("#create-folder-btn").addEventListener("click", createNewFolder);
    $("#conversation-search").addEventListener("input", (e) => {
        searchQuery = e.target.value.trim();
        renderConversationList();
    });
    $("#export-chat-btn").addEventListener("click", (e) => {
        const conv = currentConv();
        if (!conv || !conv.messages.length) {
            toast("Nothing to export yet.");
            return;
        }
        showMenu(e.currentTarget, [
            { label: "Export as Markdown", onClick: exportToMarkdown },
            { label: "Export as JSON", onClick: exportToJSON },
        ]);
    });

    // Settings modal
    $(".close-button", settingsModal).addEventListener("click", closeSettingsModal);
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) closeSettingsModal();
    });
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => selectSettingsTab(btn.dataset.tab));
    });

    $("#add-connection-btn").addEventListener("click", () => showConnectionEditor());
    $("#conn-test-btn").addEventListener("click", testConnection);
    $("#conn-fetch-models-btn").addEventListener("click", fetchModelsIntoDraft);
    $("#conn-save-btn").addEventListener("click", saveConnectionDraft);
    $("#conn-cancel-btn").addEventListener("click", hideConnectionEditor);
    const addModelManually = () => {
        const input = $("#conn-model-input");
        const model = input.value.trim();
        if (!model || !editingDraft) return;
        if (!editingDraft.models.includes(model)) {
            editingDraft.models.push(model);
            renderModelChips();
        }
        input.value = "";
        input.focus();
    };
    $("#conn-model-add-btn").addEventListener("click", addModelManually);
    $("#conn-model-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addModelManually();
        }
    });

    // Chat + appearance settings: apply immediately
    $("#default-system-prompt").addEventListener("input", (e) => {
        settings.systemPrompt = e.target.value;
        saveSettings();
        updateTokenEstimate();
    });
    $("#setting-temperature").addEventListener("change", (e) => {
        settings.temperature = e.target.value;
        saveSettings();
    });
    $("#setting-max-tokens").addEventListener("change", (e) => {
        settings.maxTokens = e.target.value;
        saveSettings();
    });
    $("#setting-send-on-enter").addEventListener("change", (e) => {
        settings.sendOnEnter = e.target.checked;
        saveSettings();
    });
    for (const [id, key] of [["chat-width", "chatWidth"], ["chat-height", "chatHeight"], ["chat-font-size", "chatFontSize"]]) {
        document.getElementById(id).addEventListener("input", (e) => {
            if (e.target.value) {
                settings[key] = e.target.value;
                saveSettings();
                applyChatSettings();
            }
        });
    }

    // Data tab
    $("#export-all-btn").addEventListener("click", exportAllData);
    $("#import-data-btn").addEventListener("click", () => $("#import-input").click());
    $("#import-input").addEventListener("change", (e) => {
        if (e.target.files.length) importData(e.target.files[0]);
        e.target.value = "";
    });
    $("#clear-data-btn").addEventListener("click", clearAllData);

    // Global keys
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if ($("#dialog-root").children.length) return; // open dialogs handle Escape themselves
        if (streamState) {
            stopStreaming();
        } else if (!settingsModal.classList.contains("hidden")) {
            closeSettingsModal();
        }
    });
}

function toggleSidebar() {
    sidebar.classList.toggle("hidden");
    sidebarClosed.classList.toggle("hidden");
    document.body.classList.toggle("sidebar-open");
}

/* ==========================================================================
 * Init
 * ========================================================================== */

async function init() {
    chatHistoryEl = $(".chat-history");
    chatForm = $("#chat-form");
    inputEl = $("#search");
    submitBtn = $("#submit-btn");
    stopBtn = $("#stop-btn");
    attachBtn = $("#attach-btn");
    imageInput = $("#image-input");
    attachmentStrip = $("#attachment-strip");
    tokenEstimateEl = $("#token-estimate");
    chatTitleEl = $("#chat-title");
    modelPicker = $("#model-picker");
    settingsModal = $("#settings-modal");
    conversationListEl = $("#conversation-list");
    folderListEl = $("#folder-list");
    sidebar = $("#sidebar");
    sidebarClosed = $("#sidebarclosed");

    document.body.classList.add("sidebar-open");
    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
    }

    loadSettings();
    applyChatSettings();
    loadFolders();

    await Store.init();
    await migrateLegacyConversations();
    const stored = await Store.getAll().catch(e => { console.error("Load failed:", e); return []; });
    conversations = {};
    for (const conv of stored) conversations[conv.id] = conv;

    const savedId = localStorage.getItem("currentConversationId");
    if (savedId && conversations[savedId]) {
        currentConversationId = savedId;
        updateChatTitle();
        renderChatHistory();
        renderConversationList();
        scrollToBottom(true);
    } else {
        createNewConversation();
    }
    renderFolderList();
    renderModelPicker();
    attachEventListeners();
    autoResizeInput();

    if (!connections.length) {
        openSettingsModal("connections");
        toast("Welcome! Add a connection to any OpenAI-compatible API to get started.");
    }
    inputEl.focus();
}

document.addEventListener("DOMContentLoaded", init);

})();
