import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import './FileDropzone.css'

const DEFAULT_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']

interface FileDropzoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  acceptedTypes?: string[]
  /** Also match by filename extension, for types browsers report inconsistently (e.g. .csv). */
  acceptedExtensions?: string[]
  hint?: string
}

export function FileDropzone({
  files,
  onFilesChange,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  acceptedExtensions = [],
  hint = 'Drag & drop, paste from clipboard, or click to browse',
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = Array.from(incoming).filter(
        (f) => acceptedTypes.includes(f.type) || acceptedExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)),
      )
      if (valid.length) onFilesChange([...files, ...valid])
    },
    [files, onFilesChange, acceptedTypes, acceptedExtensions],
  )

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (e.clipboardData.files.length) {
      addFiles(e.clipboardData.files)
    }
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const acceptAttr = [...acceptedTypes, ...acceptedExtensions].join(',')

  return (
    <div>
      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onClick={() => inputRef.current?.click()}
        tabIndex={0}
        role="button"
        aria-label="Upload file"
      >
        <p>{hint}</p>
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="dropzone-file-list">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`}>
              <span>{file.name}</span>
              <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${file.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
