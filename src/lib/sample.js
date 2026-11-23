// A small, original three-page vector PDF. No network request is needed for the demo.
export function samplePdf() {
  const encoder = new TextEncoder();
  const streams = [
    '0.95 0.96 0.93 rg 0 0 420 560 re f\n0.14 0.24 0.24 rg BT /F1 12 Tf 34 513 Td (FIELD NOTES / 001) Tj ET\nBT /F2 42 Tf 34 435 Td (A quieter) Tj 0 -48 Td (perspective.) Tj ET\n0.69 0.76 0.57 rg 34 120 352 220 re f\n0.26 0.38 0.29 rg 34 120 m 160 303 l 300 120 l f\n0.39 0.51 0.36 rg 150 120 m 280 270 l 386 120 l f\n0.96 0.86 0.57 rg 310 290 32 32 re f\n0.14 0.24 0.24 rg BT /F1 11 Tf 34 72 Td (Observations from the everyday.) Tj ET\nBT /F1 9 Tf 34 39 Td (PAGEPRESS JOURNAL) Tj 310 0 Td (01) Tj ET',
    '0.97 0.96 0.92 rg 0 0 420 560 re f\n0.14 0.24 0.24 rg BT /F1 12 Tf 34 513 Td (FIELD NOTES / 002) Tj ET\nBT /F2 38 Tf 34 430 Td (Make room) Tj 0 -45 Td (for the small) Tj 0 -45 Td (things.) Tj ET\n0.75 0.39 0.25 rg 34 130 112 130 re f\n0.89 0.71 0.48 rg 154 130 112 130 re f\n0.50 0.59 0.48 rg 274 130 112 130 re f\nBT /F1 11 Tf 34 83 Td (A little space. A different point of view.) Tj ET\nBT /F1 9 Tf 34 39 Td (PAGEPRESS JOURNAL) Tj 310 0 Td (02) Tj ET',
    '0.90 0.93 0.96 rg 0 0 420 560 re f\n0.14 0.24 0.33 rg BT /F1 12 Tf 34 513 Td (FIELD NOTES / 003) Tj ET\nBT /F2 40 Tf 34 432 Td (Keep looking.) Tj ET\n0.30 0.45 0.58 rg 34 170 352 190 re f\n0.55 0.67 0.72 rg 34 170 m 34 260 l 150 210 l 260 290 l 386 240 l 386 170 l f\n0.14 0.24 0.33 rg BT /F1 12 Tf 34 100 Td (Good things are often hiding in plain sight.) Tj ET\nBT /F1 9 Tf 34 39 Td (PAGEPRESS JOURNAL) Tj 310 0 Td (03) Tj ET',
  ];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R 7 0 R 9 0 R] /Count 3 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  for (const [index, stream] of streams.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([encoder.encode(pdf)], 'Field notes.pdf', { type: 'application/pdf' });
}
