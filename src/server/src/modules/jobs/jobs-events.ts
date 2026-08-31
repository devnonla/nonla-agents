const INSTANCE_ID = crypto.randomUUID();

let wakeResolver: (() => void) | null = null;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

export function getInstanceId(): string {
  return INSTANCE_ID;
}

export function wakeScheduler() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  const resolve = wakeResolver;
  wakeResolver = null;
  resolve?.();
}

export function sleepInterruptible(ms: number): Promise<void> {
  return new Promise((resolve) => {
    wakeResolver = resolve;
    sleepTimer = setTimeout(() => {
      sleepTimer = null;
      wakeResolver = null;
      resolve();
    }, ms);
  });
}
