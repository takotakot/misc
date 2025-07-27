import { createActor, SnapshotFrom } from 'xstate';
import { counterMachine } from '../src/counter';

describe('counterMachine', () => {
  it('should have initial count 0', () => {
    const actor = createActor(counterMachine);
    actor.start();
    const snapshot: SnapshotFrom<typeof actor> = actor.getSnapshot();
    expect(snapshot.context.count).toBe(0);
    actor.stop();
  });

  it('should increment count on INCREMENT', () => {
    const actor = createActor(counterMachine);
    actor.start();
    actor.send({ type: 'INCREMENT' });
    let snapshot = actor.getSnapshot();
    expect(snapshot.context.count).toBe(1);
    actor.send({ type: 'INCREMENT' });
    snapshot = actor.getSnapshot();
    expect(snapshot.context.count).toBe(2);
    actor.stop();
  });

  it('should reset count to 0 on RESET', () => {
    const actor = createActor(counterMachine);
    actor.start();
    actor.send({ type: 'INCREMENT' });
    actor.send({ type: 'INCREMENT' });
    let snapshot = actor.getSnapshot();
    expect(snapshot.context.count).toBe(2);
    actor.send({ type: 'RESET' });
    snapshot = actor.getSnapshot();
    expect(snapshot.context.count).toBe(0);
    actor.stop();
  });
});
