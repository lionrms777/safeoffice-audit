import { 
  BorderStyle,
  Document, 
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer, 
  PageNumber,
  Paragraph, 
  TableCell, 
  Table,
  TableRow,
  TextRun,
  WidthType, 
  AlignmentType, 
  VerticalAlign,
  TableLayoutType,
  TableOfContents,
} from 'docx';
import { saveAs } from 'file-saver';
import { Audit } from '../types';
import { formatDate } from './utils';
import { getPhotoBytesByPreference } from './firebaseStorage';

type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp';

interface ImageAsset {
  data: Uint8Array;
  type: DocxImageType;
  width: number;
  height: number;
}
import { DEFAULT_NARRATIVE, getRiskBand } from '../constants';

const BRAND_NAME = 'Safety is the Key Ltd';
const REPORT_TITLE = 'Health and Safety Audit Report';

const COLOR_TEXT = '1F2937';
const COLOR_MUTED = '64748B';
const COLOR_HEADER_FILL = 'E2E8F0';
const COLOR_HEADER_TEXT = '0F172A';
const COLOR_ACTION_HEADER_FILL = '1E3A8A';

const TABLE_BORDER_OUTER = { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' };
const TABLE_BORDER_INNER = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };

function normalizeRiskLabel(value?: string): 'low' | 'medium' | 'high' {
  const v = (value || '').toLowerCase();
  if (v.includes('very high') || v.includes('high')) return 'high';
  if (v.includes('moderate') || v.includes('medium')) return 'medium';
  return 'low';
}

function getRiskFill(value?: string): string {
  const level = normalizeRiskLabel(value);
  if (level === 'high') return 'FDE8E8';
  if (level === 'medium') return 'FFF4DB';
  return 'EAF7EE';
}

function getRiskTextColor(value?: string): string {
  const level = normalizeRiskLabel(value);
  if (level === 'high') return '991B1B';
  if (level === 'medium') return '92400E';
  return '166534';
}

function getComplianceFill(score: number): string {
  if (score >= 85) return 'EAF7EE';
  if (score >= 70) return 'FFF4DB';
  if (score >= 55) return 'FDECD9';
  return 'FDE8E8';
}

function getComplianceTextColor(score: number): string {
  if (score >= 85) return '166534';
  if (score >= 70) return '92400E';
  if (score >= 55) return '9A3412';
  return '991B1B';
}

function getComplianceRating(score: number): string {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Needs Improvement';
  return 'Poor';
}

/** Wrap nullable narrative text — falls back to the supplied default. */
function narrativeText(value: string | undefined, defaultValue: string): string {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

/** Render a multi-line narrative paragraph (preserving newlines as separate paragraphs). */
function narrativeParagraphs(text: string): Paragraph[] {
  return text.split('\n').filter(l => l.trim().length > 0).map(line =>
    new Paragraph({
      spacing: { after: 170, line: 300 },
      children: [
        new TextRun({ text: line.trim(), size: 22, color: COLOR_TEXT, font: 'Calibri' }),
      ],
    })
  );
}



function detectImageType(url?: string, data?: Uint8Array): DocxImageType {
  const lowerUrl = (url || '').toLowerCase();
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'jpg';
  if (lowerUrl.endsWith('.gif')) return 'gif';
  if (lowerUrl.endsWith('.bmp')) return 'bmp';
  if (lowerUrl.endsWith('.png')) return 'png';

  if (data && data.length >= 4) {
    const [b0, b1, b2, b3] = data;
    if (b0 === 0xff && b1 === 0xd8) return 'jpg';
    if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'gif';
    if (b0 === 0x42 && b1 === 0x4d) return 'bmp';
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'png';
  }

  return 'png';
}

function getImageSignatureType(data?: Uint8Array): 'jpg' | 'png' | 'gif' | 'bmp' | 'unknown' {
  if (!data || data.length < 4) return 'unknown';
  const [b0, b1, b2, b3] = data;
  if (b0 === 0xff && b1 === 0xd8) return 'jpg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'png';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'gif';
  if (b0 === 0x42 && b1 === 0x4d) return 'bmp';
  return 'unknown';
}

async function transcodeToPng(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image for PNG conversion'));
      image.src = url;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      URL.revokeObjectURL(url);
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    URL.revokeObjectURL(url);
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  }
}

async function transcodeToJpegNormalized(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image for JPEG conversion'));
      image.src = url;
    });

    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;
    if (!srcWidth || !srcHeight) {
      URL.revokeObjectURL(url);
      return null;
    }

    // Keep image quality high while constraining very large images for DOCX compatibility.
    const maxW = 1800;
    const maxH = 1400;
    const ratio = Math.min(maxW / srcWidth, maxH / srcHeight, 1);
    const width = Math.max(1, Math.round(srcWidth * ratio));
    const height = Math.max(1, Math.round(srcHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }

    // Fill white background for compatibility with transparent source images.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
    });

    URL.revokeObjectURL(url);
    if (!jpegBlob) return null;
    return new Uint8Array(await jpegBlob.arrayBuffer());
  } catch {
    return null;
  }
}

