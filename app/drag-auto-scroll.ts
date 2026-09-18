import { useEffect } from 'react';

// While a drag of the given payload type is in flight, the window scrolls
// when the pointer nears the top or bottom edge, so a card from deep in a
// tall column can reach any lane. Speed grows toward the edge; nothing
// happens for foreign drags or ordinary pointer movement.
export function useDragAutoScroll(type: string) {
  useEffect(() => {
    const margin = 90;
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(type)) return;
      const fromTop = e.clientY;
      const fromBottom = window.innerHeight - e.clientY;
      if (fromTop < margin)
        window.scrollBy(0, -Math.ceil(((margin - fromTop) / margin) * 24));
      else if (fromBottom < margin)
        window.scrollBy(0, Math.ceil(((margin - fromBottom) / margin) * 24));
    };
    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, [type]);
}
