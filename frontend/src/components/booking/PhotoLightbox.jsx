import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';

/** Thumbnails that open a full-size viewer with previous / next (arrow keys work too). */
export function PhotoLightbox({ images = [], title = 'Photos' }) {
  const [index, setIndex] = useState(null);
  const open = index !== null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, images.length]);

  if (images.length === 0) return null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {images.map((src, i) => (
          <li key={src}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={`Open photo ${i + 1} of ${images.length}`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>
      <Modal
        open={open}
        onClose={() => setIndex(null)}
        title={`${title} (${(index ?? 0) + 1} of ${images.length})`}
        size="xl"
      >
        {open && (
          <div className="relative">
            <img
              src={images[index]}
              alt={`Photo ${index + 1} of ${images.length}`}
              className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
            />
            {images.length > 1 && (
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
                  className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => (i + 1) % images.length)}
                  className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export default PhotoLightbox;