async function ensureDocxCompatibleAsset(asset: ImageAsset): Promise<ImageAsset> {
  // Force a predictable Word-safe image stream regardless of source format/profile.
  const normalizedJpeg = await transcodeToJpegNormalized(asset.data);
  if (normalizedJpeg) {
    const { width, height } = await getImageDimensions(normalizedJpeg);
    return {
      data: normalizedJpeg,
      type: 'jpg',
      width,
      height,
    };
  }

  const sig = getImageSignatureType(asset.data);
  if (sig !== 'unknown') {
    return { ...asset, type: sig };
  }

  const converted = await transcodeToPng(asset.data);
  if (!converted) return asset;

  const { width, height } = await getImageDimensions(converted);
  return {
    data: converted,
    type: 'png',
    width,
    height,
  };
}

function safeText(value?: string) {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : 'N/A';
}

function getLikelihoodLabel(value?: number): string {
  switch (value) {
    case 1:
      return '1 Rare';
    case 2:
      return '2 Unlikely';
    case 3:
      return '3 Possible';
    case 4:
      return '4 Likely';
    case 5:
      return '5 Almost Certain';
    default:
      return 'N/A';
  }
}

function getSeverityLabel(value?: number): string {
  switch (value) {
    case 1:
      return '1 Negligible';
    case 2:
      return '2 Minor';
    case 3:
      return '3 Moderate';
    case 4:
      return '4 Major';
    case 5:
      return '5 Catastrophic';
    default:
      return 'N/A';
  }
}

function formatRiskCell(likelihood?: number, severity?: number, score?: number): string {
  if (!likelihood || !severity || !score) return 'N/A';
  const band = getRiskBand(score);
  return `${score} (${band}) | ${getLikelihoodLabel(likelihood)} x ${getSeverityLabel(severity)}`;
}

function getAuditMetrics(audit: Audit) {
  const totalItems = audit.sections.reduce((acc, section) => acc + section.items.length, 0);
  const compliantItems = audit.sections.reduce(
    (acc, section) => acc + section.items.filter((item) => item.status === 'positive').length,
    0
  );
  const nonCompliantItems = audit.sections.reduce(
    (acc, section) => acc + section.items.filter((item) => item.status === 'negative').length,
    0
  );
  const notApplicableItems = audit.sections.reduce(
    (acc, section) => acc + section.items.filter((item) => item.status === 'na').length,
    0
  );
  const inScopeItems = Math.max(totalItems - notApplicableItems, 0);
  const complianceRate = inScopeItems > 0 ? Math.round((compliantItems / inScopeItems) * 100) : 100;
  const riskScores = (audit.findings || [])
    .map((finding) => finding.riskScore)
    .filter((score) => Number.isFinite(score) && score > 0);
  const avgRiskScore = riskScores.length > 0
    ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
    : null;
  const riskHealthScore = avgRiskScore !== null
    ? Math.round(Math.max(0, 100 - ((avgRiskScore / 25) * 100)))
    : complianceRate;
  const generalComplianceScore = Math.round((complianceRate * 0.65) + (riskHealthScore * 0.35));
  const generalComplianceRating = getComplianceRating(generalComplianceScore);
  const highRiskFindings = (audit.findings || []).filter(
    (finding) => finding.riskBand === 'High' || finding.riskBand === 'Very High'
  ).length;

  return {
    totalItems,
    compliantItems,
    nonCompliantItems,
    notApplicableItems,
    inScopeItems,
    complianceRate,
    avgRiskScore,
    riskHealthScore,
    generalComplianceScore,
    generalComplianceRating,
    highRiskFindings,
  };
}

function createSectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 520, after: 220 },
    border: {
      bottom: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 6 },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        color: COLOR_HEADER_TEXT,
        size: 28,
        font: 'Calibri',
      }),
    ],
  });
}

function createHeaderCell(text: string, fill = 'E2E8F0') {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text, bold: true, color: COLOR_HEADER_TEXT, size: 21, font: 'Calibri' })],
      }),
    ],
    shading: { fill },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
  });
}

function createActionHeaderCell(text: string) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })],
      }),
    ],
    shading: { fill: COLOR_ACTION_HEADER_FILL },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
  });
}

function createBodyCell(
  text: string,
  options?: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    fill?: string;
    color?: string;
  }
) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: options?.align,
        spacing: { before: 70, after: 70 },
        children: [
          new TextRun({
            text: safeText(text),
            bold: options?.bold,
            color: options?.color || COLOR_TEXT,
            size: 21,
            font: 'Calibri',
          }),
        ],
      }),
    ],
    shading: options?.fill ? { fill: options.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
  });
}

