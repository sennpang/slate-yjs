import { Node, Point, Range, Text } from 'slate';
import * as Y from 'yjs';
import { InsertDelta, RelativeRange, TextRange } from '../model/types';
import { getInsertDeltaLength, yTextToInsertDelta } from './delta';
import { getSlatePath, getYTarget, yOffsetToSlateOffsets } from './location';
import { assertDocumentAttachment } from './yjs';

export const STORED_POSITION_PREFIX = '__slateYjsStoredPosition_';

export function slatePointToRelativePosition(
  sharedRoot: Y.XmlText,
  slateRoot: Node,
  point: Point
) {
  const { yTarget, yParent, textRange } = getYTarget(
    sharedRoot,
    slateRoot,
    point.path
  );

  if (yTarget) {
    throw new Error(
      'Slate point points to a non-text element inside sharedRoot'
    );
  }

  return Y.createRelativePositionFromTypeIndex(
    yParent,
    textRange.start + point.offset,
    point.offset === textRange.end ? -1 : 0
  );
}

export function absolutePositionToSlatePoint(
  sharedRoot: Y.XmlText,
  slateRoot: Node,
  { type, index, assoc }: Y.AbsolutePosition
): Point {
  if (!(type instanceof Y.XmlText)) {
    throw new Error('Absolute position points to a non-XMLText');
  }

  const parentPath = getSlatePath(sharedRoot, slateRoot, type);
  const parent = Node.get(slateRoot, parentPath);

  if (Text.isText(parent)) {
    throw new Error(
      "Absolute position doesn't match slateRoot, cannot descent into text"
    );
  }

  const [pathOffset, textOffset] = yOffsetToSlateOffsets(parent, index, {
    assoc,
  });
  return { path: [...parentPath, pathOffset], offset: textOffset };
}

export function relativePositionToSlatePoint(
  sharedRoot: Y.XmlText,
  slateRoot: Node,
  pos: Y.RelativePosition
) {
  if (!sharedRoot.doc) {
    throw new Error("sharedRoot isn't attach to a yDoc");
  }

  const absPos = Y.createAbsolutePositionFromRelativePosition(
    pos,
    sharedRoot.doc
  );

  return absPos && absolutePositionToSlatePoint(sharedRoot, slateRoot, absPos);
}

export function relativeRangeToSlateRange(
  sharedRoot: Y.XmlText,
  slateRoot: Node,
  relativeRange: RelativeRange
) {
  const {
    anchor: relativeAnchor,
    focus: relativeFocus,
    ...data
  } = relativeRange;

  const anchor = relativePositionToSlatePoint(
    sharedRoot,
    slateRoot,
    relativeAnchor
  );

  if (!anchor) {
    return null;
  }

  const focus = relativePositionToSlatePoint(
    sharedRoot,
    slateRoot,
    relativeFocus
  );

  if (!focus) {
    return null;
  }

  return { anchor, focus, ...data };
}

export function slateRangeToRelativeRange(
  sharedRoot: Y.XmlText,
  slateRoot: Node,
  range: Range
): RelativeRange {
  const { anchor, focus, ...data } = range;

  const relativeAnchor = slatePointToRelativePosition(
    sharedRoot,
    slateRoot,
    anchor
  );

  const relativeFocus = slatePointToRelativePosition(
    sharedRoot,
    slateRoot,
    focus
  );

  return { anchor: relativeAnchor, focus: relativeFocus, ...data };
}

export function getStoredPosition(
  sharedRoot: Y.XmlText,
  key: string
): Y.RelativePosition | null {
  const rawPosition = sharedRoot.getAttribute(STORED_POSITION_PREFIX + key);
  if (!rawPosition) {
    return null;
  }

  return Y.decodeRelativePosition(rawPosition);
}

export function getStoredPositions(
  sharedRoot: Y.XmlText
): Record<string, Y.RelativePosition> {
  return Object.fromEntries(
    Object.entries(sharedRoot.getAttributes())
      .filter(([key]) => key.startsWith(STORED_POSITION_PREFIX))
      .map(([key, position]) => [
        key.slice(STORED_POSITION_PREFIX.length),
        Y.createRelativePositionFromJSON(position),
      ])
  );
}

