export function createEventScope() {
  const subscriptions = [];

  return {
    listen(target, type, listener, options) {
      if (!target?.addEventListener || !target?.removeEventListener) {
        return;
      }
      target.addEventListener(type, listener, options);
      subscriptions.push({ target, type, listener, options });
    },
    cleanup() {
      while (subscriptions.length > 0) {
        const subscription = subscriptions.pop();
        subscription.target.removeEventListener(
          subscription.type,
          subscription.listener,
          subscription.options,
        );
      }
    },
    get size() {
      return subscriptions.length;
    },
  };
}
