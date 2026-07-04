import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * ConnectAPIWizard
 * A compact, production-ready multi-step setup wizard that helps non-technical users
 * pick a provider, fetch an API key, paste it, test it, and store it securely (encrypted) in localStorage.
 *
 * Props:
 * - onDone: (conn) => void  // called with { provider, serverUrl, apiKeyRef, storage } when the wizard finishes
 * - defaultProvider: one of ["openai","azure-openai","huggingface","custom","local"]
 * - allowLocal: boolean (default true)
 * - className: string
 *
 * Notes:
 * - Keys are encrypted at rest using AES-GCM with a passphrase. If user skips passphrase, we store raw (still scoped to browser storage).
 * - Test connection performs a simple call based on provider. For CORS-constrained environments, add a lightweight proxy at /api/proxy.
 */
export default function ConnectAPIWizard({ onDone, defaultProvider = "openai", allowLocal = true, className = "" }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState(defaultProvider);
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [azure, setAzure] = useState({ endpoint: "", deployment: "", apiVersion: "2024-02-15-preview" });
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const [remember, setRemember] = useState(true);

  const title = useMemo(() => {
    switch (step) {
      case 0: return "Welcome";
      case 1: return "Choose a Provider";
      case 2: return provider === "local" ? "Local Model" : "Get an API Key";
      case 3: return provider === "local" ? "Preferences" : "Paste & Secure Your Key";
      case 4: return provider === "local" ? "Finish" : "Test Connection";
      case 5: return "All Set";
      default: return "";
    }
  }, [step, provider]);

  const canContinue = useMemo(() => {
    if (provider === "local") {
      // Local: no key needed; users can still set serverUrl if they run a local HTTP endpoint
      if (step === 1) return true;
      if (step === 2) return true;
      if (step === 3) return true;
      return true;
    }
    // Hosted providers need key by step >=3
    if (step <= 1) return true;
    if (step === 2) return true; // instructions only
    if (step === 3) return !!apiKey;
    if (step === 4) return status.state === "ok"; // require a passing test
    return true;
  }, [provider, step, apiKey, status.state]);

  function next() { setStep(s => Math.min(s + 1, provider === "local" ? 5 : 5)); }
  function back() { setStep(s => Math.max(s - 1, 0)); }

  // --- Crypto helpers (PBKDF2 + AES-GCM) ---
  async function deriveKey(pass) {
    const enc = new TextEncoder();
    const salt = enc.encode("connect-api-wizard-salt");
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encrypt(pass, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    const buf = new Uint8Array(iv.byteLength + ct.byteLength);
    buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.byteLength);
    return btoa(String.fromCharCode(...buf));
  }

  // --- Storage ---
  async function persist() {
    if (!remember) return { storage: "memory", apiKeyRef: apiKey };
    try {
      if (passphrase) {
        const payload = await encrypt(passphrase, apiKey);
        localStorage.setItem("conn_api_encrypted", payload);
        localStorage.setItem("conn_api_mode", "encrypted");
        return { storage: "encrypted-localStorage", apiKeyRef: "encrypted:conn_api_encrypted" };
      }
      localStorage.setItem("conn_api_plain", apiKey);
      localStorage.setItem("conn_api_mode", "plain");
      return { storage: "plain-localStorage", apiKeyRef: "plain:conn_api_plain" };
    } catch (e) {
      console.error(e);
      return { storage: "memory", apiKeyRef: apiKey };
    }
  }

  // --- Test connection for different providers ---
  async function testConnection() {
    setStatus({ state: "loading", message: "Testing…" });
    try {
      let ok = false; let msg = "";
      if (provider === "openai") {
        const url = serverUrl || "https://api.openai.com/v1/models";
        const r = await fetch("/api/proxy", { // expects a tiny proxy to avoid CORS
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, method: "GET", headers: { Authorization: `Bearer ${apiKey}` } })
        });
        ok = r.ok; msg = r.ok ? "Connected to OpenAI." : `HTTP ${r.status}`;
      } else if (provider === "huggingface") {
        const url = serverUrl || "https://huggingface.co/api/whoami-v2";
        const r = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, method: "GET", headers: { Authorization: `Bearer ${apiKey}` } })
        });
        ok = r.ok; msg = r.ok ? "Connected to Hugging Face." : `HTTP ${r.status}`;
      } else if (provider === "azure-openai") {
        // Minimal ping: list deployments requires proper endpoint & version
        const base = azure.endpoint.replace(/\/$/, "");
        const url = `${base}/openai/deployments?api-version=${azure.apiVersion}`;
        const r = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, method: "GET", headers: { "api-key": apiKey } })
        });
        ok = r.ok; msg = r.ok ? "Connected to Azure OpenAI." : `HTTP ${r.status}`;
      } else if (provider === "custom") {
        const url = serverUrl || "";
        if (!url) throw new Error("Custom endpoint URL required");
        const r = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, method: "GET", headers: { Authorization: `Bearer ${apiKey}` } })
        });
        ok = r.ok; msg = r.ok ? "Connected to custom endpoint." : `HTTP ${r.status}`;
      } else if (provider === "local") {
        ok = true; msg = "Local mode selected.";
      }
      setStatus({ state: ok ? "ok" : "error", message: msg });
    } catch (e) {
      setStatus({ state: "error", message: e.message });
    }
  }

  async function finish() {
    const persisted = await persist();
    const conn = { provider, serverUrl: resolvedServerUrl(), apiKeyRef: persisted.apiKeyRef, storage: persisted.storage, azure };
    onDone?.(conn);
    setStep(5);
  }

  function resolvedServerUrl() {
    if (provider === "openai") return serverUrl || "https://api.openai.com/v1";
    if (provider === "huggingface") return serverUrl || "https://api-inference.huggingface.co";
    return serverUrl || "";
  }

  // --- Step bodies ---
  const Step = ({ children }) => (
    <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4" >
      {children}
    </motion.div>
  );

  return (
    <div className={`w-full max-w-xl mx-auto p-6 rounded-2xl border shadow bg-white/80 backdrop-blur ${className}`}>
      <div className="mb-3">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">Step {Math.min(step + 1, 6)} of 6</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <Step>
            <p className="text-gray-700">We'll connect you to a model provider. You can use a hosted provider (OpenAI, Hugging Face, Azure) or a local model. Keys can be encrypted at rest with a passphrase.</p>
            <ul className="text-sm list-disc ml-5 text-gray-700">
              <li>You control where your key is stored.</li>
              <li>You can switch providers anytime.</li>
            </ul>
          </Step>
        )}

        {step === 1 && (
          <Step>
            <div className="grid grid-cols-2 gap-3">
              <ProviderCard label="OpenAI" value="openai" provider={provider} onSelect={setProvider} />
              <ProviderCard label="Hugging Face" value="huggingface" provider={provider} onSelect={setProvider} />
              <ProviderCard label="Azure OpenAI" value="azure-openai" provider={provider} onSelect={setProvider} />
              <ProviderCard label="Custom (OpenAI-compatible)" value="custom" provider={provider} onSelect={setProvider} />
              {allowLocal && <ProviderCard label="Local (no key)" value="local" provider={provider} onSelect={setProvider} />}
            </div>
          </Step>
        )}

        {step === 2 && provider !== "local" && (
          <Step>
            <InstructionBlock provider={provider} />
          </Step>
        )}

        {step === 2 && provider === "local" && (
          <Step>
            <p className="text-gray-700">Local mode uses a model running on your machine or LAN. Point the server URL to your inference endpoint (e.g. llama.cpp, vLLM, LM Studio).</p>
            <label className="block text-sm font-medium">Server URL (optional)</label>
            <input value={serverUrl} onChange={e=>setServerUrl(e.target.value)} placeholder="http://localhost:8080/v1" className="input" />
          </Step>
        )}

        {step === 3 && provider !== "local" && (
          <Step>
            {provider === "azure-openai" ? (
              <AzureFields azure={azure} setAzure={setAzure} />
            ) : (
              <>
                <label className="block text-sm font-medium">Server URL (optional)</label>
                <input value={serverUrl} onChange={e=>setServerUrl(e.target.value)} placeholder={provider === "openai" ? "https://api.openai.com/v1" : provider === "huggingface" ? "https://api-inference.huggingface.co" : "https://your-endpoint.example.com/v1"} className="input" />
              </>
            )}

            <label className="block text-sm font-medium mt-2">API Key</label>
            <input value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password" className="input" placeholder="sk-…" />

            <div className="flex items-center gap-2 mt-2">
              <input id="remember" type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
              <label htmlFor="remember" className="text-sm">Store key securely on this browser</label>
            </div>

            {remember && (
              <>
                <label className="block text-sm font-medium mt-2">Add a passphrase (recommended)</label>
                <input value={passphrase} onChange={e=>setPassphrase(e.target.value)} type="password" className="input" placeholder="Create a passphrase to encrypt the key" />
                <p className="text-xs text-gray-500">Keys are encrypted with AES-GCM (PBKDF2). Lose the passphrase, lose access.</p>
              </>
            )}
          </Step>
        )}

        {step === 4 && provider !== "local" && (
          <Step>
            <p className="text-gray-700">We'll run a quick request to confirm your credentials.</p>
            <div className="flex items-center gap-2">
              <button onClick={testConnection} className="btn">Run Test</button>
              {status.state === "loading" && <span className="text-sm">Testing…</span>}
              {status.state === "ok" && <span className="text-sm text-green-700">{status.message}</span>}
              {status.state === "error" && <span className="text-sm text-red-700">{status.message}</span>}
            </div>
          </Step>
        )}

        {(step === 4 && provider === "local") && (
          <Step>
            <p className="text-gray-700">Local mode selected. You can adjust the endpoint later in Settings → Connections.</p>
          </Step>
        )}

        {step === 5 && (
          <Step>
            <p className="text-gray-700">You're connected. You can change providers anytime in Settings → Connections.</p>
          </Step>
        )}
      </AnimatePresence>

      <div className="mt-6 flex justify-between">
        <button onClick={back} disabled={step===0} className="btn-secondary">Back</button>
        {step < 4 && <button onClick={() => setStep(step + 1)} disabled={!canContinue} className="btn" >Continue</button>}
        {step === 4 && <button onClick={finish} disabled={!canContinue} className="btn">Finish</button>}
        {step === 5 && <button onClick={() => onDone?.({ provider, serverUrl: resolvedServerUrl() })} className="btn">Close</button>}
      </div>

      {/* Styles */}
      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.6rem 0.8rem; }
        .btn { padding: 0.6rem 1rem; border-radius: 0.75rem; background: #111827; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .btn:disabled { opacity: 0.5; }
        .btn-secondary { padding: 0.6rem 1rem; border-radius: 0.75rem; background: #eef2ff; color: #111827; }
        .card { border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.8rem; cursor: pointer; }
        .card.active { border-color: #111827; background: #f9fafb; }
      `}</style>
    </div>
  );
}

function ProviderCard({ label, value, provider, onSelect }) {
  const active = provider === value;
  return (
    <div className={`card ${active ? "active" : ""}`} onClick={() => onSelect(value)}>
      <div className="text-base font-medium">{label}</div>
      <div className="text-xs text-gray-600 mt-1">{value === "local" ? "No API key required" : "Requires API key"}</div>
    </div>
  );
}

function InstructionBlock({ provider }) {
  const items = {
    "openai": [
      { t: "Sign in to OpenAI", u: "https://platform.openai.com/" },
      { t: "Create a new secret key", u: "https://platform.openai.com/account/api-keys" },
      { t: "Copy the key and paste on next step", u: "" },
    ],
    "huggingface": [
      { t: "Sign in to Hugging Face", u: "https://huggingface.co/" },
      { t: "Create an access token (read)", u: "https://huggingface.co/settings/tokens" },
      { t: "Copy the token and paste on next step", u: "" },
    ],
    "azure-openai": [
      { t: "Open Azure Portal → Cognitive Services", u: "https://portal.azure.com/" },
      { t: "Create or choose an Azure OpenAI resource", u: "" },
      { t: "Get endpoint and API key", u: "" },
    ],
    "custom": [
      { t: "Enter your OpenAI-compatible endpoint URL (e.g. vLLM, LM Studio)", u: "" },
      { t: "Paste bearer token / key", u: "" },
    ]
  }[provider] || [];

  return (
    <div>
      <p className="text-gray-700">Follow these quick steps to obtain your key.</p>
      <ol className="list-decimal ml-5 space-y-2 mt-2">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-gray-800">
            {it.u ? <a className="underline" href={it.u} target="_blank" rel="noreferrer">{it.t}</a> : it.t}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AzureFields({ azure, setAzure }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Azure Endpoint</label>
      <input value={azure.endpoint} onChange={e=>setAzure({ ...azure, endpoint: e.target.value })} className="input" placeholder="https://YOUR-RESOURCE.openai.azure.com" />
      <label className="block text-sm font-medium">Deployment Name</label>
      <input value={azure.deployment} onChange={e=>setAzure({ ...azure, deployment: e.target.value })} className="input" placeholder="gpt-4o-mini" />
      <label className="block text-sm font-medium">API Version</label>
      <input value={azure.apiVersion} onChange={e=>setAzure({ ...azure, apiVersion: e.target.value })} className="input" placeholder="2024-02-15-preview" />
    </div>
  );
}
