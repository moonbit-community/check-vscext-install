export interface TaskProcessEndObserver {
  onDidEndTaskProcess(listener: (event: TaskProcessEndEvent) => void): Disposable;
}

export interface TaskProcessEndEvent {
  readonly exitCode: number | undefined;
  readonly execution: {
    readonly task: {
      readonly name: string;
      readonly source: string;
    };
  };
}

export interface WatchTaskExitOptions {
  readonly observer: TaskProcessEndObserver;
  readonly taskName: string;
  readonly taskSource: string;
  readonly timeoutMs: number;
}

export interface WatchedTaskExit {
  readonly promise: Promise<TaskProcessEndEvent>;
  dispose(): void;
}

interface Disposable {
  dispose(): void;
}

export function watchTaskExit(options: WatchTaskExitOptions): WatchedTaskExit {
  let disposed = false;
  let settled = false;
  let listenerDisposable: Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (listenerDisposable !== undefined) {
      listenerDisposable.dispose();
      listenerDisposable = undefined;
    }
  };

  const promise = new Promise<TaskProcessEndEvent>((resolve, reject) => {
    const settle = (callback: () => void): void => {
      if (disposed || settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    listenerDisposable = options.observer.onDidEndTaskProcess((event) => {
      if (!isWatchedTask(event, options.taskName, options.taskSource)) {
        return;
      }

      settle(() => resolve(event));
    });

    timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            `Timed out after ${options.timeoutMs}ms waiting for task process end: ` +
              `name="${options.taskName}" source="${options.taskSource}"`
          )
        )
      );
    }, options.timeoutMs);
  });

  return {
    promise,
    dispose: () => {
      if (disposed || settled) {
        return;
      }

      disposed = true;
      cleanup();
    }
  };
}

function isWatchedTask(event: TaskProcessEndEvent, taskName: string, taskSource: string): boolean {
  const task = event.execution.task;
  return task.name === taskName && task.source === taskSource;
}
