import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import './FileDropzone.css'

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']

interface FileDropzoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
}

export function FileDropzone({ files, onFilesChange }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = Array.from(incoming).filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (valid.length) onFilesChange([...files, ...valid])
    },
    [files, onFilesChange],
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
        aria-label="Upload slip or statement"
      >
        <p>Drag & drop a PDF or image, paste from clipboard, or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
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
