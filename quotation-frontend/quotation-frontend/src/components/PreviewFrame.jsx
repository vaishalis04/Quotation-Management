import { useEffect, useState } from 'react';
import { loadPreview, NATIVE_LABEL } from '../api/preview';
import { ErrorBox, Spinner } from './ui';

/**
 * Shows the rendered quotation design.
 *  - html layout  -> sandboxed <iframe srcdoc> (no scripts can run, whatever the uploaded layout contains)
 *  - docx / xlsx  -> PDF preview made by the server (needs LibreOffice there); otherwise a hint is shown
 */
export default function PreviewFrame({ path, query, onLoaded, onDownloadNative }) {
  const [state, setState] = useState({ loading: true });
  const queryKey = JSON.stringify(query || {});

  useEffect(() => {
    let cancelled = false;
    let blobUrl = null;
    setState({ loading: true });
    loadPreview(path, query)
      .then((info) => {
        if (cancelled) { if (info.url) URL.revokeObjectURL(info.url); return; }
        blobUrl = info.url || null;
        setState({ loading: false, info });
        onLoaded && onLoaded(info);
      })
      .catch((error) => !cancelled && setState({ loading: false, error }));
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey]);

  if (state.loading) return <Spinner text="Preparing preview…" />;
  if (state.error) return <ErrorBox error={state.error} />;
  const { info } = state;

  if (info.kind === 'html') {
    return <iframe className="preview-frame" title="Quotation design" sandbox="" srcDoc={info.html} />;
  }
  if (info.kind === 'pdf') {
    return <iframe className="preview-frame" title="Quotation design" src={info.url} />;
  }
  return (
    <div className="notice">
      <p><strong>No in-browser preview for this {NATIVE_LABEL[info.native]} layout.</strong></p>
      <p className="muted">{info.message}</p>
      <p className="muted">Install LibreOffice on the server to see a PDF preview here. You can still download the {NATIVE_LABEL[info.native]} file.</p>
      {onDownloadNative && <button className="btn primary" onClick={onDownloadNative}>Download {NATIVE_LABEL[info.native]} file</button>}
    </div>
  );
}
