import { memo, useState } from 'react';
import SnackArt from './SnackArt';
import { readyAsset, imageUrl, srcSet } from '../../utils/assets';
import { cx } from './index';

/**
 * Any image from assets/manifest.json (doc 6.2, 22.8): a responsive <picture> with a
 * 400/800/1200 srcset, explicit width and height so nothing shifts, and lazy loading.
 * Until the asset is marked ready, or if it fails to load, `fallback` is shown instead,
 * so there is never a broken image.
 */
export function AssetImage({ id, alt = '', className, imgClassName, sizes = '(min-width: 1024px) 40vw, 90vw', priority = false, fallback = null, width = 1200, height = 1200, style }) {
  const [failed, setFailed] = useState(false);
  const file = id ? readyAsset(id) : null;
  if (!file || failed) return fallback;
  return (
    <picture className={className}>
      <source type="image/webp" srcSet={srcSet(file)} sizes={sizes} />
      <img
        src={imageUrl(file, 800)}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        alt={alt}
        onError={() => setFailed(true)}
        className={cx('object-cover', imgClassName ?? 'block h-full w-full')}
        style={style}
      />
    </picture>
  );
}

/** Snack picture for one catalogue slug, with the illustration as the fallback (doc 5.1, 6). */
function SnackImage({ slug, art, title, className, plate = true, sizes = '(min-width: 1024px) 25vw, 50vw', priority = false, decorative = false }) {
  const illustration = <SnackArt shape={art?.shape} colors={art?.colors} title={title} plate={plate} decorative={decorative} className={className} />;
  return (
    <AssetImage
      id={slug ? `snack-${slug}` : null}
      alt={decorative ? '' : `${title} (AI illustration)`}
      sizes={sizes}
      priority={priority}
      width={1200}
      height={960}
      imgClassName={className}
      style={{ backgroundColor: art?.colors?.[0] ? `${art.colors[0]}33` : undefined }}
      fallback={illustration}
    />
  );
}

export default memo(SnackImage);
