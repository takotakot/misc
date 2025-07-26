import { createMachine, assign } from 'xstate';

type CounterContext = {
  count: number;
};

export type CounterEvent = { type: 'INCREMENT' } | { type: 'RESET' };

export const counterMachine = createMachine({
  types: {} as {
    context: CounterContext;
    events: CounterEvent;
  },
  id: 'counterMachine',
  initial: 'active',
  context: { count: 0 },
  states: {
    active: {
      on: {
        INCREMENT: {
          actions: assign({ count: ({ context }) => context.count + 1 }),
        },
        RESET: {
          actions: assign({ count: 0 }),
        },
      },
    },
  },
});
