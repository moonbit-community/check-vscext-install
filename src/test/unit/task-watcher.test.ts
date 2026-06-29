import * as assert from 'node:assert/strict';
import { watchTaskExit } from '../task-watcher.js';

describe('task watcher', () => {
  it('resolves on a matching task process end and disposes the listener', async () => {
    const observer = new FakeTaskObserver();
    const watcher = watchTaskExit({
      observer,
      taskName: 'Install moonbit',
      taskSource: 'moonbit',
      timeoutMs: 1_000
    });

    observer.fire(taskProcessEndEvent('Install moonbit', 'moonbit', 0));

    const event = await watcher.promise;
    assert.equal(event.exitCode, 0);
    assert.equal(observer.listenerCount, 0);
    assert.equal(observer.disposeCount, 1);

    watcher.dispose();
    assert.equal(observer.disposeCount, 1);
  });

  it('ignores non-matching task process ends until a matching task exits', async () => {
    const observer = new FakeTaskObserver();
    const watcher = watchTaskExit({
      observer,
      taskName: 'Install moonbit',
      taskSource: 'moonbit',
      timeoutMs: 1_000
    });

    observer.fire(taskProcessEndEvent('Install moonbit', 'other-source', 1));
    observer.fire(taskProcessEndEvent('Other task', 'moonbit', 1));
    assert.equal(observer.listenerCount, 1);

    observer.fire(taskProcessEndEvent('Install moonbit', 'moonbit', 7));

    const event = await watcher.promise;
    assert.equal(event.exitCode, 7);
    assert.equal(observer.listenerCount, 0);
  });

  it('rejects on timeout with the task name and source in the error message', async () => {
    const observer = new FakeTaskObserver();
    const watcher = watchTaskExit({
      observer,
      taskName: 'Install moonbit',
      taskSource: 'moonbit',
      timeoutMs: 5
    });

    await assert.rejects(watcher.promise, /Install moonbit.*moonbit/);
    assert.equal(observer.listenerCount, 0);
  });

  it('does not respond to task process end events after manual disposal', async () => {
    const observer = new FakeTaskObserver();
    const watcher = watchTaskExit({
      observer,
      taskName: 'Install moonbit',
      taskSource: 'moonbit',
      timeoutMs: 1_000
    });

    watcher.dispose();
    observer.fire(taskProcessEndEvent('Install moonbit', 'moonbit', 0));

    const result = await Promise.race([
      watcher.promise.then(
        () => 'settled',
        () => 'settled'
      ),
      sleep(20).then(() => 'pending')
    ]);

    assert.equal(result, 'pending');
    assert.equal(observer.listenerCount, 0);
    assert.equal(observer.disposeCount, 1);
  });
});

class FakeTaskObserver {
  private readonly listeners = new Set<(event: FakeTaskProcessEndEvent) => void>();
  disposeCount = 0;

  get listenerCount(): number {
    return this.listeners.size;
  }

  onDidEndTaskProcess(listener: (event: FakeTaskProcessEndEvent) => void): FakeDisposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        if (this.listeners.delete(listener)) {
          this.disposeCount += 1;
        }
      }
    };
  }

  fire(event: FakeTaskProcessEndEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

interface FakeTaskProcessEndEvent {
  readonly exitCode: number | undefined;
  readonly execution: {
    readonly task: {
      readonly name: string;
      readonly source: string;
    };
  };
}

interface FakeDisposable {
  dispose(): void;
}

function taskProcessEndEvent(
  taskName: string,
  taskSource: string,
  exitCode: number | undefined
): FakeTaskProcessEndEvent {
  return {
    exitCode,
    execution: {
      task: {
        name: taskName,
        source: taskSource
      }
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
