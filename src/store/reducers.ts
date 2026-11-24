/** Pure builders / mergers used by the store actions. */

import {
  formatPositionsDisplay,
  normalizeCustomGrants,
  normalizePositionsList,
} from '@/lib/officer-roles';
import { createId, normalizeName } from '@/lib/utils';
import type { Entry, Student } from '@/types/models';

import type { EntryInput, StudentInput } from './types';

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** Next free `10T4-XX` code, so two students never share a code by accident. */
function nextCode(students: Student[], className: string): string {
  const prefix = `${className}-`;
  let max = 0;
  for (const student of students) {
    if (!student.code.startsWith(prefix)) continue;
    const numeric = Number.parseInt(student.code.slice(prefix.length), 10);
    if (Number.isFinite(numeric) && numeric > max) max = numeric;
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

function resolveEntryPoints(
  kind: Entry['kind'],
  rawPoints: number,
  source?: Entry['source'],
): number {
  const rounded = Number.isFinite(rawPoints) ? Math.round(rawPoints) : 0;
  if (kind === 'violation') {
    return rounded < 0 ? rounded : -Math.max(1, Math.abs(rounded) || 5);
  }
  if (rounded < 0 && source === 'duty_diligence') {
    return rounded;
  }
  return Math.max(0, rounded);
}

export function buildStudent(existing: Student[], className: string, input: StudentInput): Student {
  const now = new Date().toISOString();
  const positions = normalizePositionsList(input.positions, input.position);
  const customPermissions = normalizeCustomGrants(input.customPermissions);
  return {
    id: input.id?.trim() || createId('stu'),
    name: normalizeName(input.name),
    code: input.code?.trim() || nextCode(existing, className),
    gender: input.gender,
    birthDate: input.birthDate ?? null,
    phone: text(input.phone),
    email: text(input.email),
    address: text(input.address),
    group: text(input.group),
    position: formatPositionsDisplay(positions),
    positions,
    customPermissions,
    note: text(input.note),
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeStudent(student: Student, patch: Partial<StudentInput>): Student {
  const next: Student = { ...student, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) next.name = normalizeName(patch.name);
  if (patch.code !== undefined) next.code = patch.code.trim() || student.code;
  if (patch.gender) next.gender = patch.gender;
  if (patch.birthDate !== undefined) next.birthDate = patch.birthDate;
  if (patch.phone !== undefined) next.phone = text(patch.phone);
  if (patch.email !== undefined) next.email = text(patch.email);
  if (patch.address !== undefined) next.address = text(patch.address);
  if (patch.group !== undefined) next.group = text(patch.group);
  if (patch.positions !== undefined || patch.position !== undefined) {
    const nextPositions =
      patch.positions !== undefined
        ? normalizePositionsList(patch.positions, null)
        : normalizePositionsList(null, patch.position);
    next.positions = nextPositions;
    next.position = formatPositionsDisplay(nextPositions);
  }
  if (patch.customPermissions !== undefined) {
    next.customPermissions = normalizeCustomGrants(patch.customPermissions);
  }
  if (patch.note !== undefined) next.note = text(patch.note);
  return next;
}

export function buildEntry(input: EntryInput): Entry {
  const now = new Date().toISOString();
  const fromStudent = input.submittedBy === 'student';
  const resolvedSource = input.source;
  const cleanSubject = text(input.subject);
  const resolvedSpeechCount =
    input.kind === 'study' ? Math.max(1, Math.round(input.speechCount ?? 1)) : undefined;
  return {
    id: createId('ent'),
    studentId: input.studentId,
    title: input.title.trim(),
    kind: input.kind,
    category: input.category,
    level: input.level,
    date: input.date,
    description: text(input.description),
    proofUrl: text(input.proofUrl),
    points: resolveEntryPoints(input.kind, input.points, resolvedSource),
    // Explicit status wins (used for officer-recorded entries); otherwise teacher=approved, student=pending.
    status: input.status ?? (fromStudent ? 'pending' : 'approved'),
    submittedBy: input.submittedBy ?? 'teacher',
    reviewNote: text(input.reviewNote),
    ...(cleanSubject !== null || input.subject !== undefined ? { subject: cleanSubject } : {}),
    ...(resolvedSpeechCount !== undefined ? { speechCount: resolvedSpeechCount } : {}),
    ...(input.recordedByName !== undefined ? { recordedByName: text(input.recordedByName) } : {}),
    ...(input.recordedByPosition !== undefined
      ? { recordedByPosition: text(input.recordedByPosition) }
      : {}),
    ...(input.recordedByStudentId !== undefined
      ? { recordedByStudentId: input.recordedByStudentId ?? null }
      : {}),
    ...(resolvedSource !== undefined ? { source: resolvedSource } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeEntry(entry: Entry, patch: Partial<EntryInput>): Entry {
  const next: Entry = { ...entry, updatedAt: new Date().toISOString() };
  if (patch.studentId) next.studentId = patch.studentId;
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.kind) next.kind = patch.kind;
  if (patch.category) next.category = patch.category;
  if (patch.level) next.level = patch.level;
  if (patch.date) next.date = patch.date;
  if (patch.description !== undefined) next.description = text(patch.description);
  if (patch.proofUrl !== undefined) next.proofUrl = text(patch.proofUrl);
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.reviewNote !== undefined) next.reviewNote = text(patch.reviewNote);
  if (patch.subject !== undefined) next.subject = text(patch.subject);
  if (patch.speechCount !== undefined || patch.kind !== undefined) {
    if (next.kind === 'study') {
      next.speechCount = Math.max(1, Math.round(patch.speechCount ?? entry.speechCount ?? 1));
    } else if (patch.kind !== undefined) {
      delete next.speechCount;
    }
  }
  if (patch.recordedByName !== undefined) next.recordedByName = text(patch.recordedByName);
  if (patch.recordedByPosition !== undefined) {
    next.recordedByPosition = text(patch.recordedByPosition);
  }
  if (patch.recordedByStudentId !== undefined) {
    next.recordedByStudentId = patch.recordedByStudentId ?? null;
  }
  if (patch.source !== undefined) next.source = patch.source;
  if (patch.points !== undefined || patch.kind !== undefined || patch.source !== undefined) {
    next.points = resolveEntryPoints(
      next.kind,
      patch.points !== undefined ? patch.points : entry.points,
      next.source,
    );
  }
  return next;
}
