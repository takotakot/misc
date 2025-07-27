import { createActor } from 'xstate';
import { counterMachine } from './counter';

/**
 * スプレッドシートを開いたときに自動実行される GAS エントリポイント
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Menu')
    .addItem('execute counter function', executeCounterFunction.name)
    .addToUi();
}

/**
 * カウンター関数の実行
 *
 * GAS メニューから呼び出される
 */
function executeCounterFunction() {
  // const ui = SpreadsheetApp.getUi();

  const actor = createActor(counterMachine);
  actor.start();
  actor.send({ type: 'INCREMENT' });
  let snapshot = actor.getSnapshot();
  console.log(snapshot.context.count);
  // ui.prompt(`Current count: ${snapshot.context.count}`);

  actor.send({ type: 'INCREMENT' });
  snapshot = actor.getSnapshot();
  console.log(snapshot.context.count);
  // ui.prompt(`Current count: ${snapshot.context.count}`);

  actor.stop();
}
