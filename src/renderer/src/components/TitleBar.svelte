<script lang="ts">
  import { onMount } from 'svelte'
  import { route } from '../routes/router'

  let isMaximized = false

  onMount(async () => {
    if (window.desktop) {
      isMaximized = await window.desktop.window.isMaximized()
    }
  })

  function minimize(): void {
    window.desktop?.window.minimize()
  }

  function maximize(): void {
    window.desktop?.window.maximize()
  }

  function close(): void {
    window.desktop?.window.close()
  }
</script>

<header class="titlebar">
  <div class="drag-region"></div>
  <div class="left">
    <div class="logo" onclick={() => route.set({ name: 'home' })}>
      <span class="logo-mark">S</span>
      <span class="logo-name">Sight</span>
    </div>
  </div>
  <div class="controls">
    {#if window.desktop?.platform !== 'darwin'}
      <button class="ctrl" aria-label="Minimize" onclick={minimize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="ctrl" aria-label="Maximize" onclick={maximize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="ctrl close" aria-label="Close" onclick={close}>
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.2" /><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    {/if}
  </div>
</header>

<style>
  .titlebar {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
    position: relative;
    z-index: 100;
    flex-shrink: 0;
  }
  .drag-region {
    position: absolute;
    inset: 0;
  }
  .left {
    padding-left: 14px;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .logo-mark {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: linear-gradient(135deg, var(--accent), #a855f7);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    color: #fff;
  }
  .logo-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .controls {
    display: flex;
    -webkit-app-region: no-drag;
  }
  .ctrl {
    width: 44px;
    height: 39px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    transition: background 0.15s ease;
  }
  .ctrl:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .ctrl.close:hover {
    background: var(--danger);
    color: #fff;
  }
</style>