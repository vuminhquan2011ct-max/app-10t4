/**
 * Visual Report Card PNG Generator (`P3-2`).
 *
 * - Web: Renders a crisp 2× high-DPI (`1080×1440`) branded FPT 10T4 report card
 *   directly on an HTML5 `<canvas>` and downloads / shares a `.png` file with
 *   immediate `URL.revokeObjectURL` cleanup (zero heavy dependencies).
 * - Native (iOS / Android): Generates a self-contained printable HTML visual card
 *   in the app cache and shares via `expo-sharing`, falling back cleanly to
 *   plain text `Share.share` if unavailable.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatPoints } from '@/constants/entry-meta';
import { formatDate, todayIso } from '@/lib/date';
import { shareOrCopyText } from '@/lib/export';
import type { AttendanceStats, ClassInfo, Student, StudentStats } from '@/types/models';

export interface StudySubjectBreakdownRow {
  subject: string;
  speeches: number;
  points: number;
}

export interface VisualReportCardInput {
  classInfo: ClassInfo;
  student: Student;
  stats: StudentStats;
  attendance: AttendanceStats;
  rank: number | null;
  positions: string[];
  studyWeeklySpeeches: number;
  studyHk1Speeches: number;
  studyHk1Points: number;
  studySubjectBreakdown: StudySubjectBreakdownRow[];
  semesterLabel: string;
  /** Strictly pass ONLY when caller has `canViewNotes === true` (never expose private GVCN notes!). */
  teacherNote?: string | null;
}

export type ExportVisualReportCardResult = 'downloaded' | 'shared' | 'copied' | 'failed';

function safeSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'hoc-sinh'
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '10';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) break;
    }
  }
  lines.push(current);

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  const lastIdx = lines.length - 1;
  while (ctx.measureText(lines[lastIdx]).width > maxWidth && lines[lastIdx].length > 4) {
    lines[lastIdx] = `${lines[lastIdx].slice(0, -2)}…`;
  }
  return lines;
}

