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
    gap: 8px;
    padding: 10px 16px;
    background: rgba(30, 30, 38, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font-size: 13px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    animation: fade-in 0.25s ease;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .toast-success .dot {
    background: var(--success);
  }
  .toast-error .dot {
    background: var(--danger);
  }
  .toast-info .dot {
    background: var(--accent);
  }
</style>