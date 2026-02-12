import { useRef } from 'react';
import { Icon } from './index';

/** Horizontal scroller with arrows, mouse drag and touch swipe. */
export default function Carousel({ children, label }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const by = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 focus-visible:outline-none"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          ref.current.style.scrollSnapType = 'none';
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          if (ref.current) ref.current.style.scrollSnapType = '';
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => {
          if (ref.current) ref.current.style.scrollSnapType = '';
          drag.current = null;
        }}
        onClickCapture={(e) => drag.current?.moved && e.preventDefault()}
      >
        {children}
      </div>
      <div className="mt-2 hidden justify-end gap-2 md:flex">
        <button onClick={() => by(-1)} aria-label="Previous" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow ring-1 ring-grey-800/10 hover:bg-sun"><Icon name="arrowLeft" /></button>
        <button onClick={() => by(1)} aria-label="Next" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow ring-1 ring-grey-800/10 hover:bg-sun"><Icon name="arrowRight" /></button>
      </div>
    </div>
  );
}
