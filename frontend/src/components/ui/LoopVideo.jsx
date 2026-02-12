import { useEffect, useRef, useState } from 'react';
import { readyAsset, imageUrl } from '../../utils/assets';
import { prefersLite, useInView, useReducedMotion } from '../../hooks/uiHooks';

/**
 * Short muted loop (doc 22.4, 22.8): poster first, WebM and MP4 sources, plays
 * only while on screen, and never under reduced motion or data-saver, where the
 * poster stays. Until the clip is marked ready in assets/manifest.json, or if it
 * fails, `fallback` is rendered instead.
 */
export default function LoopVideo({ id, fallback, className = '', label }) {
  const file = readyAsset(id);
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [ref, inView] = useInView('100px');
  const video = useRef(null);
  const canPlay = !reduced && !prefersLite();

  useEffect(() => {
    const v = video.current;
    if (!v || !canPlay) return;
    if (inView) v.play().catch(() => {});
    else v.pause();
  }, [inView, canPlay]);

  if (!file || failed) return fallback;
  const base = file.replace(/\.[a-z0-9]+$/, '');
  const poster = imageUrl(`${base}-poster.webp`);
  return (
    <div ref={ref} className={className}>
      {canPlay ? (
        <video ref={video} muted loop playsInline preload="none" poster={poster} aria-label={label} onError={() => setFailed(true)} className="h-full w-full object-cover">
          <source src={imageUrl(`${base}.webm`)} type="video/webm" />
          <source src={imageUrl(`${base}.mp4`)} type="video/mp4" />
        </video>
      ) : (
        <img src={poster} alt={label || ''} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      )}
    </div>
  );
}
