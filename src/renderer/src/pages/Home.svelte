<script lang="ts">
  import { navigate } from '../routes/router'
  import { normalizeSessionCode, formatSessionCode, isValidSessionCode } from '@shared/lib/session-code'
  import { showToast } from '../stores/toast'

  let codeInput = ''
  let codeError = ''

  function startSession(): void {
    navigate({ name: 'host-picker' })
  }

  function onCodeInput(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value
    const normalized = normalizeSessionCode(raw)
    codeInput = normalized
    codeError = ''
    if (normalized.length > 0) {
      const el = event.currentTarget as HTMLInputElement
      el.value = formatSessionCode(normalized)
    }
  }

  function joinSession(): void {
    const normalized = normalizeSessionCode(codeInput)
    if (!isValidSessionCode(normalized)) {
      codeError = 'Enter a valid session code like 8K4-X9P.'
      return
    }
    navigate({ name: 'joining', code: formatSessionCode(normalized) })
  }

  function openSettings(): void {
    navigate({ name: 'settings' })
  }
</script>

<main class="home animate-in">
  <section class="card">
    <header class="brand">
      <div class="logo">S</div>
      <div class="brand-text">
        <h1><span>Sight</span></h1>
        <p class="tagline">Direct screen-to-screen</p>
      </div>
    </header>

    <p class="desc">
      Screens move directly between devices over an encrypted, peer-to-peer
      connection. No accounts, nothing passes through or stays on the server.
    </p>

    <button class="btn btn-primary" onclick={startSession}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <span>Create a session</span>
    </button>

    <div class="divider"><span>or join with a code</span></div>

    <div class="receive-row">
      <input
        class="code-input"
        placeholder="8K4-X9P"
        value={codeInput}
        oninput={onCodeInput}
        onkeydown={(e) => {
          if (e.key === 'Enter') joinSession()
        }}
        maxlength="7"
        aria-label="Session code"
      />
      <button class="btn btn-ghost" onclick={joinSession}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
        <span>Join</span>
      </button>
    </div>
    {#if codeError}
      <p class="error">{codeError}</p>
    {/if}

    <button class="foot-note" onclick={openSettings}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    </button>
  </section>
</main>

<style>
  .home {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 36px 16px 48px;
    overflow-y: auto;
  }
  .card {
    position: relative;
    width: 100%;
    max-width: 560px;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0 28px 28px;
    overflow: hidden;
  }
  .card::before {
    content: '';
    display: block;
    height: 12px;
    margin: 0 -28px;
    background: linear-gradient(
      90deg,
      var(--accent) 0 33.333%,
      var(--teal) 33.333% 66.666%,
      var(--mustard) 66.666% 100%
    );
    border-bottom: var(--border-w) solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 22px 0 20px;
  }
  .logo {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--accent);
    border: var(--border-w) solid var(--border);
    border-radius: 13px;
    box-shadow: var(--shadow-xs);
    color: #fff;
    font-family: var(--font-logo);
    font-size: 24px;
    transform: rotate(-1.5deg);
  }
  .brand-text {
    display: flex;
    flex-direction: column;
  }
  .brand h1 {
    font-family: var(--font-logo);
    font-size: 26px;
    line-height: 0.95;
    color: var(--text);
  }
  .tagline {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #fff;
    background: var(--text);
    display: inline-block;
    padding: 3px 7px 3.5px;
    border-radius: 6px;
    margin-top: 5px;
    width: fit-content;
    line-height: 1;
    transform: rotate(-0.3deg);
  }
  .desc {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
    line-height: 1.6;
    margin-bottom: 18px;
    background: #fff;
    border: 2px dashed rgba(26, 24, 22, 0.18);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 2.5px solid var(--border);
    border-radius: 12px;
    padding: 12px 18px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: all 0.13s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }
  .btn:active:not(:disabled) {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 var(--border);
  }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    width: 100%;
  }
  .btn-primary:hover {
    background: var(--accent-hover);
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 var(--border);
  }
  .btn-primary:active {
    background: var(--accent-press);
  }
  .btn-ghost {
    background: #fff;
    color: var(--text);
    white-space: nowrap;
  }
  .btn-ghost:hover {
    background: var(--bg-card-hover);
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 var(--border);
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 2.5px;
    background: var(--border);
    opacity: 0.13;
    border-radius: 999px;
  }
  .receive-row {
    display: flex;
    gap: 10px;
  }
  .receive-row input {
    flex: 1;
    min-width: 0;
    background: #fff;
    border: 2.5px solid var(--border);
    border-radius: 12px;
    padding: 11px 14px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-align: center;
    box-shadow: var(--shadow-xs);
    transition: all 0.13s;
  }
  .receive-row input::placeholder {
    color: var(--text-faint);
    letter-spacing: 0.15em;
  }
  .receive-row input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 3px 3px 0 var(--border);
    transform: translate(-1px, -1px);
  }
  .error {
    color: var(--danger);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    margin-top: 10px;
    text-align: center;
  }
  .foot-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 20px;
    margin-left: auto;
    margin-right: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
    background: var(--mustard);
    border: 2px solid var(--border);
    border-radius: 999px;
    padding: 7px 12px;
    width: fit-content;
    box-shadow: 2px 2px 0 var(--border);
    transform: rotate(-0.4deg);
    transition: all 0.13s;
  }
  .foot-note:hover {
    transform: rotate(-0.4deg) translate(-1px, -1px);
    box-shadow: 3px 3px 0 var(--border);
  }
</style>
