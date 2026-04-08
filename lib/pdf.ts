import { Job, Photo } from './db';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 }); // fallback aspect ratio
    img.src = dataUrl;
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export async function generatePDFBlob(job: Job, photos: Photo[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 16;
  const contentW = W - margin * 2;
  // Max image height — never exceed this so there's room for notes + page breaks
  const maxImgH = 120;
  let y = 0;

  // Header
  doc.setFillColor(27, 94, 32);
  doc.rect(0, 0, W, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FIELDSHOTS REPORT', margin, 10);
  doc.setFontSize(16);
  doc.text(job.name, margin, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${job.referenceCode}`, margin, 28);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, W - margin, 28, { align: 'right' });

  y = 44;

  // Summary
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`${photos.length} Photos  ·  ${photos.filter((p) => p.notes).length} with Notes`, margin, y);
  y += 6;

  if (job.description) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const lines = doc.splitTextToSize(job.description, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  }

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // Photos
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];

    let dataUrl = '';
    let imgH = 60;

    try {
      dataUrl = await blobToDataUrl(photo.blob);
      // Calculate height that preserves the photo's actual aspect ratio
      const { w, h } = await getImageDimensions(dataUrl);
      const ratio = h / w;
      imgH = Math.min(contentW * ratio, maxImgH);
    } catch {
      // handled below
    }

    const blockH = 10 + imgH + (photo.notes ? 20 : 0) + 10;
    if (y + blockH > 277) {
      doc.addPage();
      y = 16;
    }

    // Photo number + date
    doc.setFillColor(46, 125, 50);
    doc.roundedRect(margin, y, 18, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${i + 1}`, margin + 9, y + 5, { align: 'center' });

    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(photo.takenAt), margin + 22, y + 5);
    y += 10;

    // Image
    if (dataUrl) {
      // If hasTimestamp, burn the timestamp onto a canvas before adding to PDF
      let finalDataUrl = dataUrl;
      if (photo.hasTimestamp) {
        finalDataUrl = await burnTimestampForPDF(dataUrl, formatTimestamp(photo.takenAt));
      }
      doc.addImage(finalDataUrl, 'JPEG', margin, y, contentW, imgH, undefined, 'FAST');
    } else {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, contentW, imgH, 'F');
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(9);
      doc.text('Image unavailable', W / 2, y + imgH / 2, { align: 'center' });
    }
    y += imgH + 3;

    // Notes
    if (photo.notes) {
      doc.setFillColor(248, 248, 248);
      const noteLines = doc.splitTextToSize(photo.notes, contentW - 8);
      const noteH = noteLines.length * 5 + 6;
      doc.roundedRect(margin, y, contentW, noteH, 2, 2, 'F');
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      doc.text(noteLines, margin + 4, y + 5);
      y += noteH + 4;
    }

    y += 6;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(`FieldShots · ${job.referenceCode} · ${formatDate(new Date().toISOString())}`, W / 2, 290, { align: 'center' });

  return doc.output('blob');
}

async function burnTimestampForPDF(dataUrl: string, ts: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const fontSize = Math.round(canvas.width * 0.022);
      ctx.font = `bold ${fontSize}px monospace`;
      const padding = Math.round(fontSize * 0.5);
      const textW = ctx.measureText(ts).width;
      const boxX = padding;
      const boxY = canvas.height - padding * 3;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(boxX - 6, boxY - fontSize, textW + 12, fontSize * 1.6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ts, boxX, boxY + fontSize * 0.4);

      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function sharePDF(job: Job, photos: Photo[]) {
  const blob = await generatePDFBlob(job, photos);
  const file = new File([blob], `FieldShots-${job.referenceCode}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `FieldShots - ${job.name}` });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FieldShots-${job.referenceCode}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export async function emailPDF(job: Job, photos: Photo[]) {
  const blob = await generatePDFBlob(job, photos);
  const file = new File([blob], `FieldShots-${job.referenceCode}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `FieldShots Report — ${job.name}`,
      text: `Please find attached the FieldShots photo report for job ${job.referenceCode}: ${job.name}.`,
    });
  } else {
    const subject = encodeURIComponent(`FieldShots Report — ${job.name} (${job.referenceCode})`);
    const body = encodeURIComponent(`Please find attached the FieldShots report for job ${job.referenceCode}: ${job.name}.\n\nGenerated by FieldShots.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
}
