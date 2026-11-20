/** Pure builders / mergers used by the store actions. */

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

export function buildStudent(existing: Student[], className: string, input: StudentInput): Student {
  const now = new Date().toISOString();
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
    position: text(input.position),
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
  if (patch.position !== undefined) next.position = text(patch.position);
  if (patch.note !== undefined) next.note = text(patch.note);
  return next;
}

export function buildEntry(input: EntryInput): Entry {
  const now = new Date().toISOString();
  const fromStudent = input.submittedBy === 'student';
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
    points: Math.max(0, Math.round(input.points)),
    // Teacher entries are trusted, student ones wait for review.
    status: fromStudent ? 'pending' : 'approved',
    submittedBy: input.submittedBy ?? 'teacher',
    reviewNote: null,
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
  if (patch.points !== undefined) next.points = Math.max(0, Math.round(patch.points));
  return next;
}
