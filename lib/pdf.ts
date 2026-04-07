import { Job, Photo } from './db';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export async function generatePDFBlob(job: Job, photos: Photo[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 16;
  const contentW = W - margin * 2;
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

    // Page break check — leave enough room for at minimum photo number + small image
    if (y > 260) {
      doc.addPage();
      y = 16;
    }

    // Photo number badge
    doc.setFillColor(46, 125, 50);
    doc.roundedRect(margin, y, 18, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${i + 1}`, margin + 9, y + 5, { align: 'center' });

    // Date
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(photo.takenAt), margin + 22, y + 5);
    y += 10;

    // Image
    try {
      const dataUrl = await blobToDataUrl(photo.blob);
      const imgH = 80;
      doc.addImage(dataUrl, 'JPEG', margin, y, contentW, imgH, undefined, 'FAST');
      y += imgH + 3;
    } catch {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, contentW, 30, 'F');
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(9);
      doc.text('Image unavailable', W / 2, y + 16, { align: 'center' });
      y += 33;
    }

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

  // Footer on last page
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(`FieldShots · ${job.referenceCode} · ${formatDate(new Date().toISOString())}`, W / 2, 290, { align: 'center' });

  return doc.output('blob');
}

export async function sharePDF(job: Job, photos: Photo[]) {
  const blob = await generatePDFBlob(job, photos);
  const file = new File([blob], `FieldShots-${job.referenceCode}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `FieldShots - ${job.name}` });
  } else {
    // Fallback: download
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

  // Try Web Share API with file (works on iOS Safari)
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `FieldShots Report — ${job.name}`,
      text: `Please find attached the FieldShots photo report for job ${job.referenceCode}: ${job.name}.`,
    });
  } else {
    // Fallback: mailto with no attachment (browsers can't attach files to mailto)
    const subject = encodeURIComponent(`FieldShots Report — ${job.name} (${job.referenceCode})`);
    const body = encodeURIComponent(`Please find attached the FieldShots report for job ${job.referenceCode}: ${job.name}.\n\nGenerated by FieldShots.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
}
