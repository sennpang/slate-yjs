import { Node, SetNodeOperation } from 'slate';
import * as Y from 'yjs';
import { getYTarget } from '../../utils/location';

export function setNode(
  root: Y.XmlText,
  slateRoot: Node,
  op: SetNodeOperation
): void {
  const { target, textRange, parent } = getYTarget(root, slateRoot, op.path);

  if (target) {
    Object.entries(op.newProperties).forEach(([key, value]) => {
      if (value === null) {
        return target.removeAttribute(key);
      }

      target.setAttribute(key, value);
    });

    return Object.entries(op.properties).forEach(([key]) => {
      if (!op.newProperties.hasOwnProperty(key)) {
        target.removeAttribute(key);
      }
    });
  }

  const unset = Object.fromEntries(
    Object.keys(op.properties).map((key) => [key, null])
  );
  const newProperties = { ...unset, ...op.newProperties };

  parent.format(
    textRange.start,
    textRange.end - textRange.start,
    newProperties
  );
}
