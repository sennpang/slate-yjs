import { Editor, Operation } from 'slate';
import * as Y from 'yjs';
import { translateYTextEvent } from './textEvent';

/**
 * Translate a yjs event into slate operations. The editor state has to match the
 * yText state before the event occurred.
 *
 * @param sharedType
 * @param op
 */
export function translateYjsEvent(
  sharedRoot: Y.XmlText,
  editor: Editor,
  event: Y.YEvent
): Operation[] {
  if (event instanceof Y.YTextEvent) {
    return translateYTextEvent(sharedRoot, editor, event);
  }

  throw new Error('Unexpected Y event type');
}

/**
 * Translates yjs events into slate operations and applies them to the editor. The
 * editor state has to match the yText state before the events occurred.
 *
 * @param sharedRoot
 * @param editor
 * @param events
 */
export function applyYjsEvents(
  sharedRoot: Y.XmlText,
  editor: Editor,
  events: Y.YEvent[]
) {
  Editor.withoutNormalizing(editor, () => {
    events.forEach((event) => {
      translateYjsEvent(sharedRoot, editor, event).forEach((op) => {
        editor.apply(op);
      });
    });
  });
}
