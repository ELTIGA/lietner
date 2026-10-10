import './style.css';

import sampleCsv from '../samples/spanish.csv?raw';
import type { Database } from './data/db';
import { openDatabase } from './data/db';
import { Repo } from './data/repo';
import { setDayOffset } from './domain/day';
import { CardActor } from './scene/cardActor';
import { Desk } from './scene/desk';
import { Stage } from './scene/stage';
import { loadFonts } from './scene/textures';
import type { CardView, DeskView } from './scene/views';
import { t } from './strings';
import { App } from './ui/app';
import { isTyping } from './ui/dom';
import { TextCard, TextDesk } from './ui/textDesk';

interface Scene {
  desk: DeskView;
  actor: CardView;
  debug: Record<string, unknown>;
}

/** The 3D desk, or null when WebGL is unavailable. */
function startWebGl(host: HTMLElement): Scene | null {
  let stage: Stage;
  try {
    stage = new Stage(host);
  } catch (error) {
    console.warn('WebGL unavailable, using text mode', error);
    return null;
  }
  const desk = new Desk();
  desk.onInvalidate = stage.requestRender;
  stage.scene.add(desk.root);
  const actor = new CardActor(desk, stage.camera, stage.requestRender);
  stage.scene.add(actor.holder);
  stage.addAnimationSource(() => actor.animating);
  stage.onLayout((mode) => {
    // Flight targets are fixed when a tween starts, so land any flight before moving things.
    actor.finish();
    desk.setLayout(mode);
    actor.relayout();
  });
  desk.setLayout(stage.layout);

  stage.onFrame(() => {
    const hit = stage.pick(desk.pickables);
    let node = hit?.object ?? null;
    while (node && node.userData.box === undefined) node = node.parent;
    desk.setHighlight((node?.userData.box as 1 | undefined) ?? null);
  });
  return { desk, actor, debug: { stage, desk, actor } };
}

function startTextMode(host: HTMLElement): Scene {
  document.documentElement.classList.add('text-mode');
  const desk = new TextDesk();
  const actor = new TextCard(desk);
  host.append(desk.element, actor.element);
  return { desk, actor, debug: { desk, actor } };
}

/** Keyboard hints are noise on phones; show them once a physical key is pressed. */
function trackInputMode(): void {
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
  const root = document.documentElement;
  root.classList.add('touch-only');
  const onKey = (event: KeyboardEvent) => {
    if (isTyping(event)) return;
    root.classList.remove('touch-only');
    window.removeEventListener('keydown', onKey);
  };
  window.addEventListener('keydown', onKey);
}

async function boot(): Promise<void> {
  if (import.meta.env.DEV) {
    // Dev-only clock shift for testing schedules: ?today=+3
    const offset = Number(new URLSearchParams(location.search).get('today'));
    if (Number.isFinite(offset)) setDayOffset(offset);
  }
  trackInputMode();

  let db: Database;
  try {
    [db] = await Promise.all([openDatabase(), loadFonts()]);
  } catch (error) {
    console.error('IndexedDB unavailable', error);
    document.getElementById('app')!.textContent = t.errors.startFailed;
    return;
  }
  // IndexedDB is the only local copy of progress; ask the browser not to evict it.
  navigator.storage
    ?.persist?.()
    .then((granted) => {
      if (!granted) console.warn('Persistent storage not granted; export backups regularly.');
    })
    .catch((error: unknown) => console.error('storage.persist failed', error));

  const host = document.getElementById('scene')!;
  // `?mode=text` forces the text mode that browsers without WebGL get.
  const forceText = new URLSearchParams(location.search).get('mode') === 'text';
  const { desk, actor, debug } = (!forceText && startWebGl(host)) || startTextMode(host);
  const app = new App(document.getElementById('app')!, { db, repo: new Repo(db), desk, actor, scene: host, sampleCsv });
  await app.start();
  if (import.meta.env.DEV) Object.assign(window, { __leitner: { ...debug, app } });
}

boot().catch((error: unknown) => {
  console.error('Failed to start', error);
  document.getElementById('app')!.textContent = t.errors.startFailed;
});
