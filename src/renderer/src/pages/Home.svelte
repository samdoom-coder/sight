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
  <div class="hero">
    <div class="badge">
      <span class="badge-dot"></span>
      Peer-to-peer · No account required
    </div>
    <h1>
      Screen sharing,<br />
      made <span class="grad">ridiculously simple</span>.
    </h1>
    <p class="sub">
      Share your screen instantly with anyone, anywhere. Real-time, secure, and direct.
    </p>
  </div>

  <div class="actions">
    <button class="primary-btn" on:click={startSession}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      Start a session
    </button>

    <div class="or"><span>or</span></div>

    <div class="join-row">
      <input
        class="code-input"
        placeholder="Enter session code"
        value={codeInput}
        on:input={onCodeInput}
        on:keydown={(e) => {
          if (e.key === 'Enter') joinSession()
        }}
        maxlength="7"
        aria-label="Session code"
      />
      <button class="join-btn" on:click={joinSession}>Join</button>
    </div>
    {#if codeError}
      <p class="error">{codeError}</p>
    {/if}
  </div>

  <div class="footer">
    <button class="text-btn" on:click={openSettings}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      Settings
    </button>
  </div>
</main>

<style>
  .home {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    padding: 32px;
    overflow-y: auto;
  }
  .hero {
    text-align: center;
    max-width: 560px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--accent-soft);
    border: 1px solid rgba(99, 102, 241, 0.25);
    color: var(--accent-hover);
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 20px;
  }
  .badge-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse-dot 2s ease infinite;
  }
  h1 {
    font-size: 44px;
    line-height: 1.12;
    font-weight: 750;
    letter-spacing: -0.03em;
    margin-bottom: 14px;
  }
  .grad {
    background: linear-gradient(120deg, var(--accent), #a855f7);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sub {
    color: var(--text-dim);
    font-size: 15px;
    line-height: 1.6;
  }
  .actions {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .primary-btn {
    width: 100%;
    padding: 16px 24px;
    border-radius: var(--radius);
    background: linear-gradient(120deg, var(--accent), #7c3aed);
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 4px 24px rgba(99, 102, 241, 0.35);
  }
  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.45);
  }
  .primary-btn:active {
    transform: translateY(0);
  }
  .or {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-faint);
    font-size: 12px;
    margin: 6px 0;
    width: 100%;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .join-row {
    display: flex;
    gap: 10px;
    width: 100%;
  }
  .code-input {
    flex: 1;
    padding: 14px 18px;
    border-radius: var(--radius);
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 16px;
    font-family: var(--font-mono);
    letter-spacing: 0.08em;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .code-input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card-hover);
  }
  .code-input::placeholder {
    font-family: var(--font-sans);
    letter-spacing: normal;
    color: var(--text-faint);
  }
  .join-btn {
    padding: 14px 28px;
    border-radius: var(--radius);
    background: var(--bg-card-hover);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .join-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--accent);
  }
  .error {
    color: var(--danger);
    font-size: 13px;
    margin-top: 4px;
  }
  .footer {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }
  .text-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-faint);
    font-size: 13px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .text-btn:hover {
    color: var(--text);
    background: var(--bg-card);
  }
</style>