export function getStoredPositionsAbsolute(sharedRoot: Y.XmlText) {
  assertDocumentAttachment(sharedRoot);

  return Object.fromEntries(
    Object.entries(sharedRoot.getAttributes())
      .filter(([key]) => key.startsWith(STORED_POSITION_PREFIX))
      .map(
        ([key, position]) =>
          [
            key.slice(STORED_POSITION_PREFIX.length),
            Y.createAbsolutePositionFromRelativePosition(
              Y.createRelativePositionFromJSON(position),
              sharedRoot.doc
            ),
          ] as const
      )
      .filter(([, position]) => position)
  ) as Record<string, Y.AbsolutePosition>;
}

export function removeStoredPosition(sharedRoot: Y.XmlText, key: string) {
  assertDocumentAttachment(sharedRoot);
  sharedRoot.removeAttribute(STORED_POSITION_PREFIX + key);
}

export function setStoredPosition(
  sharedRoot: Y.XmlText,
  key: string,
  position: Y.RelativePosition
) {
  assertDocumentAttachment(sharedRoot);

  sharedRoot.setAttribute(
    STORED_POSITION_PREFIX + key,
    Y.encodeRelativePosition(position)
  );
}

function getAbsolutePositionsInTextRange(
  absolutePositions: Record<string, Y.AbsolutePosition>,
  yTarget: Y.XmlText,
  textRange?: TextRange
) {
  return Object.fromEntries(
    Object.entries(absolutePositions).filter(([, position]) => {
      if (position.type !== yTarget) {
        return false;
      }

      if (!textRange) {
        return true;
      }

      return position.assoc >= 0
        ? position.index >= textRange.start && position.index < textRange.end
        : position.index > textRange.start && position.index >= textRange.end;
    })
  );
}

function getAbsolutePositionsInYText(
  absolutePositions: Record<string, Y.AbsolutePosition>,
  yText: Y.XmlText,
  parentPath = ''
): Record<string, Record<string, Y.AbsolutePosition>> {
  const positions = {
    [parentPath]: getAbsolutePositionsInTextRange(absolutePositions, yText),
  };

  const insertDelta = yTextToInsertDelta(yText);
  insertDelta.forEach(({ insert }, i) => {
    if (insert instanceof Y.XmlText) {
      Object.assign(
        positions,
        getAbsolutePositionsInYText(
          absolutePositions,
          insert,
          parentPath ? `${parentPath}.${i}` : i.toString()
        )
      );
    }
  });

  return positions;
}

export function getStoredPositionsInDeltaAbsolute(
  sharedRoot: Y.XmlText,
  yText: Y.XmlText,
  delta: InsertDelta,
  deltaOffset = 0
) {
  const absolutePositions = getStoredPositionsAbsolute(sharedRoot);

  const positions = {
    '': getAbsolutePositionsInTextRange(absolutePositions, yText, {
      start: deltaOffset,
      end: deltaOffset + getInsertDeltaLength(delta),
    }),
  };

  delta.forEach(({ insert }, i) => {
    if (insert instanceof Y.XmlText) {
      Object.assign(
        positions,
        getAbsolutePositionsInYText(absolutePositions, insert, i.toString())
      );
    }
  });

  return positions;
}

export function restoreStoredPositionsWithDeltaAbsolute(
  sharedRoot: Y.XmlText,
  yText: Y.XmlText,
  absolutePositions: Record<string, Record<string, Y.AbsolutePosition>>,
  delta: InsertDelta,
  newDeltaOffset = 0,
  previousDeltaOffset = 0,
  path = ''
) {
  const toRestore = absolutePositions[path];

  if (toRestore) {
    Object.entries(toRestore).forEach(([key, position]) => {
      setStoredPosition(
        sharedRoot,
        key,
        Y.createRelativePositionFromTypeIndex(
          yText,
          position.index - previousDeltaOffset + newDeltaOffset,
          position.assoc
        )
      );
    });
  }

  delta.forEach(({ insert }, i) => {
    if (insert instanceof Y.XmlText) {
      restoreStoredPositionsWithDeltaAbsolute(
        sharedRoot,
        insert,
        absolutePositions,
        yTextToInsertDelta(insert),
        0,
        0,
        path ? `${path}.${i}` : i.toString()
      );
    }
  });
}
