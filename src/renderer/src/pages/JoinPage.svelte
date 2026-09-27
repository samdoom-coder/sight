<script lang="ts">
  import { navigate } from '../routes/router'
  import { normalizeSessionCode, formatSessionCode, isValidSessionCode } from '@shared/lib/session-code'

  let codeInput = ''
  let codeError = ''

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

  function connect(): void {
    const normalized = normalizeSessionCode(codeInput)
    if (!isValidSessionCode(normalized)) {
      codeError = 'Enter a valid session code like 8K4-X9P.'
      return
    }
    navigate({ name: 'joining', code: formatSessionCode(normalized) })
  }

  function goBack(): void {
    navigate({ name: 'home' })
  }
</script>

<main class="join animate-in">
  <button class="back-btn" onclick={goBack}>← Back</button>
  <div class="card">
    <h1>Join a session</h1>
    <p class="sub">Enter the code your host shared with you.</p>

    <input
      class="code-input"
      placeholder="8K4-X9P"
      oninput={onCodeInput}
      onkeydown={(e) => {
        if (e.key === 'Enter') connect()
      }}
      maxlength="7"
      aria-label="Session code"
      autofocus
    />
    {#if codeError}
      <p class="error">{codeError}</p>
    {/if}

    <button class="connect-btn" onclick={connect}>
      Connect
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>
    </button>
  </div>
</main>

<style>
  .join {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow-y: auto;
  }
  .back-btn {
    position: absolute;
    top: 64px;
    left: 32px;
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
  .card {
    width: 100%;
    max-width: 420px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 36px;
    backdrop-filter: blur(12px);
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .sub {
    color: var(--text-dim);
    font-size: 14px;
    margin-top: 6px;
    margin-bottom: 24px;
  }
  .code-input {
    width: 100%;
    padding: 16px;
    border-radius: var(--radius);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 24px;
    font-family: var(--font-mono);
    letter-spacing: 0.2em;
    text-align: center;
    transition: border-color 0.15s ease;
  }
  .code-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .code-input::placeholder {
    font-family: var(--font-sans);
    letter-spacing: normal;
    color: var(--text-faint);
    font-size: 16px;
  }
  .error {
    color: var(--danger);
    font-size: 13px;
    margin-top: 10px;
  }
  .connect-btn {
    width: 100%;
    margin-top: 20px;
    padding: 15px;
    border-radius: var(--radius);
    background: linear-gradient(120deg, var(--accent), #7c3aed);
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
  }
  .connect-btn:hover {
    transform: translateY(-1px);
  }
</style>