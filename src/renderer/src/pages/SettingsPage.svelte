<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { settings, saveSettings, loadSettings } from '../services/config'
  import { showToast } from '../stores/toast'

  let draft = $settings
  let activeTab: 'general' | 'session' | 'network' | 'privacy' = 'general'

  onMount(async () => {
    await loadSettings()
    draft = $settings
  })

  function updateDraft(): void {
    draft = $settings
  }

  function save(): void {
    saveSettings(draft)
    showToast('Settings saved.', 'success')
  }

  function clearData(): void {
    window.desktop?.settings.clearSessionData()
    showToast('Local session data cleared.', 'success')
    setTimeout(() => loadSettings(), 300)
  }

  function openDiagnostics(): void {
    navigate({ name: 'diagnostics' })
  }

  function goBack(): void {
    navigate({ name: 'home' })
  }
</script>

<main class="settings animate-in">
  <div class="settings-header">
    <button class="back-btn" onclick={goBack}>← Back</button>
    <h1>Settings</h1>
  </div>

  <div class="layout">
    <nav class="tabs">
      <button class:active={activeTab === 'general'} onclick={() => (activeTab = 'general')}>General</button>
      <button class:active={activeTab === 'session'} onclick={() => (activeTab = 'session')}>Session</button>
      <button class:active={activeTab === 'network'} onclick={() => (activeTab = 'network')}>Network</button>
      <button class:active={activeTab === 'privacy'} onclick={() => (activeTab = 'privacy')}>Privacy</button>
    </nav>

    <div class="panel">
      {#if activeTab === 'general'}
        <section class="group">
          <h2>General</h2>
          <label class="row">
            <span>Launch at startup</span>
            <input type="checkbox" bind:checked={draft.general.launchAtStartup} onchange={updateDraft} />
          </label>
          <label class="row">
            <span>Theme</span>
            <select bind:value={draft.general.theme} onchange={updateDraft}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <label class="row">
            <span>Language</span>
            <select bind:value={draft.general.language} onchange={updateDraft}>
              <option value="en">English</option>
            </select>
          </label>
          <label class="row">
            <span>Notifications</span>
            <input type="checkbox" bind:checked={draft.general.notifications} onchange={updateDraft} />
          </label>
        </section>
      {:else if activeTab === 'session'}
        <section class="group">
          <h2>Session</h2>
          <label class="row">
            <span>Default audio state</span>
            <input type="checkbox" bind:checked={draft.session.defaultAudio} onchange={updateDraft} />
          </label>
          <label class="row">
            <span>Cursor behavior</span>
            <select bind:value={draft.session.cursorBehavior} onchange={updateDraft}>
              <option value="show">Always show</option>
              <option value="hide">Always hide</option>
              <option value="only-hover">Only on hover</option>
            </select>
          </label>
          <label class="row">
            <span>Session timeout (seconds)</span>
            <input
              type="number"
              min="60"
              max="7200"
              step="60"
              bind:value={draft.session.timeoutSeconds}
              onchange={updateDraft}
            />
          </label>
          <label class="row">
            <span>Default screen</span>
            <span class="hint">(Chosen when you start a session)</span>
          </label>
        </section>
      {:else if activeTab === 'network'}
        <section class="group">
          <h2>Network</h2>
          <p class="desc">
            ICE servers are used to establish peer-to-peer connections. STUN discovers your public address;
            TURN relays traffic when direct connections fail.
          </p>
          {#each draft.network.iceServers as server, i (i)}
            <div class="ice-row">
              <input
                type="text"
                placeholder="stun:stun.example.com:3478"
                bind:value={draft.network.iceServers[i].urls}
                onchange={updateDraft}
              />
              <button
                class="remove-btn"
                onclick={() => {
                  draft.network.iceServers.splice(i, 1)
                  updateDraft()
                }}
                aria-label="Remove ICE server"
              >
                ✕
              </button>
            </div>
          {/each}
          <button
            class="add-btn"
            onclick={() => {
              draft.network.iceServers.push({ urls: '' })
              updateDraft()
            }}
          >
            + Add ICE server
          </button>
          <button class="diag-link" onclick={openDiagnostics}>Open connection diagnostics →</button>
        </section>
      {:else if activeTab === 'privacy'}
        <section class="group">
          <h2>Privacy</h2>
          <label class="row">
            <span>Telemetry</span>
            <input type="checkbox" bind:checked={draft.privacy.telemetry} onchange={updateDraft} />
          </label>
          <p class="desc">
            When disabled, no usage information is collected. Telemetry never includes your screen content.
          </p>
          <div class="row">
            <span>Permission information</span>
            <span class="hint">{window.desktop?.platform === 'darwin' ? 'macOS: Screen Recording required' : window.desktop?.platform === 'linux' ? 'Linux: depends on desktop environment' : 'Windows: no extra permission needed'}</span>
          </div>
          <div class="row">
            <span>Clear local session data</span>
            <button class="danger-btn" onclick={clearData}>Clear</button>
          </div>
        </section>
      {/if}

      <div class="save-row">
        <button class="save-btn" onclick={save}>Save settings</button>
      </div>
    </div>
  </div>
</main>

<style>
  .settings {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .settings-header {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .back-btn {
    color: var(--text-dim);
    font-size: 14px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .back-btn:hover {
    background: var(--bg-card);
    color: var(--text);
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .layout {
    display: flex;
    gap: 24px;
    flex: 1;
  }
  .tabs {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 180px;
    flex-shrink: 0;
  }
  .tabs button {
    text-align: left;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-dim);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .tabs button.active {
    background: var(--accent-soft);
    color: var(--accent-hover);
    font-weight: 500;
  }
  .tabs button:hover:not(.active) {
    background: var(--bg-card);
    color: var(--text);
  }
  .panel {
    flex: 1;
    max-width: 560px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 28px;
  }
  .group h2 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 18px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
    color: var(--text);
    gap: 16px;
  }
  .row select,
  .row input[type='number'] {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text);
    font-size: 13px;
  }
  .row input[type='checkbox'] {
    accent-color: var(--accent);
    width: 18px;
    height: 18px;
  }
  .hint {
    color: var(--text-faint);
    font-size: 12px;
  }
  .desc {
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 16px;
  }
  .ice-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .ice-row input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .remove-btn {
    width: 34px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-faint);
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .remove-btn:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .add-btn {
    margin-top: 6px;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    background: var(--bg-card-hover);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    transition: border-color 0.15s ease;
  }
  .add-btn:hover {
    border-color: var(--accent);
  }
  .diag-link {
    display: block;
    margin-top: 22px;
    color: var(--accent-hover);
    font-size: 13px;
    font-weight: 500;
  }
  .diag-link:hover {
    text-decoration: underline;
  }
  .danger-btn {
    padding: 7px 16px;
    border-radius: var(--radius-sm);
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: var(--danger);
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s ease;
  }
  .danger-btn:hover {
    background: rgba(239, 68, 68, 0.22);
  }
  .save-row {
    margin-top: 26px;
    display: flex;
    justify-content: flex-end;
  }
  .save-btn {
    padding: 12px 28px;
    border-radius: var(--radius);
    background: linear-gradient(120deg, var(--accent), #7c3aed);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    transition: transform 0.15s ease;
  }
  .save-btn:hover {
    transform: translateY(-1px);
  }
</style>