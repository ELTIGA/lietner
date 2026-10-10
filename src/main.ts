import './style.css';

import sampleCsv from '../samples/spanish.csv?raw';
import { openDatabase } from './data/db';
import { Repo } from './data/repo';
import { setDayOffset } from './domain/day';
import { CardActor } from './scene/cardActor';
import { Desk } from './scene/desk';
import { Stage } from './scene/stage';
import { loadFonts } from './scene/textures';
import { App } from './ui/app';

async function boot(): Promise<void> {
  if (import.meta.env.DEV) {
    // Dev-only clock shift for testing schedules: ?today=+3
    const offset = Number(new URLSearchParams(location.search).get('today'));
    if (Number.isFinite(offset)) setDayOffset(offset);
  }

  const [db] = await Promise.all([openDatabase(), loadFonts()]);
  // IndexedDB is the only copy of progress; ask the browser not to evict it.
  navigator.storage
    ?.persist?.()
    .then((granted) => {
      if (!granted) console.warn('Persistent storage not granted; export backups regularly.');
    })
    .catch((error: unknown) => console.error('storage.persist failed', error));
  const stage = new Stage(document.getElementById('scene')!);
  const desk = new Desk();
  stage.scene.add(desk.root);
  const actor = new CardActor(desk, stage.camera);
  stage.scene.add(actor.holder);

  stage.onFrame(() => {
    const hit = stage.pick(desk.pickables);
    let node = hit?.object ?? null;
    while (node && node.userData.box === undefined) node = node.parent;
    desk.setHighlight((node?.userData.box as 1 | undefined) ?? null);
  });

  const app = new App(document.getElementById('app')!, { db, repo: new Repo(db), desk, actor, sampleCsv });
  await app.start();
  if (import.meta.env.DEV) Object.assign(window, { __leitner: { stage, desk, actor, app } });
}

boot().catch((error: unknown) => {
  console.error('Failed to start', error);
  document.getElementById('app')!.textContent = 'Could not start: this browser may block IndexedDB or WebGL.';
});
