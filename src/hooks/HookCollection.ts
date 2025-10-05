/**
 * Generic hook collection for managing hook functions
 *
 * Provides a reusable utility for:
 * - Adding/removing hooks
 * - Executing hooks with early return support
 * - Managing cleanup functions
 * - Error handling during hook execution
 *
 * This is a low-level utility used by EventBrokerHooks.
 * Most users should interact with EventBrokerHooks instead.
 *
 * @template HookFn - Hook function signature
 * @internal
 */
export class HookCollection<HookFn extends (...args: any[]) => any> {
  #hooks: HookFn[] = [];
  #cleanups = new Map<number, () => void>();
  #nextId = 0;

  /**
   * Add hook(s) and return cleanup function
   *
   * @param hookOrHooks - Single hook or array of hooks
   * @returns Cleanup function to remove all added hooks
   */
  add(hookOrHooks: HookFn | HookFn[]): () => void {
    const list = Array.isArray(hookOrHooks) ? hookOrHooks : [hookOrHooks];
    this.#hooks.push(...list);

    return () => {
      for (const hook of list) {
        this.remove(hook);
      }
    };
  }

  /**
   * Register a cleanup function
   *
   * @param cleanup - Function to call during cleanup
   * @returns Function to remove this cleanup
   */
  addCleanup(cleanup: () => void): () => void {
    const id = this.#nextId++;
    this.#cleanups.set(id, cleanup);

    return () => {
      this.#cleanups.delete(id);
    };
  }

  /**
   * Execute all hooks with a callback function
   *
   * Supports early return: if any hook returns false, execution stops
   * and this method returns false. All errors are caught and logged.
   *
   * @param callback - Function to execute for each hook
   * @returns false if any hook returned false, true otherwise
   */
  run(callback: (hook: HookFn) => boolean | void): boolean {
    for (const hook of this.#hooks) {
      try {
        const result = callback(hook);
        if (result === false) return false;
      } catch (error) {
        console.error('Hook execution error:', error);
      }
    }
    return true;
  }

  /**
   * Remove a specific hook
   *
   * @param hook - Hook function to remove
   * @returns true if hook was found and removed
   */
  remove(hook: HookFn): boolean {
    const index = this.#hooks.indexOf(hook);
    if (index !== -1) {
      this.#hooks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all hooks and execute all cleanup functions
   */
  clear(): void {
    this.#hooks = [];

    // Execute all cleanup functions
    for (const [id, cleanup] of this.#cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
    this.#cleanups.clear();
  }
}
