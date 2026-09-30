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
    padding: 36px 16px 48px;
    overflow-y: auto;
  }
  .back-btn {
    position: absolute;
    top: 68px;
    left: 32px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 8px 12px;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.13s ease;
  }
  .back-btn:hover {
    background: var(--bg-card);
    border-color: var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0 32px 32px;
    overflow: hidden;
  }
  .card::before {
    content: '';
    display: block;
    height: 12px;
    margin: 0 -32px 24px -32px;
    background: linear-gradient(
      90deg,
      var(--accent) 0 33.333%,
      var(--teal) 33.333% 66.666%,
      var(--mustard) 66.666% 100%
    );
    border-bottom: var(--border-w) solid var(--border);
  }
  h1 {
    font-family: var(--font-logo);
    font-size: 22px;
    letter-spacing: 0;
  }
  .sub {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    margin-top: 6px;
    margin-bottom: 24px;
  }
  .code-input {
    width: 100%;
    padding: 16px;
    border-radius: 12px;
    background: var(--surface);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
    font-size: 24px;
    font-family: var(--font-mono);
    font-weight: 800;
    letter-spacing: 0.2em;
    text-align: center;
    transition: all 0.13s ease;
  }
  .code-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
    transform: translate(-1px, -1px);
  }
  .code-input::placeholder {
    letter-spacing: 0.2em;
    color: var(--text-faint);
    font-size: 16px;
  }
  .error {
    color: var(--danger);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    margin-top: 10px;
    text-align: center;
  }
  .connect-btn {
    width: 100%;
    margin-top: 20px;
    padding: 15px;
    border-radius: 12px;
    background: var(--accent);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-sm);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.13s ease;
  }
  .connect-btn:hover {
    background: var(--accent-hover);
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 var(--border);
  }
  .connect-btn:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--border);
  }
</style>