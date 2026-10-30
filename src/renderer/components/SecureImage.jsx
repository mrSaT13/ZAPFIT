import React, { useEffect, useState } from 'react';

// Parity with mobile SecureImage + ApiClient.getImageBytes
// Renders server images via IPC (auth headers + fallback candidates)
// Supports: user_images, activity_media, activity_thumbnails, gear_images
const memoryCache = new Map();
const failedSet = new Set();

export default function SecureImage({ src, alt, className = '', style, fallback = null, onError, onLoad, ...props }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [loading, setLoading] = useState(!!src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) { setDataUrl(null); setLoading(false); setFailed(true); return; }
    // If already a data/http without auth needed, still prefer IPC for server images
    const isServerImage = src.includes('user_images') || src.includes('activity_media') || src.includes('activity_thumbnails') || src.includes('gear_images') || src.startsWith('/user_images') || src.startsWith('/activity');
    // Data URLs or blob — render directly
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setDataUrl(src);
      setLoading(false);
      return;
    }
    // External unsplash etc — direct
    if (src.startsWith('http') && !isServerImage) {
      setDataUrl(src);
      setLoading(false);
      return;
    }
    if (memoryCache.has(src)) {
      setDataUrl(memoryCache.get(src));
      setLoading(false);
      return;
    }
    if (failedSet.has(src)) {
      setFailed(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const api = window.electronAPI;
    if (!api || !api.endurainGetImage) {
      // No IPC — fallback to direct src
      setDataUrl(src);
      setLoading(false);
      return;
    }

    api.endurainGetImage(src).then(res => {
      if (cancelled) return;
      if (res && res.success && res.data) {
        const url = `data:${res.mime || 'image/jpeg'};base64,${res.data}`;
        memoryCache.set(src, url);
        setDataUrl(url);
        if (onLoad) onLoad();
      } else {
        // fallback: try direct src (for public thumbs / unsplash)
        if (src.startsWith('http') || src.startsWith('/')) {
          setDataUrl(src);
          setFailed(false);
        } else {
          failedSet.add(src);
          setFailed(true);
        }
        if (onError) onError(res?.error);
      }
    }).catch(err => {
      if (!cancelled) {
        if (src.startsWith('http') || src.startsWith('/')) {
          setDataUrl(src);
          setFailed(false);
        } else {
          failedSet.add(src);
          setFailed(true);
        }
        if (onError) onError(err?.message);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-white/5 animate-pulse ${className}`} style={style}>
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (failed || !dataUrl) {
    return fallback || (
      <div className={`flex items-center justify-center bg-white/5 text-gray-400 text-xs ${className}`} style={style}>
        Нет изображения
      </div>
    );
  }

  return <img src={dataUrl} alt={alt || ''} className={className} style={style} onError={() => setFailed(true)} {...props} />;
}

// Hook for programmatic fetch
export function useSecureImage(src) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!src) { setUrl(null); return; }
    if (memoryCache.has(src)) { setUrl(memoryCache.get(src)); return; }
    const api = window.electronAPI;
    if (!api?.endurainGetImage) { setUrl(src); return; }
    api.endurainGetImage(src).then(res => {
      if (res?.success) setUrl(`data:${res.mime};base64,${res.data}`);
      else setUrl(null);
    });
  }, [src]);
  return url;
}
