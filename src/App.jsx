import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, ChevronDown, Download, FileImage, FileText, Image, Layers, LockKeyhole, LoaderCircle, Plus, Share2, ShieldCheck, SlidersHorizontal, Upload, X, ZoomIn } from 'lucide-react';
import { baseName, createZip, downloadBlob, formatBytes, FORMATS, parsePages, shareLinks } from './lib/files';
import { usePdfConverter } from './hooks/usePdfConverter';
import { samplePdf } from './lib/sample';

function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button autoFocus className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function ShareMenu({ images, onError }) {
  const files = useMemo(() => images.map((image) => new File([image.blob], image.name, { type: image.blob.type })), [images]);
  const [sharing, setSharing] = useState(false);
  const menu = useRef(null);
  let canShareFiles = false;
  try { canShareFiles = Boolean(navigator.share && navigator.canShare?.({ files })); } catch { /* The links below remain available. */ }
  useEffect(() => {
    const close = (event) => { if (!menu.current?.contains(event.target)) menu.current?.removeAttribute('open'); };
    const escape = (event) => { if (event.key === 'Escape') menu.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  async function nativeShare() {
    setSharing(true);
    try { await navigator.share({ files, title: 'Images from Pagepress' }); }
    catch (error) { if (error.name !== 'AbortError') onError('File sharing was unavailable. Download the images and attach them in your app.'); }
    finally { setSharing(false); }
  }
  return <details className="share-menu" ref={menu}>
    <summary className="button secondary"><Share2 size={16} /> Share in… <ChevronDown size={14} /></summary>
    <div className="share-panel">
      <strong>Share your images</strong>
      {canShareFiles && <button className="button native-share" disabled={sharing} onClick={nativeShare}><Share2 size={16} />{sharing ? 'Opening…' : 'Share image files…'}</button>}
      <p>{canShareFiles ? 'Or share a link to Pagepress below.' : 'Download your images first, then attach them in your app.'} These links share the converter, not your files.</p>
      <div className="share-links">{shareLinks(window.location.href.split(/[?#]/)[0]).map((target) => <a key={target.name} href={target.href} target="_blank" rel="noopener noreferrer"><span aria-hidden="true" className={`social-mark social-${target.name.toLowerCase()}`}>{target.mark}</span>{target.name}<span className="sr-only"> (opens in a new tab)</span></a>)}</div>
      <span className="share-note"><LockKeyhole size={13} />Your documents are never uploaded.</span>
    </div>
  </details>;
}

export default function App() {
  const {
    file, pageCount, results: images, status, progress, error: conversionError, notice,
    load, convert, cancel, reset, clearError,
  } = usePdfConverter();
  const [format, setFormat] = useState('png');
  const [dpi, setDpi] = useState(144);
  const [quality, setQuality] = useState(90);
  const [pageMode, setPageMode] = useState('all');
  const [range, setRange] = useState('');
  const [zipping, setZipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uiError, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const loading = status === 'loading';
  const busy = status === 'converting';
  const locked = loading || busy || zipping;
  const error = uiError || conversionError;

  let selectedPages = [];
  let rangeError = '';
  if (file) {
    try { selectedPages = pageMode === 'all' ? Array.from({ length: pageCount }, (_, index) => index + 1) : parsePages(range, pageCount); }
    catch (issue) { rangeError = issue.message; }
  }

  async function importFile(file) {
    if (locked) return;
    setError('');
    if (await load(file)) {
      setPreview(null); setPageMode('all'); setRange('');
    }
  }

  function removeDocument() {
    reset(); setPreview(null); setError('');
    inputRef.current?.focus();
  }

  async function handleConvert() {
    if (locked || rangeError) return;
    setError('');
    if (await convert({ pages: selectedPages, dpi, format, quality })) {
      setPreview(null);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }));
    }
  }

  async function downloadAll() {
    setZipping(true); setError('');
    try { downloadBlob(await createZip(images, file.size * 2), `${baseName(file.name)}-images.zip`); }
    catch (error) { setError(error.message || 'We could not prepare your ZIP. Try downloading images individually.'); }
    finally { setZipping(false); }
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="./" aria-label="Pagepress home"><span className="brand-icon"><FileImage size={23} strokeWidth={1.7} /></span>pagepress<span className="brand-period">.</span></a>
      <div className="header-right"><span className="local-label"><ShieldCheck size={16} /> A little more private.</span><button className="text-button" onClick={() => setDialog('help')}>How it works</button></div>
    </header>

    <main>
      <section className="intro" aria-labelledby="page-title">
        <div><span className="eyebrow">PDF TO IMAGE CONVERTER</span><h1 id="page-title">From PDF to picture<span>.</span></h1><p>Give your pages a new format. Ready to save, send, or share.</p></div>
        <div className="intro-note"><span className="privacy-icon"><LockKeyhole size={19} /></span><div><strong>Your files stay yours.</strong><span>Converted right on your device.</span></div></div>
      </section>

      <section className="workspace" aria-label="PDF conversion workspace">
        <div className="document-panel">
          <div className="panel-heading"><h2><FileText size={18} /> Your document</h2><span className="small-muted">One PDF, plenty of possibilities</span></div>
          <input ref={inputRef} className="sr-only" type="file" id="pdf-upload" accept=".pdf,application/pdf" disabled={locked} aria-label="Choose PDF document" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ''; }} />
          {!file ? <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
            event.preventDefault(); setDragging(false);
            if (locked) return;
            if (event.dataTransfer.files.length !== 1) { setError('Please choose one PDF at a time.'); return; }
            importFile(event.dataTransfer.files[0]);
          }}>
            <div className="document-art" aria-hidden="true"><div className="art-back" /><div className="art-page"><span>PDF</span><div className="art-lines"><i /><i /><i /></div></div><span className="art-image"><Image size={27} strokeWidth={1.4} /></span></div>
            <h3>{loading ? 'Opening your document…' : dragging ? 'Drop it here.' : 'A fresh start for your PDF.'}</h3>
            <p>Drag and drop your document here</p>
            <button className="button primary upload-button" disabled={locked} onClick={() => inputRef.current.click()}>{loading ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} Choose a PDF</button>
            <span className="upload-limit">PDF files up to 100 MB</span>
          </div> : <div className="loaded-document">
            <div className="loaded-icon"><FileText size={34} strokeWidth={1.3} /><span>PDF</span></div>
            <span className="ready-badge"><Check size={13} /> Ready to convert</span>
            <h3 title={file.name}>{file.name}</h3>
            <p>{pageCount} {pageCount === 1 ? 'page' : 'pages'}<span>·</span>{formatBytes(file.size)}</p>
            <div className="file-actions"><button className="button secondary" disabled={locked} onClick={() => inputRef.current.click()}><Upload size={15} />Replace PDF</button><button className="icon-button remove-button" disabled={locked} aria-label="Remove document" onClick={removeDocument}><X size={18} /></button></div>
            <div className="document-local"><LockKeyhole size={13} />Saved only in this browser tab</div>
          </div>}
          <div className="sample-row"><span>Just looking around?</span><button className="text-button" disabled={locked} onClick={() => importFile(samplePdf())}>Try a sample PDF</button></div>
        </div>

        <div className="settings-panel">
          <div className="panel-heading"><h2><SlidersHorizontal size={18} /> Make it yours</h2><span className="small-muted">Export settings</span></div>
          <fieldset disabled={locked}>
            <legend className="sr-only">Image export settings</legend>
            <span className="field-label" id="format-label">Image format</span>
            <div className="format-picker" role="group" aria-labelledby="format-label">{Object.entries(FORMATS).map(([key, value]) => <button key={key} type="button" aria-pressed={format === key} onClick={() => setFormat(key)} className={format === key ? 'selected' : ''}>{value.label}{format === key && <Check size={14} />}</button>)}</div>
            <p className="field-hint">{FORMATS[format].description}</p>
            <div className="settings-row"><div className="resolution-field"><label className="field-label" htmlFor="resolution">Resolution</label><div className="select-wrap"><select id="resolution" value={dpi} onChange={(event) => setDpi(Number(event.target.value))}><option value={72}>Standard · 72 DPI</option><option value={144}>High · 144 DPI</option><option value={300}>Print · 300 DPI</option></select><ChevronDown size={15} /></div></div><div className="resolution-note"><span>{dpi === 72 ? 'For quick sharing' : dpi === 144 ? 'A crisp everyday choice' : 'For detailed prints'}</span></div></div>
            {format !== 'png' && <div className="quality-field"><div className="quality-heading"><label className="field-label" htmlFor="quality">Image quality</label><output htmlFor="quality">{quality}%</output></div><input id="quality" type="range" min="30" max="100" step="5" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></div>}
            <div className="page-heading"><span className="field-label" id="pages-label">Pages to convert</span>{file && <span className="small-muted">{pageCount} total</span>}</div>
            <div className="page-picker" role="group" aria-labelledby="pages-label"><button aria-pressed={pageMode === 'all'} className={pageMode === 'all' ? 'selected' : ''} onClick={() => setPageMode('all')}><span className="radio-dot" />All pages</button><button aria-pressed={pageMode === 'custom'} className={pageMode === 'custom' ? 'selected' : ''} onClick={() => setPageMode('custom')}><span className="radio-dot" />Select pages</button></div>
            {pageMode === 'custom' && <div className="range-field"><label className="sr-only" htmlFor="page-range">Page numbers or ranges</label><input id="page-range" placeholder="e.g. 1, 3–5" value={range} onChange={(event) => setRange(event.target.value)} aria-invalid={Boolean(rangeError)} aria-describedby="range-help" /><p id="range-help" className={rangeError ? 'field-error' : 'field-hint'}>{rangeError || 'Separate pages with commas. Use a dash for ranges.'}</p></div>}
          </fieldset>
          <div className="convert-area">
            {loading ? <div className="progress-heading"><span>Opening document…</span><button className="text-button" onClick={cancel}>Cancel</button></div> : busy ? <><div className="progress-heading"><span>Converting {Math.min(progress.current + 1, progress.total)} of {progress.total}…</span><button className="text-button" onClick={cancel}>Cancel</button></div><progress value={progress.current} max={progress.total} aria-label="Conversion progress" /></> : <><button className="button primary convert-button" disabled={!file || locked || Boolean(rangeError)} onClick={handleConvert}><FileImage size={18} />Convert to {FORMATS[format].label}{selectedPages.length > 0 && <span className="button-count">{selectedPages.length}</span>}</button><p className="convert-hint">{file ? `${selectedPages.length} ${selectedPages.length === 1 ? 'page' : 'pages'} selected · one image per page` : 'Add a PDF to get started'}</p></>}
          </div>
        </div>
      </section>

      {error && <div className="alert" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => { setError(''); clearError(); }}><X size={17} /></button></div>}
      <div className="sr-only" role="status" aria-live="polite">{notice || (loading ? 'Opening document' : busy ? `Converted ${progress.current} of ${progress.total} pages` : '')}</div>
      {notice.includes('cancelled') && <p className="notice">{notice}</p>}

      <section className="results-section" ref={resultsRef} aria-labelledby="results-title" aria-busy={busy}>
        <div className="results-heading"><div><h2 id="results-title">Your images {images.length > 0 && <span className="count-badge">{images.length}</span>}</h2><p>{images.length ? `${FORMATS[images[0].blob.type.split('/')[1]]?.label || images[0].blob.type.split('/')[1].toUpperCase()} images · ${formatBytes(images.reduce((sum, image) => sum + image.blob.size, 0))} total` : 'A new view of your document.'}</p></div>
          {images.length > 0 && <div className="results-actions"><ShareMenu images={images} onError={setError} /><button className="button primary" onClick={downloadAll} disabled={locked}>{zipping ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{zipping ? 'Preparing ZIP…' : 'Download all'}<span className="zip-label">ZIP</span></button></div>}
        </div>
        {images.length ? <div className="image-grid">{images.map((image) => <article className="image-card" key={image.name}><button className="image-preview" onClick={() => setPreview(image)} aria-label={`Preview page ${image.page}`}><img src={image.url} alt={`Converted PDF page ${image.page}`} loading="lazy" /><span className="zoom-hint"><ZoomIn size={17} />Preview</span></button><div className="image-card-bottom"><div><strong>Page {image.page}</strong><span>{image.width} × {image.height} px · {formatBytes(image.blob.size)}</span></div><button className="icon-button" aria-label={`Download page ${image.page}`} onClick={() => downloadBlob(image.blob, image.name)}><Download size={18} /></button></div></article>)}</div> : <div className="empty-results"><span className="empty-icon"><Layers size={28} strokeWidth={1.3} /></span><div><h3>A little empty. For now.</h3><p>Your converted pages will appear here, ready to download and share.</p></div><span className="output-formats">PNG <i /> JPG <i /> WebP</span></div>}
      </section>

      <div className="reassurance"><span><ShieldCheck size={17} />No uploads. No account. Just your files.</span><span><CheckCheck size={17} />Every page, its own image.</span></div>
    </main>

    <footer><span className="footer-brand">pagepress.</span><span>A simple tool for a change of format.</span><button className="text-button" onClick={() => setDialog('privacy')}><LockKeyhole size={13} />Privacy, by design</button></footer>

    {dialog && <Dialog title={dialog === 'privacy' ? 'Your document stays on your device.' : 'A few clicks. A new format.'} onClose={() => setDialog(null)}>{dialog === 'privacy' ? <div className="dialog-copy"><p>Pagepress opens and converts your PDF in this browser. It does not send your document or generated images to a server.</p><p>Files are kept in memory while this tab is open. Remove the document or close the tab to clear them. Downloads remain on your device.</p><p>Sharing image files uses your device’s share sheet. Social links open external services and share a link to Pagepress. Attach downloaded images yourself; those services have their own privacy policies.</p></div> : <div className="dialog-copy"><ol><li><strong>Choose your PDF.</strong> Drop in one file, up to 100 MB, or try the sample.</li><li><strong>Set your output.</strong> Pick PNG for sharp text, JPG for sharing, or WebP for compact images. Choose a resolution and your pages.</li><li><strong>Make it a picture.</strong> Convert, preview each page, and download images individually or together in a ZIP.</li></ol><p>Password protected PDFs need to be unlocked first. Large exports may need fewer pages or a lower resolution to stay within the estimated 256 MB memory budget.</p></div>}</Dialog>}
    {preview && <Dialog title={`Page ${preview.page}`} onClose={() => setPreview(null)} wide><div className="full-preview"><img src={preview.url} alt={`Full preview of converted page ${preview.page}`} /></div><div className="preview-footer"><span>{preview.width} × {preview.height} px · {formatBytes(preview.blob.size)}</span><button className="button primary" onClick={() => downloadBlob(preview.blob, preview.name)}><Download size={16} />Download image</button></div></Dialog>}
  </div>;
}
