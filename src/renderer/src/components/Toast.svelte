<script lang="ts">
  import { toastStore, type ToastKind } from '../stores/toast'
</script>

<div class="toast-wrap">
  {#each $toastStore as t (t.id)}
    <div class="toast toast-{t.kind}" class:visible={true}>
      <span class="dot"></span>
      <span class="msg">{t.message}</span>
    </div>
  {/each}
</div>

<style>
  .toast-wrap {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    align-items: center;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    background: var(--text);
    color: #fff;
    border: 2.5px solid var(--border);
    border-radius: 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    box-shadow: var(--shadow-sm);
    animation: fade-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .toast-success {
    background: #fff;
    color: var(--text);
  }
  .toast-success .dot {
    background: var(--success);
  }
  .toast-error .dot {
    background: #ff6b6b;
  }
  .toast-info .dot {
    background: var(--accent);
  }
</style>