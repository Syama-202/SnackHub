import { memo, useState } from 'react';
import SnackArt from './SnackArt';
import { readyAsset, imageUrl, srcSet } from '../lib/assets';
import { cx } from './ui';

/**
 * Snack picture (doc 5.1, 6.2): a responsive <picture> with a 400/800/1200 srcset,
 * explicit width and height so nothing shifts, and lazy loading. Until the file for
 * this slug is marked ready in assets/manifest.json, or if it fails to load, the
 * illustration is shown instead, so there is never a broken image.
 */
function SnackImage({ slug, art, title, className, plate = true, sizes = '(min-width: 1024px) 25vw, 50vw', priority = false, decorative = false }) {
  const [failed, setFailed] = useState(false);
  const file = slug ? readyAsset(`snack-${slug}`) : null;
  if (!file || failed) return <SnackArt shape={art?.shape} colors={art?.colors} title={title} plate={plate} decorative={decorative} className={className} />;
  return (
    <picture>
      <source type="image/webp" srcSet={srcSet(file)} sizes={sizes} />
      <img
        src={imageUrl(file, 800)}
        width={1200}
        height={960}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        alt={decorative ? '' : `${title} (AI illustration)`}
        onError={() => setFailed(true)}
        className={cx('object-cover', className)}
        style={{ backgroundColor: art?.colors?.[0] ? `${art.colors[0]}33` : undefined }}
      />
    </picture>
  );
}

export default memo(SnackImage);