function createBodyCellParagraphs(
  lines: string[],
  options?: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    fill?: string;
    color?: string;
  }
) {
  return new TableCell({
    children: lines
      .map((line) => safeText(line).trim())
      .filter((line) => line.length > 0)
      .map((line) => new Paragraph({
        alignment: options?.align,
        spacing: { before: 35, after: 35 },
        children: [
          new TextRun({
            text: line,
            bold: options?.bold,
            color: options?.color || COLOR_TEXT,
            size: 21,
            font: 'Calibri',
          }),
        ],
      })),
    shading: options?.fill ? { fill: options.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
  });
}

function createImageGalleryCell(
  images: Array<{
    imageData: Uint8Array | null;
    imageType: DocxImageType;
    imageWidth: number;
    imageHeight: number;
  }>,
  options?: {
    emptyText?: string;
    maxWidth?: number;
    maxHeight?: number;
  }
) {
  const validImages = images.filter((image) => Boolean(image.imageData));
  if (validImages.length === 0) {
    return createBodyCell(options?.emptyText || 'No image', { align: AlignmentType.CENTER, color: '64748B' });
  }

  return new TableCell({
    children: validImages.map((image) => {
      const imageSize = fitImageWithin(
        image.imageWidth,
        image.imageHeight,
        options?.maxWidth ?? 120,
        options?.maxHeight ?? 85,
      );

      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 50, after: 50 },
        children: [
          new ImageRun({
            type: image.imageType,
            data: image.imageData!,
            transformation: imageSize,
          }),
        ],
      });
    }),
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
  });
}

function defaultTableBorders() {
  return {
    top: TABLE_BORDER_OUTER,
    bottom: TABLE_BORDER_OUTER,
    left: TABLE_BORDER_OUTER,
    right: TABLE_BORDER_OUTER,
    insideHorizontal: TABLE_BORDER_INNER,
    insideVertical: TABLE_BORDER_INNER,
  };
}

/** Load image bytes via Firebase Storage SDK — bypasses CORS entirely. */
async function getImageDimensions(data: Uint8Array): Promise<{ width: number; height: number }> {
  try {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to decode image dimensions'));
      img.src = url;
    });
    const width = image.naturalWidth || image.width || 800;
    const height = image.naturalHeight || image.height || 600;
    URL.revokeObjectURL(url);
    return { width, height };
  } catch {
    return { width: 800, height: 600 };
  }
}

function fitImageWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const safeW = width > 0 ? width : maxWidth;
  const safeH = height > 0 ? height : maxHeight;
  const ratio = Math.min(maxWidth / safeW, maxHeight / safeH, 1);
  return {
    width: Math.max(120, Math.round(safeW * ratio)),
    height: Math.max(80, Math.round(safeH * ratio)),
  };
}

/** Load image bytes via Firebase Storage SDK — bypasses CORS entirely. */
async function loadImageAsset(photoPath?: string, photoUrl?: string, timeoutMs = 20000): Promise<ImageAsset | null> {
  try {
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Image load timed out')), ms)
        ),
      ]);
    const data = await withTimeout(getPhotoBytesByPreference(photoPath, photoUrl), timeoutMs);
    if (!data) return null;
    const { width, height } = await withTimeout(getImageDimensions(data), 5000);
    const rawAsset: ImageAsset = { data, type: detectImageType(photoUrl || photoPath, data), width, height };
    return await withTimeout(ensureDocxCompatibleAsset(rawAsset), 8000);
  } catch (err) {
    console.warn('⚠️ loadImageAsset failed, skipping image:', err);
    return null;
  }
}

function dataUrlToBytes(dataUrl: string): { data: Uint8Array; type: DocxImageType } | null {
  try {
    const [meta, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mime = meta.match(/data:(.*?);base64/i)?.[1]?.toLowerCase() || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    let type: DocxImageType = 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) type = 'jpg';
    else if (mime.includes('gif')) type = 'gif';
    else if (mime.includes('bmp')) type = 'bmp';
    return { data: bytes, type };
  } catch {
    return null;
  }
}

async function loadImageAssetFromDataUrl(dataUrl?: string): Promise<ImageAsset | null> {
  const parsed = dataUrl ? dataUrlToBytes(dataUrl) : null;
  if (!parsed) return null;
  const { width, height } = await getImageDimensions(parsed.data);
  const rawAsset: ImageAsset = {
    data: parsed.data,
    type: parsed.type,
    width,
    height,
  };
  return await ensureDocxCompatibleAsset(rawAsset);
}

function getExecutiveSummary(audit: Audit) {
  const metrics = getAuditMetrics(audit);
  let summary = `This Health and Safety Audit was conducted at ${audit.siteName} for ${audit.clientName} on ${formatDate(audit.auditDate)}. `;
  summary += `A total of ${metrics.totalItems} items were inspected across ${audit.sections.length} sections. `;

  if (metrics.nonCompliantItems === 0) {
    summary += `The site demonstrated an excellent level of compliance with no non-conformities identified during the inspection. `;
  } else {
    summary += `The audit identified ${metrics.nonCompliantItems} comments, resulting in an overall assessment score of ${metrics.complianceRate}%. `;

    if (metrics.highRiskFindings > 0) {
      summary += `Of particular concern are ${metrics.highRiskFindings} high-risk findings that require immediate attention to mitigate significant risks. `;
    }
  }

  summary += `The automatically generated general compliance score, based on both hazard outcomes and risk severity, is ${metrics.generalComplianceScore}% (${metrics.generalComplianceRating}). `;

  return summary;
}

