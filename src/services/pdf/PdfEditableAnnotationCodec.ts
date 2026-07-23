import { PDFDict, PDFDocument, PDFName, PDFString, rgb } from 'pdf-lib';
import type { PdfInkAnnotation } from './PdfAnnotationStore';

const APP_TITLE = 'Revision Engine';
const APP_ID_PREFIX = 'revision-engine:';

function colour(hex: string) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255] as const;
}

function pdfNumber(value: number) {
  return Number(value.toFixed(3));
}

function removePreviousAppAnnotations(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = annots.size() - 1; index >= 0; index -= 1) {
      const reference = annots.get(index);
      const annotation = pdf.context.lookup(reference);
      if (!(annotation instanceof PDFDict)) continue;
      const name = annotation.lookup(PDFName.of('NM'));
      const title = annotation.lookup(PDFName.of('T'));
      const nameText = name instanceof PDFString ? name.decodeText() : '';
      const titleText = title instanceof PDFString ? title.decodeText() : '';
      if (nameText.startsWith(APP_ID_PREFIX) || titleText === APP_TITLE) annots.remove(index);
    }
  }
}

function addEditableAnnotation(pdf: PDFDocument, annotation: PdfInkAnnotation) {
  const page = pdf.getPages()[annotation.page - 1];
  if (!page || annotation.points.length < 2) return;
  const { width, height } = page.getSize();
  const straight = annotation.tool === 'line' || (annotation.tool === 'highlighter' && annotation.straight);
  const source = straight ? [annotation.points[0]!, annotation.points.at(-1)!] : annotation.points;
  const points = source.map((point) => ({ x: point.x * width, y: point.y * height }));
  const thickness = annotation.size * (annotation.tool === 'highlighter' ? 5 : 1.3);
  const opacity = annotation.tool === 'highlighter' ? annotation.opacity ?? .3 : .95;
  const padding = Math.max(2, thickness * 1.5);
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const rect = [Math.max(0, Math.min(...xs) - padding), Math.max(0, Math.min(...ys) - padding), Math.min(width, Math.max(...xs) + padding), Math.min(height, Math.max(...ys) + padding)].map(pdfNumber);
  const inkList = points.flatMap((point) => [pdfNumber(point.x), pdfNumber(point.y)]);
  const [red, green, blue] = colour(annotation.color);
  const appearance = [`${pdfNumber(thickness)} w 1 J 1 j`, `${pdfNumber(red)} ${pdfNumber(green)} ${pdfNumber(blue)} RG`, opacity < 1 ? '/GS0 gs' : '', ...points.map((point, index) => `${pdfNumber(point.x)} ${pdfNumber(point.y)} ${index === 0 ? 'm' : 'l'}`), 'S'].filter(Boolean).join('\n');
  const resources = opacity < 1 ? { ExtGState: { GS0: { Type: 'ExtGState', CA: opacity, ca: opacity, ...(annotation.tool === 'highlighter' ? { BM: 'Multiply' } : {}) } } } : {};
  const appearanceStream = pdf.context.flateStream(appearance, { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: rect, Resources: resources });
  const appearanceRef = pdf.context.register(appearanceStream);
  const annotationDict = pdf.context.obj({
    Type: 'Annot', Subtype: 'Ink', Rect: rect, InkList: [inkList], C: [red, green, blue], CA: opacity,
    BS: { Type: 'Border', W: thickness, S: 'S' }, Border: [0, 0, thickness], F: 4,
    NM: PDFString.of(`${APP_ID_PREFIX}${annotation.id}`), T: PDFString.of(APP_TITLE),
    Contents: PDFString.of(annotation.tool === 'highlighter' ? 'Highlight' : annotation.tool === 'line' ? 'Line' : 'Pen stroke'),
    IT: annotation.tool === 'highlighter' ? 'InkHighlight' : undefined,
    AP: { N: appearanceRef },
  });
  page.node.addAnnot(pdf.context.register(annotationDict));
}

function addFlattenedAnnotations(pdf: PDFDocument, annotations: readonly PdfInkAnnotation[]) {
  for (const annotation of annotations) {
    const page = pdf.getPages()[annotation.page - 1]; if (!page) continue;
    const { width, height } = page.getSize();
    const straight = annotation.tool === 'line' || (annotation.tool === 'highlighter' && annotation.straight);
    const points = straight && annotation.points.length > 1 ? [annotation.points[0]!, annotation.points.at(-1)!] : annotation.points;
    const [red, green, blue] = colour(annotation.color);
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!; const to = points[index]!;
      const pressure = annotation.pressureEnabled === false ? .5 : (from.pressure + to.pressure) / 2;
      page.drawLine({ start: { x: from.x * width, y: from.y * height }, end: { x: to.x * width, y: to.y * height }, thickness: annotation.size * (annotation.tool === 'highlighter' ? 5 : .65 + pressure * .7), color: rgb(red, green, blue), opacity: annotation.tool === 'highlighter' ? annotation.opacity ?? .3 : .95 });
    }
  }
}

export async function createAnnotatedPdf(bytes: Uint8Array, annotations: readonly PdfInkAnnotation[], editable: boolean) {
  const pdf = await PDFDocument.load(bytes);
  removePreviousAppAnnotations(pdf);
  if (editable) for (const annotation of annotations) addEditableAnnotation(pdf, annotation);
  else addFlattenedAnnotations(pdf, annotations);
  return new Uint8Array(await pdf.save());
}
