import { useCallback, useRef, useState } from "react";
import QRCode from "qrcode";

const QR_PIXEL_SIZE = 384;

async function renderQr(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: QR_PIXEL_SIZE,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// Returns the current QR-code preview data URL plus an `update(value)` callback
// to (re)generate it. Generation is driven imperatively from event handlers
// rather than a prop-watching effect; only the most recent request is applied
// so stale async renders never overwrite a newer preview.
export function useQrPreview(): {
  preview: string | null;
  update: (value: string) => void;
} {
  const [preview, setPreview] = useState<string | null>(null);
  const generation = useRef(0);

  const update = useCallback((value: string) => {
    const trimmed = value.trim();
    const token = ++generation.current;
    if (!trimmed) {
      setPreview(null);
      return;
    }
    renderQr(trimmed)
      .then((url) => {
        if (token === generation.current) setPreview(url);
      })
      .catch(() => {
        if (token === generation.current) setPreview(null);
      });
  }, []);

  return { preview, update };
}
