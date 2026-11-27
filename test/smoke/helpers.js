// Shared helpers for the browser smoke tests.

/** On narrow screens (phase 21) the needs-attention list is a drawer: open it first. */
export async function openAttention(page) {
  const toggle = page.locator('[data-action="attention-toggle"]');
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}