function renderReportCardCanvas(input: VisualReportCardInput): HTMLCanvasElement {
  const WIDTH = 1080;
  const HEIGHT = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ Canvas 2D để xuất ảnh PNG.');
  }

  const fontStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const diligence = input.attendance.diligenceScore ?? input.attendance.rate;
  const cleanNote = input.teacherNote?.trim() || '';

  // 1. Warm Ivory Parchment Base
  const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGrad.addColorStop(0, '#FFFBF5');
  bgGrad.addColorStop(1, '#FEF3E2');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer Gold Frame
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.28)';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 36);
  ctx.stroke();

  // 2. Royal Dong Son Crimson-Amber Header
  const headerH = 420;
  ctx.save();
  drawRoundedRect(ctx, 40, 40, WIDTH - 80, headerH, 32);
  ctx.clip();

  const headerGrad = ctx.createLinearGradient(40, 40, WIDTH - 40, 40 + headerH);
  headerGrad.addColorStop(0, '#9A3412');
  headerGrad.addColorStop(0.5, '#D97706');
  headerGrad.addColorStop(1, '#B45309');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(40, 40, WIDTH - 80, headerH);

  // Subtle Dong Son concentric rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.lineWidth = 2;
  for (const radius of [120, 190, 260, 330]) {
    ctx.beginPath();
    ctx.arc(WIDTH - 130, 110, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(140, 400, 170, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // FPT 10T4 Crest Pill
  const crestLabel = `FPT · LỚP ${input.classInfo.name.toUpperCase()} · ${input.classInfo.year}`;
  ctx.font = `800 22px ${fontStack}`;
  const crestW = Math.min(WIDTH - 160, ctx.measureText(crestLabel).width + 52);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  drawRoundedRect(ctx, (WIDTH - crestW) / 2, 72, crestW, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#FFFBEB';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(crestLabel, WIDTH / 2, 95);

  // Subtitle
  ctx.font = `700 20px ${fontStack}`;
  ctx.fillStyle = 'rgba(255, 251, 235, 0.88)';
  ctx.fillText('PHIẾU THÀNH TÍCH & RÈN LUYỆN HỌC SINH', WIDTH / 2, 140);

  // Monogram Avatar Circle
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.beginPath();
  ctx.arc(WIDTH / 2, 220, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FEF3C7';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 40px ${fontStack}`;
  ctx.fillText(initialsOf(input.student.name), WIDTH / 2, 223);

  // Student Full Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 44px ${fontStack}`;
  ctx.fillText(input.student.name, WIDTH / 2, 314, WIDTH - 140);

  // ID + Tổ + Officer Position Pills
  const pills = [
    `ID: ${input.student.code}`,
    input.student.group || 'Chưa phân tổ',
    ...input.positions.slice(0, 2).map((p) => `★ ${p}`),
  ];
  ctx.font = `700 21px ${fontStack}`;
  const pillMeta = pills.map((text) => ({
    text,
    w: Math.min(280, ctx.measureText(text).width + 36),
  }));
  const gap = 14;
  const totalPillsW = pillMeta.reduce((sum, p) => sum + p.w, 0) + gap * (pillMeta.length - 1);
  let px = (WIDTH - totalPillsW) / 2;
  for (let i = 0; i < pillMeta.length; i += 1) {
    const p = pillMeta[i];
    const isOfficerPill = i >= 2;
    ctx.fillStyle = isOfficerPill ? '#FEF08A' : 'rgba(255, 255, 255, 0.22)';
    drawRoundedRect(ctx, px, 356, p.w, 42, 21);
    ctx.fill();
    ctx.fillStyle = isOfficerPill ? '#78350F' : '#FFFFFF';
    ctx.fillText(p.text, px + p.w / 2, 378, p.w - 18);
    px += p.w + gap;
  }

  // 3. 2×2 KPI Grid
  const kpiTop = 492;
  const kpiGap = 24;
  const kpiW = (WIDTH - 80 - kpiGap) / 2;
  const kpiH = 156;

  const kpis = [
    {
      label: 'ĐIỂM THI ĐUA & HẠNG',
      value: `${formatPoints(input.stats.points)} điểm`,
      sub: input.rank ? `Xếp hạng #${input.rank} toàn lớp` : `Lớp ${input.classInfo.name}`,
      accent: '#15803D',
      soft: '#DCFCE7',
    },
    {
      label: `STAMP PHÁT BIỂU (${input.semesterLabel.toUpperCase()})`,
      value: `${input.studyHk1Speeches} stamps`,
      sub: `+${formatPoints(input.studyHk1Points)}đ (0,25đ/stamp) · Tuần: ${input.studyWeeklySpeeches}`,
      accent: '#7C3AED',
      soft: '#EDE9FE',
    },
    {
      label: 'THÀNH TÍCH & HOẠT ĐỘNG',
      value: `${input.stats.achievements} thành tích`,
      sub: `${input.stats.academicAchievements} học thuật · ${input.stats.activities} hoạt động`,
      accent: '#C2410C',
      soft: '#FFEDD5',
    },
    {
      label: 'CHUYÊN CẦN & TRỰC NHẬT',
      value: diligence !== null ? `${diligence}%` : 'Chưa chấm',
      sub:
        input.attendance.dutyTotal > 0
          ? `Trực nhật: ${input.attendance.dutyCompleted} HT · ${input.attendance.dutyMissed} chưa HT`
          : input.attendance.total > 0
            ? `${input.attendance.present} có mặt · ${input.attendance.late} muộn`
            : 'Duy trì nề nếp ổn định',
      accent: '#0369A1',
      soft: '#E0F2FE',
    },
  ];

  ctx.textAlign = 'left';
  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 40 + col * (kpiW + kpiGap);
    const y = kpiTop + row * (kpiH + kpiGap);

    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, x, y, kpiW, kpiH, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Accent pill strip
    ctx.fillStyle = kpi.soft;
    drawRoundedRect(ctx, x + 22, y + 20, kpiW - 44, 34, 10);
    ctx.fill();
    ctx.fillStyle = kpi.accent;
    ctx.font = `800 17px ${fontStack}`;
    ctx.fillText(kpi.label, x + 34, y + 38, kpiW - 68);

    ctx.fillStyle = '#1C1917';
    ctx.font = `900 38px ${fontStack}`;
    ctx.fillText(kpi.value, x + 24, y + 92, kpiW - 48);

    ctx.fillStyle = '#57534E';
    ctx.font = `600 19px ${fontStack}`;
    ctx.fillText(kpi.sub, x + 24, y + 132, kpiW - 48);
  });

  // 4. Subject Stamp Breakdown Card
  const subjTop = kpiTop + kpiH * 2 + kpiGap + 28;
  const subjH = cleanNote ? 300 : 410;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, 40, subjTop, WIDTH - 80, subjH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#1C1917';
  ctx.font = `800 24px ${fontStack}`;
  ctx.fillText('CHI TIẾT STAMP PHÁT BIỂU THEO MÔN HỌC (0,25Đ / STAMP)', 72, subjTop + 44);

  const topSubjects = input.studySubjectBreakdown.slice(0, cleanNote ? 4 : 6);
  if (topSubjects.length === 0) {
    ctx.fillStyle = '#78716C';
    ctx.font = `600 21px ${fontStack}`;
    ctx.fillText(
      'Chưa ghi nhận stamp phát biểu môn học trong kỳ này — hãy tích cực phát biểu nhé!',
      72,
      subjTop + 110,
      WIDTH - 144,
    );
  } else {
    const maxSpeeches = Math.max(1, ...topSubjects.map((s) => s.speeches));
    const barStartX = 290;
    const barMaxW = WIDTH - 80 - 290 - 200;
    const rowStep = 50;

    topSubjects.forEach((row, idx) => {
      const ry = subjTop + 96 + idx * rowStep;
      ctx.fillStyle = '#292524';
      ctx.font = `700 21px ${fontStack}`;
      ctx.textAlign = 'left';
      ctx.fillText(row.subject, 72, ry, 200);

      // Track
      ctx.fillStyle = '#F5F5F4';
      drawRoundedRect(ctx, barStartX, ry - 12, barMaxW, 24, 12);
      ctx.fill();

      // Fill
      const fillW = Math.max(24, Math.round((row.speeches / maxSpeeches) * barMaxW));
      const barGrad = ctx.createLinearGradient(barStartX, ry, barStartX + fillW, ry);
      barGrad.addColorStop(0, '#EA580C');
      barGrad.addColorStop(1, '#F59E0B');
      ctx.fillStyle = barGrad;
      drawRoundedRect(ctx, barStartX, ry - 12, fillW, 24, 12);
      ctx.fill();

      ctx.fillStyle = '#15803D';
      ctx.font = `800 20px ${fontStack}`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `${row.speeches} stamps (+${formatPoints(row.points)}đ)`,
        WIDTH - 72,
        ry,
      );
    });
    ctx.textAlign = 'left';
  }

  // 5. Optional GVCN Note Card (strictly when caller authorized `canViewNotes`)
  if (cleanNote) {
    const noteTop = subjTop + subjH + 22;
    const noteH = 148;
    ctx.fillStyle = '#FFFBEB';
    drawRoundedRect(ctx, 40, noteTop, WIDTH - 80, noteH, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#B45309';
    ctx.font = `800 21px ${fontStack}`;
    ctx.fillText('NHẬN XÉT CỦA GIÁO VIÊN CHỦ NHIỆM', 72, noteTop + 38);

    ctx.fillStyle = '#292524';
    ctx.font = `600 21px ${fontStack}`;
    const noteLines = wrapTextLines(ctx, cleanNote, WIDTH - 144, 3);
    noteLines.forEach((line, idx) => {
      ctx.fillText(line, 72, noteTop + 76 + idx * 30);
    });
  }

  // 6. Footer Signature Strip
  const footerY = HEIGHT - 84;
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, footerY - 34);
  ctx.lineTo(WIDTH - 64, footerY - 34);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#78716C';
  ctx.font = `700 20px ${fontStack}`;
  ctx.fillText(`GVCN: ${input.classInfo.teacherName} · ${input.classInfo.school}`, 64, footerY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#B45309';
  ctx.font = `800 20px ${fontStack}`;
  ctx.fillText(`Ngày xuất: ${formatDate(todayIso())}`, WIDTH - 64, footerY);

  return canvas;
}

function buildPrintableReportHtml(input: VisualReportCardInput): string {
  const diligence = input.attendance.diligenceScore ?? input.attendance.rate;
  const cleanNote = input.teacherNote?.trim() || '';
  const subjectRows = input.studySubjectBreakdown
    .slice(0, 8)
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.subject)}</td><td style="text-align:right;font-weight:700;color:#15803d">${s.speeches} stamps (+${escapeHtml(formatPoints(s.points))}đ)</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8" /><title>Phiếu điểm ${escapeHtml(input.student.name)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fffbf5;color:#1c1917;padding:24px;max-width:720px;margin:0 auto}
.hero{background:linear-gradient(135deg,#9a3412,#d97706);color:#fff;padding:28px;border-radius:20px;text-align:center}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.card{background:#fff;border:1px solid #fed7aa;border-radius:14px;padding:14px}
.k{font-size:11px;font-weight:800;color:#b45309;text-transform:uppercase}.v{font-size:24px;font-weight:900;margin:4px 0}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}td{padding:10px 14px;border-bottom:1px solid #f5f5f4}</style></head>
<body><div class="hero"><div style="font-size:12px;font-weight:800;opacity:.9">FPT · LỚP ${escapeHtml(input.classInfo.name.toUpperCase())} · ${escapeHtml(input.classInfo.year)}</div>
<h1 style="margin:10px 0 6px">${escapeHtml(input.student.name)}</h1>
<div>ID: ${escapeHtml(input.student.code)} · ${escapeHtml(input.student.group ?? 'Chưa phân tổ')}${input.positions.length > 0 ? ` · ★ ${escapeHtml(input.positions.join(' · '))}` : ''}</div></div>
<div class="grid">
<div class="card"><div class="k">Điểm thi đua</div><div class="v">${escapeHtml(formatPoints(input.stats.points))}đ</div><div>${input.rank ? `Hạng #${input.rank} toàn lớp` : ''}</div></div>
<div class="card"><div class="k">Stamp HK I (0,25đ/stamp)</div><div class="v">${input.studyHk1Speeches} stamps</div><div>+${escapeHtml(formatPoints(input.studyHk1Points))}đ · Tuần: ${input.studyWeeklySpeeches}</div></div>
<div class="card"><div class="k">Thành tích</div><div class="v">${input.stats.achievements}</div><div>${input.stats.academicAchievements} học thuật · ${input.stats.activities} hoạt động</div></div>
<div class="card"><div class="k">Chuyên cần</div><div class="v">${diligence !== null ? `${diligence}%` : '--'}</div><div>Trực nhật: ${input.attendance.dutyCompleted} HT / ${input.attendance.dutyMissed} chưa HT</div></div>
</div>
<h3>Stamp phát biểu theo Môn học</h3><table>${subjectRows || '<tr><td>Chưa có stamp phát biểu</td></tr>'}</table>
${cleanNote ? `<div class="card" style="margin-top:16px;background:#fffbeb"><div class="k">Nhận xét của GVCN</div><p style="margin:6px 0 0">${escapeHtml(cleanNote)}</p></div>` : ''}
<p style="font-size:12px;color:#78716c;margin-top:18px">GVCN: ${escapeHtml(input.classInfo.teacherName)} · Ngày xuất: ${escapeHtml(formatDate(todayIso()))}</p></body></html>`;
}

/**
 * Export a visual FPT 10T4 Student Report Card PNG (Web Canvas 1080×1440) or
 * printable HTML / Share sheet fallback on iOS/Android.
 */
export async function exportVisualReportCardPng(
  input: VisualReportCardInput,
): Promise<ExportVisualReportCardResult> {
  const fileBase = `phieu-diem-${safeSlug(input.student.name)}-${todayIso()}`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const canvas = renderReportCardCanvas(input);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/png', 1);
      });
      if (!blob) return 'failed';

      const pngName = `${fileBase}.png`;
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = pngName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return 'downloaded';
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return 'failed';
    }
  }

  // Native iOS / Android: write printable HTML card to cache and open native Share sheet
  try {
    const htmlName = `${fileBase}.html`;
    const html = buildPrintableReportHtml(input);
    const cacheFile = new File(Paths.cache, htmlName);
    cacheFile.create({ overwrite: true });
    await cacheFile.write(html, { encoding: 'utf8' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cacheFile.uri, {
        mimeType: 'text/html',
        UTI: 'public.html',
        dialogTitle: `Phiếu điểm ${input.student.name}`,
      });
      return 'shared';
    }
  } catch {
    // Graceful fallback to text share below.
  }

  const fallbackSummary = [
    `🎓 PHIẾU ĐIỂM — ${input.student.name} (${input.student.code})`,
    `Lớp ${input.classInfo.name} · ${input.student.group ?? 'Chưa phân tổ'}${input.rank ? ` · Hạng #${input.rank}` : ''}`,
    `• Điểm thi đua: ${formatPoints(input.stats.points)}đ`,
    `• Stamp phát biểu ${input.semesterLabel}: ${input.studyHk1Speeches} stamps (+${formatPoints(input.studyHk1Points)}đ)`,
    `• Chuyên cần: ${(input.attendance.diligenceScore ?? input.attendance.rate) !== null ? `${input.attendance.diligenceScore ?? input.attendance.rate}%` : '--'}`,
    ...(input.teacherNote?.trim() ? [`• Nhận xét GVCN: ${input.teacherNote.trim()}`] : []),
  ].join('\n');

  const res = await shareOrCopyText(fallbackSummary, `Phiếu điểm ${input.student.name}`);
  return res === 'failed' ? 'failed' : res;
}
