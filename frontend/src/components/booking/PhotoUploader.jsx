import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, X } from 'lucide-react';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_MB, MAX_IMAGES } from '../../lib/constants.js';

/**
 * Drag-and-drop or pick up to 5 photos. Client-side checks mirror the backend
 * (JPEG/PNG/WebP, 5 MB each). `files` is a File[]; previews are object URLs, revoked on change.
 */
export function PhotoUploader({ files, onChange, max = MAX_IMAGES }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState([]);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const add = (list) => {
    const problems = [];
    const accepted = [];
    for (const file of list) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name}: only JPEG, PNG or WebP images`);
      } else if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        problems.push(`${file.name}: larger than ${MAX_IMAGE_MB} MB`);
      } else if (files.length + accepted.length >= max) {
        problems.push(`${file.name}: at most ${max} photos`);
      } else {
        accepted.push(file);
      }
    }
    setErrors(problems);
    if (accepted.length) onChange([...files, ...accepted]);
  };

  const remove = (index) => {
    setErrors([]);
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">
        Photos <span className="font-normal text-slate-400">(optional, up to {max})</span>
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add([...e.dataTransfer.files]);
        }}
        className={clsx(
          'rounded-xl border-2 border-dashed p-4 transition-colors',
          dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white',
        )}
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {previews.map((url, i) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
            >
              <img
                src={url}
                alt={`Photo ${i + 1}: ${files[i]?.name ?? ''}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {files.length < max && (
            <label
              htmlFor={inputId}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500"
            >
              <ImagePlus className="h-6 w-6" aria-hidden />
              Add photo
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                multiple
                className="sr-only"
                onChange={(e) => {
                  add([...e.target.files]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Drag photos here or tap “Add photo”. JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB each.
        </p>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs font-medium text-red-600" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PhotoUploader;