export async function generateAuditReport(audit: Audit) {
  const metrics = getAuditMetrics(audit);
  const executiveSummaryText = getExecutiveSummary(audit);
  const generatedOn = new Date().toISOString();

  const uniqueFindings = (audit.findings || [])
    .filter((finding, index, arr) => arr.findIndex((f) => f.itemId === finding.itemId) === index)
    .sort((a, b) => {
      const sectionCompare = a.sectionTitle.localeCompare(b.sectionTitle);
      if (sectionCompare !== 0) return sectionCompare;
      const riskCompare = b.riskScore - a.riskScore;
      if (riskCompare !== 0) return riskCompare;
      return a.title.localeCompare(b.title);
    });

  // Map finding.id → 1-based index (F1, F2, …) based on the sorted Findings Register order
  const findingRefMap = new Map<string, number>();
  uniqueFindings.forEach((f, i) => findingRefMap.set(f.id, i + 1));

  const uniqueActions = (audit.actions || [])
    .filter((action, index, arr) => arr.findIndex((a) => a.id === action.id) === index)
    .sort((a, b) => {
      // Sort by the finding's F-number so Action Plan order mirrors Findings Register
      const aFRef = findingRefMap.get(a.findingId) ?? Number.MAX_SAFE_INTEGER;
      const bFRef = findingRefMap.get(b.findingId) ?? Number.MAX_SAFE_INTEGER;
      if (aFRef !== bFRef) return aFRef - bFRef;
      const riskCompare = b.riskScore - a.riskScore;
      if (riskCompare !== 0) return riskCompare;
      return a.actionRequired.localeCompare(b.actionRequired);
    });

  const positiveObservationSections = audit.sections.map((section) => {
    const positiveItems = section.items.filter((item) => item.status === 'positive');
    const observedLines = positiveItems
      .map((item) => [
        item.question?.trim(),
        item.positiveStatement?.trim(),
        item.comment?.trim(),
      ].filter(Boolean).join(' - '))
      .filter((line) => line.length > 0);

    return {
      sectionId: section.id,
      sectionTitle: section.title,
      observedLines: observedLines.length > 0
        ? observedLines
        : ['No positive observations recorded.'],
      photos: positiveItems
        .filter((item) => Boolean(item.photoUrl || item.photoPath || item.photoDataUrl))
        .map((item) => ({
          photoUrl: item.photoUrl || '',
          photoPath: item.photoPath || '',
          photoDataUrl: item.photoDataUrl || '',
          hasPhotoRef: Boolean(item.photoUrl || item.photoPath || item.photoDataUrl),
        })),
    };
  });

  // Fetch ALL images in a single parallel batch (cover + every finding photo)
  const findingRowsMeta = uniqueFindings.map((finding, index) => {
    const section = audit.sections.find(s => s.id === finding.sectionId);
    const item = section?.items.find(i => i.id === finding.itemId);
    return {
      ...finding,
      finding,
      refCode: `F${index + 1}`,
      rowKind: 'finding' as const,
      sectionTitle: finding.sectionTitle,
      title: finding.title,
      observation: finding.observation,
      recommendedAction: finding.recommendedAction,
      likelihood: finding.likelihood,
      severity: finding.severity,
      riskScore: finding.riskScore,
      riskBand: finding.riskBand,
      priority: finding.priority,
      targetDate: finding.targetDate,
      responsiblePerson: finding.responsiblePerson,
      status: finding.status,
      photoUrl: item?.photoUrl || '',
      photoPath: item?.photoPath || '',
      photoDataUrl: item?.photoDataUrl || '',
      itemComment: item?.comment || '',
      hasPhotoRef: Boolean(item?.photoUrl || item?.photoPath || item?.photoDataUrl),
    };
  });

  const [logoAsset, buildingAsset] = await Promise.all([
    (audit.siteLogoPath || audit.siteLogoUrl)
      ? loadImageAsset(audit.siteLogoPath, audit.siteLogoUrl, 45000)
      : (audit.siteLogoDataUrl ? loadImageAssetFromDataUrl(audit.siteLogoDataUrl) : Promise.resolve(null)),
    (audit.siteBuildingPhotoPath || audit.siteBuildingPhotoUrl)
      ? loadImageAsset(audit.siteBuildingPhotoPath, audit.siteBuildingPhotoUrl, 45000)
      : (audit.siteBuildingPhotoDataUrl ? loadImageAssetFromDataUrl(audit.siteBuildingPhotoDataUrl) : Promise.resolve(null)),
  ]);

  const [coverLogoFinal, coverBuildingFinal] = await Promise.all([
    logoAsset || loadImageAssetFromDataUrl(audit.siteLogoDataUrl),
    buildingAsset || loadImageAssetFromDataUrl(audit.siteBuildingPhotoDataUrl),
  ]);

  const findingAssets = await Promise.all(
    findingRowsMeta.map(({ photoPath, photoUrl }) =>
      (photoPath || photoUrl) ? loadImageAsset(photoPath, photoUrl) : Promise.resolve(null)
    )
  );

  const findingsWithImages = await Promise.all(findingRowsMeta.map(async ({ hasPhotoRef, itemComment, photoDataUrl, ...row }, i) => {
    const asset = findingAssets[i] || await loadImageAssetFromDataUrl(photoDataUrl);
    return {
      ...row,
      hasPhotoRef,
      itemComment,
      imageData: asset?.data ?? null,
      imageType: (asset?.type ?? 'png') as DocxImageType,
      imageWidth: asset?.width ?? 800,
      imageHeight: asset?.height ?? 600,
    };
  }));

  const positivePhotoEntries = positiveObservationSections.flatMap((section) => section.photos);
  const positivePhotoAssets = await Promise.all(
    positivePhotoEntries.map(({ photoPath, photoUrl }) =>
      (photoPath || photoUrl) ? loadImageAsset(photoPath, photoUrl) : Promise.resolve(null)
    )
  );

  let positivePhotoIndex = 0;
  const positiveObservationSectionsWithImages = await Promise.all(positiveObservationSections.map(async (section) => {
    const photos = await Promise.all(section.photos.map(async ({ hasPhotoRef, photoDataUrl }) => {
      const asset = positivePhotoAssets[positivePhotoIndex++] || await loadImageAssetFromDataUrl(photoDataUrl);
      return {
        hasPhotoRef,
        imageData: asset?.data ?? null,
        imageType: (asset?.type ?? 'png') as DocxImageType,
        imageWidth: asset?.width ?? 800,
        imageHeight: asset?.height ?? 600,
      };
    }));

    return {
      ...section,
      photos,
    };
  }));

  const referencedPhotoCount = findingsWithImages.filter((entry) => entry.hasPhotoRef).length
    + positiveObservationSectionsWithImages.flatMap((section) => section.photos).filter((photo) => photo.hasPhotoRef).length;
  const embeddedPhotoCount = findingsWithImages.filter((entry) => Boolean(entry.imageData)).length
    + positiveObservationSectionsWithImages.flatMap((section) => section.photos).filter((photo) => Boolean(photo.imageData)).length;

  const generatedDate = formatDate(generatedOn);
  const hasLogoRef = Boolean(audit.siteLogoPath || audit.siteLogoUrl || audit.siteLogoDataUrl);
  const hasBuildingRef = Boolean(audit.siteBuildingPhotoPath || audit.siteBuildingPhotoUrl || audit.siteBuildingPhotoDataUrl);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
            color: COLOR_TEXT,
          },
          paragraph: {
            spacing: { after: 140, line: 300 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1080,
              bottom: 1080,
              left: 1080,
              header: 720,
              footer: 720,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                border: {
                  bottom: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 4 },
                },
                children: [
                  new TextRun({ text: `${BRAND_NAME}  |  `, bold: true, size: 20, color: COLOR_HEADER_TEXT, font: 'Calibri' }),
                  new TextRun({ text: REPORT_TITLE, size: 20, color: COLOR_TEXT, font: 'Calibri' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100 },
                border: {
                  top: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 4 },
                },
                children: [
                  new TextRun({ text: `${BRAND_NAME}  |  ${generatedDate}  |  `, size: 18, color: COLOR_MUTED, font: 'Calibri' }),
                  new TextRun({ text: 'Page ', size: 18, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64748B' }),
                  new TextRun({ text: ' of ', size: 18, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '64748B' }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Cover: logo
          ...(coverLogoFinal ? [
            (() => {
              const size = fitImageWithin(coverLogoFinal.width, coverLogoFinal.height, 180, 90);
              return new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 420, after: 160 },
                children: [
                  new ImageRun({
                    type: coverLogoFinal.type,
                    data: coverLogoFinal.data,
                    transformation: { width: size.width, height: size.height },
                  }),
                ],
              });
            })(),
          ] : [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 420, after: 120 },
              children: [new TextRun({ text: BRAND_NAME, bold: true, size: 24, color: '1E3A8A' })],
            }),
            ...(hasLogoRef
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 },
                    children: [new TextRun({ text: 'Image unavailable: Client logo', italics: true, color: '64748B' })],
                  }),
                ]
              : []),
          ]),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: REPORT_TITLE, size: 36, bold: true, color: COLOR_HEADER_TEXT, font: 'Calibri' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: `Completed by ${BRAND_NAME}`, size: 22, bold: true, color: COLOR_TEXT, font: 'Calibri' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: coverLogoFinal ? 180 : 320 },
            children: [new TextRun({ text: `Generated ${generatedDate}`, size: 20, color: '475569', font: 'Calibri' })],
          }),

          // Cover: building photo
          ...(coverBuildingFinal ? [
            (() => {
              const size = fitImageWithin(coverBuildingFinal.width, coverBuildingFinal.height, 500, 280);
              return new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 280 },
                children: [
                  new ImageRun({
                    type: coverBuildingFinal.type,
                    data: coverBuildingFinal.data,
                    transformation: { width: size.width, height: size.height },
                  }),
                ],
              });
            })(),
          ] : hasBuildingRef ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 280 },
              children: [new TextRun({ text: 'Image unavailable: Site photo', italics: true, color: '64748B' })],
            }),
          ] : []),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2600, 6400],
            borders: defaultTableBorders(),
            rows: [
              new TableRow({
                children: [
                  createHeaderCell('Premises Detail', COLOR_HEADER_FILL),
                  createHeaderCell('Information', COLOR_HEADER_FILL),
                ],
              }),
              new TableRow({ children: [createBodyCell('Premises Details', { bold: true }), createBodyCell(`${safeText(audit.siteName)} | ${safeText(audit.siteAddress)}`)] }),
              new TableRow({ children: [createBodyCell('Client', { bold: true }), createBodyCell(audit.clientName)] }),
              new TableRow({ children: [createBodyCell('Responsible Person', { bold: true }), createBodyCell(audit.responsiblePerson)] }),
              new TableRow({ children: [createBodyCell('Assessor', { bold: true }), createBodyCell(audit.auditorName)] }),
              new TableRow({ children: [createBodyCell('Prepared by Company', { bold: true }), createBodyCell(BRAND_NAME)] }),
              new TableRow({ children: [createBodyCell('Date of Audit', { bold: true }), createBodyCell(formatDate(audit.auditDate))] }),
              new TableRow({ children: [createBodyCell('Review Date of Audit', { bold: true }), createBodyCell(audit.reviewDate ? formatDate(audit.reviewDate) : 'Not Recorded')] }),
            ],
          }),
          new Paragraph({ spacing: { after: 180 } }),

          createSectionHeading('Contents'),
          new Paragraph({
            children: [
              new TableOfContents('Table of Contents', {
                hyperlink: true,
                headingStyleRange: '2-3',
              }),
            ],
          }),
          new Paragraph({ spacing: { after: 160 } }),

          createSectionHeading('Risk Profile / Premises Details'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2200, 6800],
            borders: defaultTableBorders(),
            rows: [
              new TableRow({ children: [createHeaderCell('Field', COLOR_HEADER_FILL), createHeaderCell('Detail', COLOR_HEADER_FILL)] }),
              new TableRow({ children: [createBodyCell('Report Reference', { bold: true }), createBodyCell(audit.assessmentReference)] }),
              new TableRow({ children: [createBodyCell('Occupancy Details', { bold: true }), createBodyCell(audit.departmentArea || audit.taskActivityProcess)] }),
              new TableRow({ children: [createBodyCell('Premises Details / Construction Type', { bold: true }), createBodyCell(audit.locationLayout || `${safeText(audit.siteName)} | ${safeText(audit.siteAddress)}`)] }),
              new TableRow({ children: [createBodyCell('People at Special Risk', { bold: true }), createBodyCell(audit.whoMightBeHarmed)] }),
            ],
          }),
          new Paragraph({ spacing: { after: 120 } }),

          createSectionHeading('2. Introduction'),
          ...narrativeParagraphs(narrativeText(audit.introduction, DEFAULT_NARRATIVE.introduction)),

          createSectionHeading('3. Scope'),
          ...narrativeParagraphs(narrativeText(audit.scope, DEFAULT_NARRATIVE.scope)),

          createSectionHeading('4. Methodology'),
          ...narrativeParagraphs(narrativeText(audit.methodology, DEFAULT_NARRATIVE.methodology)),

          createSectionHeading('5. Applicable UK Legislation'),
          ...narrativeParagraphs(narrativeText(audit.legislation, DEFAULT_NARRATIVE.legislation)),

          createSectionHeading('6. Disclaimer / Limitations'),
          ...narrativeParagraphs(narrativeText(audit.disclaimer, DEFAULT_NARRATIVE.disclaimer)),

          createSectionHeading('7. Executive Summary'),
          (() => {
            const fill = getComplianceFill(metrics.generalComplianceScore);
            const color = getComplianceTextColor(metrics.generalComplianceScore);
            return new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              layout: TableLayoutType.FIXED,
              columnWidths: [6200, 1800],
              borders: defaultTableBorders(),
              rows: [
                new TableRow({ children: [createHeaderCell('General Compliance Indicator'), createHeaderCell('Value')] }),
                new TableRow({
                  children: [
                    createBodyCell('General Compliance Score (Hazards + Risks)', { bold: true }),
                    createBodyCell(`${metrics.generalComplianceScore}% (${metrics.generalComplianceRating})`, {
                      align: AlignmentType.CENTER,
                      bold: true,
                      fill,
                      color,
                    }),
                  ],
                }),
              ],
            });
          })(),
          new Paragraph({ spacing: { after: 120 } }),
          new Paragraph({
            spacing: { after: 220, line: 300 },
            children: [new TextRun({ text: executiveSummaryText, size: 22, color: COLOR_TEXT, font: 'Calibri' })],
          }),
          ...((audit.risksIdentified || audit.overallRiskLevel)
            ? [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  layout: TableLayoutType.FIXED,
                  columnWidths: [2600, 7400],
                  borders: defaultTableBorders(),
                  rows: [
                    ...(audit.risksIdentified
                      ? [new TableRow({
                          children: [
                            createBodyCell('Risks Identified', { bold: true }),
                            createBodyCell(audit.risksIdentified),
                          ],
                        })]
                      : []),
                    ...(audit.overallRiskLevel
                      ? [new TableRow({
                          children: [
                            createBodyCell('Overall Risk Level', { bold: true }),
                            createBodyCell(audit.overallRiskLevel, { bold: true }),
                          ],
                        })]
                      : []),
                  ],
                }),
              ]
            : []),
          new Paragraph({ spacing: { after: 160 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2200, 5100, 2700],
            borders: defaultTableBorders(),
            rows: [
              new TableRow({
                children: [
                  createActionHeaderCell('Section'),
                  createActionHeaderCell('What Was Observed'),
                  createActionHeaderCell('Photo'),
                ],
              }),
              ...positiveObservationSectionsWithImages.map((row) => new TableRow({
                children: [
                  createBodyCell(row.sectionTitle, { bold: true }),
                  createBodyCellParagraphs(row.observedLines),
                  createImageGalleryCell(row.photos, { emptyText: 'No image', maxWidth: 110, maxHeight: 80 }),
                ],
              })),
            ],
          }),

          createSectionHeading('8. Risk Matrix'),
          new Paragraph({
            spacing: { after: 100, line: 300 },
            children: [
              new TextRun({
                text: 'Risk matrix guidance: identify the most realistic Likelihood (1-5) and Consequence (1-5), then cross-reference the values in the matrix below to determine the risk score and banding.',
                size: 22,
                color: COLOR_TEXT,
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120, line: 300 },
            children: [
              new TextRun({
                text: 'Higher scores indicate greater risk and should be prioritised for immediate control measures and follow-up actions.',
                size: 22,
                color: COLOR_TEXT,
                font: 'Calibri',
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: 'UK 5x5 Matrix (Likelihood x Consequence)', bold: true, size: 22, color: COLOR_HEADER_TEXT })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [1800, 1200, 1200, 1200, 1200, 1200],
            borders: defaultTableBorders(),
            rows: [
              new TableRow({
                children: [
                  createHeaderCell('Likelihood \\ Consequence'),
                  createHeaderCell('1 Negligible'),
                  createHeaderCell('2 Minor'),
                  createHeaderCell('3 Moderate'),
                  createHeaderCell('4 Major'),
                  createHeaderCell('5 Catastrophic'),
                ],
              }),
              ...[5, 4, 3, 2, 1].map((likelihood) =>
                new TableRow({
                  children: [
                    createBodyCell(getLikelihoodLabel(likelihood), { bold: true, fill: 'F8FAFC' }),
                    ...[1, 2, 3, 4, 5].map((severity) => {
                      const score = likelihood * severity;
                      const band = getRiskBand(score);
                      return createBodyCell(`${score} ${band}`, {
                        align: AlignmentType.CENTER,
                        bold: score >= 12,
                        fill: getRiskFill(band),
                        color: getRiskTextColor(band),
                      });
                    }),
                  ],
                })
              ),
            ],
          }),
          new Paragraph({ spacing: { after: 120 } }),

          createSectionHeading('9. Findings Register'),
          ...(findingsWithImages.length > 0
            ? [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  layout: TableLayoutType.FIXED,
                  columnWidths: [650, 1800, 2550, 1800, 950, 1500, 1650],
                  borders: defaultTableBorders(),
                  rows: [
                    new TableRow({
                      children: [
                        createActionHeaderCell('Ref'),
                        createActionHeaderCell('Section'),
                        createActionHeaderCell('Finding / Observation'),
                        createActionHeaderCell('Recommended Action'),
                        createActionHeaderCell('Risk'),
                        createActionHeaderCell('Owner / Status'),
                        createActionHeaderCell('Photo'),
                      ],
                    }),
                    ...findingsWithImages.map((finding) => {
                      const riskFill = getRiskFill(finding.riskBand);
                      const riskTextColor = getRiskTextColor(finding.riskBand);

                      const findingTextLines = Array.from(new Set(
                        (finding.itemComment?.trim() && finding.rowKind === 'finding'
                          ? [finding.title, finding.observation, `Inspector Note: ${finding.itemComment}`]
                          : [finding.title, finding.observation])
                          .map((line) => safeText(line).trim())
                          .filter((line) => line.length > 0)
                      ));

                      const ownerStatusLines = [
                        `Resp: ${safeText(finding.responsiblePerson) || 'N/A'}`,
                        `Target: ${safeText(finding.targetDate) || 'N/A'}`,
                        `Status: ${safeText(finding.status) || 'N/A'}`,
                      ];

                      const riskLines = [
                        `${finding.riskScore} (${safeText(finding.riskBand)})`,
                        `L ${finding.likelihood} x S ${finding.severity}`,
                        safeText(finding.priority) || 'Low',
                      ];

                      const photoCell = createImageGalleryCell([
                        {
                          imageData: finding.imageData,
                          imageType: finding.imageType,
                          imageWidth: finding.imageWidth,
                          imageHeight: finding.imageHeight,
                        },
                      ], {
                        emptyText: finding.hasPhotoRef ? 'Image unavailable' : 'No image',
                        maxWidth: 160,
                        maxHeight: 110,
                      });

                      return new TableRow({
                        children: [
                          createBodyCell(finding.refCode, { align: AlignmentType.CENTER, bold: true }),
                          createBodyCell(finding.sectionTitle, { bold: true }),
                          createBodyCellParagraphs(findingTextLines),
                          createBodyCell(finding.recommendedAction),
                          createBodyCellParagraphs(riskLines, {
                            align: AlignmentType.CENTER,
                            bold: true,
                            fill: riskFill,
                            color: riskTextColor,
                          }),
                          createBodyCellParagraphs(ownerStatusLines),
                          photoCell,
                        ],
                      });
                    }),
                  ],
                }),
              ]
            : [
                new Paragraph({
                  text: 'No findings were identified during this audit.',
                  spacing: { before: 120, after: 160 },
                }),
              ]),

          createSectionHeading('10. Action Plan'),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [700, 1900, 2300, 1000, 450, 450, 950, 1150, 950, 950],
            borders: defaultTableBorders(),
            rows: [
              new TableRow({
                children: [
                  createActionHeaderCell("Ref"),
                  createActionHeaderCell("Finding"),
                  createActionHeaderCell("Action Required"),
                  createActionHeaderCell("Priority"),
                  createActionHeaderCell("L"),
                  createActionHeaderCell("S"),
                  createActionHeaderCell("Score"),
                  createActionHeaderCell("Responsible"),
                  createActionHeaderCell("Target Date"),
                  createActionHeaderCell("Status"),
                ],
              }),
              ...uniqueActions.map((action, idx) => {
                const riskBand = safeText(action.riskBand || action.finalRiskRating);
                const riskFill = getRiskFill(riskBand);
                const riskTextColor = getRiskTextColor(riskBand);
                const priorityFill = getRiskFill(action.priority);
                const priorityTextColor = getRiskTextColor(action.priority);

                const findingFRef = findingRefMap.get(action.findingId);
                const actionRef = findingFRef != null ? `F${findingFRef}` : `A${idx + 1}`;

                return new TableRow({
                  children: [
                    createBodyCell(actionRef, { align: AlignmentType.CENTER, bold: true }),
                    createBodyCell(action.findingTitle),
                    createBodyCell(action.actionRequired),
                    createBodyCell(action.priority, {
                      align: AlignmentType.CENTER,
                      bold: true,
                      fill: priorityFill,
                      color: priorityTextColor,
                    }),
                    createBodyCell(action.likelihood.toString(), { align: AlignmentType.CENTER }),
                    createBodyCell(action.severity.toString(), { align: AlignmentType.CENTER }),
                    createBodyCell(`${action.riskScore} (${riskBand})`, {
                      align: AlignmentType.CENTER,
                      bold: true,
                      fill: riskFill,
                      color: riskTextColor,
                    }),
                    createBodyCell(action.responsiblePerson),
                    createBodyCell(action.targetDate, { align: AlignmentType.CENTER }),
                    createBodyCell(action.status, { align: AlignmentType.CENTER }),
                  ],
                });
              }),
            ],
          }),

          ...(uniqueActions.length === 0
            ? [new Paragraph({ text: 'No actions are currently required.', spacing: { before: 120, after: 140 } })]
            : []),

          createSectionHeading('11. Conclusion / Final Comments'),

          ...narrativeParagraphs(narrativeText(audit.conclusion || audit.generalComments, DEFAULT_NARRATIVE.conclusion)),
          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: 'Prepared by:', bold: true })],
          }),
          new Paragraph({ text: safeText(audit.auditorName) }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Photo diagnostics: ${embeddedPhotoCount} embedded out of ${referencedPhotoCount} referenced`,
                size: 18,
                color: COLOR_MUTED,
              }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: `Date: ${formatDate(audit.auditDate)}`, color: '475569' })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Full_Report_Safety_is_the_Key_Ltd_${audit.clientName.replace(/\s+/g, '_')}_${audit.siteName.replace(/\s+/g, '_')}_${formatDate(audit.auditDate).replace(/\//g, '-')}.docx`;
  saveAs(blob, fileName);

  return {
    embeddedPhotoCount,
    referencedPhotoCount,
  };
}
